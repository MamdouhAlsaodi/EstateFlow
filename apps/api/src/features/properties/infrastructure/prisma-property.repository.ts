import { Prisma, type PrismaClient } from "@prisma/client";
import type { ImageMetadata } from "../domain/image-metadata.js";
import type { Listing, Property } from "../domain/property.js";
import {
  PropertyRepositoryConflictCode,
  PropertyRepositoryConflictError,
  type PropertyRepository,
  type PropertySearchCriteria,
  type PropertySearchPage,
} from "../application/property-repository.js";

type PropertyRow = Property & { listings?: Listing[] };
type ListingRow = Listing;
type ImageRow = ImageMetadata;

function mapProperty(
  row: PropertyRow,
): Property & { activeListing?: Listing | null } {
  const { listings, ...property } = row;
  return {
    ...property,
    ...(listings ? { activeListing: listings[0] ?? null } : {}),
  };
}

function mapListing(row: ListingRow): Listing {
  return { ...row };
}

function mapImage(row: ImageRow): ImageMetadata {
  return { ...row };
}

function isPrismaCode(error: unknown, code: string): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError && error.code === code
  );
}

export class PrismaPropertyRepository implements PropertyRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findProperty(
    organizationId: string,
    propertyId: string,
  ): Promise<Property | null> {
    const row = await this.prisma.property.findFirst({
      where: { id: propertyId, organizationId },
      include: {
        listings: { where: { status: { in: ["DRAFT", "PUBLISHED"] } } },
      },
    });
    return row ? mapProperty(row) : null;
  }

  async searchProperties(
    organizationId: string,
    criteria: PropertySearchCriteria,
    cursor?: string,
    limit = 50,
  ): Promise<PropertySearchPage> {
    const where: Prisma.PropertyWhereInput = { organizationId };
    if (criteria.titleOrAddress !== undefined) {
      where.OR = [
        { title: { contains: criteria.titleOrAddress, mode: "insensitive" } },
        {
          addressText: {
            contains: criteria.titleOrAddress,
            mode: "insensitive",
          },
        },
      ];
    }
    const rows = await this.prisma.property.findMany({
      where,
      orderBy: { id: "asc" },
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      take: limit + 1,
      include: {
        listings: { where: { status: { in: ["DRAFT", "PUBLISHED"] } } },
      },
    });
    const pageRows = rows as PropertyRow[];
    const hasNext = pageRows.length > limit;
    const items = pageRows.slice(0, limit).map(mapProperty);
    return { items, nextCursor: hasNext ? (items.at(-1)?.id ?? null) : null };
  }

  async createProperty(property: Property): Promise<Property> {
    const row = await this.prisma.property.create({ data: property });
    return mapProperty(row);
  }

  async updateProperty(input: {
    organizationId: string;
    propertyId: string;
    version: number;
    changes: Record<string, unknown>;
  }): Promise<Property> {
    const changes = input.changes;
    try {
      const result = await this.prisma.property.updateMany({
        where: {
          organizationId: input.organizationId,
          id: input.propertyId,
          version: input.version,
        },
        data: {
          ...(changes.title !== undefined
            ? { title: changes.title as string }
            : {}),
          ...(changes.propertyType !== undefined
            ? { propertyType: changes.propertyType as string }
            : {}),
          ...(changes.addressText !== undefined
            ? { addressText: changes.addressText as string }
            : {}),
          ...(changes.ownerReference !== undefined
            ? { ownerReference: changes.ownerReference as string | null }
            : {}),
          version: { increment: 1 },
        },
      });
      if (result.count !== 1)
        throw new PropertyRepositoryConflictError(
          PropertyRepositoryConflictCode.PROPERTY_VERSION_CONFLICT,
        );
      const row = await this.prisma.property.findUniqueOrThrow({
        where: { id: input.propertyId },
      });
      return mapProperty(row);
    } catch (error) {
      if (isPrismaCode(error, "P2025"))
        throw new PropertyRepositoryConflictError(
          PropertyRepositoryConflictCode.PROPERTY_VERSION_CONFLICT,
        );
      throw error;
    }
  }

  async createListing(input: {
    organizationId: string;
    propertyId: string;
    propertyVersion: number;
    listingId: string;
    now: Date;
  }): Promise<Listing> {
    try {
      const row = await this.prisma.$transaction(async (tx) => {
        const property = await tx.property.findFirst({
          where: { organizationId: input.organizationId, id: input.propertyId },
        });
        if (
          !property ||
          property.version !== input.propertyVersion ||
          property.status !== "ACTIVE"
        ) {
          throw new PropertyRepositoryConflictError(
            PropertyRepositoryConflictCode.PROPERTY_VERSION_CONFLICT,
          );
        }
        return tx.listing.create({
          data: {
            id: input.listingId,
            organizationId: input.organizationId,
            propertyId: input.propertyId,
            status: "DRAFT",
            version: 1,
            createdAt: input.now,
            updatedAt: input.now,
          },
        });
      });
      return mapListing(row);
    } catch (error) {
      if (isPrismaCode(error, "P2002"))
        throw new PropertyRepositoryConflictError(
          PropertyRepositoryConflictCode.ACTIVE_LISTING_CONFLICT,
        );
      throw error;
    }
  }

  async findActiveListingForProperty(
    organizationId: string,
    propertyId: string,
  ): Promise<Listing | null> {
    const row = await this.prisma.listing.findFirst({
      where: {
        organizationId,
        propertyId,
        status: { in: ["DRAFT", "PUBLISHED"] },
      },
    });
    return row ? mapListing(row) : null;
  }

  async findListing(
    organizationId: string,
    listingId: string,
  ): Promise<Listing | null> {
    const row = await this.prisma.listing.findFirst({
      where: { id: listingId, organizationId },
    });
    return row ? mapListing(row) : null;
  }

  async listImageMetadata(
    organizationId: string,
    listingId: string,
  ): Promise<readonly ImageMetadata[]> {
    const rows = await this.prisma.imageMetadata.findMany({
      where: { listing: { id: listingId, organizationId } },
      orderBy: { position: "asc" },
    });
    return rows.map(mapImage);
  }

  async updateListing(listing: Listing): Promise<Listing> {
    try {
      const result = await this.prisma.listing.updateMany({
        where: {
          id: listing.id,
          organizationId: listing.organizationId,
          version: listing.version - 1,
        },
        data: {
          status: listing.status,
          version: listing.version,
          updatedAt: listing.updatedAt,
        },
      });
      if (result.count !== 1)
        throw new PropertyRepositoryConflictError(
          PropertyRepositoryConflictCode.PROPERTY_VERSION_CONFLICT,
        );
      const row = await this.prisma.listing.findUniqueOrThrow({
        where: { id: listing.id },
      });
      return mapListing(row);
    } catch (error) {
      if (isPrismaCode(error, "P2025"))
        throw new PropertyRepositoryConflictError(
          PropertyRepositoryConflictCode.PROPERTY_VERSION_CONFLICT,
        );
      throw error;
    }
  }

  async saveImageMetadata(image: ImageMetadata): Promise<ImageMetadata> {
    const row = await this.prisma.imageMetadata.create({ data: image });
    return mapImage(row);
  }

  async countImages(listingId: string): Promise<number> {
    return this.prisma.imageMetadata.count({ where: { listingId } });
  }
}
