import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import test from "node:test";
import { TextEncoder } from "node:util";
import {
  MediaAccessDeniedError,
  MediaApplication,
  MediaNotFoundError,
} from "../dist/features/media/application/media-application.js";
import { MediaIntentSigner } from "../dist/features/media/domain/media-intent.js";
import { InMemoryFakeStorageAdapter } from "../dist/features/media/domain/storage.port.js";
import {
  validJpeg,
  validMp4,
  validPng,
} from "./support/ef601-media-fixtures.mjs";

// --- in-memory repository fake ----------------------------------------------

function inMemoryMediaRepository() {
  const assets = new Map();
  const properties = new Map();
  return {
    assets,
    properties,
    seedProperty(organizationId, propertyId) {
      properties.set(`${organizationId}:${propertyId}`, {
        id: propertyId,
        coverMediaId: null,
      });
    },
    async createAsset(input) {
      const record = {
        ...input,
        status: "PENDING",
        format: null,
        byteSize: null,
        sha256: null,
        width: null,
        height: null,
        processingNote: null,
        confirmedAt: null,
        orphanMarkedAt: null,
        updatedAt: input.createdAt,
        variants: [],
      };
      assets.set(`${input.organizationId}:${input.id}`, record);
      return structuredClone(record);
    },
    async findAsset(organizationId, mediaId) {
      const record = assets.get(`${organizationId}:${mediaId}`);
      return record ? structuredClone(record) : null;
    },
    async listByProperty(organizationId, propertyId) {
      return [...assets.values()]
        .filter(
          (asset) =>
            asset.organizationId === organizationId &&
            asset.propertyId === propertyId,
        )
        .map((entry) => structuredClone(entry));
    },
    async findProperty(organizationId, propertyId) {
      const property = properties.get(`${organizationId}:${propertyId}`);
      return property ? { ...property } : null;
    },
    async confirmAsset(input) {
      const key = `${input.organizationId}:${input.mediaId}`;
      const record = assets.get(key);
      if (!record) throw new MediaNotFoundError();
      Object.assign(record, {
        status: input.status,
        format: input.format,
        byteSize: input.byteSize,
        sha256: input.sha256,
        width: input.width,
        height: input.height,
        processingNote: input.processingNote,
        confirmedAt: input.confirmedAt,
        updatedAt: input.confirmedAt,
        variants: input.variants
          .slice()
          .sort((a, b) => a.variant.localeCompare(b.variant))
          .map((variant) => ({
            id: variant.id,
            organizationId: input.organizationId,
            mediaAssetId: input.mediaId,
            variant: variant.variant,
            storageKey: variant.storageKey,
            width: variant.width,
            height: variant.height,
            byteSize: variant.byteSize,
            createdAt: input.confirmedAt,
          })),
      });
      return structuredClone(record);
    },
    async deleteAsset(organizationId, mediaId) {
      assets.delete(`${organizationId}:${mediaId}`);
    },
    async setCover({ organizationId, propertyId, mediaId }) {
      const property = properties.get(`${organizationId}:${propertyId}`);
      property.coverMediaId = mediaId;
    },
    async clearCoverForMedia(organizationId, mediaId) {
      for (const property of properties.values()) {
        if (
          property.coverMediaId === mediaId &&
          properties.get(`${organizationId}:`) === undefined
        )
          property.coverMediaId = null;
      }
    },
    async markOrphanedUploads({ now }) {
      const marked = [];
      for (const record of assets.values()) {
        if (record.status === "PENDING" && record.intentExpiresAt < now) {
          record.status = "ORPHAN";
          record.orphanMarkedAt = now;
          marked.push({
            id: record.id,
            organizationId: record.organizationId,
            storageKey: record.storageKey,
          });
        }
      }
      return marked;
    },
    async listOrphanAssets() {
      return [...assets.values()]
        .filter((asset) => asset.status === "ORPHAN")
        .map((entry) => structuredClone(entry));
    },
    async deleteOrphanAssets(entries) {
      let deleted = 0;
      for (const { organizationId, mediaId } of entries) {
        const record = assets.get(`${organizationId}:${mediaId}`);
        if (record?.status === "ORPHAN") {
          assets.delete(`${organizationId}:${mediaId}`);
          deleted += 1;
        }
      }
      return deleted;
    },
  };
}

