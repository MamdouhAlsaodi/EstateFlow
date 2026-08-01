import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import test from "node:test";

const TEST_BROWSER_ORIGIN = "https://app.estateflow.test";
const TEST_HASH_KEY = "a".repeat(32);
const TEST_AUDIT_KEY = "b".repeat(32);
const TEST_TABLES = [
  "Membership",
  "Organization",
  "User",
  "Credential",
  "SessionFamily",
  "AccessSession",
  "RefreshSession",
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

function syntheticUser(role = "NONE") {
  return {
    id: randomUUID(),
    accountIdentifier: `ef121-${randomUUID()}@example.test`,
    verifiedAt: new Date(),
    platformRole: role,
  };
}

test(
  "EF-121 protected HTTP smoke creates an owner, approves a broker, permits active reads, and hides another tenant",
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
    const owner = syntheticUser();
    const broker = syntheticUser();
    const platformAdmin = syntheticUser("PLATFORM_ADMIN");
    const otherTenantUser = syntheticUser();
    const organizationId = randomUUID();
    const otherOrganizationId = randomUUID();

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
          issuedAt: new Date(),
          expiresAt: new Date(Date.now() + 60_000),
        },
      });
      return {
        cookie: `__Host-estateflow_access=${access.serialized}; estateflow_csrf=${csrfToken}`,
        csrfToken,
      };
    }

    async function request(session, path, options = {}) {
      const method = options.method ?? "GET";
      const headers = { cookie: session.cookie, ...options.headers };
      if (method !== "GET") {
        headers.origin = TEST_BROWSER_ORIGIN;
        headers["x-csrf-token"] = session.csrfToken;
        headers["content-type"] = "application/json";
      }
      const response = await fetch(`${baseUrl}${path}`, {
        method,
        headers,
        ...(options.body ? { body: JSON.stringify(options.body) } : {}),
      });
      return { response, body: await response.json() };
    }

    let baseUrl;
    try {
      await prisma.$connect();
      await cleanupDatabase(prisma, TEST_TABLES);
      await prisma.user.createMany({
        data: [owner, broker, platformAdmin, otherTenantUser],
      });
      await prisma.organization.create({
        data: {
          id: otherOrganizationId,
          name: "EF-121 Other Tenant",
          memberships: {
            create: {
              userId: otherTenantUser.id,
              role: "OWNER",
              status: "ACTIVE",
            },
          },
        },
      });

      const [ownerSession, brokerSession, adminSession, otherTenantSession] =
        await Promise.all([
          browserSession(owner.id),
          browserSession(broker.id),
          browserSession(platformAdmin.id),
          browserSession(otherTenantUser.id),
        ]);
      await app.listen(0, "127.0.0.1");
      const { port } = app.getHttpServer().address();
      baseUrl = `http://127.0.0.1:${port}`;

      const created = await request(ownerSession, "/organizations", {
        method: "POST",
        body: { organizationId, name: "EF-121 Synthetic Realty" },
      });
      assert.equal(created.response.status, 201);
      assert.equal(created.body.membership.role, "OWNER");
      assert.equal(created.body.membership.status, "ACTIVE");

      const submitted = await request(
        ownerSession,
        `/organizations/${organizationId}/memberships`,
        {
          method: "POST",
          body: { userId: broker.id, role: "BROKER" },
        },
      );
      assert.equal(submitted.response.status, 201);
      assert.equal(submitted.body.status, "PENDING");

      const approved = await request(
        adminSession,
        `/platform/broker-memberships/${submitted.body.id}/approve`,
        { method: "POST", body: { organizationId } },
      );
      assert.equal(approved.response.status, 201);
      assert.equal(approved.body.status, "ACTIVE");
      assert.equal(approved.body.approvedByUserId, platformAdmin.id);

      const activeRead = await request(
        brokerSession,
        `/organizations/${organizationId}/memberships/me`,
      );
      assert.equal(activeRead.response.status, 200);
      assert.deepEqual(activeRead.body, {
        id: submitted.body.id,
        organizationId,
        userId: broker.id,
        role: "BROKER",
        status: "ACTIVE",
      });

      const crossTenant = await request(
        otherTenantSession,
        `/organizations/${organizationId}`,
      );
      assert.equal(crossTenant.response.status, 404);
      assert.equal(
        JSON.stringify(crossTenant.body).includes(organizationId),
        false,
      );
      assert.equal(
        JSON.stringify(crossTenant.body).includes("Synthetic Realty"),
        false,
      );
    } finally {
      await app.close();
      await cleanupDatabase(prisma, TEST_TABLES);
      await assertTablesAreEmpty(prisma, TEST_TABLES);
    }
  },
);
