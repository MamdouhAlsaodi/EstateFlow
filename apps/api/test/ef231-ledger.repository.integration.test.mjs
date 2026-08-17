import assert from "node:assert/strict";
import process from "node:process";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { PrismaClient } from "@prisma/client";
import { PrismaLedgerRepository } from "../dist/features/finance/infrastructure/prisma-ledger.repository.js";
import { LedgerApplication } from "../dist/features/finance/application/ledger-application.js";
import {
  LedgerStateError,
  createAccount,
  createAccountingPeriod,
  createJournalDraft,
  postJournalEntry,
} from "../dist/features/finance/domain/ledger.js";
import { createMoney } from "../dist/features/finance/domain/money.js";
import {
  assertTablesAreEmpty,
  cleanupDatabase,
} from "./support/cleanup-database.mjs";

const TABLES = ["JournalLine", "JournalEntry", "AccountingPeriod", "Account"];
const guarded =
  process.env.ALLOW_DESTRUCTIVE_TESTS === "1" &&
  process.env.DATABASE_URL?.includes("estateflow_test");
const now = new Date("2026-08-14T12:00:00.000Z");

function account(organizationId, code, type = "ASSET") {
  return createAccount({
    id: randomUUID(),
    organizationId,
    code,
    name: `${code} account`,
    type,
  });
}
async function persistAccounts(repository, accounts) {
  for (const account of accounts)
    assert.equal((await repository.createAccount({ account })).kind, "created");
}
function draft(organizationId, accounts, id = randomUUID()) {
  return createJournalDraft({
    id,
    organizationId,
    reference: "EF-231",
    reason: "integration",
    actorId: randomUUID(),
    createdAt: now,
    lines: [
      {
        account: accounts[0],
        side: "DEBIT",
        money: createMoney(12500n, "USD"),
      },
      {
        account: accounts[1],
        side: "CREDIT",
        money: createMoney(12500n, "USD"),
      },
    ],
  });
}

