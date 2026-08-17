-- EF-202 CRM-04: organization-scoped lead notes and tasks with typed timeline events.
ALTER TYPE "LeadTimelineEventType" ADD VALUE 'LEAD_NOTE_ADDED';
ALTER TYPE "LeadTimelineEventType" ADD VALUE 'LEAD_TASK_CREATED';
ALTER TYPE "LeadTimelineEventType" ADD VALUE 'LEAD_TASK_COMPLETED';
ALTER TYPE "LeadTimelineEventType" ADD VALUE 'LEAD_TASK_RESCHEDULED';
CREATE TYPE "LeadTaskStatus" AS ENUM ('OPEN', 'COMPLETED');

CREATE TABLE "LeadNote" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organizationId" UUID NOT NULL,
    "leadId" UUID NOT NULL,
    "body" TEXT NOT NULL,
    "createdByUserId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "LeadNote_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "LeadNote_organizationId_leadId_fkey" FOREIGN KEY ("organizationId", "leadId") REFERENCES "Lead"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "LeadNote_organizationId_id_key" ON "LeadNote"("organizationId", "id");
CREATE INDEX "LeadNote_organizationId_leadId_createdAt_idx" ON "LeadNote"("organizationId", "leadId", "createdAt");

CREATE TABLE "LeadTask" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organizationId" UUID NOT NULL,
    "leadId" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "dueAt" TIMESTAMPTZ(6) NOT NULL,
    "status" "LeadTaskStatus" NOT NULL DEFAULT 'OPEN',
    "completedAt" TIMESTAMPTZ(6),
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdByUserId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "LeadTask_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "LeadTask_organizationId_leadId_fkey" FOREIGN KEY ("organizationId", "leadId") REFERENCES "Lead"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "LeadTask_version_positive" CHECK ("version" > 0)
);
CREATE UNIQUE INDEX "LeadTask_organizationId_id_key" ON "LeadTask"("organizationId", "id");
CREATE INDEX "LeadTask_organizationId_leadId_status_dueAt_idx" ON "LeadTask"("organizationId", "leadId", "status", "dueAt");
