-- EF-304: durable internal notification records for replay-safe finance reminders.
-- This is fake-delivery-compatible in-app storage only; no email/SMS provider.
CREATE TABLE "AutomationNotification" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organizationId" UUID NOT NULL,
  "recipientUserId" UUID NOT NULL,
  "template" VARCHAR(200) NOT NULL,
  "idempotencyKey" VARCHAR(200) NOT NULL,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),
  CONSTRAINT "AutomationNotification_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AutomationNotification_organization_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "AutomationNotification_recipient_membership_fkey"
    FOREIGN KEY ("organizationId", "recipientUserId")
    REFERENCES "Membership"("organizationId", "userId") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "AutomationNotification_template_check"
    CHECK ("template" <> '' AND "template" ~ '\S' AND char_length("template") <= 200),
  CONSTRAINT "AutomationNotification_idempotency_check"
    CHECK ("idempotencyKey" <> '' AND char_length("idempotencyKey") <= 200)
);
CREATE UNIQUE INDEX "AutomationNotification_organizationId_id_key"
  ON "AutomationNotification"("organizationId", "id");
CREATE UNIQUE INDEX "AutomationNotification_organizationId_idempotencyKey_key"
  ON "AutomationNotification"("organizationId", "idempotencyKey");
CREATE INDEX "AutomationNotification_organizationId_createdAt_idx"
  ON "AutomationNotification"("organizationId", "createdAt" DESC, "id");