// --- harness ----------------------------------------------------------------

const ORG = "11111111-1111-4111-8111-111111111111";
const OTHER_ORG = "22222222-2222-4222-8222-222222222222";
const PROPERTY = "33333333-3333-4333-8333-333333333333";
const OWNER = "44444444-4444-4444-8444-444444444444";
const MANAGER = "55555555-5555-4555-8555-555555555555";
const BROKER = "66666666-6666-4666-8666-666666666666";
const CLIENT = "77777777-7777-4777-8777-777777777777";
let seq = 0;
const uid = () =>
  `a${String(++seq).padStart(3, "0")}${"0".repeat(29)}`
    .replace(/^(.{8})(.{4})(.{4})(.{4})/, "$1-$2-4$3-8$4-")
    .slice(0, 36);

function actorFor(userId, organizationId, role = "OWNER") {
  return {
    userId,
    verified: true,
    memberships: [{ organizationId, role, active: true }],
  };
}

function harness(options = {}) {
  const repository = inMemoryMediaRepository();
  const signer = new MediaIntentSigner(
    Buffer.from("ef601-application-test-secret-0000000000", "utf8"),
  );
  const storage = new InMemoryFakeStorageAdapter(signer);
  const media = new MediaApplication({
    repository,
    storage,
    signer,
    intentTtlSeconds: options.intentTtlSeconds ?? 900,
  });
  return { repository, signer, storage, media };
}

async function seededIntent(media, storage, overrides = {}) {
  const mediaId = overrides.mediaId ?? uid();
  const intent = await media.createUploadIntent({
    actor: actorFor(OWNER, ORG, overrides.role ?? "OWNER"),
    organizationId: ORG,
    propertyId: PROPERTY,
    mediaId,
    kind: overrides.kind ?? "IMAGE",
    contentType: overrides.contentType ?? "image/png",
    byteSize: overrides.byteSize ?? validPng(640, 480).length,
    fileName: overrides.fileName ?? "photo.png",
    now: overrides.now,
  });
  if (overrides.skipUpload !== true) {
    await storage.putDirect(
      intent.storageKey,
      overrides.bytes ?? validPng(640, 480),
      overrides.contentType ?? "image/png",
    );
  }
  return { mediaId, intent };
}

// --- tests ------------------------------------------------------------------

test("EF-601 happy path: intent → direct upload → confirm yields CONFIRMED image with deterministic variants", async () => {
  const { media, storage } = harness();
  media.repository.seedProperty(ORG, PROPERTY);
  const { mediaId, intent } = await seededIntent(media, storage);

  // Intent view is closed-world: opaque storage key, signed token, no paths.
  assert.deepEqual(Object.keys(intent).sort(), [
    "contentType",
    "expiresAt",
    "kind",
    "maxBytes",
    "mediaId",
    "organizationId",
    "propertyId",
    "storageKey",
    "token",
  ]);
  assert.match(intent.storageKey, /^et1_[A-Za-z0-9_-]+$/);
  assert.ok(!intent.storageKey.includes(ORG));

  const view = await media.confirmUpload({
    actor: actorFor(OWNER, ORG),
    organizationId: ORG,
    propertyId: PROPERTY,
    mediaId,
    token: intent.token,
  });
  assert.equal(view.status, "CONFIRMED");
  assert.equal(view.kind, "IMAGE");
  assert.equal(view.width, 640);
  assert.equal(view.height, 480);
  assert.deepEqual(Object.keys(view).sort(), [
    "byteSize",
    "confirmedAt",
    "createdAt",
    "fileName",
    "format",
    "height",
    "isCover",
    "kind",
    "mediaId",
    "organizationId",
    "processingNote",
    "propertyId",
    "status",
    "variants",
    "width",
  ]);
  assert.ok(!JSON.stringify(view).includes(intent.storageKey));
  assert.deepEqual(
    view.variants.map((variant) => [
      variant.variant,
      variant.width,
      variant.height,
    ]),
    [
      ["PREVIEW", 640, 480],
      ["THUMB", 160, 120],
    ],
  );
  // Variant bytes exist in storage under their own opaque keys.
  assert.equal(storage.storedKeys().length, 3);
});

