import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import process from "node:process";
import { URL } from "node:url";
import test from "node:test";
import { ValidationPipe } from "@nestjs/common";

const ORIGIN = "https://app.estateflow.test";
const HASH_KEY = "a".repeat(32);
const AUDIT_KEY = "b".repeat(32);
const TABLES = [
  "PaymentRecord",
  "Receivable",
  "Invoice",
  "CommissionAccrualSplit",
  "CommissionAccrual",
  "CommissionableValue",
  "CommissionPlanRecipient",
  "CommissionPlanVersion",
  "DealDomainEvent",
  "Expense",
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
async function get(base, path, session, query = "") {
  const headers = {};
  if (session) headers.cookie = session.cookie;
  const response = await fetch(`${base}${path}${query}`, { headers });
  const text = await response.text();
  if (response.status >= 500)
    console.error("DEBUG", path + query, response.status, text.slice(0, 1200));
  return { status: response.status, body: text ? JSON.parse(text) : null };
}

test(
  "EF-235 owner report HTTP is session-guarded, Owner-only, bigint-safe, and fresh",
  { skip: !guardedTarget() },
  async () => {
    const [
      { NestFactory },
      { AppModule },
      { PrismaService },
      { NodeCryptoCredentialIssuer },
      { cleanupDatabase, assertTablesAreEmpty },
    ] = await Promise.all([
      import("@nestjs/core"),
      import("../dist/app.module.js"),
      import("../dist/database/prisma.service.js"),
      import("../dist/features/auth/infrastructure/node-crypto-credential-issuer.js"),
      import("./support/cleanup-database.mjs"),
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
      const organizationId = randomUUID();
      const ownerId = randomUUID();
      const brokerId = randomUUID();
      await prisma.user.createMany({
        data: [ownerId, brokerId].map((id) => ({
          id,
          accountIdentifier: `${id}@test.invalid`,
          verifiedAt: now,
        })),
      });
      await prisma.organization.create({
        data: { id: organizationId, name: "Report HTTP" },
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
        ],
      });
      const propertyId = randomUUID();
      const leadId = randomUUID();
      const dealId = randomUUID();
      await prisma.property.create({
        data: {
          id: propertyId,
          organizationId,
          title: "Report HTTP",
          propertyType: "HOUSE",
          addressText: "Report HTTP",
          status: "ACTIVE",
        },
      });
      await prisma.$executeRaw`INSERT INTO "Lead" ("id", "organizationId", "ownerId", "stage", "nextAction", "source", "version", "createdAt", "updatedAt") VALUES (${leadId}::uuid, ${organizationId}::uuid, ${ownerId}::uuid, 'QUALIFIED', 'x', 'x', 1, ${now}, ${now})`;
      await prisma.deal.create({
        data: {
          id: dealId,
          organizationId,
          leadId,
          propertyId,
          brokerId: ownerId,
        },
      });
      const invoiceId = randomUUID();
      const receivableId = randomUUID();
      await prisma.invoice.create({
        data: {
          id: invoiceId,
          organizationId,
          dealId,
          amountMinor: 120_000n,
          currency: "USD",
          status: "ISSUED",
          draftCreatedBy: ownerId,
          draftCreatedAt: now,
          issuedBy: ownerId,
          issuedAt: now,
          dueAt: new Date(now.getTime() + 86_400_000),
        },
      });
      await prisma.receivable.create({
        data: {
          id: receivableId,
          organizationId,
          invoiceId,
          dealId,
          originalAmountMinor: 120_000n,
          outstandingMinor: 70_000n,
          currency: "USD",
          status: "PARTIALLY_PAID",
          issuedAt: now,
          dueAt: new Date(now.getTime() + 86_400_000),
        },
      });
      await prisma.paymentRecord.create({
        data: {
          id: randomUUID(),
          organizationId,
          receivableId,
          amountMinor: 50_000n,
          currency: "USD",
          recordedAt: now,
          recordedBy: ownerId,
          commandScope: "RECEIVABLE_PAYMENT_RECORD",
          idempotencyKey: randomUUID(),
          commandPayloadHash: "c".repeat(64),
        },
      });
      await prisma.expense.create({
        data: {
          id: randomUUID(),
          organizationId,
          category: "PROPERTY",
          vendorReference: "vendor",
          amountMinor: 20_000n,
          currency: "USD",
          status: "APPROVED",
          propertyId,
          draftCreatedBy: brokerId,
          draftCreatedAt: now,
          submittedBy: ownerId,
          submittedAt: now,
          decidedBy: ownerId,
          decidedAt: now,
          decision: "APPROVED",
          decisionReason: "BELOW_THRESHOLD_AUTO_APPROVAL",
        },
      });
      const planId = randomUUID();
      const accrualId = randomUUID();
      const eventId = randomUUID();
      const valueId = randomUUID();
      await prisma.commissionPlanVersion.create({
        data: { id: planId, organizationId, version: 1, rateBps: 500 },
      });
      await prisma.commissionPlanRecipient.createMany({
        data: [
          {
            organizationId,
            planVersionId: planId,
            order: 1,
            kind: "BROKER",
            splitBps: 6000,
          },
          {
            organizationId,
            planVersionId: planId,
            order: 2,
            kind: "OFFICE",
            splitBps: 4000,
          },
        ],
      });
      await prisma.dealDomainEvent.create({
        data: {
          id: eventId,
          organizationId,
          dealId,
          type: "DEAL_CLOSED_WON",
          schemaVersion: 1,
          occurredAt: now,
          data: {},
        },
      });
      await prisma.commissionableValue.create({
        data: {
          id: valueId,
          organizationId,
          dealId,
          amountMinor: 2_000_000n,
          currency: "USD",
          capturedBy: ownerId,
          capturedAt: now,
        },
      });
      await prisma.commissionAccrual.create({
        data: {
          id: accrualId,
          organizationId,
          dealId,
          dealClosedWonEventId: eventId,
          commissionableValueId: valueId,
          commissionPlanVersionId: planId,
          totalAmountMinor: 100_000n,
          currency: "USD",
          status: "EXPECTED",
          createdAt: now,
        },
      });
      await prisma.commissionAccrualSplit.createMany({
        data: [
          {
            organizationId,
            accrualId,
            order: 1,
            kind: "BROKER",
            amountMinor: 60_000n,
            currency: "USD",
          },
          {
            organizationId,
            accrualId,
            order: 2,
            kind: "OFFICE",
            amountMinor: 40_000n,
            currency: "USD",
          },
        ],
      });

      const issuer = new NodeCryptoCredentialIssuer(HASH_KEY);
      const owner = await sessionFor(prisma, issuer, ownerId, now);
      const broker = await sessionFor(prisma, issuer, brokerId, now);
      await app.listen(0, "127.0.0.1");
      base = `http://127.0.0.1:${app.getHttpServer().address().port}`;
      const reports = `/organizations/${organizationId}/finance/reports`;

      // Unauthenticated reads are rejected.
      assert.equal((await get(base, `${reports}/cash-flow`, null)).status, 401);
      assert.equal(
        (await get(base, `${reports}/performance`, null)).status,
        401,
      );

      // Owner-only: even a BROKER member is denied (403).
      assert.equal(
        (await get(base, `${reports}/cash-flow`, broker)).status,
        403,
      );
      assert.equal(
        (await get(base, `${reports}/receivables/aging`, broker)).status,
        403,
      );

      // Invalid queries are rejected with 400.
      for (const [path, query] of [
        [`${reports}/payments`, "?limit=0"],
        [`${reports}/payments`, "?limit=101"],
        [`${reports}/payments`, "?dealId=not-a-uuid"],
        [`${reports}/payments`, `?dealId=${dealId}&propertyId=${propertyId}`],
        [`${reports}/payments`, "?from=2026-13-01T00:00:00.000Z"],
        [`${reports}/payments`, "?cursor=!!!"],
        [`${reports}/receivables/aging/items`, "?bucket=LAST_CENTURY"],
        [`${reports}/receivables/aging/items`, ""],
        [`${reports}/commissions/items`, "?status=INHERITED"],
        [`${reports}/commissions/items`, ""],
        [
          `${reports}/cash-flow`,
          "?from=2026-02-01T00:00:00.000Z&to=2026-01-01T00:00:00.000Z",
        ],
      ]) {
        assert.equal(
          (await get(base, path, owner, query)).status,
          400,
          `${path}${query}`,
        );
      }

      // Fresh, bigint-safe payloads for the four summary surfaces.
      const UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
      const cashFlow = await get(base, `${reports}/cash-flow`, owner);
      assert.equal(cashFlow.status, 200);
      assert.deepEqual(Object.keys(cashFlow.body).sort(), [
        "asOf",
        "cashIn",
        "cashOut",
        "netCash",
      ]);
      assert.match(cashFlow.body.asOf, UTC);
      assert.deepEqual(cashFlow.body.cashIn, [
        { currency: "USD", count: 1, amountMinor: "50000" },
      ]);
      assert.deepEqual(cashFlow.body.cashOut, [
        { currency: "USD", count: 1, amountMinor: "20000" },
      ]);
      assert.deepEqual(cashFlow.body.netCash, [
        { currency: "USD", amountMinor: "30000" },
      ]);

      const aging = await get(base, `${reports}/receivables/aging`, owner);
      assert.equal(aging.status, 200);
      assert.deepEqual(Object.keys(aging.body).sort(), ["asOf", "buckets"]);
      assert.match(aging.body.asOf, UTC);
      assert.equal(aging.body.buckets.length, 1);
      assert.equal(aging.body.buckets[0].bucket, "CURRENT");
      assert.equal(aging.body.buckets[0].count, 1);
      assert.equal(aging.body.buckets[0].outstandingMinor, "70000");

      const commissions = await get(base, `${reports}/commissions`, owner);
      assert.equal(commissions.status, 200);
      assert.deepEqual(Object.keys(commissions.body).sort(), [
        "asOf",
        "due",
        "expected",
        "paid",
      ]);
      assert.deepEqual(commissions.body.expected, [
        { currency: "USD", count: 1, amountMinor: "100000" },
      ]);
      assert.deepEqual(commissions.body.due, []);
      assert.deepEqual(commissions.body.paid, []);

      const performance = await get(base, `${reports}/performance`, owner);
      assert.equal(performance.status, 200);
      assert.deepEqual(Object.keys(performance.body).sort(), [
        "asOf",
        "deals",
        "properties",
      ]);
      assert.deepEqual(performance.body.deals, [
        {
          keyId: dealId,
          currency: "USD",
          revenueMinor: "50000",
          costsMinor: "0",
          marginMinor: "50000",
          paymentCount: 1,
          expenseCount: 0,
        },
      ]);
      assert.deepEqual(performance.body.properties, [
        {
          keyId: propertyId,
          currency: "USD",
          revenueMinor: "50000",
          costsMinor: "20000",
          marginMinor: "30000",
          paymentCount: 1,
          expenseCount: 1,
        },
      ]);

      // Drill-downs return the bounded underlying rows behind the figures.
      const payments = await get(
        base,
        `${reports}/payments`,
        owner,
        `?dealId=${dealId}&limit=50`,
      );
      assert.equal(payments.status, 200);
      assert.equal(payments.body.items.length, 1);
      assert.equal(payments.body.items[0].amountMinor, "50000");
      assert.equal(payments.body.items[0].propertyId, propertyId);
      assert.match(payments.body.items[0].recordedAt, UTC);

      const expenses = await get(
        base,
        `${reports}/expenses`,
        owner,
        `?propertyId=${propertyId}`,
      );
      assert.equal(expenses.status, 200);
      assert.equal(expenses.body.items.length, 1);
      assert.equal(expenses.body.items[0].amountMinor, "20000");

      const agingItems = await get(
        base,
        `${reports}/receivables/aging/items`,
        owner,
        "?bucket=CURRENT&limit=1",
      );
      assert.equal(agingItems.status, 200);
      assert.equal(agingItems.body.items.length, 1);
      assert.equal(agingItems.body.items[0].receivableId, receivableId);
      assert.equal(agingItems.body.items[0].bucket, "CURRENT");
      assert.equal(agingItems.body.items[0].outstandingMinor, "70000");

      const commissionItems = await get(
        base,
        `${reports}/commissions/items`,
        owner,
        "?status=EXPECTED",
      );
      assert.equal(commissionItems.status, 200);
      assert.equal(commissionItems.body.items.length, 1);
      assert.equal(commissionItems.body.items[0].accrualId, accrualId);
      assert.deepEqual(commissionItems.body.items[0].splits, [
        { order: 1, kind: "BROKER", amountMinor: "60000" },
        { order: 2, kind: "OFFICE", amountMinor: "40000" },
      ]);

      // Unknown-but-valid dimension ids yield empty, tenant-safe results.
      const foreign = await get(
        base,
        `${reports}/payments`,
        owner,
        `?dealId=${randomUUID()}`,
      );
      assert.equal(foreign.status, 200);
      assert.deepEqual(foreign.body.items, []);

      // Window filters flow through HTTP.
      const future = await get(
        base,
        `${reports}/cash-flow`,
        owner,
        `?from=${new Date(now.getTime() + 3_600_000).toISOString()}`,
      );
      assert.equal(future.status, 200);
      assert.deepEqual(future.body.cashIn, []);
      assert.deepEqual(future.body.cashOut, []);
    } finally {
      await app.close();
      await cleanupDatabase(prisma, TABLES);
      await assertTablesAreEmpty(prisma, TABLES);
    }
  },
);
