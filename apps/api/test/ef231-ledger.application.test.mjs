import test from "node:test";
import assert from "node:assert/strict";
import {
  createAccount,
  createAccountingPeriod,
  createJournalDraft,
  createMoney,
  postJournalEntry,
  LedgerStateError,
} from "../dist/features/finance/domain/ledger.js";
import { LedgerApplication } from "../dist/features/finance/application/ledger-application.js";

const now = new Date("2026-08-13T10:00:00.000Z");
const period = createAccountingPeriod({
  id: "period-1",
  organizationId: "org-1",
  startsAt: new Date("2026-08-01T00:00:00.000Z"),
  endsAt: new Date("2026-08-31T23:59:59.999Z"),
});
const account = (id, code, type = "ASSET") =>
  createAccount({ id, organizationId: "org-1", code, name: code, type });
const accounts = [
  account("account-1", "1000"),
  account("account-2", "4000", "REVENUE"),
];
const persistedDraft = (reference = "sale") =>
  createJournalDraft({
    id: "entry-1",
    organizationId: "org-1",
    reference,
    reason: "sale",
    actorId: "user-1",
    createdAt: now,
    lines: [
      { account: accounts[0], side: "DEBIT", money: createMoney(1000n, "USD") },
      {
        account: accounts[1],
        side: "CREDIT",
        money: createMoney(1000n, "USD"),
      },
    ],
  });

function repositoryFake(
  calls,
  foundAccounts = new Map(accounts.map((item) => [item.id, item])),
) {
  return {
    async createAccountingPeriod(input) {
      calls.push(["createAccountingPeriod", input]);
      return { kind: "created", period: input.period };
    },
    async findAccountingPeriod(organizationId, periodId) {
      calls.push(["findAccountingPeriod", organizationId, periodId]);
      return periodId === period.id && organizationId === period.organizationId
        ? period
        : null;
    },
    async findJournalEntry(organizationId, entryId) {
      calls.push(["findJournalEntry", organizationId, entryId]);
      return organizationId === "org-1" && entryId === "entry-1"
        ? persistedDraft()
        : null;
    },
    async findAccount(organizationId, accountId) {
      calls.push(["findAccount", organizationId, accountId]);
      return organizationId === "org-1"
        ? (foundAccounts.get(accountId) ?? null)
        : null;
    },
    async createAccount(input) {
      calls.push(["createAccount", input]);
      return { kind: "created", account: input.account };
    },
    async createDraft(input) {
      calls.push(["createDraft", input]);
      return { kind: "created", entry: input.entry };
    },
    async post(input) {
      calls.push(["post", input]);
      return { kind: "posted", entry: input.entry };
    },
    async createReversal(input) {
      calls.push(["createReversal", input]);
      return { kind: "created", entry: input.entry };
    },
  };
}
function membership(role = "OWNER", status = "ACTIVE") {
  return { organizationId: "org-1", role, status };
}
function app(calls, foundAccounts) {
  return new LedgerApplication(repositoryFake(calls, foundAccounts), {
    async findMembership() {
      return membership();
    },
  });
}
const commandBase = {
  actor: { verified: true },
  userId: "user-1",
  organizationId: "org-1",
};

for (const role of ["OWNER", "MANAGER"])
  test(`${role} can create an account from primitive command fields`, async () => {
    const calls = [];
    const result = await new LedgerApplication(repositoryFake(calls), {
      async findMembership() {
        return membership(role);
      },
    }).createAccount({
      ...commandBase,
      id: "account-new",
      code: "1010",
      name: "Cash",
      type: "ASSET",
      account: {
        id: "forged",
        organizationId: "org-2",
        code: "9999",
        name: "forged",
        type: "EXPENSE",
      },
    });
    assert.equal(result.kind, "created");
    assert.deepEqual(calls.at(-1), [
      "createAccount",
      {
        account: {
          id: "account-new",
          organizationId: "org-1",
          code: "1010",
          name: "Cash",
          type: "ASSET",
        },
      },
    ]);
  });

test("createDraft resolves every account in the command organization before mutation", async () => {
  const calls = [];
  const result = await app(calls).createDraft({
    ...commandBase,
    entryId: "entry-new",
    reference: "sale",
    reason: "sale",
    createdAt: now,
    lines: [
      {
        accountId: accounts[0].id,
        side: "DEBIT",
        amountMinor: 1000n,
        currency: "USD",
      },
      {
        accountId: accounts[1].id,
        side: "CREDIT",
        amountMinor: 1000n,
        currency: "USD",
      },
    ],
    entry: { ...persistedDraft("forged"), organizationId: "org-2" },
  });
  assert.equal(result.kind, "created");
  assert.deepEqual(
    calls
      .filter(([name]) => name === "findAccount")
      .map(([, organizationId, id]) => [organizationId, id]),
    [
      ["org-1", accounts[0].id],
      ["org-1", accounts[1].id],
    ],
  );
  const created = calls.at(-1)[1].entry;
  assert.equal(created.reference, "sale");
  assert.equal(created.lines[0].account, accounts[0]);
  assert.equal(created.lines[1].account, accounts[1]);
});

