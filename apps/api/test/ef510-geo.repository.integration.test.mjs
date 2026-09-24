import assert from "node:assert/strict";
import process from "node:process";
import { URL } from "node:url";
import test from "node:test";
import { PrismaClient } from "@prisma/client";
import { PrismaGeoSearchRepository } from "../dist/features/search/infrastructure/prisma-geo-search.repository.js";
import {
  decodeCursor,
  haversineKm,
} from "../dist/features/search/domain/geo-search.js";
import {
  assertTablesAreEmpty,
  cleanupDatabase,
} from "./support/cleanup-database.mjs";

const TABLES = ["Listing", "Property", "Organization"];
function hasGuardedTestTarget() {
  const value = process.env.DATABASE_URL;
  if (process.env.ALLOW_DESTRUCTIVE_TESTS !== "1" || !value) return false;
  const parsed = new URL(value);
  return (
    parsed.protocol === "postgresql:" &&
    parsed.hostname === "127.0.0.1" &&
    parsed.port === "55435" &&
    parsed.username === "estateflow_test" &&
    parsed.pathname === "/estateflow_test"
  );
}

const radius = {
  mode: "radius",
  center: { latitude: 30, longitude: 31 },
  radiusKm: 10,
};
const bbox = {
  mode: "bbox",
  bbox: {
    minLatitude: 30,
    minLongitude: 31,
    maxLatitude: 30.1,
    maxLongitude: 31.1,
  },
};

async function createPublished(
  prisma,
  organizationId,
  id,
  latitude,
  longitude,
  title = id,
) {
  await prisma.property.create({
    data: {
      id,
      organizationId,
      title,
      propertyType: "VILLA",
      addressText: "Synthetic geo address",
      latitude,
      longitude,
      updatedAt: new Date("2026-10-01T00:00:00.000Z"),
    },
  });
  await prisma.listing.create({
    data: {
      id,
      organizationId,
      propertyId: id,
      status: "PUBLISHED",
      updatedAt: new Date("2026-10-01T00:00:00.000Z"),
    },
  });
}

test(
  "PostGIS geo search proves containment, edges, keyset inserts, clusters, tenant isolation, and GiST use",
  {
    skip: !hasGuardedTestTarget(),
  },
  async () => {
    const prisma = new PrismaClient();
    const repository = new PrismaGeoSearchRepository(prisma);
    const organizationId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    const otherOrganizationId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
    const ids = [
      "00000000-0000-4000-8000-000000000001",
      "00000000-0000-4000-8000-000000000002",
      "00000000-0000-4000-8000-000000000003",
      "00000000-0000-4000-8000-000000000004",
    ];
    try {
      await prisma.$connect();
      await cleanupDatabase(prisma, TABLES);
      await prisma.organization.create({
        data: { id: organizationId, name: "Geo A" },
      });
      await prisma.organization.create({
        data: { id: otherOrganizationId, name: "Geo B" },
      });
      await createPublished(
        prisma,
        organizationId,
        ids[0],
        30,
        31,
        "inside-center",
      );
      await createPublished(
        prisma,
        organizationId,
        ids[1],
        30.05,
        31.05,
        "inside-near",
      );
      await createPublished(
        prisma,
        organizationId,
        ids[2],
        30.1,
        31.1,
        "bbox-edge",
      );
      await createPublished(
        prisma,
        organizationId,
        ids[3],
        31,
        32,
        "outside-radius",
      );
      await createPublished(
        prisma,
        otherOrganizationId,
        "00000000-0000-4000-8000-000000000005",
        30,
        31,
        "other-tenant",
      );

      const radiusPage = await repository.search(
        organizationId,
        radius,
        undefined,
        100,
      );
      assert.deepEqual(
        radiusPage.items.map(({ id }) => id),
        ids.slice(0, 2),
      );
      for (const item of radiusPage.items)
        assert.ok(haversineKm(radius.center, item) <= radius.radiusKm + 0.001);
      assert.equal(
        (await repository.search(otherOrganizationId, radius, undefined, 100))
          .items.length,
        1,
      );

      const polygonPage = await repository.search(
        organizationId,
        {
          mode: "polygon",
          polygon: [
            { latitude: 30, longitude: 31 },
            { latitude: 30, longitude: 31.1 },
            { latitude: 30.1, longitude: 31.1 },
            { latitude: 30.1, longitude: 31 },
            { latitude: 30, longitude: 31 },
          ],
        },
        undefined,
        100,
      );
      assert.deepEqual(
        polygonPage.items.map(({ id }) => id),
        ids.slice(0, 3),
      );
      assert.deepEqual(
        (
          await repository.search(organizationId, bbox, undefined, 100)
        ).items.map(({ id }) => id),
        ids.slice(0, 3),
      );

      const first = await repository.search(
        organizationId,
        radius,
        undefined,
        1,
      );
      assert.equal(first.items.length, 1);
      await createPublished(
        prisma,
        organizationId,
        "00000000-0000-4000-8000-000000000006",
        30.01,
        31.01,
        "inserted-after-cursor",
      );
      const second = await repository.search(
        organizationId,
        radius,
        first.nextCursor && decodeCursor(first.nextCursor),
        100,
      );
      assert.ok(!second.items.some(({ id }) => id === first.items[0].id));
      assert.ok(
        second.items.some(({ title }) => title === "inserted-after-cursor"),
      );

      const clusters = await repository.cluster(organizationId, radius, 10);
      assert.equal(
        clusters.totalMembers,
        (await repository.search(organizationId, radius, undefined, 100)).items
          .length,
      );
      assert.equal(
        clusters.clusters.reduce((sum, cluster) => sum + cluster.count, 0),
        clusters.totalMembers,
      );
      assert.ok(
        clusters.clusters.every(
          ({ count, latitude, longitude }) =>
            count > 0 && latitude >= -90 && longitude >= -180,
        ),
      );

      const plan = await prisma.$transaction(async (tx) => {
        await tx.$executeRawUnsafe("SET LOCAL enable_seqscan = off");
        return tx.$queryRaw`EXPLAIN (COSTS OFF) SELECT p."id" FROM "Property" p WHERE p."location" IS NOT NULL AND ST_DWithin(p."location", ST_SetSRID(ST_MakePoint(31, 30), 4326)::geography, 10000)`;
      });
      assert.match(
        plan.map((row) => Object.values(row).join(" ")).join("\n"),
        /Property_location_gist_idx/,
      );
    } finally {
      await cleanupDatabase(prisma, TABLES);
      await assertTablesAreEmpty(prisma, TABLES);
      await prisma.$disconnect();
    }
  },
);
