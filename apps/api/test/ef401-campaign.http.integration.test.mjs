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

const campaignBody = {
  name: "Ramadan 2026",
  objective: "Generate qualified seller leads",
  channel: "META",
  startsAt: "2026-10-01T00:00:00.000Z",
  endsAt: "2026-10-30T00:00:00.000Z",
  budgetPlannedMinor: "1000000",
  currency: "SAR",
  utmSource: "meta",
  utmCampaign: "ramadan-2026",
};

test(
  "EF-401 campaign HTTP lifecycle, corrections, expense binding, and append-only invariants",
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
      const otherOrganizationId = randomUUID();
      const ownerId = randomUUID();
      const managerId = randomUUID();
      const brokerId = randomUUID();
      await prisma.user.createMany({
        data: [ownerId, managerId, brokerId].map((id) => ({
          id,
          accountIdentifier: `${id}@test.invalid`,
          verifiedAt: now,
        })),
      });
      await prisma.organization.createMany({
        data: [
          { id: organizationId, name: "Campaign HTTP" },
          { id: otherOrganizationId, name: "Other Campaign HTTP" },
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
            organizationId: otherOrganizationId,
            userId: ownerId,
            role: "OWNER",
            status: "ACTIVE",
          },
        ],
      });
      const issuer = new NodeCryptoCredentialIssuer(HASH_KEY);
      const owner = await sessionFor(prisma, issuer, ownerId, now);
      const manager = await sessionFor(prisma, issuer, managerId, now);
      const broker = await sessionFor(prisma, issuer, brokerId, now);
      await app.listen(0, "127.0.0.1");
      base = `http://127.0.0.1:${app.getHttpServer().address().port}`;
      const campaignsPath = `/organizations/${organizationId}/campaigns`;

      // Transport guards: no session, no CSRF, wrong origin.
      assert.equal(
        (await post(base, campaignsPath, null, campaignBody)).status,
        401,
      );
      assert.equal(
        (await post(base, campaignsPath, owner, campaignBody, { csrf: false }))
          .status,
        403,
      );
      assert.equal(
        (
          await post(base, campaignsPath, owner, campaignBody, {
            origin: "https://evil.test",
          })
        ).status,
        403,
      );
      // Authority matrix: broker denied, manager allowed.
      assert.equal(
        (await post(base, campaignsPath, broker, campaignBody)).status,
        403,
      );
      // Strict DTO: unknown fields rejected.
      assert.equal(
        (
          await post(base, campaignsPath, manager, {
            ...campaignBody,
            platform: "tiktok",
          })
        ).status,
        400,
      );

      const created = await post(base, campaignsPath, manager, campaignBody);
      assert.equal(created.status, 201);
      const campaign = created.body.campaign;
      assert.equal(campaign.status, "DRAFT");
      assert.equal(campaign.budget.amountMinor, "1000000");
      assert.equal(campaign.budget.currency, "SAR");
      assert.equal(campaign.utm.utmSource, "meta");
      const campaignId = campaign.id;

      // A second campaign in the OTHER organization for tenant-safety checks.
      const foreign = await post(
        base,
        `/organizations/${otherOrganizationId}/campaigns`,
        owner,
        campaignBody,
      );
      assert.equal(foreign.status, 201);
      const foreignCampaignId = foreign.body.campaign.id;

      // Cross-tenant reads are opaque 404s even for the same user.
      assert.equal(
        (
          await get(
            base,
            `/organizations/${organizationId}/campaigns/${foreignCampaignId}`,
            owner,
          )
        ).status,
        404,
      );

      // Lifecycle: complete from draft is forbidden; activate then complete.
      assert.equal(
        (
          await post(
            base,
            `${campaignsPath}/${campaignId}/transition`,
            manager,
            {
              toStatus: "COMPLETED",
            },
          )
        ).status,
        409,
      );
      const activated = await post(
        base,
        `${campaignsPath}/${campaignId}/transition`,
        manager,
        { toStatus: "ACTIVE" },
      );
      assert.equal(activated.status, 200);
      assert.equal(activated.body.transition.fromStatus, "DRAFT");
      assert.equal(activated.body.transition.toStatus, "ACTIVE");

      // Broker cannot transition; cancelling without a reason is rejected.
      assert.equal(
        (
          await post(
            base,
            `${campaignsPath}/${campaignId}/transition`,
            broker,
            {
              toStatus: "CANCELLED",
            },
          )
        ).status,
        403,
      );
      assert.equal(
        (
          await post(
            base,
            `${campaignsPath}/${campaignId}/transition`,
            manager,
            {
              toStatus: "CANCELLED",
            },
          )
        ).status,
        400,
      );

      // Budget correction: mandatory reason, append-only record, real delta.
      assert.equal(
        (
          await post(
            base,
            `${campaignsPath}/${campaignId}/budget-corrections`,
            manager,
            { correctedMinor: "1200000" },
          )
        ).status,
        400,
      );
      const corrected = await post(
        base,
        `${campaignsPath}/${campaignId}/budget-corrections`,
        manager,
        { correctedMinor: "1200000", reason: "media plan expanded" },
      );
      assert.equal(corrected.status, 201);
      assert.equal(corrected.body.correction.previousMinor, "1000000");
      assert.equal(corrected.body.correction.correctedMinor, "1200000");

      // The campaign row moved; the audit record exists exactly once.
      const detail = await get(base, `${campaignsPath}/${campaignId}`, manager);
      assert.equal(detail.status, 200);
      assert.equal(detail.body.campaign.budget.amountMinor, "1200000");
      assert.equal(detail.body.budgetCorrections.length, 1);
      assert.equal(detail.body.transitions.length, 1);
      assert.equal(detail.body.transitions[0].toStatus, "ACTIVE");
      // The append-only correction row cannot be mutated or deleted.
      await assert.rejects(
        () =>
          prisma.$executeRaw`UPDATE "CampaignBudgetCorrection" SET "reason" = 'tampered' WHERE "campaignId" = ${campaignId}::uuid`,
      );
      await assert.rejects(
        () =>
          prisma.$executeRaw`DELETE FROM "CampaignBudgetCorrection" WHERE "campaignId" = ${campaignId}::uuid`,
      );

      // Manual performance entry (no ad-platform integrations anywhere).
      const entryBody = {
        occurredAt: "2026-10-05T00:00:00.000Z",
        impressions: 5000,
        clicks: 400,
        leadsCount: 9,
        note: "manual weekly entry",
      };
      assert.equal(
        (
          await post(
            base,
            `${campaignsPath}/${campaignId}/performance-entries`,
            broker,
            entryBody,
          )
        ).status,
        403,
      );
      const entry = await post(
        base,
        `${campaignsPath}/${campaignId}/performance-entries`,
        manager,
        entryBody,
      );
      assert.equal(entry.status, 201);
      assert.equal(entry.body.entry.impressions, 5000);
      const entriesPage = await get(
        base,
        `${campaignsPath}/${campaignId}/performance-entries`,
        manager,
      );
      assert.equal(entriesPage.status, 200);
      assert.equal(entriesPage.body.items.length, 1);
      await assert.rejects(
        () =>
          prisma.$executeRaw`DELETE FROM "CampaignPerformanceEntry" WHERE "campaignId" = ${campaignId}::uuid`,
      );

      // Expense binding: the EF-234 campaign dimension is now a real FK.
      const expenseBody = {
        category: "CAMPAIGN",
        vendorReference: "Meta billing",
        amountMinor: "300000",
        currency: "SAR",
        campaignId,
      };
      const expensePath = `/organizations/${organizationId}/finance/expenses`;
      assert.equal(
        (
          await post(base, expensePath, manager, {
            ...expenseBody,
            campaignId: foreignCampaignId,
          })
        ).status,
        404,
      );
      const expense = await post(base, expensePath, manager, expenseBody);
      assert.equal(expense.status, 201);
      assert.equal(expense.body.expense.dimensions.campaignId, campaignId);
      // Approve it so it counts toward the actual budget.
      assert.equal(
        (
          await post(
            base,
            `${expensePath}/${expense.body.expense.id}/submit`,
            manager,
          )
        ).status,
        200,
      );
      assert.equal(
        (
          await post(
            base,
            `${expensePath}/${expense.body.expense.id}/decision`,
            owner,
            { decision: "APPROVED", reason: "within corrected budget" },
          )
        ).status,
        200,
      );
      const detailAfterSpend = await get(
        base,
        `${campaignsPath}/${campaignId}`,
        manager,
      );
      assert.deepEqual(detailAfterSpend.body.actualByCurrency, [
        { currency: "SAR", count: 1, amountMinor: "300000" },
      ]);
      // Database-enforced composite tenant FK integrity.
      await assert.rejects(
        () =>
          prisma.$executeRaw`INSERT INTO "Expense" ("id", "organizationId", "category", "vendorReference", "amountMinor", "currency", "campaignId", "status", "draftCreatedBy", "draftCreatedAt") VALUES (${randomUUID()}::uuid, ${otherOrganizationId}::uuid, 'CAMPAIGN', 'cross-tenant', 1, 'SAR', ${campaignId}::uuid, 'DRAFT', ${ownerId}::uuid, ${now})`,
      );

      // Broker is denied reads; the list is scoped and typed.
      assert.equal((await get(base, campaignsPath, broker)).status, 403);
      const list = await get(base, campaignsPath, manager);
      assert.equal(list.status, 200);
      assert.equal(list.body.items.length, 1);
      assert.equal(list.body.items[0].budgetActualMinor, "300000");
      assert.equal(list.body.items[0].touchCount, 0);

      // Audit trail is untouched after every read.
      assert.equal(
        (await get(base, `${campaignsPath}/${campaignId}`, manager)).body
          .budgetCorrections.length,
        1,
      );
    } finally {
      await app.close();
      await cleanupDatabase(prisma, TABLES);
      await assertTablesAreEmpty(prisma, TABLES);
    }
  },
);
