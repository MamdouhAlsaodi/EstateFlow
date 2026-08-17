-- EF-203: atomic Lead close outcomes, tenant-scoped Deals, and durable Deal events.
ALTER TYPE "LeadStage" ADD VALUE 'CLOSED_WON';
ALTER TYPE "LeadStage" ADD VALUE 'CLOSED_LOST';
ALTER TYPE "LeadTimelineEventType" ADD VALUE 'LEAD_CLOSED_WON';
ALTER TYPE "LeadTimelineEventType" ADD VALUE 'LEAD_CLOSED_LOST';

CREATE TABLE "Deal" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organizationId" UUID NOT NULL,
    "leadId" UUID NOT NULL,
    "propertyId" UUID NOT NULL,
    "brokerId" UUID NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "Deal_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "Deal_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Deal_organizationId_leadId_fkey" FOREIGN KEY ("organizationId", "leadId") REFERENCES "Lead"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Deal_organizationId_propertyId_fkey" FOREIGN KEY ("organizationId", "propertyId") REFERENCES "Property"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Deal_organizationId_brokerId_fkey" FOREIGN KEY ("organizationId", "brokerId") REFERENCES "Membership"("organizationId", "userId") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Deal_version_positive" CHECK ("version" > 0),
    CONSTRAINT "Deal_status_open" CHECK ("status" = 'OPEN')
);
CREATE UNIQUE INDEX "Deal_organizationId_id_key" ON "Deal"("organizationId", "id");
CREATE UNIQUE INDEX "Deal_organizationId_leadId_key" ON "Deal"("organizationId", "leadId");

CREATE TABLE "DealDomainEvent" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organizationId" UUID NOT NULL,
    "dealId" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "schemaVersion" INTEGER NOT NULL,
    "occurredAt" TIMESTAMPTZ(6) NOT NULL,
    "data" JSONB NOT NULL,
    CONSTRAINT "DealDomainEvent_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "DealDomainEvent_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "DealDomainEvent_organizationId_dealId_fkey" FOREIGN KEY ("organizationId", "dealId") REFERENCES "Deal"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "DealDomainEvent_organizationId_id_key" ON "DealDomainEvent"("organizationId", "id");
CREATE INDEX "DealDomainEvent_organizationId_dealId_occurredAt_idx" ON "DealDomainEvent"("organizationId", "dealId", "occurredAt");