test("EF-601 video confirm becomes a PROCESSING placeholder without variants", async () => {
  const { media, storage } = harness();
  media.repository.seedProperty(ORG, PROPERTY);
  const mp4 = validMp4(64);
  const { mediaId, intent } = await seededIntent(media, storage, {
    kind: "VIDEO",
    contentType: "video/mp4",
    byteSize: mp4.length,
    fileName: "tour.mp4",
    bytes: mp4,
  });
  const view = await media.confirmUpload({
    actor: actorFor(OWNER, ORG),
    organizationId: ORG,
    propertyId: PROPERTY,
    mediaId,
    token: intent.token,
  });
  assert.equal(view.status, "PROCESSING");
  assert.equal(view.processingNote, "VIDEO_TRANSCODE_OUT_OF_SCOPE");
  assert.deepEqual(view.variants, []);
  assert.ok(storage.readObject(intent.storageKey));
});

test("EF-601 intent binding: wrong user, expired, and tampered grants are rejected", async () => {
  const { media, storage } = harness();
  media.repository.seedProperty(ORG, PROPERTY);
  const { mediaId, intent } = await seededIntent(media, storage);

  await assert.rejects(
    () =>
      media.confirmUpload({
        actor: actorFor(BROKER, ORG, "BROKER"),
        organizationId: ORG,
        propertyId: PROPERTY,
        mediaId,
        token: intent.token,
      }),
    (error) => error.code === "INTENT_BINDING_MISMATCH",
  );

  const expired = harness({ intentTtlSeconds: -1 });
  expired.repository.seedProperty(ORG, PROPERTY);
  const expiredIntent = await expired.media.createUploadIntent({
    actor: actorFor(OWNER, ORG),
    organizationId: ORG,
    propertyId: PROPERTY,
    mediaId: uid(),
    kind: "IMAGE",
    contentType: "image/png",
    byteSize: 1000,
    fileName: "photo.png",
    now: new Date(Date.now() - 60_000),
  });
  await expired.storage.putDirect(
    expiredIntent.storageKey,
    validPng(640, 480),
    "image/png",
  );
  await assert.rejects(
    () =>
      expired.media.confirmUpload({
        actor: actorFor(OWNER, ORG),
        organizationId: ORG,
        propertyId: PROPERTY,
        mediaId: expiredIntent.mediaId,
        token: expiredIntent.token,
      }),
    (error) => error.code === "INTENT_EXPIRED",
  );

  await assert.rejects(
    () =>
      media.confirmUpload({
        actor: actorFor(OWNER, ORG),
        organizationId: ORG,
        propertyId: PROPERTY,
        mediaId,
        token: `${intent.token.slice(0, -4)}beef`,
      }),
    (error) => error.code === "INTENT_INVALID_SIGNATURE",
  );
});

