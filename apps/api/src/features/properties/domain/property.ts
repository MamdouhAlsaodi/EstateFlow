export const PropertyStatus = {
  ACTIVE: "ACTIVE",
  ARCHIVED: "ARCHIVED",
} as const;
export type PropertyStatus =
  (typeof PropertyStatus)[keyof typeof PropertyStatus];

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
  latitude: number | null;
  longitude: number | null;
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

function optionalCoordinate(value: unknown, field: string): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== "number" || !Number.isFinite(value))
    throw new PropertyValidationError(`Invalid ${field}`);
  if (field === "latitude" && (value < -90 || value > 90))
    throw new PropertyValidationError(`Invalid ${field}`);
  if (field === "longitude" && (value < -180 || value > 180))
    throw new PropertyValidationError(`Invalid ${field}`);
  return value;
}

function coordinates(
  latitude: unknown,
  longitude: unknown,
): { latitude: number | null; longitude: number | null } {
  const nextLatitude = optionalCoordinate(latitude, "latitude");
  const nextLongitude = optionalCoordinate(longitude, "longitude");
  if ((nextLatitude === null) !== (nextLongitude === null))
    throw new PropertyValidationError(
      "Latitude and longitude must be supplied together",
    );
  return { latitude: nextLatitude, longitude: nextLongitude };
}

function requiredText(value: unknown, field: string): string {
  if (
    typeof value !== "string" ||
    value.trim().length === 0 ||
    value.length > MAX_TEXT_LENGTH
  ) {
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
  latitude?: number | null;
  longitude?: number | null;
  now: Date;
}): Property {
  const location = coordinates(input.latitude, input.longitude);
  return {
    id: input.id,
    organizationId: input.organizationId,
    title: requiredText(input.title, "title"),
    propertyType: requiredText(input.propertyType, "propertyType"),
    addressText: requiredText(input.addressText, "addressText"),
    ownerReference: optionalText(input.ownerReference),
    ...location,
    status: PropertyStatus.ACTIVE,
    version: 1,
    createdAt: input.now,
    updatedAt: input.now,
  };
}

export function updateProperty(
  property: Property,
  changes: {
    version: number;
    title?: string;
    propertyType?: string;
    addressText?: string;
    ownerReference?: string | null;
    latitude?: number | null;
    longitude?: number | null;
  },
  now: Date,
): Property {
  requireVersion(property.version, changes.version);
  const allowed = new Set([
    "version",
    "title",
    "propertyType",
    "addressText",
    "ownerReference",
    "latitude",
    "longitude",
  ]);
  if (Object.keys(changes).some((key) => !allowed.has(key)))
    throw new PropertyValidationError("Invalid writable fields");
  const next = { ...property };
  if (changes.title !== undefined)
    next.title = requiredText(changes.title, "title");
  if (changes.propertyType !== undefined)
    next.propertyType = requiredText(changes.propertyType, "propertyType");
  if (changes.addressText !== undefined)
    next.addressText = requiredText(changes.addressText, "addressText");
  if (changes.ownerReference !== undefined)
    next.ownerReference = optionalText(changes.ownerReference);
  if (changes.latitude !== undefined || changes.longitude !== undefined) {
    const location = coordinates(
      changes.latitude === undefined ? property.latitude : changes.latitude,
      changes.longitude === undefined ? property.longitude : changes.longitude,
    );
    next.latitude = location.latitude;
    next.longitude = location.longitude;
  }
  return { ...next, version: property.version + 1, updatedAt: now };
}

export function archiveProperty(
  property: Property,
  expectedVersion: number,
  now: Date,
): Property {
  requireVersion(property.version, expectedVersion);
  if (property.status === PropertyStatus.ARCHIVED)
    throw new PropertyTransitionError("Property is already archived");
  return {
    ...property,
    status: PropertyStatus.ARCHIVED,
    version: property.version + 1,
    updatedAt: now,
  };
}

export function createDraftListing(input: {
  id: string;
  property: Property;
  existingListings?: readonly Listing[];
  now: Date;
}): Listing {
  if (input.property.status !== PropertyStatus.ACTIVE)
    throw new PropertyTransitionError(
      "Archived properties cannot have listings",
    );
  if (
    input.existingListings?.some(
      (listing) =>
        listing.status === ListingStatus.DRAFT ||
        listing.status === ListingStatus.PUBLISHED,
    )
  ) {
    throw new PropertyTransitionError("Property already has an active listing");
  }
  return {
    id: input.id,
    organizationId: input.property.organizationId,
    propertyId: input.property.id,
    status: ListingStatus.DRAFT,
    version: 1,
    createdAt: input.now,
    updatedAt: input.now,
  };
}

export function publishListing(
  listing: Listing,
  expectedVersion: number,
  now: Date,
): Listing {
  requireVersion(listing.version, expectedVersion);
  if (listing.status !== ListingStatus.DRAFT)
    throw new PropertyTransitionError("Only draft listings can be published");
  return {
    ...listing,
    status: ListingStatus.PUBLISHED,
    version: listing.version + 1,
    updatedAt: now,
  };
}

export function archiveListing(
  listing: Listing,
  expectedVersion: number,
  now: Date,
): Listing {
  requireVersion(listing.version, expectedVersion);
  if (listing.status === ListingStatus.ARCHIVED)
    throw new PropertyTransitionError("Listing is already archived");
  return {
    ...listing,
    status: ListingStatus.ARCHIVED,
    version: listing.version + 1,
    updatedAt: now,
  };
}
