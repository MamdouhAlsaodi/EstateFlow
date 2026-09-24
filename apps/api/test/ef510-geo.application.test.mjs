import assert from "node:assert/strict";
import test from "node:test";
import {
  GeoSearchAccessDeniedError,
  GeoSearchApplication,
} from "../dist/features/search/application/geo-search-application.js";
import {
  decodeCursor,
  encodeCursor,
  haversineKm,
  validateBoundingBox,
  validatePolygon,
} from "../dist/features/search/domain/geo-search.js";

const organizationId = "11111111-1111-4111-8111-111111111111";
const actor = {
  verified: true,
  memberships: [{ organizationId, role: "BROKER", active: true }],
};

test("geo primitives validate closed rings, edges, haversine distance, and opaque cursors", () => {
  const ring = validatePolygon([
    { latitude: 30, longitude: 31 },
    { latitude: 30, longitude: 32 },
    { latitude: 31, longitude: 32 },
    { latitude: 30, longitude: 31 },
  ]);
  assert.equal(ring.length, 4);
  assert.deepEqual(
    validateBoundingBox({
      minLatitude: 30,
      minLongitude: 31,
      maxLatitude: 31,
      maxLongitude: 32,
    }),
    {
      minLatitude: 30,
      minLongitude: 31,
      maxLatitude: 31,
      maxLongitude: 32,
    },
  );
  assert.ok(
    haversineKm(
      { latitude: 30, longitude: 31 },
      { latitude: 30, longitude: 31.01 },
    ) > 0,
  );
  const cursor = encodeCursor("11111111-1111-4111-8111-111111111111");
  assert.equal(decodeCursor(cursor), organizationId);
  assert.throws(() =>
    validatePolygon([
      { latitude: 30, longitude: 31 },
      { latitude: 31, longitude: 32 },
      { latitude: 30, longitude: 31 },
    ]),
  );
});

test("geo application enforces tenant membership and bounded keyset queries", async () => {
  const calls = [];
  const application = new GeoSearchApplication({
    search: async (...args) => {
      calls.push(args);
      return { items: [], nextCursor: null };
    },
    cluster: async () => ({ clusters: [], totalMembers: 0 }),
  });
  await application.search({
    actor,
    organizationId,
    criteria: {
      mode: "radius",
      center: { latitude: 30, longitude: 31 },
      radiusKm: 5,
    },
    cursor: encodeCursor("22222222-2222-4222-8222-222222222222"),
    limit: 25,
  });
  assert.equal(calls[0][0], organizationId);
  assert.equal(calls[0][2], "22222222-2222-4222-8222-222222222222");
  assert.equal(calls[0][3], 25);
  await assert.rejects(
    application.search({
      actor: { verified: true, memberships: [] },
      organizationId,
      criteria: {
        mode: "bbox",
        bbox: {
          minLatitude: 30,
          minLongitude: 31,
          maxLatitude: 31,
          maxLongitude: 32,
        },
      },
    }),
    GeoSearchAccessDeniedError,
  );
});
