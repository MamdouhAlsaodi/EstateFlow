import {
  createDraftListing,
  createProperty,
  publishListing,
  archiveListing,
  PropertyVersionConflictError,
  ListingStatus,
} from "../domain/property.js";
import type { Listing, Property } from "../domain/property.js";
import {
  validateImageCount,
  validateImageMetadata,
} from "../domain/image-metadata.js";
import type { ImageMetadata } from "../domain/image-metadata.js";
import type {
  CreateListingInput,
  PropertyRepository,
} from "./property-repository.js";

export type PropertyRole =
  "OWNER" | "MANAGER" | "BROKER" | "CLIENT" | "PLATFORM_ADMIN";
export type ActorContext = {
  verified: boolean;
  platformAdmin?: boolean;
  memberships: readonly {
    organizationId: string;
    role: PropertyRole;
    active: boolean;
  }[];
};

export class PropertyNotFoundError extends Error {
  constructor() {
    super("Property not found");
    this.name = "PropertyNotFoundError";
  }
}
export class PropertyAccessDeniedError extends Error {
  constructor() {
    super("Property access denied");
    this.name = "PropertyAccessDeniedError";
  }
}

const MANAGEMENT_ROLES = new Set<PropertyRole>(["OWNER", "MANAGER"]);
const READ_ROLES = new Set<PropertyRole>(["OWNER", "MANAGER", "BROKER"]);

export class PropertyApplication {
  constructor(private readonly repository: PropertyRepository) {}

  private membership(actor: ActorContext, organizationId: string) {
    if (!actor?.verified) throw new PropertyAccessDeniedError();
    return actor.memberships.find(
      (membership) =>
        membership.organizationId === organizationId && membership.active,
    );
  }

  private requireManagement(actor: ActorContext, organizationId: string): void {
    const membership = this.membership(actor, organizationId);
    if (!membership || !MANAGEMENT_ROLES.has(membership.role))
      throw new PropertyAccessDeniedError();
  }

  private requireReadable(
    actor: ActorContext,
    organizationId: string,
  ): PropertyRole {
    const membership = this.membership(actor, organizationId);
    if (!membership || !READ_ROLES.has(membership.role))
      throw new PropertyNotFoundError();
    return membership.role;
  }

  async createProperty(input: {
    actor: ActorContext;
    organizationId: string;
    property: {
      id: string;
      title: string;
      propertyType: string;
      addressText: string;
      ownerReference?: string | null;
      latitude?: number | null;
      longitude?: number | null;
    };
    now?: Date;
  }): Promise<Property> {
    this.requireManagement(input.actor, input.organizationId);
    const result = createProperty({
      ...input.property,
      organizationId: input.organizationId,
      now: input.now ?? new Date(),
    });
    if (!this.repository.createProperty)
      throw new Error("Property repository create is unavailable");
    return this.repository.createProperty(result);
  }

  async update(input: {
    actor: ActorContext;
    organizationId: string;
    propertyId: string;
    version: number;
    changes: {
      title?: string;
      propertyType?: string;
      addressText?: string;
      ownerReference?: string | null;
      latitude?: number | null;
      longitude?: number | null;
    };
    now?: Date;
  }): Promise<Property> {
    this.requireManagement(input.actor, input.organizationId);
    const current = await this.repository.findProperty(
      input.organizationId,
      input.propertyId,
    );
    if (
      !current ||
      current.organizationId !== input.organizationId ||
      current.id !== input.propertyId
    )
      throw new PropertyNotFoundError();
    if (current.version !== input.version)
      throw new PropertyVersionConflictError("Property version conflict");
    return this.repository.updateProperty({
      organizationId: input.organizationId,
      propertyId: input.propertyId,
      version: input.version,
      changes: input.changes,
    });
  }

