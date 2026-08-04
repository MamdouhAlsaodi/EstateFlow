import test from "node:test";
import assert from "node:assert/strict";
import { createProperty } from "../dist/features/properties/domain/property.js";
import {
  propertyFields,
  listingFields,
  imageMetadataFields,
  PropertyRepositoryConflictError,
} from "../dist/features/properties/application/property-repository.js";
import { PrismaPropertyRepository } from "../dist/features/properties/infrastructure/prisma-property.repository.js";

test("repository contract exposes a typed atomic listing conflict", async () => {
  const conflict = new PropertyRepositoryConflictError("ACTIVE_LISTING_CONFLICT");
  assert.equal(conflict.code, "ACTIVE_LISTING_CONFLICT");
  assert.equal(conflict.name, "PropertyRepositoryConflictError");
  assert.equal(conflict instanceof Error, true);
});

test("repository contract exposes only the approved persisted fields", () => {
  assert.deepEqual(propertyFields, ["id", "organizationId", "title", "propertyType", "addressText", "ownerReference", "status", "version", "createdAt", "updatedAt"]);
  assert.deepEqual(listingFields, ["id", "organizationId", "propertyId", "status", "version", "createdAt", "updatedAt"]);
  assert.deepEqual(imageMetadataFields, ["id", "listingId", "mediaType", "byteSize", "position", "createdAt", "updatedAt"]);
  assert.equal(createProperty({ id: "11111111-1111-4111-8111-111111111111", organizationId: "22222222-2222-4222-8222-222222222222", title: "T", propertyType: "V", addressText: "A", ownerReference: null, now: new Date() }).version, 1);
});

test("Prisma repository maps organization-scoped property search and opaque cursor", async () => {
  const property = {
    id: "11111111-1111-4111-8111-111111111111",
    organizationId: "22222222-2222-4222-8222-222222222222",
    title: "Villa",
    propertyType: "VILLA",
    addressText: "Cairo",
    ownerReference: null,
    status: "ACTIVE",
    version: 1,
    createdAt: new Date("2026-08-01T00:00:00.000Z"),
    updatedAt: new Date("2026-08-01T00:00:00.000Z"),
  };
  const calls = [];
  const prisma = {
    property: {
      findMany: async (args) => {
        calls.push(args);
        return [{ ...property, listings: [{ id: "listing-1", organizationId: property.organizationId, propertyId: property.id, status: "PUBLISHED", version: 1, createdAt: property.createdAt, updatedAt: property.updatedAt }] }];
      },
    },
  };
  const result = await new PrismaPropertyRepository(prisma).searchProperties(property.organizationId, { titleOrAddress: "Cairo" }, "cursor-1", 10);
  assert.equal(result.items[0].activeListing.status, "PUBLISHED");
  assert.equal(result.nextCursor, null);
  assert.deepEqual(calls[0].where, {
    organizationId: property.organizationId,
    OR: [
      { title: { contains: "Cairo", mode: "insensitive" } },
      { addressText: { contains: "Cairo", mode: "insensitive" } },
    ],
  });
  assert.deepEqual(calls[0].cursor, { id: "cursor-1" });
  assert.equal(calls[0].skip, 1);
  assert.equal(calls[0].take, 11);
});
