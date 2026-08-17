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
  "JournalLine",
  "JournalEntry",
  "AccountingPeriod",
  "Account",
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
async function request(base, path, session, body, origin = ORIGIN) {
  const headers = { origin, "content-type": "application/json" };
  if (session)
    Object.assign(headers, {
      cookie: session.cookie,
      "x-csrf-token": session.csrfToken,
    });
  const response = await fetch(`${base}${path}`, {
    method: "POST",
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: response.status, body: await response.json() };
}

test(
  "EF-231 guarded ledger HTTP commands enforce tenant access and serialize money",
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
    const issuer = new NodeCryptoCredentialIssuer(HASH_KEY);
    const now = new Date("2026-08-14T10:00:00.000Z");
    const organizationId = randomUUID();
    const otherOrganizationId = randomUUID();
    const ownerId = randomUUID();
    const managerId = randomUUID();
    const brokerId = randomUUID();
    const otherOwnerId = randomUUID();
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
          { id: organizationId, name: "Ledger HTTP" },
          { id: otherOrganizationId, name: "Other Ledger HTTP" },
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
            userId: otherOwnerId,
            role: "OWNER",
            status: "ACTIVE",
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
      const accountPath = `/organizations/${organizationId}/finance/accounts`;
      assert.equal(
        (
          await request(base, accountPath, null, {
            code: "1000",
            name: "Cash",
            type: "ASSET",
          })
        ).status,
        401,
      );
      const account = await request(base, accountPath, owner, {
        code: "1000",
        name: "Cash",
        type: "ASSET",
      });
      assert.equal(account.status, 201, JSON.stringify(account.body));
      const accountId = account.body.account.id;
      assert.equal(
        (
          await request(base, accountPath, manager, {
            code: "2000",
            name: "Revenue",
            type: "REVENUE",
          })
        ).status,
        201,
      );
      assert.equal(
        (
          await request(base, accountPath, broker, {
            code: "3000",
            name: "Denied",
            type: "ASSET",
          })
        ).status,
        403,
      );
      assert.equal(
        (
          await request(base, accountPath, other, {
            code: "4000",
            name: "Hidden",
            type: "ASSET",
          })
        ).status,
        403,
      );
      assert.equal(
        (
          await request(base, accountPath, owner, {
            code: "1000",
            name: "Duplicate",
            type: "ASSET",
          })
        ).status,
        409,
      );
      assert.equal(
        (
          await request(base, accountPath, owner, {
            code: "bad",
            name: "Bad",
            type: "ASSET",
            extra: true,
          })
        ).status,
        400,
      );
      assert.equal(
        (
          await request(
            base,
            accountPath,
            owner,
            { code: "bad2", name: "Bad", type: "ASSET" },
            "https://evil.test",
          )
        ).status,
        403,
      );
      const period = await request(
        base,
        `/organizations/${organizationId}/finance/accounting-periods`,
        owner,
        {
          startsAt: "2026-08-14T00:00:00.000Z",
          endsAt: "2026-08-15T00:00:00.000Z",
        },
      );
      assert.equal(period.status, 201, JSON.stringify(period.body));
      const periodId = period.body.period.id;
      const draft = await request(
        base,
        `/organizations/${organizationId}/finance/journal-drafts`,
        owner,
        {
          reference: "Sale",
          reason: "Receipt",
          lines: [
            { accountId, side: "DEBIT", amountMinor: "100", currency: "USD" },
            { accountId, side: "CREDIT", amountMinor: "100", currency: "USD" },
          ],
        },
      );
      assert.equal(draft.status, 201, JSON.stringify(draft.body));
      const entryId = draft.body.entry.id;
      assert.equal(
        (
          await request(
            base,
            `/organizations/${organizationId}/finance/journal-entries/${entryId}/post`,
            owner,
            { periodId, postedAt: "2026-08-14T12:00:00.000Z" },
          )
        ).status,
        200,
      );
      const stateError = await request(
        base,
        `/organizations/${organizationId}/finance/journal-entries/${entryId}/post`,
        owner,
        { periodId, postedAt: "2026-08-14T12:00:00.000Z" },
      );
      assert.equal(stateError.status, 400);
      const reversed = await request(
        base,
        `/organizations/${organizationId}/finance/journal-entries/${entryId}/reverse`,
        owner,
        {},
      );
      assert.equal(reversed.status, 201, JSON.stringify(reversed.body));
      const reversalId = reversed.body.entry.id;
      assert.notEqual(reversalId, entryId);
      assert.match(
        reversalId,
        /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
      );
      assert.equal(reversed.body.entry.reversalOfEntryId, entryId);
      assert.equal(reversed.body.entry.status, "DRAFT");
      const lifecycleLines = await prisma.journalLine.findMany({
        where: { entryId: { in: [entryId, reversalId] } },
        orderBy: { id: "asc" },
        select: {
          entryId: true,
          accountId: true,
          side: true,
          amountMinor: true,
          currency: true,
        },
      });
      assert.equal(lifecycleLines.length, 4);
      const sourceLines = lifecycleLines
        .filter((line) => line.entryId === entryId)
        .map(({ accountId, side, amountMinor, currency }) => ({
          accountId,
          side,
          amountMinor: amountMinor.toString(),
          currency,
        }));
      const reversalLines = lifecycleLines
        .filter((line) => line.entryId === reversalId)
        .map(({ accountId, side, amountMinor, currency }) => ({
          accountId,
          side,
          amountMinor: amountMinor.toString(),
          currency,
        }));
      const withoutSide = ({ accountId, amountMinor, currency }) => ({
        accountId,
        amountMinor,
        currency,
      });
      const semanticSort = (left, right) =>
        JSON.stringify(left).localeCompare(JSON.stringify(right));
      assert.deepEqual(sourceLines.map(withoutSide).sort(semanticSort), [
        { accountId, amountMinor: "100", currency: "USD" },
        { accountId, amountMinor: "100", currency: "USD" },
      ]);
      assert.deepEqual(
        reversalLines.map(withoutSide).sort(semanticSort),
        sourceLines.map(withoutSide).sort(semanticSort),
      );
      assert.deepEqual(sourceLines.map(({ side }) => side).sort(), [
        "CREDIT",
        "DEBIT",
      ]);
      assert.deepEqual(reversalLines.map(({ side }) => side).sort(), [
        "CREDIT",
        "DEBIT",
      ]);
      const oppositeSide = { DEBIT: "CREDIT", CREDIT: "DEBIT" };
      assert.deepEqual(
        reversalLines.map(({ side }) => oppositeSide[side]).sort(),
        sourceLines.map(({ side }) => side).sort(),
      );
      const sourceAfterReversal = await prisma.journalEntry.findUniqueOrThrow({
        where: { id: entryId },
        select: { status: true },
      });
      assert.equal(sourceAfterReversal.status, "POSTED");

      await prisma.membership.create({
        data: {
          organizationId,
          userId: otherOwnerId,
          role: "MANAGER",
          status: "ACTIVE",
        },
      });
      const foreignAccount = await request(
        base,
        `/organizations/${otherOrganizationId}/finance/accounts`,
        other,
        { code: "9000", name: "Foreign Cash", type: "ASSET" },
      );
      assert.equal(
        foreignAccount.status,
        201,
        JSON.stringify(foreignAccount.body),
      );
      const foreignAccountId = foreignAccount.body.account.id;
      const foreignPeriod = await request(
        base,
        `/organizations/${otherOrganizationId}/finance/accounting-periods`,
        other,
        {
          startsAt: "2026-08-14T00:00:00.000Z",
          endsAt: "2026-08-15T00:00:00.000Z",
        },
      );
      assert.equal(
        foreignPeriod.status,
        201,
        JSON.stringify(foreignPeriod.body),
      );
      const foreignPeriodId = foreignPeriod.body.period.id;
      const foreignDraft = await request(
        base,
        `/organizations/${otherOrganizationId}/finance/journal-drafts`,
        other,
        {
          reference: "Foreign Sale",
          reason: "Foreign Receipt",
          lines: [
            {
              accountId: foreignAccountId,
              side: "DEBIT",
              amountMinor: "200",
              currency: "USD",
            },
            {
              accountId: foreignAccountId,
              side: "CREDIT",
              amountMinor: "200",
              currency: "USD",
            },
          ],
        },
      );
      assert.equal(foreignDraft.status, 201, JSON.stringify(foreignDraft.body));
      const foreignEntryId = foreignDraft.body.entry.id;
      assert.equal(
        (
          await request(
            base,
            `/organizations/${otherOrganizationId}/finance/journal-entries/${foreignEntryId}/post`,
            other,
            { periodId: foreignPeriodId, postedAt: "2026-08-14T12:00:00.000Z" },
          )
        ).status,
        200,
      );
      const beforeIsolation = await Promise.all([
        prisma.journalEntry.count({}),
        prisma.journalLine.count({}),
      ]);
      const isolated = await request(
        base,
        `/organizations/${organizationId}/finance/journal-entries/${foreignEntryId}/reverse`,
        other,
        {},
      );
      assert.equal(isolated.status, 404, JSON.stringify(isolated.body));
      const disclosed = JSON.stringify(isolated.body);
      for (const secret of [
        foreignEntryId,
        otherOrganizationId,
        organizationId,
        foreignAccountId,
        foreignPeriodId,
        "Foreign Sale",
        "Foreign Receipt",
        "200",
        "USD",
        "DEBIT",
        "CREDIT",
      ])
        assert.equal(disclosed.includes(secret), false, secret);
      assert.deepEqual(
        await Promise.all([
          prisma.journalEntry.count({}),
          prisma.journalLine.count({}),
        ]),
        beforeIsolation,
      );
    } finally {
      await app.close();
      await cleanupDatabase(prisma, TABLES);
      await assertTablesAreEmpty(prisma, TABLES);
      await prisma.$disconnect();
    }
  },
);
