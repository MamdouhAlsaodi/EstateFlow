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
  "ExpenseEvidenceMetadata",
  "ExpenseApprovalPolicy",
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
async function seedPropertyAndDeal(prisma, organizationId, userId, now) {
  const leadId = randomUUID();
  const propertyId = randomUUID();
  const dealId = randomUUID();
  await prisma.property.create({
    data: {
      id: propertyId,
      organizationId,
      title: "Expense HTTP",
      propertyType: "HOUSE",
      addressText: "Expense HTTP",
      status: "ACTIVE",
    },
  });
  await prisma.$executeRaw`INSERT INTO "Lead" ("id", "organizationId", "ownerId", "stage", "nextAction", "source", "version", "createdAt", "updatedAt") VALUES (${leadId}::uuid, ${organizationId}::uuid, ${userId}::uuid, 'QUALIFIED', 'x', 'x', 1, ${now}, ${now})`;
  await prisma.deal.create({
    data: { id: dealId, organizationId, leadId, propertyId, brokerId: userId },
  });
  return { propertyId, dealId };
}

test(
  "EF-234 guarded expense HTTP is auth-safe, tenant-safe, maker-checked, and replay-safe",
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
          { id: organizationId, name: "Expense HTTP" },
          { id: otherOrganizationId, name: "Other Expense HTTP" },
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
          { organizationId, userId: brokerId, role: "BROKER", status: "ACTIVE" },
          {
            organizationId: otherOrganizationId,
            userId: ownerId,
            role: "OWNER",
            status: "ACTIVE",
          },
        ],
      });
      const { propertyId, dealId } = await seedPropertyAndDeal(
        prisma,
        organizationId,
        ownerId,
        now,
      );
      const foreign = await seedPropertyAndDeal(
        prisma,
        otherOrganizationId,
        ownerId,
        now,
      );
      const issuer = new NodeCryptoCredentialIssuer(HASH_KEY);
      const owner = await sessionFor(prisma, issuer, ownerId, now);
      const manager = await sessionFor(prisma, issuer, managerId, now);
      const broker = await sessionFor(prisma, issuer, brokerId, now);
      await app.listen(0, "127.0.0.1");
      base = `http://127.0.0.1:${app.getHttpServer().address().port}`;
      const expensePath = `/organizations/${organizationId}/finance/expenses`;
      const draftBody = {
        category: "CAMPAIGN",
        vendorReference: "Ads agency",
        amountMinor: "250000",
        currency: "SAR",
        campaignReference: "ramadan-2026",
        propertyId,
        dealId,
      };

      assert.equal((await post(base, expensePath, null, draftBody)).status, 401);
      assert.equal(
        (await post(base, expensePath, owner, draftBody, { csrf: false }))
          .status,
        403,
      );
      assert.equal(
        (
          await post(base, expensePath, owner, draftBody, {
            origin: "https://evil.test",
          })
        ).status,
        403,
      );
      assert.equal(
        (await post(base, expensePath, broker, draftBody)).status,
        403,
      );
      assert.equal(
        (
          await post(base, expensePath, manager, {
            ...draftBody,
            extra: true,
          })
        ).status,
        400,
      );

      const created = await post(base, expensePath, manager, draftBody);
      assert.equal(created.status, 201);
      const expense = created.body.expense;
      assert.equal(expense.status, "DRAFT");
      assert.equal(expense.money.amountMinor, "250000");
      assert.equal(expense.money.currency, "SAR");
      assert.deepEqual(expense.dimensions, {
        campaignReference: "ramadan-2026",
        propertyId,
        dealId,
      });

      // Owner holds memberships in both organizations; the org-A-scoped
      // lookup of an org-B property must produce an opaque tenant-safe 404.
      const foreignExpense = await post(
        base,
        expensePath,
        owner,
        {
          category: "OFFICE",
          vendorReference: "Foreign",
          amountMinor: "100",
          currency: "SAR",
          propertyId: foreign.propertyId,
        },
      );
      assert.equal(foreignExpense.status, 404);

      const evidenceId = randomUUID();
      const evidencePath = `${expensePath}/${expense.id}/evidence`;
      const evidenceBody = {
        evidenceId,
        mediaType: "PDF",
        byteSize: 2048,
        note: "Agency invoice",
        attachedAt: "2026-09-21T10:00:00.000Z",
      };
      assert.equal(
        (await post(base, evidencePath, broker, evidenceBody)).status,
        403,
      );
      const attached = await post(base, evidencePath, manager, evidenceBody);
      assert.equal(attached.status, 201);
      assert.equal(attached.body.evidence.mediaType, "PDF");
      const replayedEvidence = await post(
        base,
        evidencePath,
        manager,
        evidenceBody,
      );
      assert.equal(replayedEvidence.status, 200);
      assert.equal(replayedEvidence.body.evidence.id, evidenceId);
      assert.equal(
        (
          await post(base, evidencePath, manager, {
            ...evidenceBody,
            byteSize: 9999,
          })
        ).status,
        409,
      );
      // A fresh evidence id on the still-draft expense is a new attach, not a conflict.
      assert.equal(
        (
          await post(base, evidencePath, manager, {
            evidenceId: randomUUID(),
            mediaType: "PNG",
            byteSize: 10,
            attachedAt: "2026-09-21T10:00:00.000Z",
          })
        ).status,
        201,
      );
      assert.equal(
        (
          await post(
            base,
            `${expensePath}/${randomUUID()}/evidence`,
            manager,
            evidenceBody,
          )
        ).status,
        404,
      );

      const submitPath = `${expensePath}/${expense.id}/submit`;
      assert.equal((await post(base, submitPath, broker)).status, 403);
      const submitted = await post(base, submitPath, manager);
      assert.equal(submitted.status, 200);
      assert.equal(submitted.body.expense.status, "SUBMITTED");
      assert.equal((await post(base, submitPath, owner)).status, 409);

      const decisionPath = `${expensePath}/${expense.id}/decision`;
      const selfDecision = await post(base, decisionPath, manager, {
        decision: "APPROVED",
      });
      assert.equal(selfDecision.status, 409);
      const approved = await post(base, decisionPath, owner, {
        decision: "APPROVED",
        reason: "Receipt verified",
      });
      assert.equal(approved.status, 200);
      assert.equal(approved.body.expense.status, "APPROVED");
      assert.equal(approved.body.expense.decisionReason, "Receipt verified");
      const replayDecision = await post(base, decisionPath, owner, {
        decision: "APPROVED",
        reason: "Receipt verified",
      });
      assert.equal(replayDecision.status, 200);
      assert.equal(
        (await post(base, decisionPath, owner, { decision: "APPROVED" }))
          .status,
        409,
      );
      assert.equal(
        (
          await post(base, decisionPath, manager, {
            decision: "REJECTED",
            reason: "Late",
          })
        ).status,
        409,
      );
      assert.equal(
        (
          await post(base, `${expensePath}/${randomUUID()}/decision`, owner, {
            decision: "APPROVED",
          })
        ).status,
        404,
      );

      const policyPath = `/organizations/${organizationId}/finance/expense-approval-policy`;
      assert.equal(
        (
          await post(base, policyPath, manager, {
            thresholdMinor: "1000",
            currency: "SAR",
          })
        ).status,
        403,
      );
      const policy = await post(base, policyPath, owner, {
        thresholdMinor: "1000000",
        currency: "SAR",
      });
      assert.equal(policy.status, 201);
      assert.equal(policy.body.policy.thresholdMinor, "1000000");
      assert.equal(
        (
          await post(base, policyPath, owner, {
            thresholdMinor: "1000000",
            currency: "SAR",
          })
        ).status,
        200,
      );

      const smallExpense = await post(base, expensePath, owner, {
        category: "OFFICE",
        vendorReference: "Stationery",
        amountMinor: "900",
        currency: "SAR",
      });
      assert.equal(smallExpense.status, 201);
      const autoSubmit = await post(
        base,
        `${expensePath}/${smallExpense.body.expense.id}/submit`,
        owner,
      );
      assert.equal(autoSubmit.status, 200);
      assert.equal(autoSubmit.body.expense.status, "APPROVED");
      assert.equal(
        autoSubmit.body.expense.decisionReason,
        "BELOW_THRESHOLD_AUTO_APPROVAL",
      );

      await cleanupDatabase(prisma, TABLES);
      await assertTablesAreEmpty(prisma, TABLES);
    } finally {
      await app.close();
    }
  },
);
