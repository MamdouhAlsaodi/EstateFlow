-- EF-301 + EF-302: versioned automation rule model and the durable scheduler
-- job table. Follows the established migration style: tenant composite FKs,
-- CHECK constraints, database-enforced immutability, and a unique execution
-- key per organization for idempotent scheduling.
--
-- Note: this packet's allowed paths cover migrations only, so these tables are
-- intentionally NOT mirrored into schema.prisma; the automation repositories
-- access them through parameterized raw SQL. A follow-up packet must either
-- sync schema.prisma or keep this boundary explicit.

CREATE TABLE "AutomationRule" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organizationId" UUID NOT NULL,
  "name" VARCHAR(200) NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT FALSE,
  "enabledAt" TIMESTAMPTZ(6),
  "createdAt" TIMESTAMPTZ(6) NOT NULL,
  "updatedAt" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "AutomationRule_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AutomationRule_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "AutomationRule_name_format" CHECK ("name" <> '' AND "name" ~ '\S' AND char_length("name") <= 200),
  CONSTRAINT "AutomationRule_enabled_lifecycle_check" CHECK (("enabled" AND "enabledAt" IS NOT NULL) OR (NOT "enabled" AND "enabledAt" IS NULL))
);
CREATE UNIQUE INDEX "AutomationRule_organizationId_id_key" ON "AutomationRule"("organizationId", "id");
CREATE UNIQUE INDEX "AutomationRule_organizationId_name_key" ON "AutomationRule"("organizationId", "name");
CREATE INDEX "AutomationRule_organizationId_enabled_idx" ON "AutomationRule"("organizationId", "enabled");

-- The rule identity is immutable: only the enable/disable flag (and its
-- bookkeeping timestamp) may ever change. Behavior changes are new versions.
CREATE FUNCTION "ef301_reject_rule_identity_update"()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW."organizationId" IS DISTINCT FROM OLD."organizationId"
    OR NEW."name" IS DISTINCT FROM OLD."name"
    OR NEW."createdAt" IS DISTINCT FROM OLD."createdAt"
  THEN
    RAISE EXCEPTION 'automation rule identity is immutable; add a new version instead'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER "AutomationRule_identity_immutability"
BEFORE UPDATE ON "AutomationRule"
FOR EACH ROW
EXECUTE FUNCTION "ef301_reject_rule_identity_update"();

CREATE TABLE "AutomationRuleVersion" (
  "organizationId" UUID NOT NULL,
  "ruleId" UUID NOT NULL,
  "version" INTEGER NOT NULL,
  "definition" JSONB NOT NULL,
  "createdBy" UUID NOT NULL,
  "createdAt" TIMESTAMPTZ(6) NOT NULL,
  "supersedesVersion" INTEGER,
  "note" VARCHAR(500),
  CONSTRAINT "AutomationRuleVersion_pkey" PRIMARY KEY ("organizationId", "ruleId", "version"),
  CONSTRAINT "AutomationRuleVersion_rule_fkey" FOREIGN KEY ("organizationId", "ruleId") REFERENCES "AutomationRule"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "AutomationRuleVersion_supersedes_fkey" FOREIGN KEY ("organizationId", "ruleId", "supersedesVersion") REFERENCES "AutomationRuleVersion"("organizationId", "ruleId", "version") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "AutomationRuleVersion_creator_membership_fkey" FOREIGN KEY ("organizationId", "createdBy") REFERENCES "Membership"("organizationId", "userId") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "AutomationRuleVersion_version_positive" CHECK ("version" >= 1),
  CONSTRAINT "AutomationRuleVersion_supersedes_check" CHECK ("supersedesVersion" IS NULL OR "supersedesVersion" = "version" - 1),
  CONSTRAINT "AutomationRuleVersion_note_format" CHECK ("note" IS NULL OR ("note" <> '' AND "note" ~ '\S' AND char_length("note") <= 500)),
  CONSTRAINT "AutomationRuleVersion_definition_object" CHECK (jsonb_typeof("definition") = 'object')
);
CREATE INDEX "AutomationRuleVersion_rule_created_idx" ON "AutomationRuleVersion"("organizationId", "ruleId", "createdAt");

-- Rule versions are append-only: the audit trail can never be rewritten.
CREATE FUNCTION "ef301_reject_rule_version_mutation"()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'automation rule versions are append-only'
    USING ERRCODE = 'check_violation';
END;
$$;

CREATE TRIGGER "AutomationRuleVersion_append_only"
BEFORE UPDATE OR DELETE ON "AutomationRuleVersion"
FOR EACH ROW
EXECUTE FUNCTION "ef301_reject_rule_version_mutation"();

