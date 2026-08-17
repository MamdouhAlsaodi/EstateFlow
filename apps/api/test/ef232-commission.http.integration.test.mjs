import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import process from "node:process";
import { URL } from "node:url";
import test from "node:test";

const ORIGIN = "https://app.estateflow.test";
const HASH_KEY = "a".repeat(32);
const AUDIT_KEY = "b".repeat(32);
const TABLES = [
  "CommissionAccrualSplit",
  "CommissionAccrual",
  "CommissionableValue",
  "CommissionPlanRecipient",
  "CommissionPlanVersion",
  "DealDomainEvent",
  "Deal",
  "Property",
  "Lead",
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
function guardedTarget() {
  if (process.env.ALLOW_DESTRUCTIVE_TESTS !== "1" || !process.env.DATABASE_URL)
    return false;
  const url = new URL(process.env.DATABASE_URL);
  return (
    ["postgres:", "postgresql:"].includes(url.protocol) &&
    ["127.0.0.1", "localhost", "::1"].includes(url.hostname) &&
    url.port === "55433" &&
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
async function request(
  base,
  path,
  session,
  body,
  origin = ORIGIN,
  includeCsrf = true,
) {
  const headers = { origin, "content-type": "application/json" };
  if (session) {
    headers.cookie = session.cookie;
    if (includeCsrf) headers["x-csrf-token"] = session.csrfToken;
  }
  const response = await fetch(`${base}${path}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  return { status: response.status, body: await response.json() };
}

test(
  "EF-232 guarded commission HTTP is tenant-safe and replay-safe",
  { skip: !guardedTarget() },
  async () => {
    const [
      { NestFactory },
      { AppModule },
      { PrismaService },
      { NodeCryptoCredentialIssuer },
      cleanup,
    ] = await Promise.all([
      import("@nestjs/core"),
      import("../dist/app.module.js"),
      import("../dist/database/prisma.service.js"),
      import("../dist/features/auth/infrastructure/node-crypto-credential-issuer.js"),
      import("./support/cleanup-database.mjs"),
    ]);
    const { cleanupDatabase, assertTablesAreEmpty } = cleanup;
    const app = await NestFactory.create(AppModule, { logger: false });
    app.useGlobalPipes(
      new (await import("@nestjs/common")).ValidationPipe({
        transform: true,
        whitelist: true,
        forbidNonWhitelisted: true,
      }),
    );
    const prisma = app.get(PrismaService);
    const issuer = new NodeCryptoCredentialIssuer(HASH_KEY);
    const now = new Date("2026-08-14T10:00:00.000Z");
    const organizationId = randomUUID();
    const otherOrganizationId = randomUUID();
    const ownerId = randomUUID();
    const managerId = randomUUID();
    const brokerId = randomUUID();
    const otherOwnerId = randomUUID();
    const dealId = randomUUID();
    const managerDealId = randomUUID();
    const otherDealId = randomUUID();
    const leadId = randomUUID();
    const managerLeadId = randomUUID();
    const otherLeadId = randomUUID();
    const propertyId = randomUUID();
    const managerPropertyId = randomUUID();
    const otherPropertyId = randomUUID();
    const eventId = randomUUID();
    const managerEventId = randomUUID();
    const otherEventId = randomUUID();
    let base;
    try {
      await prisma.$connect();
      await cleanupDatabase(prisma, TABLES);
      await prisma.user.createMany({
        data: [ownerId, managerId, brokerId, otherOwnerId].map((id) => ({
          id,
          accountIdentifier: `${id}@test.invalid`,
          verifiedAt: now,
        })),
      });
      await prisma.organization.createMany({
        data: [
          { id: organizationId, name: "Commission HTTP" },
          { id: otherOrganizationId, name: "Other Commission HTTP" },
        ],
      });
      await prisma.membership.createMany({
        data: [
          { organizationId, userId: ownerId, role: "OWNER", status: "ACTIVE" },
          {
            organizationId,
            userId: managerId,
            role: "MANAGER",
            status: "ACTIVE",
          },
          {
            organizationId,
            userId: brokerId,
            role: "BROKER",
            status: "ACTIVE",
          },
          {
            organizationId,
            userId: otherOwnerId,
            role: "MANAGER",
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
      await prisma.property.createMany({
        data: [
          {
            id: propertyId,
            organizationId,
            title: "Test",
            propertyType: "HOUSE",
            addressText: "Test",
            status: "ACTIVE",
          },
          {
            id: otherPropertyId,
            organizationId: otherOrganizationId,
            title: "Other",
            propertyType: "HOUSE",
            addressText: "Other",
            status: "ACTIVE",
          },
        ],
      });
      await prisma.$executeRaw`INSERT INTO "Lead" ("id", "organizationId", "ownerId", "stage", "nextAction", "source", "version", "createdAt", "updatedAt") VALUES (${leadId}::uuid, ${organizationId}::uuid, ${ownerId}::uuid, 'QUALIFIED', 'x', 'x', 1, ${now}, ${now}), (${managerLeadId}::uuid, ${organizationId}::uuid, ${managerId}::uuid, 'QUALIFIED', 'x', 'x', 1, ${now}, ${now}), (${otherLeadId}::uuid, ${otherOrganizationId}::uuid, ${otherOwnerId}::uuid, 'QUALIFIED', 'x', 'x', 1, ${now}, ${now})`;
      await prisma.property.create({
        data: {
          id: managerPropertyId,
          organizationId,
          title: "Manager Test",
          propertyType: "HOUSE",
          addressText: "Manager Test",
          status: "ACTIVE",
        },
      });
      await prisma.deal.createMany({
        data: [
          { id: dealId, organizationId, leadId, propertyId, brokerId: ownerId },
          {
            id: managerDealId,
            organizationId,
            leadId: managerLeadId,
            propertyId: managerPropertyId,
            brokerId: managerId,
          },
          {
            id: otherDealId,
            organizationId: otherOrganizationId,
            leadId: otherLeadId,
            propertyId: otherPropertyId,
            brokerId: otherOwnerId,
          },
        ],
      });
      await prisma.dealDomainEvent.createMany({
        data: [
          {
            id: eventId,
            organizationId,
            dealId,
            type: "DEAL_CLOSED_WON",
            schemaVersion: 1,
            occurredAt: now,
            data: {},
          },
          {
            id: managerEventId,
            organizationId,
            dealId: managerDealId,
            type: "DEAL_CLOSED_WON",
            schemaVersion: 1,
            occurredAt: now,
            data: {},
          },
          {
            id: otherEventId,
            organizationId: otherOrganizationId,
            dealId: otherDealId,
            type: "DEAL_CLOSED_WON",
            schemaVersion: 1,
            occurredAt: now,
            data: {},
          },
        ],
      });
      const sessionNow = new Date();
      const owner = await sessionFor(prisma, issuer, ownerId, sessionNow);
      const manager = await sessionFor(prisma, issuer, managerId, sessionNow);
      const broker = await sessionFor(prisma, issuer, brokerId, sessionNow);
      const other = await sessionFor(prisma, issuer, otherOwnerId, sessionNow);
      await app.listen(0, "127.0.0.1");
      base = `http://127.0.0.1:${app.getHttpServer().address().port}`;
      const planPath = `/organizations/${organizationId}/finance/commission-plan-versions`;
      const valuePath = `/organizations/${organizationId}/finance/deals/${dealId}/commissionable-values`;
      const accrualPath = `/organizations/${organizationId}/finance/deals/${dealId}/expected-commissions`;
      assert.equal(
        (await request(base, planPath, null, { version: 1 })).status,
        401,
      );
      const beforeMissingCsrf = await prisma.commissionPlanVersion.count();
      assert.equal(
        (await request(base, planPath, manager, { version: 1 }, ORIGIN, false))
          .status,
        403,
      );
      assert.equal(
        await prisma.commissionPlanVersion.count(),
        beforeMissingCsrf,
      );
      assert.equal(
        (await request(base, planPath, broker, { version: 1 })).status,
        403,
      );
      assert.equal(
        (
          await request(
            base,
            planPath,
            owner,
            { version: 1 },
            "https://evil.test",
          )
        ).status,
        403,
      );
      const ownerPlan = await request(base, planPath, owner, { version: 1 });
      assert.equal(ownerPlan.status, 201, JSON.stringify(ownerPlan.body));
      const ownerPlanId = ownerPlan.body.plan.id;
      const plan = await request(base, planPath, manager, { version: 2 });
      assert.equal(plan.status, 201, JSON.stringify(plan.body));
      const managerPlanId = plan.body.plan.id;
      const value = await request(base, valuePath, owner, {
        valueId: randomUUID(),
        amountMinor: "10000",
        currency: "USD",
        capturedAt: now.toISOString(),
      });
      assert.equal(value.status, 201, JSON.stringify(value.body));
      assert.equal(typeof value.body.value.money.amountMinor, "string");
      assert.equal(
        (
          await request(base, valuePath, owner, {
            ...{
              valueId: value.body.value.id,
              amountMinor: "10000",
              currency: "USD",
              capturedAt: now.toISOString(),
            },
          })
        ).status,
        409,
      );
      const accrualId = randomUUID();
      const accrualBody = {
        accrualId,
        commissionableValueId: value.body.value.id,
        commissionPlanVersionId: ownerPlanId,
        dealClosedWonEventId: eventId,
      };
      const created = await request(base, accrualPath, owner, accrualBody);
      assert.equal(created.status, 201, JSON.stringify(created.body));
      assert.equal(
        typeof created.body.accrual.totalMoney.amountMinor,
        "string",
      );
      const replay = await request(base, accrualPath, owner, accrualBody);
      assert.equal(replay.status, 200, JSON.stringify(replay.body));
      const managerValuePath = `/organizations/${organizationId}/finance/deals/${managerDealId}/commissionable-values`;
      const managerAccrualPath = `/organizations/${organizationId}/finance/deals/${managerDealId}/expected-commissions`;
      const managerValueBody = {
        valueId: randomUUID(),
        amountMinor: "12500",
        currency: "USD",
        capturedAt: now.toISOString(),
      };
      const managerValue = await request(
        base,
        managerValuePath,
        manager,
        managerValueBody,
      );
      assert.equal(managerValue.status, 201, JSON.stringify(managerValue.body));
      assert.equal(typeof managerValue.body.value.money.amountMinor, "string");
      const managerAccrualBody = {
        accrualId: randomUUID(),
        commissionableValueId: managerValue.body.value.id,
        commissionPlanVersionId: managerPlanId,
        dealClosedWonEventId: managerEventId,
      };
      const managerCreated = await request(
        base,
        managerAccrualPath,
        manager,
        managerAccrualBody,
      );
      assert.equal(
        managerCreated.status,
        201,
        JSON.stringify(managerCreated.body),
      );
      assert.equal(
        typeof managerCreated.body.accrual.totalMoney.amountMinor,
        "string",
      );
      const managerReplay = await request(
        base,
        managerAccrualPath,
        manager,
        managerAccrualBody,
      );
      assert.equal(
        managerReplay.status,
        200,
        JSON.stringify(managerReplay.body),
      );
      assert.equal(
        await prisma.commissionAccrual.count({
          where: { dealId: managerDealId },
        }),
        1,
      );
      assert.equal(
        await prisma.commissionAccrualSplit.count({
          where: { accrual: { dealId: managerDealId } },
        }),
        2,
      );
      const before = await Promise.all([
        prisma.commissionAccrual.count(),
        prisma.commissionAccrualSplit.count(),
        prisma.commissionableValue.count(),
      ]);
      const foreign = await request(base, accrualPath, other, {
        ...accrualBody,
        accrualId: randomUUID(),
        commissionableValueId: value.body.value.id,
        commissionPlanVersionId: ownerPlanId,
        dealClosedWonEventId: otherEventId,
      });
      assert.equal(foreign.status, 404);
      assert.deepEqual(
        await Promise.all([
          prisma.commissionAccrual.count(),
          prisma.commissionAccrualSplit.count(),
          prisma.commissionableValue.count(),
        ]),
        before,
      );
    } finally {
      await app.close();
      await cleanupDatabase(prisma, TABLES);
      await assertTablesAreEmpty(prisma, TABLES);
      await prisma.$disconnect();
    }
  },
);
