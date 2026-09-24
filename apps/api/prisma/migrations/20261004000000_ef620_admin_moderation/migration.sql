-- EF-620 — Admin & moderation.
--
-- Follows the established migration style: tenant composite FKs, CHECK
-- constraints, database-enforced append-only audit trails, and keyset-friendly
-- indexes. Three new append-only tables:
--   * ListingModerationEvent — audited moderation transitions per listing.
--   * AdminAuditEvent        — platform-admin privileged-action audit trail
--                              (action/target identity + reason only; never
--                              raw payloads or secrets).
--   * AdminStepUpEvent       — append-only step-up re-authentication proofs
--                              bound to (userId, accessSessionId).
--
-- Every published listing carries a moderation state (default PENDING so the
-- ALTER backfills existing rows); the moderation queue is
-- status=PUBLISHED AND moderationStatus=PENDING.

CREATE TYPE "ListingModerationStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'TAKEN_DOWN');
CREATE TYPE "ListingModerationAction" AS ENUM ('APPROVED', 'REJECTED', 'TAKEN_DOWN');
CREATE TYPE "AdminAuditAction" AS ENUM ('BROKER_APPROVED', 'BROKER_SUSPENDED', 'BROKER_REINSTATED', 'LISTING_MODERATION_APPROVED', 'LISTING_MODERATION_REJECTED', 'LISTING_MODERATION_TAKEN_DOWN');
CREATE TYPE "AdminStepUpOutcome" AS ENUM ('SUCCEEDED', 'DENIED');

ALTER TABLE "Listing" ADD COLUMN "moderationStatus" "ListingModerationStatus" NOT NULL DEFAULT 'PENDING';
ALTER TABLE "Listing" ADD COLUMN "moderationReason" VARCHAR(500);
ALTER TABLE "Listing" ADD COLUMN "moderatedBy" UUID;
ALTER TABLE "Listing" ADD COLUMN "moderatedAt" TIMESTAMPTZ(6);
ALTER TABLE "Listing" ADD CONSTRAINT "Listing_moderatedBy_fkey" FOREIGN KEY ("moderatedBy") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE UNIQUE INDEX "Listing_organizationId_id_key" ON "Listing"("organizationId", "id");
CREATE INDEX "Listing_moderation_queue_idx" ON "Listing"("status", "moderationStatus", "createdAt", "id");

-- Moderation events are the append-only audit record for listing moderation.
-- REJECTED and TAKEN_DOWN carry a mandatory reason and always archive the
-- listing; APPROVED keeps (or restores) the published state untouched.
CREATE TABLE "ListingModerationEvent" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organizationId" UUID NOT NULL,
  "listingId" UUID NOT NULL,
  "action" "ListingModerationAction" NOT NULL,
  "fromModerationStatus" "ListingModerationStatus" NOT NULL,
  "toModerationStatus" "ListingModerationStatus" NOT NULL,
  "listingStatusBefore" "ListingStatus" NOT NULL,
  "listingStatusAfter" "ListingStatus" NOT NULL,
  "reason" VARCHAR(500),
  "actorId" UUID NOT NULL,
  "createdAt" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "ListingModerationEvent_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ListingModerationEvent_listing_fkey" FOREIGN KEY ("organizationId", "listingId") REFERENCES "Listing"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "ListingModerationEvent_organization_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "ListingModerationEvent_actor_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "ListingModerationEvent_reason_check" CHECK (
    "action" = 'APPROVED'
    OR ("reason" IS NOT NULL AND "reason" <> '' AND "reason" ~ '\S' AND char_length("reason") <= 500)
  ),
  CONSTRAINT "ListingModerationEvent_transition_check" CHECK (
    ("action" = 'APPROVED' AND "toModerationStatus" = 'APPROVED')
    OR ("action" = 'REJECTED' AND "toModerationStatus" = 'REJECTED' AND "listingStatusAfter" = 'ARCHIVED')
    OR ("action" = 'TAKEN_DOWN' AND "toModerationStatus" = 'TAKEN_DOWN' AND "listingStatusAfter" = 'ARCHIVED')
  )
);
CREATE INDEX "ListingModerationEvent_listing_created_idx" ON "ListingModerationEvent"("organizationId", "listingId", "createdAt");

