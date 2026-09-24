-- EF-601: media pipeline — signed upload intents, confirmed media assets with
-- deterministic image variants, and orphan cleanup support. Storage keys are
-- opaque adapter tokens; no server filesystem path is persisted.

CREATE TYPE "MediaKind" AS ENUM ('IMAGE', 'VIDEO');
CREATE TYPE "MediaStatus" AS ENUM ('PENDING', 'CONFIRMED', 'PROCESSING', 'ORPHAN');
CREATE TYPE "MediaFormat" AS ENUM ('JPEG', 'PNG', 'WEBP', 'MP4', 'WEBM', 'MOV');
CREATE TYPE "MediaVariantKind" AS ENUM ('THUMB', 'PREVIEW');

CREATE TABLE "MediaAsset" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organizationId" UUID NOT NULL,
    "propertyId" UUID NOT NULL,
    "kind" "MediaKind" NOT NULL,
    "status" "MediaStatus" NOT NULL DEFAULT 'PENDING',
    "declaredContentType" VARCHAR(100) NOT NULL,
    "declaredFileName" VARCHAR(255) NOT NULL,
    "declaredByteSize" INTEGER NOT NULL,
    "storageKey" VARCHAR(120) NOT NULL,
    "format" "MediaFormat",
    "byteSize" INTEGER,
    "sha256" CHAR(64),
    "width" INTEGER,
    "height" INTEGER,
    "processingNote" VARCHAR(200),
    "uploadedBy" UUID NOT NULL,
    "intentExpiresAt" TIMESTAMPTZ(6) NOT NULL,
    "confirmedAt" TIMESTAMPTZ(6),
    "orphanMarkedAt" TIMESTAMPTZ(6),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "MediaAsset_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MediaVariant" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organizationId" UUID NOT NULL,
    "mediaAssetId" UUID NOT NULL,
    "variant" "MediaVariantKind" NOT NULL,
    "storageKey" VARCHAR(120) NOT NULL,
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "byteSize" INTEGER NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MediaVariant_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MediaAsset_storageKey_key" ON "MediaAsset"("storageKey");
CREATE UNIQUE INDEX "MediaAsset_organizationId_id_key" ON "MediaAsset"("organizationId", "id");
CREATE INDEX "MediaAsset_organizationId_propertyId_status_idx" ON "MediaAsset"("organizationId", "propertyId", "status");
CREATE INDEX "MediaAsset_status_orphanMarkedAt_idx" ON "MediaAsset"("status", "orphanMarkedAt");
CREATE INDEX "MediaAsset_createdAt_idx" ON "MediaAsset"("createdAt");

CREATE UNIQUE INDEX "MediaVariant_storageKey_key" ON "MediaVariant"("storageKey");
CREATE UNIQUE INDEX "MediaVariant_organizationId_id_key" ON "MediaVariant"("organizationId", "id");
CREATE UNIQUE INDEX "MediaVariant_organizationId_mediaAssetId_variant_key" ON "MediaVariant"("organizationId", "mediaAssetId", "variant");
CREATE INDEX "MediaVariant_organizationId_mediaAssetId_idx" ON "MediaVariant"("organizationId", "mediaAssetId");

ALTER TABLE "MediaAsset"
  ADD CONSTRAINT "MediaAsset_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MediaAsset"
  ADD CONSTRAINT "MediaAsset_organizationId_propertyId_fkey"
  FOREIGN KEY ("organizationId", "propertyId") REFERENCES "Property"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "MediaVariant"
  ADD CONSTRAINT "MediaVariant_organizationId_mediaAssetId_fkey"
  FOREIGN KEY ("organizationId", "mediaAssetId") REFERENCES "MediaAsset"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Property" ADD COLUMN "coverMediaId" UUID;
ALTER TABLE "Property"
  ADD CONSTRAINT "Property_organizationId_coverMediaId_fkey"
  FOREIGN KEY ("organizationId", "coverMediaId") REFERENCES "MediaAsset"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
