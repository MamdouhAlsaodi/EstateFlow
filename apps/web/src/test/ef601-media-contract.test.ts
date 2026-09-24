import assert from "node:assert/strict";
import test from "node:test";
import {
  formatBytes,
  mediaBytesUrl,
  MEDIA_KIND_LABELS,
  MEDIA_STATUS_LABELS,
  MEDIA_VARIANT_LABELS,
  normalizeMediaItem,
  normalizeMediaList,
  normalizePropertySummary,
  normalizeUploadIntent,
  storageObjectUrl,
} from "../features/properties/media-contract";
import { arMessages } from "../i18n/catalog";

const orgId = "11111111-1111-4111-8111-111111111111";
const propertyId = "22222222-2222-4222-8222-222222222222";
const mediaId = "33333333-3333-4333-8333-333333333333";
const variantId = "44444444-4444-4444-8444-444444444444";
const now = "2026-10-02T10:00:00.000Z";

const validVariant = {
  variantId,
  variant: "THUMB",
  width: 160,
  height: 120,
  byteSize: 2048,
};

const validMediaItem = {
  mediaId,
  propertyId,
  kind: "IMAGE",
  status: "CONFIRMED",
  format: "PNG",
  byteSize: 65536,
  width: 640,
  height: 480,
  fileName: "villa.png",
  isCover: true,
  createdAt: now,
  confirmedAt: now,
  processingNote: null,
  variants: [validVariant],
};

test("EF-601 media items normalize with closed-world fields", () => {
  const item = normalizeMediaItem(validMediaItem);
  assert.equal(item.mediaId, mediaId);
  assert.equal(item.status, "CONFIRMED");
  assert.equal(item.isCover, true);
  assert.deepEqual(item.variants[0], {
    variantId,
    variant: "THUMB",
    width: 160,
    height: 120,
    byteSize: 2048,
  });
  // Unknown fields are dropped, never propagated into the view model.
  const leaked = normalizeMediaItem({
    ...validMediaItem,
    storageKey: "et1_secret",
    serverPath: "/var/lib/estateflow/media",
  });
  assert.equal(JSON.stringify(leaked).includes("et1_secret"), false);
  assert.equal(JSON.stringify(leaked).includes("/var/lib"), false);
});

test("EF-601 media list normalizer rejects malformed payloads", () => {
  assert.throws(() => normalizeMediaList(null), TypeError);
  assert.throws(() => normalizeMediaList({}), TypeError);
  assert.throws(
    () =>
      normalizeMediaList({ items: [{ ...validMediaItem, mediaId: "nope" }] }),
    TypeError,
  );
  assert.throws(
    () =>
      normalizeMediaList({ items: [{ ...validMediaItem, status: "ORPHAN" }] }),
    TypeError,
  );
  assert.throws(
    () => normalizeMediaList({ items: [{ ...validMediaItem, kind: "GIF" }] }),
    TypeError,
  );
  assert.throws(
    () =>
      normalizeMediaList({
        items: [{ ...validMediaItem, createdAt: "2026-10-02 10:00" }],
      }),
    TypeError,
  );
  assert.throws(
    () =>
      normalizeMediaList({ items: [{ ...validMediaItem, width: 10000000 }] }),
    TypeError,
  );
});

test("EF-601 upload intent normalizer accepts only opaque storage keys", () => {
  const intent = normalizeUploadIntent({
    mediaId,
    storageKey: "et1_A9zzXX00-_mask",
    token: "eyJ0ZXN0IjoxfQ.sig",
    contentType: "image/png",
    maxBytes: 1024,
    expiresAt: now,
  });
  assert.equal(intent.storageKey, "et1_A9zzXX00-_mask");
  assert.throws(
    () =>
      normalizeUploadIntent({
        mediaId,
        storageKey: "/var/lib/estateflow/media/secret.png",
        token: "tok-0000001",
        contentType: "image/png",
        maxBytes: 1024,
        expiresAt: now,
      }),
    TypeError,
  );
  assert.throws(
    () =>
      normalizeUploadIntent({
        mediaId,
        storageKey: "et1_ok_but_bad_token",
        token: "x",
        contentType: "image/png",
        maxBytes: 1024,
        expiresAt: now,
      }),
    TypeError,
  );
});

test("EF-601 property summary normalizer validates identity fields", () => {
  const summary = normalizePropertySummary({
    id: propertyId,
    organizationId: orgId,
    title: "فيلا الملقا",
    propertyType: "VILLA",
    addressText: "الرياض",
    status: "ACTIVE",
    version: 3,
    latitude: 24.8,
    longitude: 46.6,
    listings: [{ unexpected: true }],
  });
  assert.equal(summary.title, "فيلا الملقا");
  assert.equal(summary.version, 3);
  assert.equal("listings" in summary, false);
  assert.throws(
    () =>
      normalizePropertySummary({
        id: propertyId,
        organizationId: orgId,
        title: "",
      }),
    TypeError,
  );
});

test("EF-601 media URLs are API paths only and reject non-UUID identifiers", () => {
  const url = mediaBytesUrl(orgId, propertyId, mediaId, "THUMB");
  assert.equal(
    url,
    `/api/organizations/${orgId}/properties/${propertyId}/media/${mediaId}/bytes?variant=THUMB`,
  );
  assert.equal(
    mediaBytesUrl(orgId, propertyId, mediaId),
    `/api/organizations/${orgId}/properties/${propertyId}/media/${mediaId}/bytes`,
  );
  assert.throws(() => storageObjectUrl(orgId, propertyId, "k", "t"), TypeError);
  const storage = storageObjectUrl(
    orgId,
    propertyId,
    "et1_abcdef",
    "tok-000000",
  );
  assert.match(storage, /^\/api\/organizations\/.+storage-objects\//);
});

test("EF-601 Arabic labels cover every media state and format helper is bounded", () => {
  assert.deepEqual(Object.keys(MEDIA_STATUS_LABELS).sort(), [
    "CONFIRMED",
    "PENDING",
    "PROCESSING",
  ]);
  assert.deepEqual(Object.keys(MEDIA_KIND_LABELS).sort(), ["IMAGE", "VIDEO"]);
  assert.deepEqual(Object.keys(MEDIA_VARIANT_LABELS).sort(), [
    "PREVIEW",
    "THUMB",
  ]);
  for (const label of Object.values(MEDIA_STATUS_LABELS))
    assert.match(arMessages[label], /[\u0600-\u06FF]/);
  const sizeUnits = {
    bytes: arMessages["properties.media.unit.bytes"],
    kb: arMessages["properties.media.unit.kb"],
    mb: arMessages["properties.media.unit.mb"],
  };
  assert.equal(formatBytes(null), "—");
  assert.equal(formatBytes(-5), "—");
  // `ar` on this runtime renders Latin digits (ICU default); the units are
  // localized from the catalog and the number formatting is locale-aware.
  assert.equal(formatBytes(512, sizeUnits), "512 بايت");
  assert.equal(formatBytes(2048, sizeUnits), "2 ك.ب");
  assert.equal(formatBytes(3 * 1024 * 1024, sizeUnits), "3 م.ب");
});