CREATE TABLE "AutomationJob" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organizationId" UUID NOT NULL,
  "ruleId" UUID NOT NULL,
  "ruleVersion" INTEGER NOT NULL,
  "executionKey" VARCHAR(200) NOT NULL,
  "triggerKind" VARCHAR(20) NOT NULL,
  "eventType" VARCHAR(100),
  "eventId" UUID,
  "actionType" VARCHAR(60) NOT NULL,
  "targetType" VARCHAR(60) NOT NULL,
  "targetId" VARCHAR(200) NOT NULL,
  "scheduleBucket" VARCHAR(20),
  "scheduledFor" TIMESTAMPTZ(6) NOT NULL,
  "status" VARCHAR(20) NOT NULL,
  "attemptCount" INTEGER NOT NULL DEFAULT 0,
  "maxAttempts" INTEGER NOT NULL,
  "nextAttemptAt" TIMESTAMPTZ(6),
  "lastErrorKind" VARCHAR(64),
  "lastErrorMessage" VARCHAR(500),
  "startedAt" TIMESTAMPTZ(6),
  "completedAt" TIMESTAMPTZ(6),
  "createdAt" TIMESTAMPTZ(6) NOT NULL,
  "updatedAt" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "AutomationJob_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AutomationJob_rule_fkey" FOREIGN KEY ("organizationId", "ruleId") REFERENCES "AutomationRule"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "AutomationJob_rule_version_fkey" FOREIGN KEY ("organizationId", "ruleId", "ruleVersion") REFERENCES "AutomationRuleVersion"("organizationId", "ruleId", "version") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "AutomationJob_execution_key_format" CHECK ("executionKey" <> '' AND char_length("executionKey") <= 200),
  CONSTRAINT "AutomationJob_status_check" CHECK ("status" IN ('QUEUED', 'RUNNING', 'RETRYING', 'SUCCEEDED', 'FAILED', 'CANCELLED')),
  CONSTRAINT "AutomationJob_trigger_kind_check" CHECK ("triggerKind" IN ('DOMAIN_EVENT', 'SCHEDULE')),
  CONSTRAINT "AutomationJob_action_type_check" CHECK ("actionType" IN ('CREATE_LEAD_TASK', 'CREATE_INTERNAL_NOTIFICATION', 'ADD_LEAD_TIMELINE_NOTE')),
  CONSTRAINT "AutomationJob_last_error_kind_check" CHECK ("lastErrorKind" IS NULL OR "lastErrorKind" IN ('action-executor-not-configured', 'action-permanent-failure', 'action-transient-failure', 'unexpected-executor-error')),
  CONSTRAINT "AutomationJob_max_attempts_check" CHECK ("maxAttempts" BETWEEN 1 AND 10),
  CONSTRAINT "AutomationJob_attempts_check" CHECK ("attemptCount" >= 0 AND "attemptCount" <= "maxAttempts"),
  CONSTRAINT "AutomationJob_trigger_shape_check" CHECK (
    ("triggerKind" = 'DOMAIN_EVENT' AND "eventId" IS NOT NULL AND "eventType" IS NOT NULL AND "scheduleBucket" IS NULL)
    OR
    ("triggerKind" = 'SCHEDULE' AND "eventId" IS NULL AND "eventType" IS NULL AND "scheduleBucket" IS NOT NULL)
  ),
  CONSTRAINT "AutomationJob_lifecycle_check" CHECK (
    ("status" IN ('QUEUED', 'RETRYING', 'RUNNING') AND "nextAttemptAt" IS NOT NULL AND "completedAt" IS NULL)
    OR
    ("status" IN ('SUCCEEDED', 'FAILED', 'CANCELLED') AND "completedAt" IS NOT NULL)
  ),
  CONSTRAINT "AutomationJob_running_started_check" CHECK ("status" <> 'RUNNING' OR "startedAt" IS NOT NULL),
  CONSTRAINT "AutomationJob_error_state_check" CHECK (
    ("status" IN ('RETRYING', 'FAILED') AND "lastErrorKind" IS NOT NULL AND "lastErrorMessage" IS NOT NULL)
    OR
    ("status" IN ('QUEUED', 'RUNNING', 'SUCCEEDED', 'CANCELLED') AND "lastErrorKind" IS NULL AND "lastErrorMessage" IS NULL)
  )
);
-- Idempotency: one job per organization per deterministic execution key.
CREATE UNIQUE INDEX "AutomationJob_organizationId_executionKey_key" ON "AutomationJob"("organizationId", "executionKey");
CREATE INDEX "AutomationJob_due_queue_idx" ON "AutomationJob"("status", "nextAttemptAt", "id");
CREATE INDEX "AutomationJob_organizationId_status_idx" ON "AutomationJob"("organizationId", "status", "nextAttemptAt");
CREATE INDEX "AutomationJob_organizationId_ruleId_idx" ON "AutomationJob"("organizationId", "ruleId", "createdAt");
