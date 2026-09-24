import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import process from "node:process";
import { TextEncoder } from "node:util";
import { URL } from "node:url";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { PrismaClient } from "@prisma/client";
import { MediaApplication } from "../dist/features/media/application/media-application.js";
import {
  MediaAccessDeniedError,
  MediaNotFoundError,
} from "../dist/features/media/application/media-application.js";
import { PrismaMediaRepository } from "../dist/features/media/infrastructure/prisma-media.repository.js";
import { MediaIntentSigner } from "../dist/features/media/domain/media-intent.js";
import { InMemoryFakeStorageAdapter } from "../dist/features/media/domain/storage.port.js";
import {
  cleanupDatabase,
  assertTablesAreEmpty,
} from "./support/cleanup-database.mjs";
import {
  validJpeg,
  validMp4,
  validPng,
} from "./support/ef601-media-fixtures.mjs";

const expectedPort = process.env.ESTATEFLOW_TEST_DB_PORT ?? "55433";
const guarded =
  process.env.ALLOW_DESTRUCTIVE_TESTS === "1" &&
  (() => {
    if (!process.env.DATABASE_URL) return false;
    const url = new URL(process.env.DATABASE_URL);
    return (
      ["postgres:", "postgresql:"].includes(url.protocol) &&
      ["127.0.0.1", "localhost", "::1"].includes(url.hostname) &&
      url.port === expectedPort &&
      url.username === "estateflow_test" &&
      url.pathname === "/estateflow_test"
    );
  })();

const TABLES = [
  "MediaVariant",
  "MediaAsset",
  "Property",
  "Membership",
  "Organization",
  "User",
];

const ORG = () => randomUUID();
const uid = () => randomUUID();

function harness(prisma) {
  const signer = new MediaIntentSigner(
    Buffer.from("ef601-integration-test-secret-00000000000", "utf8"),
  );
  const storage = new InMemoryFakeStorageAdapter(signer);
  const repository = new PrismaMediaRepository(prisma);
  const media = new MediaApplication({ repository, storage, signer });
  return { media, storage, signer, repository };
}

function actorFor(userId, organizationId, role = "OWNER") {
  return {
    userId,
    verified: true,
    memberships: [{ organizationId, role, active: true }],
  };
}

async function seedOrganization(
  prisma,
  ids,
  { members } = { members: ["OWNER"] },
) {
  const now = new Date();
  await prisma.user.createMany({
    data: members.map((role) => ({
      id: ids[role],
      accountIdentifier: `${ids[role]}@ef601.test.invalid`,
      verifiedAt: now,
    })),
  });
  await prisma.organization.create({
    data: { id: ids.organizationId, name: "EF601 synthetic" },
  });
  const roles = {
    OWNER: "OWNER",
    MANAGER: "MANAGER",
    BROKER: "BROKER",
    CLIENT: "CLIENT",
  };
  await prisma.membership.createMany({
    data: members.map((role) => ({
      organizationId: ids.organizationId,
      userId: ids[role],
      role: roles[role],
      status: "ACTIVE",
    })),
  });
  await prisma.property.create({
    data: {
      id: ids.propertyId,
      organizationId: ids.organizationId,
      title: "EF601 villa",
      propertyType: "VILLA",
      addressText: "Synthetic address",
      status: "ACTIVE",
    },
  });
}

function baseIds() {
  return {
    organizationId: ORG(),
    propertyId: uid(),
    OWNER: uid(),
    MANAGER: uid(),
    BROKER: uid(),
    CLIENT: uid(),
  };
}