for (const missingId of ["missing", "foreign"])
  test(`missing or cross-organization account ${missingId} cannot reach draft mutation`, async () => {
    const calls = [];
    const found = new Map([[accounts[0].id, accounts[0]]]);
    const result = await app(calls, found).createDraft({
      ...commandBase,
      entryId: "entry-new",
      reference: "sale",
      reason: "sale",
      createdAt: now,
      lines: [
        {
          accountId: accounts[0].id,
          side: "DEBIT",
          amountMinor: 1000n,
          currency: "USD",
        },
        {
          accountId: missingId,
          side: "CREDIT",
          amountMinor: 1000n,
          currency: "USD",
        },
      ],
    });
    assert.deepEqual(result, { kind: "not-found", resource: "account" });
    assert.equal(
      calls.some(([name]) => name === "createDraft"),
      false,
    );
  });

test("draft with fewer than two lines rejects before account lookup or mutation", async () => {
  const calls = [];
  await assert.rejects(
    () =>
      app(calls).createDraft({
        ...commandBase,
        entryId: "entry-new",
        reference: "sale",
        reason: "sale",
        createdAt: now,
        lines: [
          {
            accountId: accounts[0].id,
            side: "DEBIT",
            amountMinor: 1000n,
            currency: "USD",
          },
        ],
      }),
    /at least two lines/,
  );
  assert.equal(
    calls.some(([name]) => name === "findAccount" || name === "createDraft"),
    false,
  );
});

for (const line of [
  {
    accountId: accounts[0].id,
    side: "INVALID",
    amountMinor: 1000n,
    currency: "USD",
  },
  {
    accountId: accounts[0].id,
    side: "DEBIT",
    amountMinor: 0n,
    currency: "USD",
  },
  {
    accountId: accounts[0].id,
    side: "DEBIT",
    amountMinor: 1000n,
    currency: "",
  },
])
  test("invalid line primitives fail before draft mutation", async () => {
    const calls = [];
    await assert.rejects(() =>
      app(calls).createDraft({
        ...commandBase,
        entryId: "entry-new",
        reference: "sale",
        reason: "sale",
        createdAt: now,
        lines: [
          line,
          {
            accountId: accounts[1].id,
            side: "CREDIT",
            amountMinor: 1000n,
            currency: "USD",
          },
        ],
      }),
    );
    assert.equal(
      calls.some(([name]) => name === "createDraft"),
      false,
    );
  });

test("authorization precedes account lookup and account creation", async () => {
  const calls = [];
  const denied = new LedgerApplication(repositoryFake(calls), {
    async findMembership() {
      return membership("BROKER");
    },
  });
  assert.deepEqual(
    await denied.createAccount({
      ...commandBase,
      id: "new",
      code: "1000",
      name: "Cash",
      type: "ASSET",
    }),
    { kind: "access-denied" },
  );
  assert.deepEqual(
    await denied.createDraft({
      ...commandBase,
      entryId: "new",
      reference: "x",
      reason: "x",
      createdAt: now,
      lines: [],
    }),
    { kind: "access-denied" },
  );
  assert.equal(calls.length, 0);
});

test("application lifecycle guards use typed state errors", async () => {
  const calls = [];
  const posted = postJournalEntry(persistedDraft(), period, now);
  const postedApplication = new LedgerApplication(
    {
      ...repositoryFake(calls),
      async findJournalEntry() {
        return posted;
      },
    },
    {
      async findMembership() {
        return membership();
      },
    },
  );
  await assert.rejects(
    () =>
      postedApplication.post({
        ...commandBase,
        entryId: "entry-1",
        periodId: period.id,
        postedAt: now,
      }),
    LedgerStateError,
  );
  const draftApplication = app(calls);
  await assert.rejects(
    () => draftApplication.reverse({ ...commandBase, entryId: "entry-1" }),
    LedgerStateError,
  );
});

test("reverse generates a schema-valid UUID independent of caller reversal state", async () => {
  const calls = [];
  const posted = postJournalEntry(persistedDraft(), period, now);
  const application = new LedgerApplication(
    {
      ...repositoryFake(calls),
      async findJournalEntry() {
        return posted;
      },
    },
    {
      async findMembership() {
        return membership();
      },
    },
  );
  const result = await application.reverse({
    ...commandBase,
    entryId: posted.id,
    reversalEntry: { id: "caller-owned-id" },
  });
  assert.equal(result.kind, "created");
  const reversal = calls.at(-1)[1].entry;
  assert.match(
    reversal.id,
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
  );
  assert.notEqual(reversal.id, posted.id);
  assert.equal(reversal.reversalOfEntryId, posted.id);
  assert.deepEqual(
    reversal.lines.map(({ account, side, money }) => ({
      account,
      side,
      money,
    })),
    [
      { account: accounts[0], side: "CREDIT", money: posted.lines[0].money },
      { account: accounts[1], side: "DEBIT", money: posted.lines[1].money },
    ],
  );
  assert.equal(reversal.status, "DRAFT");
  assert.deepEqual(posted, postJournalEntry(persistedDraft(), period, now));
});

test("existing persisted entry lookup remains caller-state independent", async () => {
  const calls = [];
  const result = await app(calls).post({
    ...commandBase,
    entryId: "entry-1",
    periodId: period.id,
    postedAt: now,
    entry: { ...persistedDraft("forged") },
  });
  assert.equal(result.kind, "posted");
  assert.equal(calls.at(-1)[1].entry.reference, "sale");
});
