-- EF-402: content workflow — idea → draft → review → approved → scheduled →
-- published/failed, version/hash locked at approval, immutable published
-- content, revision variants, append-only audited transitions.
CREATE TYPE "ContentStatus" AS ENUM ('IDEA', 'DRAFT', 'REVIEW', 'APPROVED', 'SCHEDULED', 'PUBLISHED', 'FAILED');
CREATE TYPE "ContentChannel" AS ENUM ('INSTAGRAM', 'X', 'SNAPCHAT', 'TIKTOK', 'LINKEDIN', 'FACEBOOK', 'WHATSAPP', 'EMAIL', 'WEBSITE', 'OTHER');
CREATE TYPE "ContentFailureKind" AS ENUM ('CHANNEL_REJECTED', 'CHANNEL_TIMEOUT', 'CONTENT_POLICY_VIOLATION', 'SCHEDULE_MISSED', 'OTHER');

CREATE TABLE "ContentItem" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organizationId" UUID NOT NULL,
    "campaignId" UUID,
    "rootContentId" UUID,
    "variantOfId" UUID,
    "variantNumber" INTEGER NOT NULL DEFAULT 1,
    "title" VARCHAR(200) NOT NULL,
    "body" VARCHAR(5000) NOT NULL,
    "channel" "ContentChannel" NOT NULL,
    "status" "ContentStatus" NOT NULL DEFAULT 'IDEA',
    "scheduledFor" TIMESTAMPTZ(6),
    "approvedVersion" INTEGER,
    "contentHash" CHAR(64),
    "createdBy" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "ContentItem_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ContentItem_variant_number_positive" CHECK ("variantNumber" >= 1)
);

CREATE TABLE "ContentTransition" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organizationId" UUID NOT NULL,
    "contentItemId" UUID NOT NULL,
    "fromStatus" "ContentStatus" NOT NULL,
    "toStatus" "ContentStatus" NOT NULL,
    "reason" VARCHAR(500),
    "failureKind" "ContentFailureKind",
    "version" INTEGER,
    "contentHash" CHAR(64),
    "actorId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContentTransition_pkey" PRIMARY KEY ("id"),
    -- Failed publishing always carries its typed reason.
    CONSTRAINT "ContentTransition_failed_typed_reason" CHECK (
        "toStatus" <> 'FAILED' OR ("failureKind" IS NOT NULL AND "reason" IS NOT NULL)
    ),
    -- Approvals always lock the content version and hash.
    CONSTRAINT "ContentTransition_approval_locks_version" CHECK (
        "toStatus" <> 'APPROVED' OR ("version" IS NOT NULL AND "contentHash" IS NOT NULL)
    ),
    CONSTRAINT "ContentTransition_version_only_on_approval" CHECK (
        "toStatus" = 'APPROVED' OR ("version" IS NULL AND "contentHash" IS NULL)
    )
);

-- Unique/composite indexes first: the composite tenant FKs below reference them.
CREATE UNIQUE INDEX "ContentItem_organization_id_key" ON "ContentItem"("organizationId", "id");
-- One variant number per lineage even under concurrent revision creation.
CREATE UNIQUE INDEX "ContentItem_lineage_variant_key" ON "ContentItem"("organizationId", "rootContentId", "variantNumber") WHERE "rootContentId" IS NOT NULL;
CREATE UNIQUE INDEX "ContentTransition_organization_id_key" ON "ContentTransition"("organizationId", "id");

-- Composite tenant foreign keys (organizationId first-class in every path).
ALTER TABLE "ContentItem" ADD CONSTRAINT "ContentItem_organization_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ContentItem" ADD CONSTRAINT "ContentItem_campaign_fkey" FOREIGN KEY ("campaignId", "organizationId") REFERENCES "Campaign"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ContentItem" ADD CONSTRAINT "ContentItem_root_content_fkey" FOREIGN KEY ("rootContentId", "organizationId") REFERENCES "ContentItem"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ContentItem" ADD CONSTRAINT "ContentItem_parent_variant_fkey" FOREIGN KEY ("variantOfId", "organizationId") REFERENCES "ContentItem"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ContentTransition" ADD CONSTRAINT "ContentTransition_content_item_fkey" FOREIGN KEY ("contentItemId", "organizationId") REFERENCES "ContentItem"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ContentTransition" ADD CONSTRAINT "ContentTransition_organization_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "ContentItem_organization_status_updated_idx" ON "ContentItem"("organizationId", "status", "updatedAt");
CREATE INDEX "ContentItem_organization_created_idx" ON "ContentItem"("organizationId", "createdAt");
CREATE INDEX "ContentItem_organization_root_variant_idx" ON "ContentItem"("organizationId", "rootContentId", "variantNumber");
CREATE INDEX "ContentItem_organization_scheduled_idx" ON "ContentItem"("organizationId", "scheduledFor");
CREATE INDEX "ContentItem_organization_campaign_idx" ON "ContentItem"("organizationId", "campaignId");
CREATE INDEX "ContentTransition_organization_item_created_idx" ON "ContentTransition"("organizationId", "contentItemId", "createdAt");