test(
  "EF-601 full media lifecycle persists confirmed image with deterministic variants on estateflow_test",
  { skip: !guarded },
  async () => {
    const prisma = new PrismaClient();
    const ids = baseIds();
    const { media, storage } = harness(prisma);
    try {
      await cleanupDatabase(prisma, TABLES);
      await seedOrganization(prisma, ids, {
        members: ["OWNER", "MANAGER", "BROKER", "CLIENT"],
      });

      const mediaId = uid();
      const bytes = validPng(640, 480);
      const intent = await media.createUploadIntent({
        actor: actorFor(ids.OWNER, ids.organizationId),
        organizationId: ids.organizationId,
        propertyId: ids.propertyId,
        mediaId,
        kind: "IMAGE",
        contentType: "image/png",
        byteSize: bytes.length,
        fileName: "villa.png",
      });

      // Nothing is confirmed yet: the grid shows only the intent state.
      const pendingRows = await prisma.mediaAsset.findMany({
        where: { organizationId: ids.organizationId },
      });
      assert.equal(pendingRows.length, 1);
      assert.equal(pendingRows[0].status, "PENDING");

      // The client uploads directly to the storage boundary (fake here).
      await storage.putDirect(intent.storageKey, bytes, "image/png");

      const view = await media.confirmUpload({
        actor: actorFor(ids.OWNER, ids.organizationId),
        organizationId: ids.organizationId,
        propertyId: ids.propertyId,
        mediaId,
        token: intent.token,
      });
      assert.equal(view.status, "CONFIRMED");
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
      // No storage keys or paths anywhere in the response payload.
      assert.ok(!JSON.stringify(view).includes("et1_"));
      assert.ok(!JSON.stringify(view).includes("/"));

      const persisted = await prisma.mediaAsset.findUnique({
        where: {
          organizationId_id: {
            organizationId: ids.organizationId,
            id: mediaId,
          },
        },
        include: { variants: true },
      });
      assert.equal(persisted.format, "PNG");
      assert.equal(persisted.byteSize, bytes.length);
      assert.match(persisted.sha256, /^[0-9a-f]{64}$/);
      assert.equal(persisted.width, 640);
      assert.equal(persisted.height, 480);
      assert.equal(persisted.variants.length, 2);
      for (const variant of persisted.variants) {
        assert.match(variant.storageKey, /^et1_[A-Za-z0-9_-]+$/);
      }
      const variantRows = persisted.variants.map((variant) => [
        variant.variant,
        variant.width,
        variant.height,
      ]);
      assert.deepEqual(variantRows.sort(), [
        ["PREVIEW", 640, 480],
        ["THUMB", 160, 120],
      ]);

      // Confirm is single-use: a second confirm is a typed state error.
      await assert.rejects(
        () =>
          media.confirmUpload({
            actor: actorFor(ids.OWNER, ids.organizationId),
            organizationId: ids.organizationId,
            propertyId: ids.propertyId,
            mediaId,
            token: intent.token,
          }),
        (error) => error.code === "MEDIA_ALREADY_CONFIRMED",
      );
    } finally {
      await prisma.$disconnect();
    }
  },
);

