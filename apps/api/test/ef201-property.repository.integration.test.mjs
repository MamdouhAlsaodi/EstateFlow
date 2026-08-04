import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import process from "node:process";
import { URL } from "node:url";
import test from "node:test";
import { PrismaClient } from "@prisma/client";
import { PrismaPropertyRepository } from "../dist/features/properties/infrastructure/prisma-property.repository.js";
import {
  PropertyRepositoryConflictError,
} from "../dist/features/properties/application/property-repository.js";
import {
  assertTablesAreEmpty,
  cleanupDatabase,
} from "./support/cleanup-database.mjs";

const TEST_TABLES = ["ImageMetadata", "Listing", "Property", "Organization"];

function hasGuardedTestTarget() {
  const databaseUrl = process.env.DATABASE_URL;
  if (process.env.ALLOW_DESTRUCTIVE_TESTS !== "1" || !databaseUrl) return false;
  const parsed = new URL(databaseUrl);
  return ["postgres:", "postgresql:"].includes(parsed.protocol)
    && ["127.0.0.1", "localhost", "::1"].includes(parsed.hostname)
    && parsed.port === "55433"
    && parsed.username === "estateflow_test"
    && parsed.pathname === "/estateflow_test";
}

test("Prisma property repository persists scoped listings, image metadata, conflicts, and cleans up", {
  skip: !hasGuardedTestTarget(),
}, async () => {
  const prisma = new PrismaClient();
  const repository = new PrismaPropertyRepository(prisma);
  const organizationId = randomUUID();
  const propertyId = randomUUID();
  const listingId = randomUUID();
  const now = new Date("2026-08-03T12:00:00.000Z");

  try {
    await prisma.$connect();
    await cleanupDatabase(prisma, TEST_TABLES);
    await prisma.organization.create({ data: { id: organizationId, name: "EF-201 Synthetic Realty" } });

    const property = await repository.createProperty({
      id: propertyId,
      organizationId,
      title: "Synthetic Villa",
      propertyType: "VILLA",
      addressText: "Cairo Test District",
      ownerReference: "OWNER-1",
      status: "ACTIVE",
      version: 1,
      createdAt: now,
      updatedAt: now,
    });
    assert.equal(property.organizationId, organizationId);
    assert.equal((await repository.findProperty(organizationId, propertyId)).title, "Synthetic Villa");

    const listing = await repository.createListing({
      organizationId,
      propertyId,
      propertyVersion: 1,
      listingId,
      now,
    });
    assert.equal(listing.status, "DRAFT");
    await assert.rejects(
      () => repository.createListing({ organizationId, propertyId, propertyVersion: 1, listingId: randomUUID(), now }),
      (error) => error instanceof PropertyRepositoryConflictError && error.code === "ACTIVE_LISTING_CONFLICT",
    );

    const updated = await repository.updateProperty({
      organizationId,
      propertyId,
      version: 1,
      changes: { title: "Updated Synthetic Villa" },
    });
    assert.equal(updated.version, 2);
    assert.equal(updated.title, "Updated Synthetic Villa");
    assert.equal((await prisma.property.findUnique({ where: { id: propertyId } })).title, "Updated Synthetic Villa");
    await assert.rejects(
      () => repository.updateProperty({ organizationId, propertyId, version: 1, changes: { title: "Stale" } }),
      (error) => error instanceof PropertyRepositoryConflictError && error.code === "PROPERTY_VERSION_CONFLICT",
    );
    assert.equal((await repository.findProperty(organizationId, propertyId)).title, "Updated Synthetic Villa");

    const image = await repository.saveImageMetadata({
      id: randomUUID(),
      listingId,
      mediaType: "JPEG",
      byteSize: 1024,
      position: 0,
      createdAt: now,
      updatedAt: now,
    });
    assert.equal(image.listingId, listingId);
    assert.equal(await repository.countImages(listingId), 1);

    const page = await repository.searchProperties(organizationId, { titleOrAddress: "Cairo" }, undefined, 1);
    assert.equal(page.items.length, 1);
    assert.equal(page.items[0].activeListing.status, "DRAFT");
    assert.equal(page.nextCursor, null);
  } finally {
    await cleanupDatabase(prisma, TEST_TABLES);
    await assertTablesAreEmpty(prisma, TEST_TABLES);
    await prisma.$disconnect();
  }
});
