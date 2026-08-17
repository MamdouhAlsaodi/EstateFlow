import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import process from "node:process";
import { URL } from "node:url";
import test from "node:test";

const TEST_BROWSER_ORIGIN = "https://app.estateflow.test";
const TEST_HASH_KEY = "a".repeat(32);
const TEST_AUDIT_KEY = "b".repeat(32);
const TEST_TABLES = [
  "LeadTimelineEvent",
  "LeadIdempotencyRecord",
  "LeadTask",
  "LeadNote",
  "Lead",
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
  "EF-202 guarded HTTP proves unauthenticated 401, owner opaque-session success, and cross-tenant 404",
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
    const now = new Date();
    const ownerId = randomUUID();
    const otherUserId = randomUUID();
    const organizationId = randomUUID();
    const otherOrganizationId = randomUUID();
    const leadId = randomUUID();
    const otherLeadId = randomUUID();

    async function browserSession(userId) {
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

    async function request(baseUrl, path, session, body, key) {
      const headers = {
        origin: TEST_BROWSER_ORIGIN,
        "content-type": "application/json",
        "idempotency-key": key,
      };
      if (session)
        Object.assign(headers, {
          cookie: session.cookie,
          "x-csrf-token": session.csrfToken,
        });
      const response = await fetch(`${baseUrl}${path}`, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
      });
      return { status: response.status, body: await response.json() };
    }

    let baseUrl;
    try {
      await prisma.$connect();
      await cleanupDatabase(prisma, TEST_TABLES);
      await prisma.user.createMany({
        data: [
          {
            id: ownerId,
            accountIdentifier: `${ownerId}@test.invalid`,
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
          name: "EF-202 HTTP Tenant",
          memberships: {
            create: { userId: ownerId, role: "OWNER", status: "ACTIVE" },
          },
        },
      });
      await prisma.organization.create({
        data: {
          id: otherOrganizationId,
          name: "EF-202 Other Tenant",
          memberships: {
            create: { userId: otherUserId, role: "OWNER", status: "ACTIVE" },
          },
        },
      });
      await prisma.lead.createMany({
        data: [
          {
            id: leadId,
            organizationId,
            ownerId,
            nextAction: "Call",
            source: "HTTP",
            createdAt: now,
            updatedAt: now,
          },
          {
            id: otherLeadId,
            organizationId: otherOrganizationId,
            ownerId: otherUserId,
            nextAction: "Call",
            source: "HTTP",
            createdAt: now,
            updatedAt: now,
          },
        ],
      });
      const owner = await browserSession(ownerId);
      const otherTenant = await browserSession(otherUserId);
      await app.listen(0, "127.0.0.1");
      baseUrl = `http://127.0.0.1:${app.getHttpServer().address().port}`;

      const denied = await request(
        baseUrl,
        `/organizations/${organizationId}/leads/${leadId}/notes`,
        null,
        { body: "unauthenticated" },
        "unauthenticated-key",
      );
      assert.equal(denied.status, 401);
      const created = await request(
        baseUrl,
        `/organizations/${organizationId}/leads/${leadId}/notes`,
        owner,
        { body: "Owner note" },
        "owner-note-key",
      );
      assert.equal(created.status, 201);
      const crossTenant = await request(
        baseUrl,
        `/organizations/${organizationId}/leads/${leadId}/tasks`,
        otherTenant,
        { title: "Hidden task", dueAt: "2026-01-02T03:04:05Z" },
        "cross-tenant-key",
      );
      assert.equal(crossTenant.status, 404);
      assert.equal(JSON.stringify(crossTenant.body).includes(leadId), false);
    } finally {
      await app.close();
      await cleanupDatabase(prisma, TEST_TABLES);
      await assertTablesAreEmpty(prisma, TEST_TABLES);
    }
  },
);