test("EF-601 tenant isolation: other-org actors cannot read or confirm; wrong property is 404-equivalent", async () => {
  const { media, storage } = harness();
  media.repository.seedProperty(ORG, PROPERTY);
  const { mediaId, intent } = await seededIntent(media, storage);

  await assert.rejects(
    () =>
      media.listMedia({
        actor: actorFor(OWNER, OTHER_ORG),
        organizationId: ORG,
        propertyId: PROPERTY,
      }),
    MediaAccessDeniedError,
  );
  await assert.rejects(
    () =>
      media.confirmUpload({
        actor: actorFor(OWNER, OTHER_ORG),
        organizationId: ORG,
        propertyId: PROPERTY,
        mediaId,
        token: intent.token,
      }),
    MediaAccessDeniedError,
  );
  await assert.rejects(
    () =>
      media.confirmUpload({
        actor: actorFor(OWNER, ORG),
        organizationId: ORG,
        propertyId: uid(),
        mediaId,
        token: intent.token,
      }),
    MediaNotFoundError,
  );
  await assert.rejects(
    () =>
      media.removeMedia({
        actor: actorFor(OWNER, OTHER_ORG),
        organizationId: ORG,
        propertyId: PROPERTY,
        mediaId,
      }),
    MediaAccessDeniedError,
  );
});

test("EF-601 authority matrix: CLIENT denied on writes, allowed on reads; unverified and non-members denied", async () => {
  const { media, storage } = harness();
  media.repository.seedProperty(ORG, PROPERTY);

  for (const [userId, role] of [
    [OWNER, "OWNER"],
    [MANAGER, "MANAGER"],
    [BROKER, "BROKER"],
  ]) {
    await seededIntent(media, storage, {
      mediaId: uid(),
      role,
    });
    const items = await media.listMedia({
      actor: actorFor(userId, ORG, role),
      organizationId: ORG,
      propertyId: PROPERTY,
    });
    assert.ok(items.length >= 1);
  }

  await assert.rejects(
    () =>
      media.createUploadIntent({
        actor: actorFor(CLIENT, ORG, "CLIENT"),
        organizationId: ORG,
        propertyId: PROPERTY,
        mediaId: uid(),
        kind: "IMAGE",
        contentType: "image/png",
        byteSize: 1000,
        fileName: "photo.png",
      }),
    MediaAccessDeniedError,
  );
  await assert.rejects(
    () =>
      media.setCover({
        actor: actorFor(CLIENT, ORG, "CLIENT"),
        organizationId: ORG,
        propertyId: PROPERTY,
        mediaId: uid(),
      }),
    MediaAccessDeniedError,
  );

  const unverified = { ...actorFor(OWNER, ORG), verified: false };
  await assert.rejects(
    () =>
      media.createUploadIntent({
        actor: unverified,
        organizationId: ORG,
        propertyId: PROPERTY,
        mediaId: uid(),
        kind: "IMAGE",
        contentType: "image/png",
        byteSize: 1000,
        fileName: "photo.png",
      }),
    MediaAccessDeniedError,
  );

  const clientRead = await media.listMedia({
    actor: actorFor(CLIENT, ORG, "CLIENT"),
    organizationId: ORG,
    propertyId: PROPERTY,
  });
  assert.ok(Array.isArray(clientRead));
});

