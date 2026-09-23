-- EF-305: versioned notification templates, approval-gated sends, policy, and audit.
CREATE TYPE "NotificationTemplateStatus" AS ENUM ('DRAFT', 'APPROVED');
CREATE TYPE "NotificationChannel" AS ENUM ('IN_APP', 'EMAIL', 'WHATSAPP');
CREATE TYPE "NotificationApprovalStatus" AS ENUM ('PENDING', 'APPROVED', 'DENIED');
CREATE TYPE "NotificationSendStatus" AS ENUM ('SENT', 'SUPPRESSED', 'FAILED');
CREATE TYPE "NotificationSuppressionReason" AS ENUM ('QUIET_HOURS', 'NO_CONSENT', 'OPTED_OUT', 'NO_APPROVED_TEMPLATE');

CREATE TABLE "NotificationTemplate" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organizationId" UUID NOT NULL,
  "templateKey" VARCHAR(100) NOT NULL,
  "locale" VARCHAR(2) NOT NULL,
  "version" INTEGER NOT NULL,
  "status" "NotificationTemplateStatus" NOT NULL DEFAULT 'DRAFT',
  "subject" VARCHAR(500),
  "body" VARCHAR(4000) NOT NULL,
  "createdBy" UUID NOT NULL,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),
  "approvedBy" UUID,
  "approvedAt" TIMESTAMPTZ(6),
  CONSTRAINT "NotificationTemplate_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "NotificationTemplate_organization_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT,
  CONSTRAINT "NotificationTemplate_creator_membership_fkey" FOREIGN KEY ("organizationId", "createdBy") REFERENCES "Membership"("organizationId", "userId") ON DELETE RESTRICT,
  CONSTRAINT "NotificationTemplate_approver_membership_fkey" FOREIGN KEY ("organizationId", "approvedBy") REFERENCES "Membership"("organizationId", "userId") ON DELETE RESTRICT,
  CONSTRAINT "NotificationTemplate_locale_check" CHECK ("locale" IN ('ar', 'en')),
  CONSTRAINT "NotificationTemplate_key_check" CHECK ("templateKey" <> '' AND "templateKey" ~ '^[a-z][a-z0-9._-]{0,99}$'),
  CONSTRAINT "NotificationTemplate_body_check" CHECK ("body" <> '' AND "body" ~ '\\S'),
  CONSTRAINT "NotificationTemplate_approval_check" CHECK (("status" = 'DRAFT' AND "approvedBy" IS NULL AND "approvedAt" IS NULL) OR ("status" = 'APPROVED' AND "approvedBy" IS NOT NULL AND "approvedAt" IS NOT NULL))
);
CREATE UNIQUE INDEX "NotificationTemplate_org_key_locale_version_key" ON "NotificationTemplate"("organizationId", "templateKey", "locale", "version");
CREATE INDEX "NotificationTemplate_org_key_locale_status_idx" ON "NotificationTemplate"("organizationId", "templateKey", "locale", "status");

CREATE TABLE "NotificationDeliveryPolicy" (
  "organizationId" UUID NOT NULL,
  "timeZone" VARCHAR(100) NOT NULL DEFAULT 'UTC',
  "quietStart" CHAR(5) NOT NULL DEFAULT '22:00',
  "quietEnd" CHAR(5) NOT NULL DEFAULT '07:00',
  "updatedBy" UUID NOT NULL,
  "updatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),
  CONSTRAINT "NotificationDeliveryPolicy_pkey" PRIMARY KEY ("organizationId"),
  CONSTRAINT "NotificationDeliveryPolicy_organization_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT,
  CONSTRAINT "NotificationDeliveryPolicy_updater_membership_fkey" FOREIGN KEY ("organizationId", "updatedBy") REFERENCES "Membership"("organizationId", "userId") ON DELETE RESTRICT,
  CONSTRAINT "NotificationDeliveryPolicy_time_check" CHECK ("timeZone" <> '' AND "quietStart" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' AND "quietEnd" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$')
);

CREATE TABLE "NotificationRecipientPreference" (
  "organizationId" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "channel" "NotificationChannel" NOT NULL,
  "consent" BOOLEAN NOT NULL DEFAULT TRUE,
  "optedOut" BOOLEAN NOT NULL DEFAULT FALSE,
  "updatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),
  CONSTRAINT "NotificationRecipientPreference_pkey" PRIMARY KEY ("organizationId", "userId", "channel"),
  CONSTRAINT "NotificationRecipientPreference_membership_fkey" FOREIGN KEY ("organizationId", "userId") REFERENCES "Membership"("organizationId", "userId") ON DELETE RESTRICT
);