test(
  "EF-601 malicious payload suite is rejected with typed errors and leaves no confirmed rows",
  { skip: !guarded },
  async () => {
    const prisma = new PrismaClient();
    const ids = baseIds();
    const { media, storage } = harness(prisma);
    try {
      await cleanupDatabase(prisma, TABLES);
      await seedOrganization(prisma, ids, { members: ["OWNER"] });

      async function attempt(name, overrides, expectedCode) {
        const mediaId = uid();
        const intent = await media.createUploadIntent({
          actor: actorFor(ids.OWNER, ids.organizationId),
          organizationId: ids.organizationId,
          propertyId: ids.propertyId,
          mediaId,
          kind: overrides.kind ?? "IMAGE",
          contentType: overrides.contentType ?? "image/png",
          byteSize: overrides.byteSize ?? 1_000_000,
          fileName: overrides.fileName ?? "photo.png",
        });
        await storage.putDirect(
          intent.storageKey,
          overrides.bytes,
          overrides.uploadContentType ?? overrides.contentType ?? "image/png",
        );
        await assert.rejects(
          () =>
            media.confirmUpload({
              actor: actorFor(ids.OWNER, ids.organizationId),
              organizationId: ids.organizationId,
              propertyId: ids.propertyId,
              mediaId,
              token: intent.token,
            }),
          (error) => {
            assert.equal(error.code, expectedCode, name);
            return true;
          },
        );
        const row = await prisma.mediaAsset.findUnique({
          where: {
            organizationId_id: {
              organizationId: ids.organizationId,
              id: mediaId,
            },
          },
        });
        assert.equal(row.status, "PENDING", name);
      }

      // Wrong magic: JPEG bytes declared as PNG.
      await attempt(
        "wrong-magic",
        { bytes: validJpeg(800, 600), contentType: "image/png" },
        "MAGIC_MISMATCH",
      );
      // Polyglot: JPEG carrying a %PDF marker.
      const jpegBytes = validJpeg(800, 600);
      const marker = new TextEncoder().encode("%PDF-1.7");
      const poly = new Uint8Array(jpegBytes.length + marker.length);
      poly.set(jpegBytes, 0);
      poly.set(marker, jpegBytes.length);
      await attempt(
        "polyglot",
        { bytes: poly, contentType: "image/jpeg", fileName: "poly.jpg" },
        "POLYGLOT_SUSPECTED",
      );
      // GIF masquerading as a photo.
      await attempt(
        "gif",
        {
          bytes: Uint8Array.from([
            0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 1, 2, 3, 4,
          ]),
          contentType: "image/png",
        },
        "UNKNOWN_FORMAT",
      );
      // Oversized image (> 5 MiB).
      const huge = new Uint8Array(5 * 1024 * 1024 + 1);
      huge.set(Uint8Array.of(0x89, 0x50, 0x4e, 0x47), 0);
      await attempt(
        "oversize",
        { bytes: huge, contentType: "image/png" },
        "OVERSIZE",
      );
      // Lying dimensions: PNG header claiming 5x5 pixels.
      await attempt(
        "lying-dimensions",
        { bytes: validPng(5, 5), contentType: "image/png" },
        "DIMENSION_INVALID",
      );
      // Double-extension filename at intent time.
      await assert.rejects(
        () =>
          media.createUploadIntent({
            actor: actorFor(ids.OWNER, ids.organizationId),
            organizationId: ids.organizationId,
            propertyId: ids.propertyId,
            mediaId: uid(),
            kind: "IMAGE",
            contentType: "image/png",
            byteSize: 1000,
            fileName: "shell.php.png",
          }),
        (error) => {
          assert.equal(error.code, "FILENAME_DOUBLE_EXTENSION");
          return true;
        },
      );

      const confirmedCount = await prisma.mediaAsset.count({
        where: {
          organizationId: ids.organizationId,
          status: { not: "PENDING" },
        },
      });
      assert.equal(confirmedCount, 0);
    } finally {
      await prisma.$disconnect();
    }
  },
);