test("EF-601 malicious confirmations: wrong magic, polyglot, oversize-vs-intent, missing upload, double confirm", async () => {
  const { media, storage } = harness();
  media.repository.seedProperty(ORG, PROPERTY);

  // Wrong magic: declared PNG, stored JPEG bytes.
  const wrongMagic = await seededIntent(media, storage, {
    mediaId: uid(),
    bytes: validJpeg(800, 600),
    contentType: "image/png",
    fileName: "trick.png",
  });
  await assert.rejects(
    () =>
      media.confirmUpload({
        actor: actorFor(OWNER, ORG),
        organizationId: ORG,
        propertyId: PROPERTY,
        mediaId: wrongMagic.mediaId,
        token: wrongMagic.intent.token,
      }),
    (error) => error.code === "MAGIC_MISMATCH",
  );

  // Polyglot: JPEG carrying a %PDF marker.
  const jpegPoly = validJpeg(800, 600);
  const pdf = new TextEncoder().encode("%PDF-1.7");
  const polyBytes = new Uint8Array(jpegPoly.length + pdf.length);
  polyBytes.set(jpegPoly, 0);
  polyBytes.set(pdf, jpegPoly.length);
  const polyglot = await seededIntent(media, storage, {
    mediaId: uid(),
    bytes: polyBytes,
    contentType: "image/jpeg",
    fileName: "poly.jpg",
  });
  await assert.rejects(
    () =>
      media.confirmUpload({
        actor: actorFor(OWNER, ORG),
        organizationId: ORG,
        propertyId: PROPERTY,
        mediaId: polyglot.mediaId,
        token: polyglot.intent.token,
      }),
    (error) => error.code === "POLYGLOT_SUSPECTED",
  );

  // Oversize vs intent bound: 32x32 PNG declared as tiny.
  const small = validPng(32, 32);
  const over = await seededIntent(media, storage, {
    mediaId: uid(),
    byteSize: 10,
    bytes: small,
  });
  await assert.rejects(
    () =>
      media.confirmUpload({
        actor: actorFor(OWNER, ORG),
        organizationId: ORG,
        propertyId: PROPERTY,
        mediaId: over.mediaId,
        token: over.intent.token,
      }),
    (error) => error.code === "OVERSIZE",
  );

  // Intent for a double-extension name never reaches storage.
  await assert.rejects(
    () =>
      media.createUploadIntent({
        actor: actorFor(OWNER, ORG),
        organizationId: ORG,
        propertyId: PROPERTY,
        mediaId: uid(),
        kind: "IMAGE",
        contentType: "image/png",
        byteSize: 1000,
        fileName: "shell.php.png",
      }),
    (error) => error.code === "FILENAME_DOUBLE_EXTENSION",
  );

  // Missing upload bytes.
  const missing = await seededIntent(media, storage, {
    mediaId: uid(),
    skipUpload: true,
  });
  await assert.rejects(
    () =>
      media.confirmUpload({
        actor: actorFor(OWNER, ORG),
        organizationId: ORG,
        propertyId: PROPERTY,
        mediaId: missing.mediaId,
        token: missing.intent.token,
      }),
    (error) => error.code === "UPLOAD_NOT_FOUND",
  );

  // Double confirm is a typed state error.
  const ok = await seededIntent(media, storage, { mediaId: uid() });
  await media.confirmUpload({
    actor: actorFor(OWNER, ORG),
    organizationId: ORG,
    propertyId: PROPERTY,
    mediaId: ok.mediaId,
    token: ok.intent.token,
  });
  await assert.rejects(
    () =>
      media.confirmUpload({
        actor: actorFor(OWNER, ORG),
        organizationId: ORG,
        propertyId: PROPERTY,
        mediaId: ok.mediaId,
        token: ok.intent.token,
      }),
    (error) => error.code === "MEDIA_ALREADY_CONFIRMED",
  );
});

test("EF-601 cover requires a confirmed image; delete clears cover and storage", async () => {
  const { media, storage } = harness();
  media.repository.seedProperty(ORG, PROPERTY);
  const image = await seededIntent(media, storage, { mediaId: uid() });
  await media.confirmUpload({
    actor: actorFor(OWNER, ORG),
    organizationId: ORG,
    propertyId: PROPERTY,
    mediaId: image.mediaId,
    token: image.intent.token,
  });

  await assert.rejects(
    () =>
      media.setCover({
        actor: actorFor(OWNER, ORG),
        organizationId: ORG,
        propertyId: PROPERTY,
        mediaId: uid(),
      }),
    MediaNotFoundError,
  );

  const pending = await seededIntent(media, storage, { mediaId: uid() });
  await assert.rejects(
    () =>
      media.setCover({
        actor: actorFor(OWNER, ORG),
        organizationId: ORG,
        propertyId: PROPERTY,
        mediaId: pending.mediaId,
      }),
    (error) => error.code === "COVER_REQUIRES_CONFIRMED_IMAGE",
  );

  await media.setCover({
    actor: actorFor(OWNER, ORG),
    organizationId: ORG,
    propertyId: PROPERTY,
    mediaId: image.mediaId,
  });
  const items = await media.listMedia({
    actor: actorFor(CLIENT, ORG, "CLIENT"),
    organizationId: ORG,
    propertyId: PROPERTY,
  });
  const coverItem = items.find((item) => item.mediaId === image.mediaId);
  assert.equal(coverItem.isCover, true);
  assert.equal(items.filter((item) => item.isCover).length, 1);

  const keysBefore = storage.storedKeys().length;
  await media.removeMedia({
    actor: actorFor(MANAGER, ORG, "MANAGER"),
    organizationId: ORG,
    propertyId: PROPERTY,
    mediaId: image.mediaId,
  });
  assert.equal(storage.storedKeys().length, keysBefore - 3);
  const after = await media.listMedia({
    actor: actorFor(OWNER, ORG),
    organizationId: ORG,
    propertyId: PROPERTY,
  });
  assert.ok(!after.some((item) => item.isCover));
});

