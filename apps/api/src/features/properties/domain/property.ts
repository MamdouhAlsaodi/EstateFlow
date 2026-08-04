export const PropertyStatus = { ACTIVE: "ACTIVE", ARCHIVED: "ARCHIVED" } as const;
export type PropertyStatus = (typeof PropertyStatus)[keyof typeof PropertyStatus];

export const ListingStatus = {
  DRAFT: "DRAFT",
  PUBLISHED: "PUBLISHED",
  ARCHIVED: "ARCHIVED",
} as const;
export type ListingStatus = (typeof ListingStatus)[keyof typeof ListingStatus];

export type Property = {
  id: string;
  organizationId: string;
  title: string;
  propertyType: string;
  addressText: string;
  ownerReference: string | null;
  status: PropertyStatus;
  version: number;
  createdAt: Date;
  updatedAt: Date;
};

export type Listing = {
  id: string;
  organizationId: string;
  propertyId: string;
  status: ListingStatus;
  version: number;
  createdAt: Date;
  updatedAt: Date;
};

export class PropertyValidationError extends Error {}
export class PropertyVersionConflictError extends Error {}
export class PropertyTransitionError extends Error {}

const MAX_TEXT_LENGTH = 500;

function requiredText(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim().length === 0 || value.length > MAX_TEXT_LENGTH) {
    throw new PropertyValidationError(`Invalid ${field}`);
  }
  return value;
}

function optionalText(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== "string" || value.length > MAX_TEXT_LENGTH) {
    throw new PropertyValidationError("Invalid ownerReference");
  }
  return value;
}

function requireVersion(actual: number, expected: unknown): void {
  if (!Number.isSafeInteger(expected) || expected !== actual) {
    throw new PropertyVersionConflictError("Property version conflict");
  }
}

export function createProperty(input: {
  id: string;
  organizationId: string;
  title: string;
  propertyType: string;
  addressText: string;
  ownerReference?: string | null;
  now: Date;
}): Property {
  return {
    id: input.id,
    organizationId: input.organizationId,
    title: requiredText(input.title, "title"),
    propertyType: requiredText(input.propertyType, "propertyType"),
    addressText: requiredText(input.addressText, "addressText"),
    ownerReference: optionalText(input.ownerReference),
    status: PropertyStatus.ACTIVE,
    version: 1,
    createdAt: input.now,
    updatedAt: input.now,
  };
}

export function updateProperty(
  property: Property,
  changes: { version: number; title?: string; propertyType?: string; addressText?: string; ownerReference?: string | null },
  now: Date,
): Property {
  requireVersion(property.version, changes.version);
  const allowed = new Set(["version", "title", "propertyType", "addressText", "ownerReference"]);
  if (Object.keys(changes).some((key) => !allowed.has(key))) throw new PropertyValidationError("Invalid writable fields");
  const next = { ...property };
  if (changes.title !== undefined) next.title = requiredText(changes.title, "title");
  if (changes.propertyType !== undefined) next.propertyType = requiredText(changes.propertyType, "propertyType");
  if (changes.addressText !== undefined) next.addressText = requiredText(changes.addressText, "addressText");
  if (changes.ownerReference !== undefined) next.ownerReference = optionalText(changes.ownerReference);
  return { ...next, version: property.version + 1, updatedAt: now };
}

export function archiveProperty(property: Property, expectedVersion: number, now: Date): Property {
  requireVersion(property.version, expectedVersion);
  if (property.status === PropertyStatus.ARCHIVED) throw new PropertyTransitionError("Property is already archived");
  return { ...property, status: PropertyStatus.ARCHIVED, version: property.version + 1, updatedAt: now };
}

export function createDraftListing(input: { id: string; property: Property; existingListings?: readonly Listing[]; now: Date }): Listing {
  if (input.property.status !== PropertyStatus.ACTIVE) throw new PropertyTransitionError("Archived properties cannot have listings");
  if (input.existingListings?.some((listing) => listing.status === ListingStatus.DRAFT || listing.status === ListingStatus.PUBLISHED)) {
    throw new PropertyTransitionError("Property already has an active listing");
  }
  return { id: input.id, organizationId: input.property.organizationId, propertyId: input.property.id, status: ListingStatus.DRAFT, version: 1, createdAt: input.now, updatedAt: input.now };
}

export function publishListing(listing: Listing, expectedVersion: number, now: Date): Listing {
  requireVersion(listing.version, expectedVersion);
  if (listing.status !== ListingStatus.DRAFT) throw new PropertyTransitionError("Only draft listings can be published");
  return { ...listing, status: ListingStatus.PUBLISHED, version: listing.version + 1, updatedAt: now };
}

export function archiveListing(listing: Listing, expectedVersion: number, now: Date): Listing {
  requireVersion(listing.version, expectedVersion);
  if (listing.status === ListingStatus.ARCHIVED) throw new PropertyTransitionError("Listing is already archived");
  return { ...listing, status: ListingStatus.ARCHIVED, version: listing.version + 1, updatedAt: now };
}
