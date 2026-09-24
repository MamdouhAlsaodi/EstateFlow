-- EF-404: publishing adapters — durable publish occurrences plus append-only
-- delivered payload snapshots. Delivery is at-most-once per (content item
-- version, channel, scheduled occurrence): the unique (organizationId,
-- executionKey) index deduplicates occurrence insertion, the worker claims
-- due occurrences FOR UPDATE SKIP LOCKED, and the unique delivery occurrence
-- index makes a double publish impossible even across worker restarts.

CREATE TYPE "ContentPublishJobStatus" AS ENUM ('QUEUED', 'RUNNING', 'RETRYING', 'DELIVERED', 'FAILED', 'CANCELLED');

CREATE TABLE "ContentPublishJob" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organizationId" UUID NOT NULL,
    "contentItemId" UUID NOT NULL,
    "approvedVersion" INTEGER NOT NULL,
    "channel" "ContentChannel" NOT NULL,
    "scheduledFor" TIMESTAMPTZ(6) NOT NULL,
    "contentHash" CHAR(64) NOT NULL,
    "executionKey" CHAR(64) NOT NULL,
    "status" "ContentPublishJobStatus" NOT NULL DEFAULT 'QUEUED',
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 5,
    "nextAttemptAt" TIMESTAMPTZ(6) NOT NULL,
    "lastErrorKind" "ContentFailureKind",
    "lastErrorMessage" VARCHAR(500),
    "startedAt" TIMESTAMPTZ(6),
    "completedAt" TIMESTAMPTZ(6),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "ContentPublishJob_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ContentPublishJob_version_positive" CHECK ("approvedVersion" >= 1),
    CONSTRAINT "ContentPublishJob_attempts_nonnegative" CHECK ("attemptCount" >= 0),
    CONSTRAINT "ContentPublishJob_max_attempts_bounded" CHECK ("maxAttempts" >= 1 AND "maxAttempts" <= 10)
);

CREATE TABLE "ContentDelivery" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organizationId" UUID NOT NULL,
    "contentItemId" UUID NOT NULL,
    "publishJobId" UUID NOT NULL,
    "approvedVersion" INTEGER NOT NULL,
    "channel" "ContentChannel" NOT NULL,
    "contentHash" CHAR(64) NOT NULL,
    "payload" JSONB NOT NULL,
    "providerMessageId" VARCHAR(200) NOT NULL,
    "deliveredAt" TIMESTAMPTZ(6) NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContentDelivery_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ContentDelivery_version_positive" CHECK ("approvedVersion" >= 1)
);

-- Unique/composite indexes first: the composite tenant FKs below reference them.
CREATE UNIQUE INDEX "ContentPublishJob_id_organization_key" ON "ContentPublishJob"("id", "organizationId");
CREATE UNIQUE INDEX "ContentPublishJob_organization_execution_key_key" ON "ContentPublishJob"("organizationId", "executionKey");
CREATE UNIQUE INDEX "ContentDelivery_occurrence_key" ON "ContentDelivery"("organizationId", "contentItemId", "approvedVersion", "channel");
CREATE UNIQUE INDEX "ContentDelivery_publish_job_organization_key" ON "ContentDelivery"("publishJobId", "organizationId");

ALTER TABLE "ContentPublishJob" ADD CONSTRAINT "ContentPublishJob_organization_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ContentPublishJob" ADD CONSTRAINT "ContentPublishJob_content_item_fkey" FOREIGN KEY ("contentItemId", "organizationId") REFERENCES "ContentItem"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ContentDelivery" ADD CONSTRAINT "ContentDelivery_organization_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ContentDelivery" ADD CONSTRAINT "ContentDelivery_content_item_fkey" FOREIGN KEY ("contentItemId", "organizationId") REFERENCES "ContentItem"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ContentDelivery" ADD CONSTRAINT "ContentDelivery_publish_job_fkey" FOREIGN KEY ("publishJobId", "organizationId") REFERENCES "ContentPublishJob"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "ContentPublishJob_claim_idx" ON "ContentPublishJob"("status", "nextAttemptAt");
CREATE INDEX "ContentPublishJob_organization_status_scheduled_idx" ON "ContentPublishJob"("organizationId", "status", "scheduledFor");
CREATE INDEX "ContentPublishJob_organization_item_idx" ON "ContentPublishJob"("organizationId", "contentItemId");
CREATE INDEX "ContentDelivery_organization_delivered_idx" ON "ContentDelivery"("organizationId", "deliveredAt");

-- Database-enforced publish-job invariants: the occurrence identity (tenant,
-- item, approved version, channel, scheduled time, hash, execution key) is
-- immutable, terminal rows are frozen, and only the allowlisted status
-- transitions can occur. Retries reschedule nextAttemptAt with bounded
-- backoff; delivered/failed/cancelled rows can never change again.
CREATE FUNCTION "ef404_reject_publish_job_update"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."organizationId" <> OLD."organizationId"
     OR NEW."contentItemId" <> OLD."contentItemId"
     OR NEW."approvedVersion" <> OLD."approvedVersion"
     OR NEW."channel" <> OLD."channel"
     OR NEW."scheduledFor" <> OLD."scheduledFor"
     OR NEW."contentHash" <> OLD."contentHash"
     OR NEW."executionKey" <> OLD."executionKey"
     OR NEW."maxAttempts" <> OLD."maxAttempts"
     OR NEW."createdAt" <> OLD."createdAt" THEN
    RAISE EXCEPTION 'publish job occurrence identity is immutable';
  END IF;
  IF OLD."status" IN ('DELIVERED', 'FAILED', 'CANCELLED') THEN
    RAISE EXCEPTION 'publish job is terminal in status %', OLD."status";
  END IF;
  IF NOT (
       (OLD."status" = 'QUEUED' AND NEW."status" IN ('RUNNING', 'CANCELLED')) OR
       (OLD."status" = 'RETRYING' AND NEW."status" IN ('RUNNING', 'CANCELLED')) OR
       (OLD."status" = 'RUNNING' AND NEW."status" IN ('DELIVERED', 'RETRYING', 'FAILED'))
     ) THEN
    RAISE EXCEPTION 'illegal publish job transition % -> %', OLD."status", NEW."status";
  END IF;
  IF NEW."status" = 'DELIVERED' AND NEW."completedAt" IS NULL THEN
    RAISE EXCEPTION 'delivered publish job requires a completion time';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "ef404_publish_job_guard"
  BEFORE UPDATE ON "ContentPublishJob"
  FOR EACH ROW EXECUTE FUNCTION "ef404_reject_publish_job_update"();

-- Delivered payload snapshots are append-only audit: no update, no delete.
CREATE FUNCTION "ef404_reject_content_delivery_mutation"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'delivered payload snapshots are append-only';
END;
$$;

CREATE TRIGGER "ef404_content_delivery_append_only"
  BEFORE UPDATE OR DELETE ON "ContentDelivery"
  FOR EACH ROW EXECUTE FUNCTION "ef404_reject_content_delivery_mutation"();
