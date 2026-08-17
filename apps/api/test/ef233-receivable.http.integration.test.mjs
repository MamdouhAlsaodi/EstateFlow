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
async function get(base, path, session, options = {}) {
  const headers = {};
  if (session) {
    headers.cookie = session.cookie;
    if (options.csrf !== false) headers["x-csrf-token"] = session.csrfToken;
  }
  const response = await fetch(`${base}${path}`, { method: "GET", headers });
  return { status: response.status, body: await response.json() };
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
  if (options.idempotencyKey !== undefined)
    headers["idempotency-key"] = options.idempotencyKey;
  const response = await fetch(`${base}${path}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  return { status: response.status, body: await response.json() };
}
async function seedDeal(prisma, organizationId, userId, now, label) {
  const leadId = randomUUID();
  const propertyId = randomUUID();
  const dealId = randomUUID();
  await prisma.property.create({
    data: {
      id: propertyId,
      organizationId,
      title: label,
      propertyType: "HOUSE",
      addressText: label,
      status: "ACTIVE",
    },
  });
  await prisma.$executeRaw`INSERT INTO "Lead" ("id", "organizationId", "ownerId", "stage", "nextAction", "source", "version", "createdAt", "updatedAt") VALUES (${leadId}::uuid, ${organizationId}::uuid, ${userId}::uuid, 'QUALIFIED', 'x', 'x', 1, ${now}, ${now})`;
  await prisma.deal.create({
    data: { id: dealId, organizationId, leadId, propertyId, brokerId: userId },
  });
  return dealId;
}

test(
  "EF-233 guarded receivable HTTP is auth-safe, tenant-safe, and replay-safe",
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
      const dualTenantId = randomUUID();
      await prisma.user.createMany({
        data: [ownerId, managerId, brokerId, dualTenantId].map((id) => ({
          id,
          accountIdentifier: `${id}@test.invalid`,
          verifiedAt: now,
        })),
      });
      await prisma.organization.createMany({
        data: [
          { id: organizationId, name: "Receivable HTTP" },
          { id: otherOrganizationId, name: "Other Receivable HTTP" },
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
            userId: dualTenantId,
            role: "MANAGER",
            status: "ACTIVE",
          },
          {
            organizationId: otherOrganizationId,
            userId: dualTenantId,
            role: "OWNER",
            status: "ACTIVE",
          },
        ],
      });
      const dealId = await seedDeal(
        prisma,
        organizationId,
        ownerId,
        now,
        "Main",
      );
      const managerDealId = await seedDeal(
        prisma,
        organizationId,
        managerId,
        now,
        "Manager",
      );
      const otherDealId = await seedDeal(
        prisma,
        otherOrganizationId,
        dualTenantId,
        now,
        "Foreign",
      );
      const issuer = new NodeCryptoCredentialIssuer(HASH_KEY);
      const owner = await sessionFor(prisma, issuer, ownerId, now);
      const manager = await sessionFor(prisma, issuer, managerId, now);
      const broker = await sessionFor(prisma, issuer, brokerId, now);
      const dual = await sessionFor(prisma, issuer, dualTenantId, now);
      await app.listen(0, "127.0.0.1");
      base = `http://127.0.0.1:${app.getHttpServer().address().port}`;
      const draftPath = `/organizations/${organizationId}/finance/deals/${dealId}/invoices`;
      const draftBody = { amountMinor: "100", currency: "USD" };
      assert.equal((await post(base, draftPath, null, draftBody)).status, 401);
      assert.equal(
        (await post(base, draftPath, owner, draftBody, { csrf: false })).status,
        403,
      );
      assert.equal(
        (
          await post(base, draftPath, owner, draftBody, {
            origin: "https://evil.test",
          })
        ).status,
        403,
      );
      assert.equal(
        (await post(base, draftPath, broker, draftBody)).status,
        403,
      );
      assert.equal(
        (
          await post(
            base,
            `/organizations/${organizationId}/finance/deals/${otherDealId}/invoices`,
            dual,
            draftBody,
          )
        ).status,
        404,
      );
      assert.equal(
        (
          await post(
            base,
            `/organizations/${organizationId}/finance/deals/${managerDealId}/invoices`,
            manager,
            draftBody,
          )
        ).status,
        201,
      );
      const draft = await post(base, draftPath, owner, draftBody);
      assert.equal(draft.status, 201, JSON.stringify(draft.body));
      assert.equal(draft.body.invoice.money.amountMinor, "100");
      const receivableId = randomUUID();
      const issuePath = `/organizations/${organizationId}/finance/invoices/${draft.body.invoice.id}/issue`;
      const issueBody = {
        receivableId,
        issuedAt: now.toISOString(),
        dueAt: new Date(now.getTime() + 86_400_000).toISOString(),
      };
      const issued = await post(base, issuePath, owner, issueBody);
      assert.equal(issued.status, 201, JSON.stringify(issued.body));
      assert.equal(issued.body.receivable.outstandingMinor, "100");
      assert.equal(issued.body.invoice.issuedAt, issueBody.issuedAt);
      assert.equal(issued.body.receivable.dueAt, issueBody.dueAt);
      assert.equal((await post(base, issuePath, owner, issueBody)).status, 200);

      const cancellationDraft = await post(base, draftPath, owner, {
        amountMinor: "101",
        currency: "USD",
      });
      const cancellationInvoiceId = cancellationDraft.body.invoice.id;
      const cancellationReceivableId = randomUUID();
      const cancellationIssuePath = `/organizations/${organizationId}/finance/invoices/${cancellationInvoiceId}/issue`;
      const cancellationIssue = await post(base, cancellationIssuePath, owner, {
        receivableId: cancellationReceivableId,
        issuedAt: now.toISOString(),
        dueAt: new Date(now.getTime() + 86_400_000).toISOString(),
      });
      assert.equal(cancellationIssue.status, 201);
      const cancelPath = `/organizations/${organizationId}/finance/invoices/${cancellationInvoiceId}/cancel`;
      const cancelBody = { reason: " customer request " };
      const cancelled = await post(base, cancelPath, owner, cancelBody);
      assert.equal(cancelled.status, 200, JSON.stringify(cancelled.body));
      assert.equal(
        (await post(base, cancelPath, owner, cancelBody)).status,
        200,
      );
      assert.equal(
        (await post(base, cancelPath, broker, cancelBody)).status,
        403,
      );
      assert.equal(
        (
          await post(
            base,
            `/organizations/${otherOrganizationId}/finance/invoices/${cancellationInvoiceId}/cancel`,
            dual,
            cancelBody,
          )
        ).status,
        404,
      );
      assert.equal(
        (
          await post(
            base,
            `/organizations/${organizationId}/finance/invoices/${randomUUID()}/cancel`,
            owner,
            cancelBody,
          )
        ).status,
        404,
      );

      const agingDraft = await post(base, draftPath, owner, {
        amountMinor: "200",
        currency: "USD",
      });
      const agingInvoiceId = agingDraft.body.invoice.id;
      const agingReceivableId = randomUUID();
      const agingIssuePath = `/organizations/${organizationId}/finance/invoices/${agingInvoiceId}/issue`;
      const agingDueAt = new Date(now.getTime() - 86_400_000);
      const agingIssue = await post(base, agingIssuePath, owner, {
        receivableId: agingReceivableId,
        issuedAt: new Date(now.getTime() - 2 * 86_400_000).toISOString(),
        dueAt: agingDueAt.toISOString(),
      });
      assert.equal(agingIssue.status, 201, JSON.stringify(agingIssue.body));
      const agingPath = `/organizations/${organizationId}/finance/receivables/aging?limit=1`;
      const aging = await get(base, agingPath, owner, { csrf: false });
      assert.equal(aging.status, 200, JSON.stringify(aging.body));
      assert.equal(aging.body.items[0].receivableId, agingReceivableId);
      assert.equal(aging.body.items[0].originalAmountMinor, "200");
      assert.equal(aging.body.items[0].dueAt, agingDueAt.toISOString());
      assert.equal((await get(base, agingPath, broker)).status, 403);
      assert.equal(
        (await get(base, `${agingPath}&cursor=bad!`, owner)).status,
        400,
      );
      assert.equal(
        (await get(base, `${agingPath}&limit=01`, owner)).status,
        400,
      );

      const paymentPath = `/organizations/${organizationId}/finance/receivables/${receivableId}/payments`;
      const paymentBody = {
        amountMinor: "30",
        currency: "USD",
        recordedAt: now.toISOString(),
      };
      assert.equal(
        (await post(base, paymentPath, owner, paymentBody)).status,
        400,
      );
      const paid = await post(base, paymentPath, owner, paymentBody, {
        idempotencyKey: " payment-1 ",
      });
      assert.equal(paid.status, 201, JSON.stringify(paid.body));
      assert.equal(paid.body.payment.money.amountMinor, "30");
      assert.equal(paid.body.receivable.outstandingMinor, "70");
      assert.equal(
        (
          await post(base, paymentPath, owner, paymentBody, {
            idempotencyKey: "payment-1",
          })
        ).status,
        200,
      );
      assert.equal(
        (
          await post(
            base,
            paymentPath,
            owner,
            { ...paymentBody, amountMinor: "31" },
            { idempotencyKey: "payment-1" },
          )
        ).status,
        409,
      );
      assert.equal(
        (
          await post(
            base,
            paymentPath,
            owner,
            { ...paymentBody, amountMinor: "71" },
            { idempotencyKey: "payment-2" },
          )
        ).status,
        400,
      );
      assert.equal(
        await prisma.paymentRecord.count({ where: { receivableId } }),
        1,
      );
      assert.equal(
        (
          await prisma.receivable.findUniqueOrThrow({
            where: { id: receivableId },
          })
        ).outstandingMinor,
        70n,
      );
    } finally {
      await app.close();
      await cleanupDatabase(prisma, TABLES);
      await assertTablesAreEmpty(prisma, TABLES);
      await prisma.$disconnect();
    }
  },
);
