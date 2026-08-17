import test from "node:test";
import assert from "node:assert/strict";
import {
  ListingStatus,
  PropertyStatus,
  archiveListing,
  archiveProperty,
  createDraftListing,
  createProperty,
  publishListing,
  updateProperty,
} from "../dist/features/properties/domain/property.js";

const propertyInput = {
  id: "11111111-1111-4111-8111-111111111111",
  organizationId: "22222222-2222-4222-8222-222222222222",
  title: "Al Noor Villa",
  propertyType: "VILLA",
  addressText: "Synthetic Street 1",
  ownerReference: null,
  now: new Date("2026-08-03T10:00:00.000Z"),
};

test("property creation starts ACTIVE at version 1 and updates only approved fields", () => {
  const property = createProperty(propertyInput);
  assert.equal(property.status, PropertyStatus.ACTIVE);
  assert.equal(property.version, 1);
  assert.deepEqual(
    updateProperty(
      property,
      { version: 1, title: "Updated Villa" },
      new Date("2026-08-03T11:00:00.000Z"),
    ).title,
    "Updated Villa",
  );
});

test("property update rejects unknown writable fields and stale versions", () => {
  const property = createProperty(propertyInput);
  assert.throws(
    () => updateProperty(property, { version: 1, organizationId: "other" }),
    /writable fields/,
  );
  assert.throws(
    () => updateProperty(property, { version: 0, title: "Updated" }),
    /version/,
  );
});

test("listing lifecycle preserves history and allows one active draft before publish", () => {
  const property = createProperty(propertyInput);
  const listing = createDraftListing({
    id: "33333333-3333-4333-8333-333333333333",
    property,
    now: new Date("2026-08-03T10:00:00.000Z"),
  });
  assert.equal(listing.status, ListingStatus.DRAFT);
  assert.throws(
    () =>
      createDraftListing({
        id: "44444444-4444-4444-8444-444444444444",
        property,
        existingListings: [listing],
        now: new Date("2026-08-03T10:30:00.000Z"),
      }),
    /active listing/,
  );
  const published = publishListing(
    listing,
    1,
    new Date("2026-08-03T12:00:00.000Z"),
  );
  assert.equal(published.status, ListingStatus.PUBLISHED);
  assert.throws(
    () =>
      createDraftListing({
        id: "55555555-5555-4555-8555-555555555555",
        property,
        existingListings: [published],
        now: new Date("2026-08-03T12:30:00.000Z"),
      }),
    /active listing/,
  );
  const archived = archiveListing(
    published,
    2,
    new Date("2026-08-03T13:00:00.000Z"),
  );
  assert.equal(archived.status, ListingStatus.ARCHIVED);
  assert.equal(
    createDraftListing({
      id: "66666666-6666-4666-8666-666666666666",
      property,
      existingListings: [archived],
      now: new Date("2026-08-03T13:30:00.000Z"),
    }).status,
    ListingStatus.DRAFT,
  );
  assert.equal(
    archiveProperty(property, 1, new Date("2026-08-03T14:00:00.000Z")).status,
    PropertyStatus.ARCHIVED,
  );
});
