-- EF-501: weekly broker availability, date exceptions, audited viewing lifecycle,
-- and the database-level confirmed-interval race guarantee.
CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TYPE "LeadTimelineEventType" ADD VALUE 'VIEWING_REQUESTED';
ALTER TYPE "LeadTimelineEventType" ADD VALUE 'VIEWING_CONFIRMED';
ALTER TYPE "LeadTimelineEventType" ADD VALUE 'VIEWING_RESCHEDULED';
ALTER TYPE "LeadTimelineEventType" ADD VALUE 'VIEWING_CANCELLED';
ALTER TYPE "LeadTimelineEventType" ADD VALUE 'VIEWING_COMPLETED';
ALTER TYPE "LeadTimelineEventType" ADD VALUE 'VIEWING_NO_SHOW';

CREATE TYPE "ViewingStatus" AS ENUM ('REQUESTED', 'CONFIRMED', 'CANCELLED', 'COMPLETED', 'NO_SHOW');
CREATE TYPE "ViewingTransitionAction" AS ENUM ('REQUESTED', 'CONFIRMED', 'RESCHEDULED', 'CANCELLED', 'COMPLETED', 'NO_SHOW');
CREATE TYPE "AvailabilityExceptionKind" AS ENUM ('BLOCKED', 'EXTRA');

CREATE TABLE "BrokerAvailabilityRule" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organizationId" UUID NOT NULL,
  "brokerId" UUID NOT NULL,
  "weekday" INTEGER NOT NULL,
  "startMinute" INTEGER NOT NULL,
  "endMinute" INTEGER NOT NULL,
  "timezone" VARCHAR(64) NOT NULL,
  "createdBy" UUID NOT NULL,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "BrokerAvailabilityRule_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "BrokerAvailabilityRule_weekday_check" CHECK ("weekday" BETWEEN 0 AND 6),
  CONSTRAINT "BrokerAvailabilityRule_minutes_check" CHECK ("startMinute" >= 0 AND "startMinute" < "endMinute" AND "endMinute" <= 1440)
);
CREATE TABLE "BrokerAvailabilityException" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organizationId" UUID NOT NULL,
  "brokerId" UUID NOT NULL,
  "localDate" VARCHAR(10) NOT NULL,
  "kind" "AvailabilityExceptionKind" NOT NULL,
  "startMinute" INTEGER NOT NULL,
  "endMinute" INTEGER NOT NULL,
  "timezone" VARCHAR(64) NOT NULL,
  "createdBy" UUID NOT NULL,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "BrokerAvailabilityException_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "BrokerAvailabilityException_date_check" CHECK ("localDate" ~ '^\\d{4}-\\d{2}-\\d{2}$'),
  CONSTRAINT "BrokerAvailabilityException_minutes_check" CHECK ("startMinute" >= 0 AND "startMinute" < "endMinute" AND "endMinute" <= 1440)
);
CREATE TABLE "Viewing" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organizationId" UUID NOT NULL,
  "leadId" UUID NOT NULL,
  "propertyId" UUID NOT NULL,
  "brokerId" UUID NOT NULL,
  "requestedByUserId" UUID NOT NULL,
  "startAt" TIMESTAMPTZ(6) NOT NULL,
  "endAt" TIMESTAMPTZ(6) NOT NULL,
  "status" "ViewingStatus" NOT NULL DEFAULT 'REQUESTED',
  "notes" VARCHAR(1000),
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "Viewing_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Viewing_interval_check" CHECK ("startAt" < "endAt")
);
CREATE TABLE "ViewingTransition" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organizationId" UUID NOT NULL,
  "viewingId" UUID NOT NULL,
  "action" "ViewingTransitionAction" NOT NULL,
  "fromStatus" "ViewingStatus",
  "toStatus" "ViewingStatus" NOT NULL,
  "startAt" TIMESTAMPTZ(6) NOT NULL,
  "endAt" TIMESTAMPTZ(6) NOT NULL,
  "reason" VARCHAR(500),
  "actorId" UUID NOT NULL,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ViewingTransition_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "BrokerAvailabilityRule_organization_id_key" ON "BrokerAvailabilityRule"("organizationId", "id");
CREATE INDEX "BrokerAvailabilityRule_broker_weekday_idx" ON "BrokerAvailabilityRule"("organizationId", "brokerId", "weekday");
CREATE UNIQUE INDEX "BrokerAvailabilityException_organization_id_key" ON "BrokerAvailabilityException"("organizationId", "id");
CREATE INDEX "BrokerAvailabilityException_broker_date_idx" ON "BrokerAvailabilityException"("organizationId", "brokerId", "localDate");
CREATE UNIQUE INDEX "Viewing_organization_id_key" ON "Viewing"("organizationId", "id");
CREATE INDEX "Viewing_broker_start_idx" ON "Viewing"("organizationId", "brokerId", "startAt");
CREATE INDEX "Viewing_lead_start_idx" ON "Viewing"("organizationId", "leadId", "startAt");
CREATE INDEX "Viewing_status_start_idx" ON "Viewing"("organizationId", "status", "startAt");
CREATE UNIQUE INDEX "ViewingTransition_organization_id_key" ON "ViewingTransition"("organizationId", "id");
CREATE INDEX "ViewingTransition_viewing_created_idx" ON "ViewingTransition"("organizationId", "viewingId", "createdAt");

ALTER TABLE "BrokerAvailabilityRule" ADD CONSTRAINT "BrokerAvailabilityRule_organization_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "BrokerAvailabilityRule" ADD CONSTRAINT "BrokerAvailabilityRule_broker_fkey" FOREIGN KEY ("organizationId", "brokerId") REFERENCES "Membership"("organizationId", "userId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "BrokerAvailabilityException" ADD CONSTRAINT "BrokerAvailabilityException_organization_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "BrokerAvailabilityException" ADD CONSTRAINT "BrokerAvailabilityException_broker_fkey" FOREIGN KEY ("organizationId", "brokerId") REFERENCES "Membership"("organizationId", "userId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Viewing" ADD CONSTRAINT "Viewing_organization_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Viewing" ADD CONSTRAINT "Viewing_lead_fkey" FOREIGN KEY ("organizationId", "leadId") REFERENCES "Lead"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Viewing" ADD CONSTRAINT "Viewing_property_fkey" FOREIGN KEY ("organizationId", "propertyId") REFERENCES "Property"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Viewing" ADD CONSTRAINT "Viewing_broker_fkey" FOREIGN KEY ("organizationId", "brokerId") REFERENCES "Membership"("organizationId", "userId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ViewingTransition" ADD CONSTRAINT "ViewingTransition_organization_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ViewingTransition" ADD CONSTRAINT "ViewingTransition_viewing_fkey" FOREIGN KEY ("organizationId", "viewingId") REFERENCES "Viewing"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Viewing" ADD CONSTRAINT "Viewing_confirmed_broker_interval_exclusion"
  EXCLUDE USING gist ("brokerId" WITH =, tstzrange("startAt", "endAt", '[)') WITH &&)
  WHERE ("status" = 'CONFIRMED');
