-- EF-201: organization-owned properties, historical listings, and image metadata.
CREATE TYPE "PropertyStatus" AS ENUM ('ACTIVE', 'ARCHIVED');
CREATE TYPE "ListingStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');
CREATE TYPE "ImageMediaType" AS ENUM ('JPEG', 'PNG', 'WEBP');

CREATE TABLE "Property" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organizationId" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "propertyType" TEXT NOT NULL,
    "addressText" TEXT NOT NULL,
    "ownerReference" TEXT,
    "status" "PropertyStatus" NOT NULL DEFAULT 'ACTIVE',
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "Property_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "Property_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Property_version_positive" CHECK ("version" > 0)
);
CREATE UNIQUE INDEX "Property_organizationId_id_key" ON "Property"("organizationId", "id");
CREATE INDEX "Property_organizationId_status_idx" ON "Property"("organizationId", "status");

CREATE TABLE "Listing" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organizationId" UUID NOT NULL,
    "propertyId" UUID NOT NULL,
    "status" "ListingStatus" NOT NULL DEFAULT 'DRAFT',
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "Listing_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "Listing_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Listing_organizationId_propertyId_fkey" FOREIGN KEY ("organizationId", "propertyId") REFERENCES "Property"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Listing_version_positive" CHECK ("version" > 0)
);
CREATE INDEX "Listing_organizationId_propertyId_status_idx" ON "Listing"("organizationId", "propertyId", "status");
CREATE UNIQUE INDEX "Listing_one_active_per_property_idx" ON "Listing"("propertyId") WHERE "status" IN ('DRAFT', 'PUBLISHED');

CREATE TABLE "ImageMetadata" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "listingId" UUID NOT NULL,
    "mediaType" "ImageMediaType" NOT NULL,
    "byteSize" INTEGER NOT NULL,
    "position" INTEGER NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "ImageMetadata_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ImageMetadata_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "Listing"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ImageMetadata_byteSize_valid" CHECK ("byteSize" > 0 AND "byteSize" <= 5242880),
    CONSTRAINT "ImageMetadata_position_valid" CHECK ("position" >= 0)
);
CREATE INDEX "ImageMetadata_listingId_position_idx" ON "ImageMetadata"("listingId", "position");