test("EF-601 orphan policy: TTL mark then sweep removes only unconfirmed media", async () => {
  const { media, storage } = harness({ intentTtlSeconds: 60 });
  media.repository.seedProperty(ORG, PROPERTY);

  await seededIntent(media, storage, { mediaId: uid() });
  const keeper = await seededIntent(media, storage, { mediaId: uid() });
  await media.confirmUpload({
    actor: actorFor(OWNER, ORG),
    organizationId: ORG,
    propertyId: PROPERTY,
    mediaId: keeper.mediaId,
    token: keeper.intent.token,
  });
  const keeperKeys = storage.storedKeys().length;

  const later = new Date(Date.now() + 120_000);
  const result = await media.runOrphanMaintenance({ now: later });
  assert.equal(result.marked, 1);
  assert.equal(result.swept, 1);
  assert.ok(result.deletedStorageKeys >= 1);

  const items = await media.listMedia({
    actor: actorFor(OWNER, ORG),
    organizationId: ORG,
    propertyId: PROPERTY,
  });
  assert.deepEqual(
    items.map((item) => item.mediaId),
    [keeper.mediaId],
  );
  // Exactly the orphan's original key was removed; keeper keys remain.
  assert.equal(storage.storedKeys().length, keeperKeys - 1);
  assert.ok(storage.readObject(keeper.intent.storageKey));

  // Re-running the sweep is a no-op.
  const replay = await media.runOrphanMaintenance({ now: later });
  assert.equal(replay.marked, 0);
  assert.equal(replay.swept, 0);
});

test("EF-601 intent for a missing property is a typed state error", async () => {
  const { media } = harness();
  await assert.rejects(
    () =>
      media.createUploadIntent({
        actor: actorFor(OWNER, ORG),
        organizationId: ORG,
        propertyId: uid(),
        mediaId: uid(),
        kind: "IMAGE",
        contentType: "image/png",
        byteSize: 1000,
        fileName: "photo.png",
      }),
    (error) => error.code === "PROPERTY_NOT_FOUND",
  );
});

test("EF-601 unsupported content types and zero/negative sizes are rejected at intent time", async () => {
  const { media } = harness();
  media.repository.seedProperty(ORG, PROPERTY);
  await assert.rejects(
    () =>
      media.createUploadIntent({
        actor: actorFor(OWNER, ORG),
        organizationId: ORG,
        propertyId: PROPERTY,
        mediaId: uid(),
        kind: "IMAGE",
        contentType: "image/gif",
        byteSize: 1000,
        fileName: "anim.gif",
      }),
    (error) => error.code === "CONTENT_TYPE_UNSUPPORTED",
  );
  await assert.rejects(
    () =>
      media.createUploadIntent({
        actor: actorFor(OWNER, ORG),
        organizationId: ORG,
        propertyId: PROPERTY,
        mediaId: uid(),
        kind: "IMAGE",
        contentType: "image/png",
        byteSize: 0,
        fileName: "photo.png",
      }),
    (error) => error.code === "OVERSIZE",
  );
});
