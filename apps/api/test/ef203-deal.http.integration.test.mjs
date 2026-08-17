import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import process from "node:process";
import { URL } from "node:url";
import test from "node:test";
import { ValidationPipe } from "@nestjs/common";

const TEST_BROWSER_ORIGIN = "https://app.estateflow.test";
const TEST_HASH_KEY = "a".repeat(32);
const TEST_AUDIT_KEY = "b".repeat(32);
const TEST_TABLES = [
  "DealDomainEvent",
  "Deal",
  "LeadTimelineEvent",
  "LeadIdempotencyRecord",
  "Lead",
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
  const value = process.env.DATABASE_URL;
  if (process.env.ALLOW_DESTRUCTIVE_TESTS !== "1" || !value) return false;
  const parsed = new URL(value);
  return (
    ["postgres:", "postgresql:"].includes(parsed.protocol) &&
    ["127.0.0.1", "localhost", "::1"].includes(parsed.hostname) &&
    parsed.port === "55433" &&
    parsed.username === "estateflow_test" &&
    parsed.pathname === "/estateflow_test"
  );
}

async function seedLead(prisma, { organizationId, leadId, ownerId, now }) {
  return prisma.lead.create({
    data: {
      id: leadId,
      organizationId,
      ownerId,
      nextAction: "Call",
      source: "HTTP",
      stage: "QUALIFIED",
      version: 1,
      createdAt: now,
      updatedAt: now,
    },
  });
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

async function request(
  baseUrl,
  path,
  session,
  body,
  key,
  { includeKey = true } = {},
) {
  const headers = {
    origin: TEST_BROWSER_ORIGIN,
    "content-type": "application/json",
  };
  if (includeKey) headers["idempotency-key"] = key;
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

async function closeCounts(prisma, leadId) {
  return {
    deals: await prisma.deal.count({ where: { leadId } }),
    events: await prisma.dealDomainEvent.count({ where: { deal: { leadId } } }),
    timelines: await prisma.leadTimelineEvent.count({
      where: { leadId, type: { in: ["LEAD_CLOSED_WON", "LEAD_CLOSED_LOST"] } },
    }),
  };
}

test(
  "EF-203 guarded HTTP proves request authorization, idempotency, tenant isolation, and durable outcomes",
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
    app.useGlobalPipes(
      new ValidationPipe({
        transform: true,
        whitelist: true,
        forbidNonWhitelisted: true,
      }),
    );
    const prisma = app.get(PrismaService);
    const issuer = new NodeCryptoCredentialIssuer(TEST_HASH_KEY);
    const now = new Date("2026-08-14T10:00:00.000Z");
    const organizationId = randomUUID();
    const otherOrganizationId = randomUUID();
    const ownerId = randomUUID();
    const otherOwnerId = randomUUID();
    const brokerId = randomUUID();
    const wonLeadId = randomUUID();
    const lostLeadId = randomUUID();
    const foreignLeadId = randomUUID();
    const propertyId = randomUUID();

    let baseUrl;
    try {
      await prisma.$connect();
      await cleanupDatabase(prisma, TEST_TABLES);
      await prisma.user.createMany({
        data: [ownerId, otherOwnerId, brokerId].map((id) => ({
          id,
          accountIdentifier: `${id}@test.invalid`,
          verifiedAt: now,
        })),
      });
      await prisma.organization.createMany({
        data: [
          { id: organizationId, name: "EF-203 HTTP Tenant" },
          { id: otherOrganizationId, name: "EF-203 Other Tenant" },
        ],
      });
      await prisma.membership.createMany({
        data: [
          { organizationId, userId: ownerId, role: "OWNER", status: "ACTIVE" },
          {
            organizationId,
            userId: brokerId,
            role: "BROKER",
            status: "ACTIVE",
          },
          {
            organizationId: otherOrganizationId,
            userId: otherOwnerId,
            role: "OWNER",
            status: "ACTIVE",
          },
        ],
      });
      await prisma.property.create({
        data: {
          id: propertyId,
          organizationId,
          title: "HTTP Property",
          propertyType: "HOUSE",
          addressText: "Private",
          status: "ACTIVE",
        },
      });
      await seedLead(prisma, {
        organizationId,
        leadId: wonLeadId,
        ownerId,
        now,
      });
      await seedLead(prisma, {
        organizationId,
        leadId: lostLeadId,
        ownerId,
        now,
      });
      await seedLead(prisma, {
        organizationId: otherOrganizationId,
        leadId: foreignLeadId,
        ownerId: otherOwnerId,
        now,
      });
      const sessionNow = new Date();
      const owner = await sessionFor(prisma, issuer, ownerId, sessionNow);
      const otherTenant = await sessionFor(
        prisma,
        issuer,
        otherOwnerId,
        sessionNow,
      );
      await app.listen(0, "127.0.0.1");
      baseUrl = `http://127.0.0.1:${app.getHttpServer().address().port}`;

      const wonPath = `/organizations/${organizationId}/leads/${wonLeadId}/close-won`;
      const lostPath = `/organizations/${organizationId}/leads/${lostLeadId}/close-lost`;
      const wonBody = { propertyId, brokerId, expectedVersion: 1 };
      const denied = await request(
        baseUrl,
        wonPath,
        null,
        wonBody,
        "unauthenticated",
      );
      assert.equal(denied.status, 401);
      const created = await request(
        baseUrl,
        wonPath,
        owner,
        wonBody,
        "won-http-key",
      );
      assert.equal(created.status, 201, JSON.stringify(created.body));
      assert.equal(created.body.lead.stage, "CLOSED_WON");
      assert.deepEqual(await closeCounts(prisma, wonLeadId), {
        deals: 1,
        events: 1,
        timelines: 1,
      });
      assert.equal(
        await prisma.deal.count({ where: { leadId: wonLeadId } }),
        1,
      );
      assert.equal(
        await prisma.dealDomainEvent.count({
          where: { deal: { leadId: wonLeadId }, type: "DEAL_CLOSED_WON" },
        }),
        1,
      );

      const replay = await request(
        baseUrl,
        wonPath,
        owner,
        wonBody,
        "won-http-key",
      );
      assert.equal(replay.status, 201);
      assert.deepEqual(await closeCounts(prisma, wonLeadId), {
        deals: 1,
        events: 1,
        timelines: 1,
      });
      const changedVersion = await request(
        baseUrl,
        wonPath,
        owner,
        { ...wonBody, expectedVersion: 2 },
        "won-http-key",
      );
      assert.equal(changedVersion.status, 409);
      assert.deepEqual(await closeCounts(prisma, wonLeadId), {
        deals: 1,
        events: 1,
        timelines: 1,
      });

      const crossTenant = await request(
        baseUrl,
        `/organizations/${organizationId}/leads/${foreignLeadId}/close-won`,
        otherTenant,
        { ...wonBody, propertyId },
        "cross-tenant-key",
      );
      assert.equal(crossTenant.status, 404);
      const crossBody = JSON.stringify(crossTenant.body);
      for (const hidden of [foreignLeadId, propertyId])
        assert.equal(crossBody.includes(hidden), false);

      const lost = await request(
        baseUrl,
        lostPath,
        owner,
        { reason: "  No budget  ", expectedVersion: 1 },
        "lost-http-key",
      );
      assert.equal(lost.status, 200);
      assert.equal(lost.body.lead.stage, "CLOSED_LOST");
      assert.deepEqual(await closeCounts(prisma, lostLeadId), {
        deals: 0,
        events: 0,
        timelines: 1,
      });

      const missingHeader = await request(
        baseUrl,
        lostPath,
        owner,
        { reason: "second", expectedVersion: 2 },
        "ignored",
        { includeKey: false },
      );
      assert.equal(missingHeader.status, 400);
      assert.deepEqual(await closeCounts(prisma, lostLeadId), {
        deals: 0,
        events: 0,
        timelines: 1,
      });
      const malformed = await request(
        baseUrl,
        lostPath,
        owner,
        {
          reason: "mutation must not happen",
          expectedVersion: 2,
          dealId: randomUUID(),
        },
        "malformed-key",
      );
      assert.equal(malformed.status, 400);
      assert.deepEqual(await closeCounts(prisma, lostLeadId), {
        deals: 0,
        events: 0,
        timelines: 1,
      });
    } finally {
      await app.close();
      await cleanupDatabase(prisma, TEST_TABLES);
      await assertTablesAreEmpty(prisma, TEST_TABLES);
      await prisma.$disconnect();
    }
  },
);