CREATE FUNCTION "ef620_reject_listing_moderation_event_mutation"()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'listing moderation events are append-only'
    USING ERRCODE = 'check_violation';
END;
$$;

CREATE TRIGGER "ListingModerationEvent_append_only"
BEFORE UPDATE OR DELETE ON "ListingModerationEvent"
FOR EACH ROW
EXECUTE FUNCTION "ef620_reject_listing_moderation_event_mutation"();

-- Platform-admin audit trail: action/target identity plus the decision reason
-- only. No raw payloads, provider bodies, or secrets are ever stored here.
CREATE TABLE "AdminAuditEvent" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "action" "AdminAuditAction" NOT NULL,
  "organizationId" UUID NOT NULL,
  "targetType" VARCHAR(40) NOT NULL,
  "targetId" VARCHAR(200) NOT NULL,
  "actorId" UUID NOT NULL,
  "reason" VARCHAR(500),
  "createdAt" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "AdminAuditEvent_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AdminAuditEvent_organization_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "AdminAuditEvent_actor_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "AdminAuditEvent_target_type_check" CHECK ("targetType" IN ('MEMBERSHIP', 'LISTING')),
  CONSTRAINT "AdminAuditEvent_target_format_check" CHECK ("targetId" <> '' AND char_length("targetId") <= 200),
  CONSTRAINT "AdminAuditEvent_reason_format_check" CHECK ("reason" IS NULL OR ("reason" <> '' AND "reason" ~ '\S' AND char_length("reason") <= 500))
);
CREATE INDEX "AdminAuditEvent_created_idx" ON "AdminAuditEvent"("createdAt" DESC, "id" DESC);
CREATE INDEX "AdminAuditEvent_action_created_idx" ON "AdminAuditEvent"("action", "createdAt" DESC, "id" DESC);
CREATE INDEX "AdminAuditEvent_organization_created_idx" ON "AdminAuditEvent"("organizationId", "createdAt" DESC, "id" DESC);
CREATE INDEX "AdminAuditEvent_actor_created_idx" ON "AdminAuditEvent"("actorId", "createdAt" DESC, "id" DESC);

CREATE FUNCTION "ef620_reject_admin_audit_event_mutation"()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'admin audit events are append-only'
    USING ERRCODE = 'check_violation';
END;
$$;

CREATE TRIGGER "AdminAuditEvent_append_only"
BEFORE UPDATE OR DELETE ON "AdminAuditEvent"
FOR EACH ROW
EXECUTE FUNCTION "ef620_reject_admin_audit_event_mutation"();

-- Step-up proofs: a SUCCEEDED row is a bounded re-auth proof bound to the
-- exact access session that presented the password; DENIED rows are bounded
-- audit markers for abuse control. No password material is ever stored.
CREATE TABLE "AdminStepUpEvent" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "userId" UUID NOT NULL,
  "familyId" UUID NOT NULL,
  "accessSessionId" UUID NOT NULL,
  "outcome" "AdminStepUpOutcome" NOT NULL,
  "expiresAt" TIMESTAMPTZ(6),
  "createdAt" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "AdminStepUpEvent_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AdminStepUpEvent_user_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "AdminStepUpEvent_outcome_shape_check" CHECK (
    ("outcome" = 'SUCCEEDED' AND "expiresAt" IS NOT NULL AND "expiresAt" > "createdAt")
    OR ("outcome" = 'DENIED' AND "expiresAt" IS NULL)
  )
);
CREATE INDEX "AdminStepUpEvent_user_created_idx" ON "AdminStepUpEvent"("userId", "createdAt");
CREATE INDEX "AdminStepUpEvent_session_outcome_idx" ON "AdminStepUpEvent"("accessSessionId", "outcome", "expiresAt");

CREATE FUNCTION "ef620_reject_admin_step_up_event_mutation"()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'admin step-up events are append-only'
    USING ERRCODE = 'check_violation';
END;
$$;

CREATE TRIGGER "AdminStepUpEvent_append_only"
BEFORE UPDATE OR DELETE ON "AdminStepUpEvent"
FOR EACH ROW
EXECUTE FUNCTION "ef620_reject_admin_step_up_event_mutation"();
