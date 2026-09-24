-- EF-502: durable, reset-safe viewing reminder and outcome occurrences.
CREATE TABLE "ViewingAutomationOccurrence" (
  "id" UUID NOT NULL,
  "organizationId" UUID NOT NULL,
  "viewingId" UUID NOT NULL,
  "kind" VARCHAR(32) NOT NULL,
  "occurrenceKey" VARCHAR(255) NOT NULL,
  "scheduledFor" TIMESTAMPTZ(6) NOT NULL,
  "status" VARCHAR(16) NOT NULL DEFAULT 'PENDING',
  "suggestedLeadStage" VARCHAR(32),
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "voidedAt" TIMESTAMPTZ(6),
  CONSTRAINT "ViewingAutomationOccurrence_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ViewingAutomationOccurrence_kind_check" CHECK ("kind" IN ('REMINDER_24H', 'REMINDER_1H', 'OUTCOME_REQUEST')),
  CONSTRAINT "ViewingAutomationOccurrence_status_check" CHECK ("status" IN ('PENDING', 'VOIDED')),
  CONSTRAINT "ViewingAutomationOccurrence_stage_check" CHECK ("suggestedLeadStage" IS NULL OR "suggestedLeadStage" IN ('QUALIFIED', 'NURTURING'))
);

CREATE UNIQUE INDEX "ViewingAutomationOccurrence_identity_key"
  ON "ViewingAutomationOccurrence" ("organizationId", "viewingId", "kind", "occurrenceKey");
CREATE UNIQUE INDEX "ViewingAutomationOccurrence_event_key"
  ON "ViewingAutomationOccurrence" ("organizationId", "id");
CREATE INDEX "ViewingAutomationOccurrence_due_idx"
  ON "ViewingAutomationOccurrence" ("status", "scheduledFor");
CREATE INDEX "ViewingAutomationOccurrence_viewing_idx"
  ON "ViewingAutomationOccurrence" ("organizationId", "viewingId", "status", "scheduledFor");

ALTER TABLE "ViewingAutomationOccurrence"
  ADD CONSTRAINT "ViewingAutomationOccurrence_organization_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ViewingAutomationOccurrence"
  ADD CONSTRAINT "ViewingAutomationOccurrence_viewing_fkey"
  FOREIGN KEY ("organizationId", "viewingId") REFERENCES "Viewing"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