test(
  "EF-601 signed-intent binding, tenant isolation, and authority matrix on the HTTP-equivalent application boundary",
  { skip: !guarded },
  async () => {
    const prisma = new PrismaClient();
    const orgA = baseIds();
    const orgB = baseIds();
    const { media, storage } = harness(prisma);
    try {
      await cleanupDatabase(prisma, TABLES);
      await seedOrganization(prisma, orgA, {
        members: ["OWNER", "MANAGER", "BROKER", "CLIENT"],
      });
      await seedOrganization(prisma, orgB, { members: ["OWNER", "CLIENT"] });

      const mediaId = uid();
      const bytes = validPng(320, 200);
      const intent = await media.createUploadIntent({
        actor: actorFor(orgA.OWNER, orgA.organizationId),
        organizationId: orgA.organizationId,
        propertyId: orgA.propertyId,
        mediaId,
        kind: "IMAGE",
        contentType: "image/png",
        byteSize: bytes.length,
        fileName: "a.png",
      });
      await storage.putDirect(intent.storageKey, bytes, "image/png");

      // Wrong user (same org): the intent is bound to its uploader.
      await assert.rejects(
        () =>
          media.confirmUpload({
            actor: actorFor(orgA.BROKER, orgA.organizationId, "BROKER"),
            organizationId: orgA.organizationId,
            propertyId: orgA.propertyId,
            mediaId,
            token: intent.token,
          }),
        (error) => error.code === "INTENT_BINDING_MISMATCH",
      );
      // Wrong property binding through a forged token for another property:
      // cross-property references are 404-equivalent (media not found in that
      // property scope), never a cross-tenant confirmation.
      const foreignGrant = harness(prisma).signer.sign({
        mediaId,
        organizationId: orgA.organizationId,
        propertyId: orgB.propertyId,
        userId: orgA.OWNER,
        kind: "IMAGE",
        contentType: "image/png",
        maxBytes: bytes.length,
        expiresAtEpochSeconds: Math.floor(Date.now() / 1000) + 60,
      });
      await assert.rejects(
        () =>
          media.confirmUpload({
            actor: actorFor(orgA.OWNER, orgA.organizationId),
            organizationId: orgA.organizationId,
            propertyId: orgB.propertyId,
            mediaId,
            token: foreignGrant.token,
          }),
        MediaNotFoundError,
      );

      // Tenant isolation: org B's owner (membership only in org B) cannot
      // read or delete org A media.
      await assert.rejects(
        () =>
          media.listMedia({
            actor: actorFor(orgB.OWNER, orgB.organizationId),
            organizationId: orgA.organizationId,
            propertyId: orgA.propertyId,
          }),
        MediaAccessDeniedError,
      );
      await assert.rejects(
        () =>
          media.removeMedia({
            actor: actorFor(orgB.OWNER, orgB.organizationId),
            organizationId: orgA.organizationId,
            propertyId: orgA.propertyId,
            mediaId,
          }),
        MediaAccessDeniedError,
      );

      // Authority: Broker confirms (uploader only → expect binding mismatch),
      // Client intents are denied, Client reads allowed.
      await assert.rejects(
        () =>
          media.createUploadIntent({
            actor: actorFor(orgA.CLIENT, orgA.organizationId, "CLIENT"),
            organizationId: orgA.organizationId,
            propertyId: orgA.propertyId,
            mediaId: uid(),
            kind: "IMAGE",
            contentType: "image/png",
            byteSize: 1000,
            fileName: "c.png",
          }),
        MediaAccessDeniedError,
      );
      const clientItems = await media.listMedia({
        actor: actorFor(orgA.CLIENT, orgA.organizationId, "CLIENT"),
        organizationId: orgA.organizationId,
        propertyId: orgA.propertyId,
      });
      assert.equal(clientItems.length, 1);
      assert.equal(clientItems[0].status, "PENDING");

      // The OWNER (bound uploader) confirms successfully.
      const view = await media.confirmUpload({
        actor: actorFor(orgA.OWNER, orgA.organizationId),
        organizationId: orgA.organizationId,
        propertyId: orgA.propertyId,
        mediaId,
        token: intent.token,
      });
      assert.equal(view.status, "CONFIRMED");

      // Cover + delete semantics with a persisted FK.
      await media.setCover({
        actor: actorFor(orgA.MANAGER, orgA.organizationId, "MANAGER"),
        organizationId: orgA.organizationId,
        propertyId: orgA.propertyId,
        mediaId,
      });
      const propertyRow = await prisma.property.findUnique({
        where: {
          organizationId_id: {
            organizationId: orgA.organizationId,
            id: orgA.propertyId,
          },
        },
      });
      assert.equal(propertyRow.coverMediaId, mediaId);
      await media.removeMedia({
        actor: actorFor(orgA.OWNER, orgA.organizationId),
        organizationId: orgA.organizationId,
        propertyId: orgA.propertyId,
        mediaId,
      });
      const cleared = await prisma.property.findUnique({
        where: {
          organizationId_id: {
            organizationId: orgA.organizationId,
            id: orgA.propertyId,
          },
        },
      });
      assert.equal(cleared.coverMediaId, null);
      assert.equal(
        await prisma.mediaAsset.count({
          where: { organizationId: orgA.organizationId },
        }),
        0,
      );
    } finally {
      await prisma.$disconnect();
    }
  },
);

