import test from "node:test";
import assert from "node:assert/strict";
import { MAX_IMAGE_BYTES, MAX_IMAGES_PER_LISTING, validateImageCount, validateImageMetadata } from "../dist/features/properties/domain/image-metadata.js";
import { PropertyApplication } from "../dist/features/properties/application/property-application.js";

test("accepts JPEG, PNG, and WebP metadata within the 5 MiB limit", () => {
  for (const mediaType of ["JPEG", "PNG", "WEBP"]) {
    assert.deepEqual(validateImageMetadata({ mediaType, byteSize: MAX_IMAGE_BYTES, position: 0 }), { mediaType, byteSize: MAX_IMAGE_BYTES, position: 0 });
  }
});

test("rejects unsupported types, oversized metadata, and more than ten records", () => {
  assert.throws(() => validateImageMetadata({ mediaType: "GIF", byteSize: 10, position: 0 }), /media type/);
  assert.throws(() => validateImageMetadata({ mediaType: "PNG", byteSize: MAX_IMAGE_BYTES + 1, position: 0 }), /size/);
  assert.throws(() => validateImageMetadata({ mediaType: "PNG", byteSize: 10, position: -1 }), /position/);
  assert.equal(MAX_IMAGES_PER_LISTING, 10);
  validateImageCount(9);
  assert.throws(() => validateImageCount(10), /limit/);
});

test("image registration is metadata-only, scoped to management membership, and enforces the count before save", async () => {
  const listing = { id: "listing-1", organizationId: "org-1", propertyId: "property-1", status: "DRAFT", version: 1, createdAt: new Date(), updatedAt: new Date() };
  let saved;
  const repository = {
    async findListing(organizationId, listingId) { return organizationId === "org-1" && listingId === listing.id ? listing : null; },
    async countImages() { return 0; },
    async saveImageMetadata(image) { saved = image; return image; },
  };
  const application = new PropertyApplication(repository);
  const image = await application.registerImageMetadata({ actor: { verified: true, memberships: [{ organizationId: "org-1", role: "MANAGER", active: true }] }, organizationId: "org-1", listingId: listing.id, imageId: "image-1", mediaType: "PNG", byteSize: 10, position: 0 });
  assert.equal(image.id, "image-1");
  assert.equal(saved.url, undefined);
});