test(
  "EF-231 persists drafts atomically, scopes account codes, posts immutably, reverses, and enforces DB checks",
  { skip: !guarded },
  async () => {
    const prisma = new PrismaClient();
    const repository = new PrismaLedgerRepository(prisma);
    const organizationId = randomUUID();
    const otherOrganizationId = randomUUID();
    const periodId = randomUUID();
    try {
      await prisma.$connect();
      await cleanupDatabase(prisma, TABLES);
      await prisma.organization.createMany({
        data: [
          { id: organizationId, name: "Ledger test" },
          { id: otherOrganizationId, name: "Other ledger test" },
        ],
      });
      const cash = account(organizationId, "1000");
      const revenue = account(organizationId, "4000", "REVENUE");
      const foreignCash = account(otherOrganizationId, "1000");
      await persistAccounts(repository, [cash, revenue]);
      assert.deepEqual(
        await repository.findAccount(organizationId, cash.id),
        cash,
      );
      assert.equal(
        await repository.findAccount(otherOrganizationId, cash.id),
        null,
      );
      const entry = draft(organizationId, [cash, revenue]);
      const created = await repository.createDraft({ entry });
      assert.equal(created.kind, "created");
      assert.equal(
        await prisma.journalLine
          .findFirst({ where: { entryId: entry.id } })
          .then((line) => line.amountMinor),
        12500n,
      );
      assert.deepEqual(
        await repository.findJournalEntry(organizationId, entry.id),
        entry,
      );
      assert.equal(
        await repository.findJournalEntry(otherOrganizationId, entry.id),
        null,
      );
      assert.deepEqual(
        await repository.createAccount({
          account: { ...cash, id: randomUUID() },
        }),
        { kind: "conflict", reason: "account-ownership-code-or-id-conflict" },
      );
      const otherAccounts = [
        foreignCash,
        account(otherOrganizationId, "4000", "REVENUE"),
      ];
      await persistAccounts(repository, otherAccounts);
      const otherEntry = draft(otherOrganizationId, otherAccounts);
      assert.equal(
        (await repository.createDraft({ entry: otherEntry })).kind,
        "created",
      );

      const period = createAccountingPeriod({
        id: periodId,
        organizationId,
        startsAt: new Date("2026-01-01"),
        endsAt: new Date("2026-12-31"),
      });
      assert.deepEqual(await repository.createAccountingPeriod({ period }), {
        kind: "created",
        period,
      });
      assert.deepEqual(
        await prisma.accountingPeriod.findUnique({
          where: { id: periodId },
          select: {
            id: true,
            organizationId: true,
            startsAt: true,
            endsAt: true,
            status: true,
          },
        }),
        {
          id: periodId,
          organizationId,
          startsAt: period.startsAt,
          endsAt: period.endsAt,
          status: "OPEN",
        },
      );
      const isolatedPeriod = createAccountingPeriod({
        id: randomUUID(),
        organizationId: otherOrganizationId,
        startsAt: period.startsAt,
        endsAt: period.endsAt,
      });
      assert.equal(
        (await repository.createAccountingPeriod({ period: isolatedPeriod }))
          .kind,
        "created",
      );
      assert.deepEqual(
        await repository.findAccountingPeriod(organizationId, period.id),
        period,
      );
      assert.deepEqual(
        await repository.findAccountingPeriod(
          otherOrganizationId,
          isolatedPeriod.id,
        ),
        isolatedPeriod,
      );
      assert.equal(
        await repository.findAccountingPeriod(otherOrganizationId, period.id),
        null,
      );
      assert.deepEqual(
        await repository.createAccountingPeriod({
          period: { ...period, id: periodId },
        }),
        { kind: "conflict", reason: "period-ownership-or-id-conflict" },
      );
      assert.deepEqual(
        await repository.createAccountingPeriod({
          period: { ...period, id: randomUUID(), organizationId: randomUUID() },
        }),
        { kind: "conflict", reason: "period-ownership-or-id-conflict" },
      );
      assert.throws(
        () =>
          createAccountingPeriod({
            id: randomUUID(),
            organizationId,
            startsAt: new Date("2026-12-31"),
            endsAt: new Date("2026-01-01"),
          }),
        /range/,
      );
      const forgedBalanceAccounts = [
        account(organizationId, "1050"),
        account(organizationId, "4050", "REVENUE"),
      ];
      await persistAccounts(repository, forgedBalanceAccounts);
      const forgedBalanceEntry = draft(organizationId, forgedBalanceAccounts);
      await repository.createDraft({ entry: forgedBalanceEntry });
      const persistedDebitLine = await prisma.journalLine.findFirstOrThrow({
        where: {
          organizationId,
          entryId: forgedBalanceEntry.id,
          side: "DEBIT",
        },
      });
      await prisma.journalLine.update({
        where: { id: persistedDebitLine.id },
        data: { amountMinor: 10000n },
      });
      const storedDraftBeforePost = await prisma.journalEntry.findUniqueOrThrow(
        { where: { id: forgedBalanceEntry.id } },
      );
      const forgedPostedEntry = postJournalEntry(
        forgedBalanceEntry,
        period,
        now,
      );
      await assert.rejects(
        () => repository.post({ entry: forgedPostedEntry, period }),
        LedgerStateError,
      );
      assert.deepEqual(
        await prisma.journalEntry.findUnique({
          where: { id: forgedBalanceEntry.id },
        }),
        storedDraftBeforePost,
      );

      const postedEntry = postJournalEntry(entry, period, now);
      const posted = await repository.post({ entry: postedEntry, period });
      assert.equal(posted.kind, "posted");
      const persistedPostedEntry = await repository.findJournalEntry(
        organizationId,
        entry.id,
      );
      assert.equal(persistedPostedEntry?.status, "POSTED");
      assert.deepEqual(persistedPostedEntry?.lines, entry.lines);
      const linesBefore = await prisma.journalLine.findMany({
        where: { organizationId, entryId: entry.id },
        orderBy: { id: "asc" },
      });
      await assert.rejects(
        () => repository.post({ entry: postedEntry, period }),
        LedgerStateError,
      );
      const closedAccounts = [
        account(organizationId, "1200"),
        account(organizationId, "4200", "REVENUE"),
      ];
      await persistAccounts(repository, closedAccounts);
      const closedEntry = draft(organizationId, closedAccounts);
      await repository.createDraft({ entry: closedEntry });
      await assert.rejects(
        () =>
          repository.post({
            entry: postJournalEntry(closedEntry, period, now),
            period: { ...period, status: "CLOSED" },
          }),
        /period|closed|invalid/i,
      );
      assert.deepEqual(
        await prisma.journalLine.findMany({
          where: { organizationId, entryId: entry.id },
          orderBy: { id: "asc" },
        }),
        linesBefore,
      );
      await assert.rejects(
        () =>
          repository.post({
            entry: draft(organizationId, [
              account(organizationId, "1100"),
              account(organizationId, "4100", "REVENUE"),
            ]),
            period: {
              id: randomUUID(),
              organizationId: otherOrganizationId,
              startsAt: new Date("2026-01-01"),
              endsAt: new Date("2026-12-31"),
              status: "OPEN",
            },
          }),
        /period|organization|ownership/i,
      );

      assert.ok(persistedPostedEntry?.status === "POSTED");
      const application = new LedgerApplication(repository, {
        async findMembership() {
          return { organizationId, role: "OWNER", status: "ACTIVE" };
        },
      });
      const reversal = await application.reverse({
        actor: { verified: true },
        userId: persistedPostedEntry.actorId,
        organizationId,
        entryId: persistedPostedEntry.id,
      });
      assert.equal(reversal.kind, "created");
      assert.match(
        reversal.entry.id,
        /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
      );
      assert.notEqual(reversal.entry.id, persistedPostedEntry.id);
      assert.equal(reversal.entry.reversalOfEntryId, persistedPostedEntry.id);
      assert.equal(reversal.entry.status, "DRAFT");
      const reversalLines = await prisma.journalLine.findMany({
        where: { entryId: reversal.entry.id },
        orderBy: { id: "asc" },
      });
      assert.equal(
        reversalLines.find((line) => line.accountId === cash.id)?.side,
        "CREDIT",
      );
      assert.equal(
        reversalLines.find((line) => line.accountId === revenue.id)?.side,
        "DEBIT",
      );
      assert.deepEqual(
        await repository.findJournalEntry(organizationId, entry.id),
        persistedPostedEntry,
      );
      assert.equal(
        (await prisma.journalEntry.findUnique({ where: { id: entry.id } }))
          .status,
        "POSTED",
      );

      await assert.rejects(
        () =>
          prisma.$executeRaw`UPDATE "JournalLine" SET "amountMinor" = 0 WHERE "entryId" = CAST(${entry.id} AS uuid)`,
        /amount|check|constraint/i,
      );
      await assert.rejects(
        () =>
          prisma.$executeRaw`UPDATE "JournalLine" SET "amountMinor" = -1 WHERE "entryId" = CAST(${entry.id} AS uuid)`,
        /amount|check|constraint/i,
      );
      await assert.rejects(
        () =>
          prisma.$executeRaw`INSERT INTO "AccountingPeriod" ("id", "organizationId", "startsAt", "endsAt", "status") VALUES (${randomUUID()}::uuid, ${organizationId}::uuid, ${new Date("2026-12-31")}, ${new Date("2026-01-01")}, 'OPEN')`,
        /range|check|constraint/i,
      );
    } finally {
      await cleanupDatabase(prisma, TABLES);
      await assertTablesAreEmpty(prisma, TABLES);
      await prisma.$disconnect();
    }
  },
);