test(
  "EF-601 orphan TTL sweep removes expired intents and keeps confirmed media; video becomes PROCESSING placeholder",
  { skip: !guarded },
  async () => {
    const prisma = new PrismaClient();
    const ids = baseIds();
    const { media, storage } = harness(prisma);
    try {
      await cleanupDatabase(prisma, TABLES);
      await seedOrganization(prisma, ids, { members: ["OWNER"] });

      // Expired intent (never confirmed).
      const expiredId = uid();
      const expiredIntent = await media.createUploadIntent({
        actor: actorFor(ids.OWNER, ids.organizationId),
        organizationId: ids.organizationId,
        propertyId: ids.propertyId,
        mediaId: expiredId,
        kind: "IMAGE",
        contentType: "image/png",
        byteSize: 1000,
        fileName: "stale.png",
        now: new Date(Date.now() - 3_600_000),
      });
      await storage.putDirect(
        expiredIntent.storageKey,
        validPng(32, 32),
        "image/png",
      );

      // Confirmed image with variants.
      const keeperId = uid();
      const keeperBytes = validPng(1600, 800);
      const keeperIntent = await media.createUploadIntent({
        actor: actorFor(ids.OWNER, ids.organizationId),
        organizationId: ids.organizationId,
        propertyId: ids.propertyId,
        mediaId: keeperId,
        kind: "IMAGE",
        contentType: "image/png",
        byteSize: keeperBytes.length,
        fileName: "keep.png",
      });
      await storage.putDirect(
        keeperIntent.storageKey,
        keeperBytes,
        "image/png",
      );
      await media.confirmUpload({
        actor: actorFor(ids.OWNER, ids.organizationId),
        organizationId: ids.organizationId,
        propertyId: ids.propertyId,
        mediaId: keeperId,
        token: keeperIntent.token,
      });

      // Video placeholder.
      const videoId = uid();
      const videoBytes = validMp4(96);
      const videoIntent = await media.createUploadIntent({
        actor: actorFor(ids.OWNER, ids.organizationId),
        organizationId: ids.organizationId,
        propertyId: ids.propertyId,
        mediaId: videoId,
        kind: "VIDEO",
        contentType: "video/mp4",
        byteSize: videoBytes.length,
        fileName: "tour.mp4",
      });
      await storage.putDirect(videoIntent.storageKey, videoBytes, "video/mp4");
      const videoView = await media.confirmUpload({
        actor: actorFor(ids.OWNER, ids.organizationId),
        organizationId: ids.organizationId,
        propertyId: ids.propertyId,
        mediaId: videoId,
        token: videoIntent.token,
      });
      assert.equal(videoView.status, "PROCESSING");
      assert.equal(videoView.processingNote, "VIDEO_TRANSCODE_OUT_OF_SCOPE");

      const result = await media.runOrphanMaintenance({ now: new Date() });
      assert.equal(result.marked, 1);
      assert.equal(result.swept, 1);

      const remaining = await prisma.mediaAsset.findMany({
        where: { organizationId: ids.organizationId },
      });
      assert.deepEqual(
        remaining.map((row) => [row.id, row.status]).sort(),
        [
          [keeperId, "CONFIRMED"],
          [videoId, "PROCESSING"],
        ].sort(),
      );
      assert.equal(
        await prisma.mediaVariant.count({
          where: { organizationId: ids.organizationId },
        }),
        2,
      );
      // The keeper's original bytes and variant bytes survive the sweep.
      assert.ok(await storage.readObject(keeperIntent.storageKey));
      assert.equal(
        await prisma.mediaAsset.count({
          where: { organizationId: ids.organizationId, status: "ORPHAN" },
        }),
        0,
      );

      // Re-running the maintenance is a no-op.
      const replay = await media.runOrphanMaintenance({ now: new Date() });
      assert.equal(replay.marked, 0);
      assert.equal(replay.swept, 0);
    } finally {
      await cleanupDatabase(prisma, TABLES);
      await prisma.$disconnect();
    }
  },
);

test(
  "EF-601 integration cleanup leaves the estateflow_test media tables empty",
  { skip: !guarded },
  async () => {
    const prisma = new PrismaClient();
    try {
      await assertTablesAreEmpty(prisma, ["MediaVariant", "MediaAsset"]);
    } finally {
      await prisma.$disconnect();
    }
  },
);
