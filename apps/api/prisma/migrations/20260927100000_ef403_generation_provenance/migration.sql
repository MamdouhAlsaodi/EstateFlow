-- EF-403: safe listing-to-content generation — provenance stamp linking a
-- generated draft to the exact property version and template version it was
-- deterministically rendered from. The four columns are written together or
-- not at all, carry positive versions only, are tenant-bound to the source
-- property through a composite FK, and are identity-immutable under the same
-- trigger philosophy as EF-402 (a stamp is historical evidence, never mutable
-- state).
ALTER TABLE "ContentItem" ADD COLUMN "sourcePropertyId" UUID;
ALTER TABLE "ContentItem" ADD COLUMN "sourcePropertyVersion" INTEGER;
ALTER TABLE "ContentItem" ADD COLUMN "generatedTemplateId" VARCHAR(100);
ALTER TABLE "ContentItem" ADD COLUMN "generatedTemplateVersion" INTEGER;

CREATE INDEX "ContentItem_organization_source_property_idx" ON "ContentItem"("organizationId", "sourcePropertyId");

-- Provenance is complete or absent: a half-written stamp can never exist.
ALTER TABLE "ContentItem" ADD CONSTRAINT "ContentItem_generation_provenance_complete" CHECK (
    (
        "sourcePropertyId" IS NULL
        AND "sourcePropertyVersion" IS NULL
        AND "generatedTemplateId" IS NULL
        AND "generatedTemplateVersion" IS NULL
    )
    OR (
        "sourcePropertyId" IS NOT NULL
        AND "sourcePropertyVersion" IS NOT NULL
        AND "generatedTemplateId" IS NOT NULL
        AND "generatedTemplateVersion" IS NOT NULL
    )
);
ALTER TABLE "ContentItem" ADD CONSTRAINT "ContentItem_source_property_version_positive" CHECK ("sourcePropertyVersion" IS NULL OR "sourcePropertyVersion" >= 1);
ALTER TABLE "ContentItem" ADD CONSTRAINT "ContentItem_generated_template_version_positive" CHECK ("generatedTemplateVersion" IS NULL OR "generatedTemplateVersion" >= 1);

-- Composite tenant FK: the stamped property must live in the same
-- organization as the generated content, so a forged cross-tenant stamp is
-- impossible at the database level.
ALTER TABLE "ContentItem" ADD CONSTRAINT "ContentItem_source_property_fkey" FOREIGN KEY ("sourcePropertyId", "organizationId") REFERENCES "Property"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Extend the EF-402 identity-immutability guard in place: generation
-- provenance becomes part of the immutable identity of a content row.
CREATE OR REPLACE FUNCTION "ef402_reject_content_item_update"() RETURNS trigger LANGUAGE plpgsql AS $$
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
     OR NEW."createdAt" <> OLD."createdAt"
     OR NEW."sourcePropertyId" IS DISTINCT FROM OLD."sourcePropertyId"
     OR NEW."sourcePropertyVersion" IS DISTINCT FROM OLD."sourcePropertyVersion"
     OR NEW."generatedTemplateId" IS DISTINCT FROM OLD."generatedTemplateId"
     OR NEW."generatedTemplateVersion" IS DISTINCT FROM OLD."generatedTemplateVersion" THEN
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
