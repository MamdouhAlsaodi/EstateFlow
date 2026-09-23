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
  "LeadTouch",
  "LeadAttributionCorrection",
  "CampaignPerformanceEntry",
  "CampaignBudgetCorrection",
  "CampaignTransition",
  "PaymentRecord",
  "CommissionAccrualSplit",
  "CommissionAccrual",
  "CommissionableValue",
  "CommissionPlanRecipient",
  "CommissionPlanVersion",
  "Receivable",
  "Invoice",
  "DealDomainEvent",
  "ExpenseEvidenceMetadata",
  "ExpenseApprovalPolicy",
  "Expense",
  "Campaign",
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
async function post(base, path, session, body, options = {}) {
  const headers = {
    origin: options.origin ?? ORIGIN,
    "content-type": "application/json",
  };
  if (session) {
    headers.cookie = session.cookie;
    if (options.csrf !== false) headers["x-csrf-token"] = session.csrfToken;
  }
  const response = await fetch(`${base}${path}`, {
    method: "POST",
    headers,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const text = await response.text();
  return { status: response.status, body: text ? JSON.parse(text) : null };
}
async function get(base, path, session) {
  const headers = {};
  if (session) headers.cookie = session.cookie;
  const response = await fetch(`${base}${path}`, { headers });
  const text = await response.text();
  return { status: response.status, body: text ? JSON.parse(text) : null };
}

test(
  "EF-401 attribution: touch append-only, first/last-touch, correction override, campaign reconciliation",
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
    const now = new Date("2026-10-06T09:00:00.000Z");
    let base;
    try {
      await prisma.$connect();
      await cleanupDatabase(prisma, TABLES);
      const organizationId = randomUUID();
      const otherOrganizationId = randomUUID();
      const ownerId = randomUUID();
      const managerId = randomUUID();
      await prisma.user.createMany({
        data: [ownerId, managerId].map((id) => ({
          id,
          accountIdentifier: `${id}@test.invalid`,
          verifiedAt: now,
        })),
      });
      await prisma.organization.createMany({
        data: [
          { id: organizationId, name: "Attribution" },
          { id: otherOrganizationId, name: "Other Attribution" },
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
            organizationId: otherOrganizationId,
            userId: managerId,
            role: "MANAGER",
            status: "ACTIVE",
          },
        ],
      });
      // Property + lead + deal per campaign scenario so payments attribute.
      async function seedLead(title) {
        const leadId = randomUUID();
        const propertyId = randomUUID();
        const dealId = randomUUID();
        await prisma.property.create({
          data: {
            id: propertyId,
            organizationId,
            title,
            propertyType: "HOUSE",
            addressText: title,
            status: "ACTIVE",
          },
        });
        await prisma.$executeRaw`INSERT INTO "Lead" ("id", "organizationId", "ownerId", "stage", "nextAction", "source", "version", "createdAt", "updatedAt") VALUES (${leadId}::uuid, ${organizationId}::uuid, ${managerId}::uuid, 'QUALIFIED', 'x', 'x', 1, ${now}, ${now})`;
        await prisma.deal.create({
          data: {
            id: dealId,
            organizationId,
            leadId,
            propertyId,
            brokerId: managerId,
          },
        });
        return { leadId, propertyId, dealId };
      }
      const firstScenario = await seedLead("First-touch deal");
      const lastScenario = await seedLead("Last-touch deal");
      const organicScenario = await seedLead("Organic deal");

      const issuer = new NodeCryptoCredentialIssuer(HASH_KEY);
      const owner = await sessionFor(prisma, issuer, ownerId, now);
      const manager = await sessionFor(prisma, issuer, managerId, now);
      await app.listen(0, "127.0.0.1");
      base = `http://127.0.0.1:${app.getHttpServer().address().port}`;
      const campaignsPath = `/organizations/${organizationId}/campaigns`;
      async function createCampaign(name) {
        const created = await post(base, campaignsPath, manager, {
          name,
          objective: "attribution scenario",
          channel: "META",
          startsAt: "2026-10-01T00:00:00.000Z",
          endsAt: "2026-10-30T00:00:00.000Z",
          budgetPlannedMinor: "500000",
          currency: "SAR",
          utmCampaign: name,
        });
        assert.equal(created.status, 201);
        return created.body.campaign.id;
      }
      const campaignA = await createCampaign("campaign-a");
      const campaignB = await createCampaign("campaign-b");
      const foreignCampaign = await post(
        base,
        `/organizations/${otherOrganizationId}/campaigns`,
        manager,
        {
          name: "foreign",
          objective: "other org",
          channel: "GOOGLE",
          startsAt: "2026-10-01T00:00:00.000Z",
          endsAt: "2026-10-30T00:00:00.000Z",
          budgetPlannedMinor: "100000",
          currency: "SAR",
        },
      );
      assert.equal(foreignCampaign.status, 201);
      const foreignCampaignId = foreignCampaign.body.campaign.id;

      // Touches: append-only, bound to real campaigns, with UTM detail.
      async function touch(leadId, campaignId, occurredAt, channel = "META") {
        const response = await post(
          base,
          `/organizations/${organizationId}/leads/${leadId}/touches`,
          manager,
          {
            channel,
            ...(campaignId === undefined ? {} : { campaignId }),
            utmSource: campaignId === undefined ? undefined : "meta",
            utmCampaign: campaignId === undefined ? undefined : "tagged",
            occurredAt,
          },
        );
        assert.equal(response.status, 201);
        return response.body.touch;
      }
      const t1 = await touch(
        firstScenario.leadId,
        campaignA,
        "2026-10-02T08:00:00.000Z",
      );
      const t2 = await touch(
        firstScenario.leadId,
        campaignB,
        "2026-10-03T08:00:00.000Z",
      );
      await touch(lastScenario.leadId, campaignA, "2026-10-02T08:00:00.000Z");
      await touch(lastScenario.leadId, campaignB, "2026-10-04T08:00:00.000Z");
      // Organic touches carry no campaign and never attribute.
      await touch(
        organicScenario.leadId,
        undefined,
        "2026-10-02T08:00:00.000Z",
        "WALK_IN",
      );

      // Foreign campaign ids and foreign leads are tenant-safe 404s.
      assert.equal(
        (
          await post(
            base,
            `/organizations/${organizationId}/leads/${firstScenario.leadId}/touches`,
            manager,
            {
              channel: "META",
              campaignId: foreignCampaignId,
              occurredAt: "2026-10-02T08:00:00.000Z",
            },
          )
        ).status,
        404,
      );
      assert.equal(
        (
          await get(
            base,
            `/organizations/${otherOrganizationId}/leads/${firstScenario.leadId}/attribution`,
            manager,
          )
        ).status,
        404,
      );

      // Touch history per lead, newest first.
      const history = await get(
        base,
        `/organizations/${organizationId}/leads/${firstScenario.leadId}/touches`,
        manager,
      );
      assert.equal(history.status, 200);
      assert.equal(history.body.items.length, 2);
      assert.deepEqual(
        history.body.items.map((item) => item.id),
        [t2.id, t1.id],
      );
      // Append-only at the database level.
      await assert.rejects(
        () =>
          prisma.$executeRaw`UPDATE "LeadTouch" SET "campaignId" = NULL WHERE "leadId" = ${firstScenario.leadId}::uuid`,
      );
      await assert.rejects(
        () =>
          prisma.$executeRaw`DELETE FROM "LeadTouch" WHERE "leadId" = ${firstScenario.leadId}::uuid`,
      );

      // First-touch: scenario one attributes to campaign A; last-touch to B.
      const attributionOne = await get(
        base,
        `/organizations/${organizationId}/leads/${firstScenario.leadId}/attribution`,
        manager,
      );
      assert.equal(attributionOne.status, 200);
      assert.equal(attributionOne.body.attribution.firstTouch.id, t1.id);
      assert.equal(attributionOne.body.attribution.lastTouch.id, t2.id);
      assert.equal(attributionOne.body.attribution.firstCampaignId, campaignA);
      assert.equal(attributionOne.body.attribution.lastCampaignId, campaignB);

      // Corrections are append-only with a mandatory reason; latest wins.
      assert.equal(
        (
          await post(
            base,
            `/organizations/${organizationId}/leads/${firstScenario.leadId}/attribution-corrections`,
            manager,
            { reason: "" },
          )
        ).status,
        400,
      );
      const corrected = await post(
        base,
        `/organizations/${organizationId}/leads/${firstScenario.leadId}/attribution-corrections`,
        manager,
        {
          correctedCampaignId: campaignA,
          reason: "UTM tag was misconfigured at capture",
        },
      );
      assert.equal(corrected.status, 201);
      assert.equal(corrected.body.correction.previousCampaignId, campaignB);
      const after = await get(
        base,
        `/organizations/${organizationId}/leads/${firstScenario.leadId}/attribution`,
        manager,
      );
      assert.equal(after.body.attribution.lastCampaignId, campaignA);
      assert.equal(
        after.body.attribution.override.reason,
        "UTM tag was misconfigured at capture",
      );
      await assert.rejects(
        () =>
          prisma.$executeRaw`UPDATE "LeadAttributionCorrection" SET "reason" = 'rewritten' WHERE "leadId" = ${firstScenario.leadId}::uuid`,
      );

      // Money: payments per deal, approved campaign-B expense only.
      async function pay(dealId, amountMinor) {
        const invoiceId = randomUUID();
        const receivableId = randomUUID();
        const paymentId = randomUUID();
        await prisma.invoice.create({
          data: {
            id: invoiceId,
            organizationId,
            dealId,
            amountMinor: BigInt(amountMinor),
            currency: "SAR",
            status: "ISSUED",
            draftCreatedBy: managerId,
            draftCreatedAt: now,
            issuedBy: managerId,
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
            originalAmountMinor: BigInt(amountMinor),
            outstandingMinor: 0n,
            currency: "SAR",
            status: "PAID",
            issuedAt: now,
            dueAt: new Date(now.getTime() + 86_400_000),
          },
        });
        await prisma.paymentRecord.create({
          data: {
            id: paymentId,
            organizationId,
            receivableId,
            amountMinor: BigInt(amountMinor),
            currency: "SAR",
            recordedAt: now,
            recordedBy: managerId,
            commandScope: "RECEIVABLE_PAYMENT_RECORD",
            idempotencyKey: paymentId,
            commandPayloadHash: "a".repeat(64),
          },
        });
      }
      // First-touch deal pays 70000; last-touch deal pays 30000; organic pays 50000.
      await pay(firstScenario.dealId, "70000");
      await pay(lastScenario.dealId, "30000");
      await pay(organicScenario.dealId, "50000");
      const expensePath = `/organizations/${organizationId}/finance/expenses`;
      async function approveExpense(campaignIdRef, amountMinor) {
        const created = await post(base, expensePath, manager, {
          category: "CAMPAIGN",
          vendorReference: "Meta billing",
          amountMinor,
          currency: "SAR",
          campaignId: campaignIdRef,
        });
        assert.equal(created.status, 201);
        const expenseId = created.body.expense.id;
        assert.equal(
          (await post(base, `${expensePath}/${expenseId}/submit`, manager))
            .status,
          200,
        );
        assert.equal(
          (
            await post(base, `${expensePath}/${expenseId}/decision`, owner, {
              decision: "APPROVED",
              reason: "approved spend",
            })
          ).status,
          200,
        );
      }
      await approveExpense(campaignB, "12000");
      await approveExpense(campaignA, "8000");
      // A rejected expense never counts toward the campaign.
      const rejected = await post(base, expensePath, manager, {
        category: "CAMPAIGN",
        vendorReference: "Duplicate invoice",
        amountMinor: "99000",
        currency: "SAR",
        campaignId: campaignA,
      });
      assert.equal(rejected.status, 201);
      await post(
        base,
        `${expensePath}/${rejected.body.expense.id}/submit`,
        manager,
      );
      await post(
        base,
        `${expensePath}/${rejected.body.expense.id}/decision`,
        owner,
        {
          decision: "REJECTED",
          reason: "duplicate invoice",
        },
      );

      // FIRST_TOUCH: A owns both tagged deals (first touch) → revenue 100000,
      const firstReport = await get(
        base,
        `/organizations/${organizationId}/finance/reports/campaigns/performance?model=FIRST_TOUCH`,
        owner,
      );
      assert.equal(firstReport.status, 200);
      assert.equal(firstReport.body.model, "FIRST_TOUCH");
      const firstRows = new Map(
        firstReport.body.campaigns.map((row) => [row.keyId, row]),
      );
      const firstA = firstRows.get(campaignA);
      const firstB = firstRows.get(campaignB);
      assert.equal(firstA.revenueMinor, "100000");
      assert.equal(firstA.paymentCount, 2);
      assert.equal(firstA.costsMinor, "8000");
      assert.equal(firstA.marginMinor, "92000");
      assert.equal(firstB.revenueMinor, "0");
      assert.equal(firstB.paymentCount, 0);
      assert.equal(firstB.costsMinor, "12000");
      assert.equal(firstB.marginMinor, "-12000");
      const totalRevenue = [...firstRows.values()].reduce(
        (sum, row) => sum + BigInt(row.revenueMinor),
        0n,
      );
      assert.equal(totalRevenue, 100000n);

      // LAST_TOUCH: scenario one corrected to A (70000), scenario two last
      // touch B (30000).
      const lastReport = await get(
        base,
        `/organizations/${organizationId}/finance/reports/campaigns/performance?model=LAST_TOUCH`,
        owner,
      );
      const lastRows = new Map(
        lastReport.body.campaigns.map((row) => [row.keyId, row]),
      );
      assert.equal(lastRows.get(campaignA).revenueMinor, "70000");
      assert.equal(lastRows.get(campaignB).revenueMinor, "30000");
      assert.equal(lastRows.get(campaignA).paymentCount, 1);
      assert.equal(lastRows.get(campaignB).paymentCount, 1);
      // The window filters payments but attribution stays anchored to touches.
      const windowed = await get(
        base,
        `/organizations/${organizationId}/finance/reports/campaigns/performance?model=LAST_TOUCH&from=2020-01-01T00:00:00.000Z&to=2020-01-02T00:00:00.000Z`,
        owner,
      );
      assert.deepEqual(windowed.body.campaigns, []);
      // Managers cannot read owner reports; unknown model is rejected.
      assert.equal(
        (
          await get(
            base,
            `/organizations/${organizationId}/finance/reports/campaigns/performance?model=LAST_TOUCH`,
            manager,
          )
        ).status,
        403,
      );
      assert.equal(
        (
          await get(
            base,
            `/organizations/${organizationId}/finance/reports/campaigns/performance?model=LINEAR`,
            owner,
          )
        ).status,
        400,
      );
      // The expenses report exposes the real campaign dimension.
      const expenseReport = await get(
        base,
        `/organizations/${organizationId}/finance/reports/expenses?campaignId=${campaignA}`,
        owner,
      );
      assert.equal(expenseReport.status, 200);
      assert.equal(expenseReport.body.items.length, 1);
      assert.equal(expenseReport.body.items[0].campaignId, campaignA);
      assert.equal(expenseReport.body.items[0].amountMinor, "8000");
    } finally {
      await app.close();
      await cleanupDatabase(prisma, TABLES);
      await assertTablesAreEmpty(prisma, TABLES);
    }
  },
);