  async searchProperties(input: {
    actor: ActorContext;
    organizationId: string;
    search?: string;
    cursor?: string;
    limit?: number;
  }): Promise<{
    items: readonly (Property & { activeListing?: Listing | null })[];
    nextCursor: string | null;
  }> {
    const role = this.requireReadable(input.actor, input.organizationId);
    if (!this.repository.searchProperties)
      throw new Error("Property repository search is unavailable");
    if (
      input.search !== undefined &&
      (typeof input.search !== "string" || input.search.length > 200)
    )
      throw new Error("Invalid search");
    const limit = input.limit ?? 50;
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 50)
      throw new Error("Invalid limit");
    const criteria =
      input.search === undefined ? {} : { titleOrAddress: input.search };
    const page = await this.repository.searchProperties(
      input.organizationId,
      criteria,
      input.cursor,
      limit,
    );
    const visible =
      role === "BROKER"
        ? page.items.filter(
            (property) =>
              property.activeListing?.status === ListingStatus.PUBLISHED,
          )
        : page.items;
    return { items: visible, nextCursor: page.nextCursor };
  }

  async getProperty(input: {
    actor: ActorContext;
    organizationId: string;
    propertyId: string;
  }): Promise<Property> {
    const role = this.requireReadable(input.actor, input.organizationId);
    const property = await this.repository.findProperty(
      input.organizationId,
      input.propertyId,
    );
    if (!property || property.organizationId !== input.organizationId)
      throw new PropertyNotFoundError();
    if (
      role === "BROKER" &&
      (property as Property & { activeListing?: Listing | null }).activeListing
        ?.status !== ListingStatus.PUBLISHED
    )
      throw new PropertyNotFoundError();
    return property;
  }

  async getListing(input: {
    actor: ActorContext;
    organizationId: string;
    listingId: string;
  }): Promise<Listing> {
    const role = this.requireReadable(input.actor, input.organizationId);
    if (!this.repository.findListing)
      throw new Error("Listing repository read is unavailable");
    const listing = await this.repository.findListing(
      input.organizationId,
      input.listingId,
    );
    if (
      !listing ||
      listing.organizationId !== input.organizationId ||
      (role === "BROKER" && listing.status !== ListingStatus.PUBLISHED)
    )
      throw new PropertyNotFoundError();
    return listing;
  }

  async listImageMetadata(input: {
    actor: ActorContext;
    organizationId: string;
    listingId: string;
  }): Promise<readonly ImageMetadata[]> {
    const role = this.requireReadable(input.actor, input.organizationId);
    if (!this.repository.findListing || !this.repository.listImageMetadata)
      throw new Error("Image metadata repository read is unavailable");
    const listing = await this.repository.findListing(
      input.organizationId,
      input.listingId,
    );
    if (
      !listing ||
      listing.organizationId !== input.organizationId ||
      (role === "BROKER" && listing.status !== ListingStatus.PUBLISHED)
    )
      throw new PropertyNotFoundError();
    return this.repository.listImageMetadata(
      input.organizationId,
      input.listingId,
    );
  }

  async createListing(input: {
    actor: ActorContext;
    organizationId: string;
    propertyId: string;
    propertyVersion: number;
    listingId: string;
    now?: Date;
  }): Promise<Listing> {
    this.requireManagement(input.actor, input.organizationId);
    const property = await this.repository.findProperty(
      input.organizationId,
      input.propertyId,
    );
    if (!property || property.organizationId !== input.organizationId)
      throw new PropertyNotFoundError();
    if (property.version !== input.propertyVersion)
      throw new PropertyVersionConflictError("Property version conflict");
    const existing = await this.repository.findActiveListingForProperty(
      input.organizationId,
      input.propertyId,
    );
    const listing = createDraftListing({
      id: input.listingId,
      property,
      existingListings: existing ? [existing] : [],
      now: input.now ?? new Date(),
    });
    const create: CreateListingInput = {
      organizationId: input.organizationId,
      propertyId: input.propertyId,
      propertyVersion: input.propertyVersion,
      listingId: listing.id,
      now: listing.createdAt,
    };
    return this.repository.createListing(create);
  }

  async publishListing(input: {
    actor: ActorContext;
    organizationId: string;
    listingId: string;
    version: number;
    now?: Date;
  }): Promise<Listing> {
    return this.lifecycle(input, publishListing);
  }

  async archiveListing(input: {
    actor: ActorContext;
    organizationId: string;
    listingId: string;
    version: number;
    now?: Date;
  }): Promise<Listing> {
    return this.lifecycle(input, archiveListing);
  }

  private async lifecycle(
    input: {
      actor: ActorContext;
      organizationId: string;
      listingId: string;
      version: number;
      now?: Date;
    },
    transition: (listing: Listing, version: number, now: Date) => Listing,
  ): Promise<Listing> {
    this.requireManagement(input.actor, input.organizationId);
    if (!this.repository.findListing || !this.repository.updateListing)
      throw new Error("Listing repository lifecycle is unavailable");
    const listing = await this.repository.findListing(
      input.organizationId,
      input.listingId,
    );
    if (!listing || listing.organizationId !== input.organizationId)
      throw new PropertyNotFoundError();
    return this.repository.updateListing(
      transition(listing, input.version, input.now ?? new Date()),
    );
  }

  async registerImageMetadata(input: {
    actor: ActorContext;
    organizationId: string;
    listingId: string;
    imageId: string;
    mediaType: unknown;
    byteSize: unknown;
    position: unknown;
    now?: Date;
  }): Promise<ImageMetadata> {
    this.requireManagement(input.actor, input.organizationId);
    if (!this.repository.findListing)
      throw new Error("Listing repository read is unavailable");
    const listing = await this.repository.findListing(
      input.organizationId,
      input.listingId,
    );
    if (!listing || listing.organizationId !== input.organizationId)
      throw new PropertyNotFoundError();
    const count = await this.repository.countImages(input.listingId);
    validateImageCount(count);
    const metadata = validateImageMetadata(input);
    const now = input.now ?? new Date();
    return this.repository.saveImageMetadata({
      id: input.imageId,
      listingId: input.listingId,
      ...metadata,
      createdAt: now,
      updatedAt: now,
    });
  }
}