-- Database-enforced content invariants: published rows are fully immutable,
-- identity/provenance columns never change, content is editable only while
-- IDEA/DRAFT, the schedule is set only when moving APPROVED → SCHEDULED, the
-- version/hash pair is locked at approval and increments by exactly one, and
-- every lifecycle step must follow the allowed transition matrix.
CREATE FUNCTION "ef402_reject_content_item_update"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD."status" = 'PUBLISHED' THEN
    RAISE EXCEPTION 'published content is immutable';
  END IF;
  IF NEW."organizationId" <> OLD."organizationId"
     OR NEW."campaignId" IS DISTINCT FROM OLD."campaignId"
     OR NEW."rootContentId" IS DISTINCT FROM OLD."rootContentId"
     OR NEW."variantOfId" IS DISTINCT FROM OLD."variantOfId"
     OR NEW."variantNumber" <> OLD."variantNumber"
     OR NEW."createdBy" <> OLD."createdBy"
     OR NEW."createdAt" <> OLD."createdAt" THEN
    RAISE EXCEPTION 'content identity is immutable; create a revision';
  END IF;
  IF OLD."status" NOT IN ('IDEA', 'DRAFT')
     AND (NEW."title" <> OLD."title" OR NEW."body" <> OLD."body" OR NEW."channel" <> OLD."channel") THEN
    RAISE EXCEPTION 'content is locked; create a revision to change it';
  END IF;
  IF NEW."scheduledFor" IS DISTINCT FROM OLD."scheduledFor"
     AND NOT (OLD."status" = 'APPROVED' AND NEW."status" = 'SCHEDULED') THEN
    RAISE EXCEPTION 'schedule is set only by the approval-to-scheduled transition';
  END IF;
  IF OLD."status" = 'REVIEW' AND NEW."status" = 'APPROVED' THEN
    IF NEW."approvedVersion" IS NULL OR NEW."contentHash" IS NULL
       OR NEW."approvedVersion" <> COALESCE(OLD."approvedVersion", 0) + 1 THEN
      RAISE EXCEPTION 'approval must lock the next content version and hash';
    END IF;
  ELSIF NEW."approvedVersion" IS DISTINCT FROM OLD."approvedVersion"
     OR NEW."contentHash" IS DISTINCT FROM OLD."contentHash" THEN
    RAISE EXCEPTION 'content version/hash changes only at approval';
  END IF;
  IF NEW."status" <> OLD."status" AND NOT (
       (OLD."status" = 'IDEA' AND NEW."status" = 'DRAFT') OR
       (OLD."status" = 'DRAFT' AND NEW."status" = 'REVIEW') OR
       (OLD."status" = 'REVIEW' AND NEW."status" IN ('DRAFT', 'APPROVED')) OR
       (OLD."status" = 'APPROVED' AND NEW."status" = 'SCHEDULED') OR
       (OLD."status" = 'SCHEDULED' AND NEW."status" IN ('PUBLISHED', 'FAILED')) OR
       (OLD."status" = 'FAILED' AND NEW."status" = 'REVIEW')
     ) THEN
    RAISE EXCEPTION 'illegal content lifecycle transition % -> %', OLD."status", NEW."status";
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "ef402_content_item_immutable"
  BEFORE UPDATE ON "ContentItem"
  FOR EACH ROW EXECUTE FUNCTION "ef402_reject_content_item_update"();

CREATE FUNCTION "ef402_reject_content_item_delete"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD."status" NOT IN ('IDEA', 'DRAFT') THEN
    RAISE EXCEPTION 'locked content is immutable and cannot be deleted';
  END IF;
  RETURN OLD;
END;
$$;

CREATE TRIGGER "ef402_content_item_no_delete"
  BEFORE DELETE ON "ContentItem"
  FOR EACH ROW EXECUTE FUNCTION "ef402_reject_content_item_delete"();

-- Audited transitions are append-only: no update, no delete, ever.
CREATE FUNCTION "ef402_reject_content_transition_mutation"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'content transitions are append-only';
END;
$$;

CREATE TRIGGER "ef402_content_transition_append_only"
  BEFORE UPDATE OR DELETE ON "ContentTransition"
  FOR EACH ROW EXECUTE FUNCTION "ef402_reject_content_transition_mutation"();
