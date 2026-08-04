-- EF-202: organization-scoped leads, append-only timeline, and command idempotency.
CREATE TYPE "LeadStage" AS ENUM ('NEW', 'CONTACTED', 'QUALIFIED', 'NURTURING');
CREATE TYPE "LeadTimelineEventType" AS ENUM ('LEAD_CREATED', 'LEAD_ASSIGNED', 'LEAD_STAGE_CHANGED', 'LEAD_NEXT_ACTION_CHANGED');

CREATE TABLE "Lead" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organizationId" UUID NOT NULL,
    "ownerId" UUID NOT NULL,
    "stage" "LeadStage" NOT NULL DEFAULT 'NEW',
    "nextAction" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "utm" JSONB,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "Lead_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "Lead_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Lead_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Lead_organizationId_ownerId_fkey" FOREIGN KEY ("organizationId", "ownerId") REFERENCES "Membership"("organizationId", "userId") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Lead_version_positive" CHECK ("version" > 0)
);
CREATE UNIQUE INDEX "Lead_organizationId_id_key" ON "Lead"("organizationId", "id");
CREATE INDEX "Lead_organizationId_ownerId_idx" ON "Lead"("organizationId", "ownerId");
CREATE INDEX "Lead_organizationId_stage_idx" ON "Lead"("organizationId", "stage");

CREATE TABLE "LeadIdempotencyRecord" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organizationId" UUID NOT NULL,
    "commandScope" VARCHAR(64) NOT NULL,
    "idempotencyKey" VARCHAR(255) NOT NULL,
    "payloadHash" VARCHAR(64) NOT NULL,
    "leadId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "LeadIdempotencyRecord_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "LeadIdempotencyRecord_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "LeadIdempotencyRecord_organizationId_leadId_fkey" FOREIGN KEY ("organizationId", "leadId") REFERENCES "Lead"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "LeadIdempotencyRecord_organizationId_id_key" ON "LeadIdempotencyRecord"("organizationId", "id");
CREATE UNIQUE INDEX "LeadIdempotencyRecord_organizationId_commandScope_idempotencyKey_key" ON "LeadIdempotencyRecord"("organizationId", "commandScope", "idempotencyKey");
CREATE INDEX "LeadIdempotencyRecord_organizationId_leadId_idx" ON "LeadIdempotencyRecord"("organizationId", "leadId");

CREATE TABLE "LeadTimelineEvent" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organizationId" UUID NOT NULL,
    "leadId" UUID NOT NULL,
    "idempotencyId" UUID NOT NULL,
    "type" "LeadTimelineEventType" NOT NULL,
    "occurredAt" TIMESTAMPTZ(6) NOT NULL,
    "data" JSONB NOT NULL,
    CONSTRAINT "LeadTimelineEvent_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "LeadTimelineEvent_organizationId_leadId_fkey" FOREIGN KEY ("organizationId", "leadId") REFERENCES "Lead"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "LeadTimelineEvent_organizationId_idempotencyId_fkey" FOREIGN KEY ("organizationId", "idempotencyId") REFERENCES "LeadIdempotencyRecord"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "LeadTimelineEvent_organizationId_leadId_occurredAt_idx" ON "LeadTimelineEvent"("organizationId", "leadId", "occurredAt");
CREATE INDEX "LeadTimelineEvent_idempotencyId_idx" ON "LeadTimelineEvent"("idempotencyId");
