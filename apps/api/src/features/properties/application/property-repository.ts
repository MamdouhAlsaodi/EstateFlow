import type { Listing, Property } from "../domain/property.js";
import type { ImageMetadata } from "../domain/image-metadata.js";

export const propertyFields = [
  "id",
  "organizationId",
  "title",
  "propertyType",
  "addressText",
  "ownerReference",
  "status",
  "version",
  "createdAt",
  "updatedAt",
] as const;
export const listingFields = [
  "id",
  "organizationId",
  "propertyId",
  "status",
  "version",
  "createdAt",
  "updatedAt",
] as const;
export const imageMetadataFields = [
  "id",
  "listingId",
  "mediaType",
  "byteSize",
  "position",
  "createdAt",
  "updatedAt",
] as const;

export const PropertyRepositoryConflictCode = {
  ACTIVE_LISTING_CONFLICT: "ACTIVE_LISTING_CONFLICT",
  PROPERTY_VERSION_CONFLICT: "PROPERTY_VERSION_CONFLICT",
} as const;
export type PropertyRepositoryConflictCode =
  (typeof PropertyRepositoryConflictCode)[keyof typeof PropertyRepositoryConflictCode];

export class PropertyRepositoryConflictError extends Error {
  readonly code: PropertyRepositoryConflictCode;

  constructor(code: PropertyRepositoryConflictCode) {
    super("Property repository conflict");
    this.name = "PropertyRepositoryConflictError";
    this.code = code;
  }
}

export type PropertySearchCriteria = {
  /** Repository implementations may match only title and addressText. */
  titleOrAddress?: string;
};

export type PropertySearchPage = {
  items: readonly (Property & { activeListing?: Listing | null })[];
  nextCursor: string | null;
};

export type CreateListingInput = {
  organizationId: string;
  propertyId: string;
  propertyVersion: number;
  listingId: string;
  now: Date;
};

export interface PropertyRepository {
  findProperty(
    organizationId: string,
    propertyId: string,
  ): Promise<Property | null>;
  searchProperties?(
    organizationId: string,
    criteria: PropertySearchCriteria,
    cursor?: string,
    limit?: number,
  ): Promise<PropertySearchPage>;
  createProperty?(property: Property): Promise<Property>;
  updateProperty(input: {
    organizationId: string;
    propertyId: string;
    version: number;
    changes: Record<string, unknown>;
  }): Promise<Property>;
  /** Atomically checks propertyVersion and active-listing uniqueness before creating the draft. */
  createListing(input: CreateListingInput): Promise<Listing>;
  findActiveListingForProperty(
    organizationId: string,
    propertyId: string,
  ): Promise<Listing | null>;
  findListing?(
    organizationId: string,
    listingId: string,
  ): Promise<Listing | null>;
  listImageMetadata?(
    organizationId: string,
    listingId: string,
  ): Promise<readonly ImageMetadata[]>;
  updateListing?(listing: Listing): Promise<Listing>;
  saveImageMetadata(image: ImageMetadata): Promise<ImageMetadata>;
  countImages(listingId: string): Promise<number>;
}
