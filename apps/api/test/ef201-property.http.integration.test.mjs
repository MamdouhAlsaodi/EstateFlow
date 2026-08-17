import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import process from "node:process";
import { URL } from "node:url";
import test from "node:test";

const TEST_BROWSER_ORIGIN = "https://app.estateflow.test";
const TEST_HASH_KEY = "a".repeat(32);
const TEST_AUDIT_KEY = "b".repeat(32);
const TEST_TABLES = [
  "ImageMetadata",
  "Listing",
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
  ESTATEFLOW_BROWSER_ORIGIN: TEST_BROWSER_ORIGIN,
  ESTATEFLOW_AUTH_HASH_KEY: TEST_HASH_KEY,
  ESTATEFLOW_AUDIT_HASH_KEY: TEST_AUDIT_KEY,
  ESTATEFLOW_AUTH_FAKE_DELIVERY: "true",
});

function hasGuardedTestTarget() {
  const databaseUrl = process.env.DATABASE_URL;
  if (process.env.ALLOW_DESTRUCTIVE_TESTS !== "1" || !databaseUrl) return false;
  const parsed = new URL(databaseUrl);
  return (
    ["postgres:", "postgresql:"].includes(parsed.protocol) &&
    ["127.0.0.1", "localhost", "::1"].includes(parsed.hostname) &&
    parsed.port === "55433" &&
    parsed.username === "estateflow_test" &&
    parsed.pathname === "/estateflow_test"
  );
}

test(
  "EF-201 protected HTTP request denies unauthenticated access and reads authorized image metadata",
  { skip: !hasGuardedTestTarget() },
  async () => {
    const [
      { NestFactory },
      { AppModule },
      { PrismaService },
      credentials,
      cleanup,
    ] = await Promise.all([
      import("@nestjs/core"),
      import("../dist/app.module.js"),
      import("../dist/database/prisma.service.js"),
      import("../dist/features/auth/infrastructure/node-crypto-credential-issuer.js"),
      import("./support/cleanup-database.mjs"),
    ]);
    const { NodeCryptoCredentialIssuer } = credentials;
    const { cleanupDatabase, assertTablesAreEmpty } = cleanup;
    const app = await NestFactory.create(AppModule, { logger: false });
    const prisma = app.get(PrismaService);
    const issuer = new NodeCryptoCredentialIssuer(TEST_HASH_KEY);
    const organizationId = randomUUID();
    const otherOrganizationId = randomUUID();
    const propertyId = randomUUID();
    const listingId = randomUUID();
    const imageId = randomUUID();
    const userId = randomUUID();
    const otherUserId = randomUUID();
    const now = new Date();

    async function browserSession(sessionUserId) {
      const access = issuer.issue();
      const csrfToken = randomBytes(32).toString("base64url");
      const family = await prisma.sessionFamily.create({
        data: { userId: sessionUserId },
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
      return `__Host-estateflow_access=${access.serialized}; estateflow_csrf=${csrfToken}`;
    }

    async function request(path, cookie) {
      const headers = cookie ? { cookie } : {};
      const response = await fetch(`${baseUrl}${path}`, { headers });
      return { status: response.status, body: await response.json() };
    }

    let baseUrl;
    try {
      await prisma.$connect();
      await cleanupDatabase(prisma, TEST_TABLES);
      await prisma.user.createMany({
        data: [
          {
            id: userId,
            accountIdentifier: `${userId}@test.invalid`,
            verifiedAt: now,
          },
          {
            id: otherUserId,
            accountIdentifier: `${otherUserId}@test.invalid`,
            verifiedAt: now,
          },
        ],
      });
      await prisma.organization.create({
        data: {
          id: organizationId,
          name: "EF-201 HTTP Synthetic Realty",
          memberships: { create: { userId, role: "OWNER", status: "ACTIVE" } },
        },
      });
      await prisma.organization.create({
        data: {
          id: otherOrganizationId,
          name: "EF-201 Other Tenant",
          memberships: {
            create: { userId: otherUserId, role: "OWNER", status: "ACTIVE" },
          },
        },
      });
      await prisma.property.create({
        data: {
          id: propertyId,
          organizationId,
          title: "HTTP Villa",
          propertyType: "VILLA",
          addressText: "Test Street",
          version: 1,
          createdAt: now,
          updatedAt: now,
        },
      });
      await prisma.listing.create({
        data: {
          id: listingId,
          organizationId,
          propertyId,
          status: "PUBLISHED",
          version: 1,
          createdAt: now,
          updatedAt: now,
        },
      });
      await prisma.imageMetadata.create({
        data: {
          id: imageId,
          listingId,
          mediaType: "JPEG",
          byteSize: 42,
          position: 0,
          createdAt: now,
          updatedAt: now,
        },
      });
      const ownerCookie = await browserSession(userId);
      const otherTenantCookie = await browserSession(otherUserId);

      await app.listen(0, "127.0.0.1");
      baseUrl = `http://127.0.0.1:${app.getHttpServer().address().port}`;
      const denied = await request(
        `/organizations/${organizationId}/listings/${listingId}/images`,
      );
      assert.equal(denied.status, 401);
      const authorized = await request(
        `/organizations/${organizationId}/listings/${listingId}/images`,
        ownerCookie,
      );
      assert.equal(authorized.status, 200);
      assert.deepEqual(authorized.body, [
        {
          id: imageId,
          listingId,
          mediaType: "JPEG",
          byteSize: 42,
          position: 0,
          createdAt: now.toISOString(),
          updatedAt: now.toISOString(),
        },
      ]);
      const crossTenant = await request(
        `/organizations/${organizationId}/listings/${listingId}/images`,
        otherTenantCookie,
      );
      assert.equal(crossTenant.status, 404);
      assert.equal(JSON.stringify(crossTenant.body).includes(listingId), false);
    } finally {
      await app.close();
      await cleanupDatabase(prisma, TEST_TABLES);
      await assertTablesAreEmpty(prisma, TEST_TABLES);
    }
  },
);