CREATE TABLE "NotificationApproval" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organizationId" UUID NOT NULL,
  "templateId" UUID NOT NULL,
  "recipientUserId" UUID NOT NULL,
  "channel" "NotificationChannel" NOT NULL,
  "locale" VARCHAR(2) NOT NULL,
  "variables" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "status" "NotificationApprovalStatus" NOT NULL DEFAULT 'PENDING',
  "requestedBy" UUID NOT NULL,
  "requestedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),
  "decidedBy" UUID,
  "decidedAt" TIMESTAMPTZ(6),
  "decisionReason" VARCHAR(500),
  "idempotencyKey" VARCHAR(200) NOT NULL,
  CONSTRAINT "NotificationApproval_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "NotificationApproval_template_fkey" FOREIGN KEY ("templateId") REFERENCES "NotificationTemplate"("id") ON DELETE RESTRICT,
  CONSTRAINT "NotificationApproval_organization_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT,
  CONSTRAINT "NotificationApproval_recipient_membership_fkey" FOREIGN KEY ("organizationId", "recipientUserId") REFERENCES "Membership"("organizationId", "userId") ON DELETE RESTRICT,
  CONSTRAINT "NotificationApproval_requester_membership_fkey" FOREIGN KEY ("organizationId", "requestedBy") REFERENCES "Membership"("organizationId", "userId") ON DELETE RESTRICT,
  CONSTRAINT "NotificationApproval_decider_membership_fkey" FOREIGN KEY ("organizationId", "decidedBy") REFERENCES "Membership"("organizationId", "userId") ON DELETE RESTRICT,
  CONSTRAINT "NotificationApproval_locale_check" CHECK ("locale" IN ('ar', 'en')),
  CONSTRAINT "NotificationApproval_decision_check" CHECK (("status" = 'PENDING' AND "decidedBy" IS NULL AND "decidedAt" IS NULL) OR ("status" <> 'PENDING' AND "decidedBy" IS NOT NULL AND "decidedAt" IS NOT NULL)),
  CONSTRAINT "NotificationApproval_idempotency_check" CHECK ("idempotencyKey" <> '')
);
CREATE UNIQUE INDEX "NotificationApproval_org_idempotency_key" ON "NotificationApproval"("organizationId", "idempotencyKey");
CREATE INDEX "NotificationApproval_org_status_requested_idx" ON "NotificationApproval"("organizationId", "status", "requestedAt" DESC);

CREATE TABLE "NotificationSend" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organizationId" UUID NOT NULL,
  "approvalId" UUID,
  "templateId" UUID,
  "templateKey" VARCHAR(100) NOT NULL,
  "templateVersion" INTEGER,
  "recipientUserId" UUID NOT NULL,
  "channel" "NotificationChannel" NOT NULL,
  "locale" VARCHAR(2) NOT NULL,
  "status" "NotificationSendStatus" NOT NULL,
  "suppressionReason" "NotificationSuppressionReason",
  "renderedSubject" VARCHAR(500),
  "renderedBody" VARCHAR(4000) NOT NULL,
  "providerMessageId" VARCHAR(200),
  "idempotencyKey" VARCHAR(200) NOT NULL,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),
  CONSTRAINT "NotificationSend_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "NotificationSend_organization_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT,
  CONSTRAINT "NotificationSend_approval_fkey" FOREIGN KEY ("approvalId") REFERENCES "NotificationApproval"("id") ON DELETE RESTRICT,
  CONSTRAINT "NotificationSend_template_fkey" FOREIGN KEY ("templateId") REFERENCES "NotificationTemplate"("id") ON DELETE RESTRICT,
  CONSTRAINT "NotificationSend_recipient_membership_fkey" FOREIGN KEY ("organizationId", "recipientUserId") REFERENCES "Membership"("organizationId", "userId") ON DELETE RESTRICT,
  CONSTRAINT "NotificationSend_locale_check" CHECK ("locale" IN ('ar', 'en')),
  CONSTRAINT "NotificationSend_suppression_check" CHECK (("status" = 'SUPPRESSED' AND "suppressionReason" IS NOT NULL) OR ("status" <> 'SUPPRESSED' AND "suppressionReason" IS NULL))
);
CREATE UNIQUE INDEX "NotificationSend_org_idempotency_key" ON "NotificationSend"("organizationId", "idempotencyKey");
CREATE INDEX "NotificationSend_org_created_idx" ON "NotificationSend"("organizationId", "createdAt" DESC, "id");

CREATE TABLE "NotificationAuditEvent" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organizationId" UUID NOT NULL,
  "entityType" VARCHAR(40) NOT NULL,
  "entityId" UUID NOT NULL,
  "action" VARCHAR(40) NOT NULL,
  "actorUserId" UUID,
  "reason" VARCHAR(500),
  "metadata" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),
  CONSTRAINT "NotificationAuditEvent_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "NotificationAuditEvent_organization_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT,
  CONSTRAINT "NotificationAuditEvent_actor_membership_fkey" FOREIGN KEY ("organizationId", "actorUserId") REFERENCES "Membership"("organizationId", "userId") ON DELETE RESTRICT
);
CREATE INDEX "NotificationAuditEvent_org_created_idx" ON "NotificationAuditEvent"("organizationId", "createdAt" DESC);
