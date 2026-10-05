// EF-701 — bounded test-only cross-tenant HTTP+PostgreSQL integration slice
// for EF-601 media bytes. Regression scope only: org A uploads and confirms a
// synthetic JPEG through the real HTTP boundary (upload intent → simulated
// storage PUT with the signed grant → confirm), then org A reads the exact
// bytes back while org B is denied with precise 403 semantics and no state
// mutation. This is not a full security signoff.
//
// Guarded like ef201-property.http.integration.test.mjs /
// ef234-expense.http.integration.test.mjs: only runs against the local
// estateflow_test database target with ALLOW_DESTRUCTIVE_TESTS=1.

import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { randomBytes, randomUUID } from "node:crypto";
import process from "node:process";
import { URL } from "node:url";
import test from "node:test";
import { ValidationPipe } from "@nestjs/common";

const ORIGIN = "https://app.estateflow.test";
const HASH_KEY = "a".repeat(32);
const AUDIT_KEY = "b".repeat(32);
const TABLES = [
  "MediaVariant",
  "MediaAsset",
  "Property",
  "Membership",
  "Organization",
  "User",
  "AccessSession",
  "SessionFamily",
  "RefreshSession",
  "Credential",
  "PasswordReset",
  "EmailVerification",
  "AuthAttempt",
  "AuthRateLimitEvent",
  "SecurityAuditEvent",
];
Object.assign(process.env, {
  NODE_ENV: "test",
  ESTATEFLOW_BROWSER_ORIGIN: ORIGIN,
  ESTATEFLOW_AUTH_HASH_KEY: HASH_KEY,
  ESTATEFLOW_AUDIT_HASH_KEY: AUDIT_KEY,
  ESTATEFLOW_AUTH_FAKE_DELIVERY: "true",
});
const expectedPort = process.env.ESTATEFLOW_TEST_DB_PORT ?? "55433";
function guardedTarget() {
  if (process.env.ALLOW_DESTRUCTIVE_TESTS !== "1" || !process.env.DATABASE_URL)
    return false;
  const url = new URL(process.env.DATABASE_URL);
  return (
    ["postgres:", "postgresql:"].includes(url.protocol) &&
    ["127.0.0.1", "localhost", "::1"].includes(url.hostname) &&
    url.port === expectedPort &&
    url.username === "estateflow_test" &&
    url.pathname === "/estateflow_test"
  );
}
async function sessionFor(prisma, issuer, userId, now) {
  const access = issuer.issue();
  const csrfToken = randomBytes(32).toString("base64url");
  const family = await prisma.sessionFamily.create({
    data: { userId },
    select: { id: true },
  });
  await prisma.accessSession.create({
    data: {
      id: access.id,
      familyId: family.id,
      tokenHash: access.hash,
      csrfHash: issuer.hash(csrfToken),
      issuedAt: now,
      expiresAt: new Date(now.getTime() + 60_000),
    },
  });
  return {
    cookie: `__Host-estateflow_access=${access.serialized}; estateflow_csrf=${csrfToken}`,
    csrfToken,
  };
}
async function get(base, path, session) {
  const headers = {};
  if (session) headers.cookie = session.cookie;
  const response = await fetch(`${base}${path}`, { headers });
  const body = await response.arrayBuffer();
  return {
    status: response.status,
    bytes: new Uint8Array(body),
    text: Buffer.from(body).toString("utf8"),
    contentType: response.headers.get("content-type"),
  };
}
async function postJson(base, path, session, body) {
  const headers = { origin: ORIGIN, "content-type": "application/json" };
  if (session) {
    headers.cookie = session.cookie;
    headers["x-csrf-token"] = session.csrfToken;
  }
  const response = await fetch(`${base}${path}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  const text = await response.text();
  return { status: response.status, body: text ? JSON.parse(text) : null };
}

test(
  "EF-701 guarded cross-tenant media bytes: A reads exact upload, B is denied 403 with byte/key safety",
  { skip: !guardedTarget() },
  async () => {
    const [
      { NestFactory },
      { AppModule },
      { PrismaService },
      { NodeCryptoCredentialIssuer },
      { cleanupDatabase, assertTablesAreEmpty },
      { validJpeg },
    ] = await Promise.all([
      import("@nestjs/core"),
      import("../dist/app.module.js"),
      import("../dist/database/prisma.service.js"),
      import("../dist/features/auth/infrastructure/node-crypto-credential-issuer.js"),
      import("./support/cleanup-database.mjs"),
      import("./support/ef601-media-fixtures.mjs"),
    ]);
    const app = await NestFactory.create(AppModule, { logger: false });
    app.useGlobalPipes(
      new ValidationPipe({
        transform: true,
        whitelist: true,
        forbidNonWhitelisted: true,
      }),
    );
    const prisma = app.get(PrismaService);
    const now = new Date();
    let base;
    try {
      await prisma.$connect();
      await cleanupDatabase(prisma, TABLES);
      const organizationIdA = randomUUID();
      const organizationIdB = randomUUID();
      const ownerAId = randomUUID();
      const ownerBId = randomUUID();
      await prisma.user.createMany({
        data: [ownerAId, ownerBId].map((id) => ({
          id,
          accountIdentifier: `${id}@test.invalid`,
          verifiedAt: now,
        })),
      });
      await prisma.organization.createMany({
        data: [
          { id: organizationIdA, name: "EF-701 Org A" },
          { id: organizationIdB, name: "EF-701 Org B" },
        ],
      });
      await prisma.membership.createMany({
        data: [
          {
            organizationId: organizationIdA,
            userId: ownerAId,
            role: "OWNER",
            status: "ACTIVE",
          },
          {
            organizationId: organizationIdB,
            userId: ownerBId,
            role: "OWNER",
            status: "ACTIVE",
          },
        ],
      });
      const propertyId = randomUUID();
      await prisma.property.create({
        data: {
          id: propertyId,
          organizationId: organizationIdA,
          title: "EF-701 Media HTTP",
          propertyType: "HOUSE",
          addressText: "EF-701 Media HTTP",
          status: "ACTIVE",
        },
      });
      const issuer = new NodeCryptoCredentialIssuer(HASH_KEY);
      const ownerA = await sessionFor(prisma, issuer, ownerAId, now);
      const ownerB = await sessionFor(prisma, issuer, ownerBId, now);
      await app.listen(0, "127.0.0.1");
      base = `http://127.0.0.1:${app.getHttpServer().address().port}`;
      const mediaPath = `/organizations/${organizationIdA}/properties/${propertyId}/media`;
      const bytes = validJpeg(32, 24);

      // Org A creates the upload intent for the synthetic JPEG.
      const intent = await postJson(
        base,
        `${mediaPath}/upload-intents`,
        ownerA,
        {
          kind: "IMAGE",
          contentType: "image/jpeg",
          byteSize: bytes.length,
          fileName: "ef701.jpg",
        },
      );
      assert.equal(intent.status, 201);
      assert.equal(intent.body.contentType, "image/jpeg");
      const { mediaId, storageKey, token } = intent.body;

      // Simulated direct storage PUT with the signed grant (org A session;
      // the storage-sim endpoint is token-authorized but session-gated).
      const putResponse = await fetch(
        `${base}${mediaPath}/storage-objects/${encodeURIComponent(storageKey)}?token=${encodeURIComponent(token)}`,
        {
          method: "PUT",
          headers: { cookie: ownerA.cookie, "content-type": "image/jpeg" },
          body: bytes,
        },
      );
      assert.equal(putResponse.status, 204);

      // Org A confirms the upload through the API boundary.
      const confirmed = await postJson(
        base,
        `${mediaPath}/${mediaId}/confirm`,
        ownerA,
        {
          token,
        },
      );
      assert.equal(confirmed.status, 201);
      assert.equal(confirmed.body.mediaId, mediaId);
      assert.equal(confirmed.body.status, "CONFIRMED");
      assert.equal(confirmed.body.byteSize, bytes.length);

      // Org A reads the exact uploaded bytes back over HTTP.
      const own = await get(base, `${mediaPath}/${mediaId}/bytes`, ownerA);
      assert.equal(own.status, 200);
      assert.equal(own.contentType, "image/jpeg");
      const ownBytes = own.bytes;
      assert.equal(ownBytes.length, bytes.length);
      assert.deepEqual([...ownBytes], [...bytes]);

      // The signed grant is still within its TTL after confirmation, but a
      // replayed PUT must not replace bytes that passed validation.
      const replayBytes = Uint8Array.from(bytes);
      replayBytes[replayBytes.length - 1] ^= 1;
      const replay = await fetch(
        `${base}${mediaPath}/storage-objects/${encodeURIComponent(storageKey)}?token=${encodeURIComponent(token)}`,
        {
          method: "PUT",
          headers: { cookie: ownerA.cookie, "content-type": "image/jpeg" },
          body: replayBytes,
        },
      );
      assert.equal(replay.status, 409);
      const replayError = await replay.text();
      assert.equal(replayError.includes(storageKey), false);
      assert.equal(replayError.includes(token), false);
      const afterReplay = await get(
        base,
        `${mediaPath}/${mediaId}/bytes`,
        ownerA,
      );
      assert.equal(afterReplay.status, 200);
      assert.deepEqual([...afterReplay.bytes], [...bytes]);

      // Org B (unrelated active owner) reads the identical media id of org A:
      // exact 403, JSON error only — no media bytes, no storage key leakage.
      const crossTenant = await get(
        base,
        `${mediaPath}/${mediaId}/bytes`,
        ownerB,
      );
      assert.equal(crossTenant.status, 403);
      assert.ok(crossTenant.contentType?.includes("application/json"));
      assert.equal(crossTenant.text.includes(storageKey), false);
      assert.equal(crossTenant.text.includes("et1_"), false);
      assert.equal(crossTenant.text.includes("ef701.jpg"), false);
      // B's listing of org A media is equally denied; state is untouched.
      const crossList = await get(base, mediaPath, ownerB);
      assert.equal(crossList.status, 403);
      const assetAfter = await prisma.mediaAsset.findUnique({
        where: {
          organizationId_id: { organizationId: organizationIdA, id: mediaId },
        },
      });
      assert.ok(assetAfter);
      assert.equal(assetAfter.status, "CONFIRMED");
      assert.equal(assetAfter.storageKey, storageKey);
      const assetCount = await prisma.mediaAsset.count();
      assert.equal(assetCount, 1);
      const stillReadable = await get(
        base,
        `${mediaPath}/${mediaId}/bytes`,
        ownerA,
      );
      assert.equal(stillReadable.status, 200);
    } finally {
      await app.close();
      await cleanupDatabase(prisma, TABLES);
      await assertTablesAreEmpty(prisma, TABLES);
    }
  },
);
