import test from "node:test";
import assert from "node:assert/strict";
import {
  MoneyValidationError,
  LedgerValidationError,
  LedgerStateError,
  createMoney,
  createAccount,
  createAccountingPeriod,
  createJournalDraft,
  postJournalEntry,
  reversePostedEntry,
} from "../dist/features/finance/domain/ledger.js";

const now = new Date("2026-08-13T10:00:00.000Z");
const period = {
  id: "period-1",
  organizationId: "org-1",
  startsAt: new Date("2026-08-01T00:00:00.000Z"),
  endsAt: new Date("2026-08-31T23:59:59.999Z"),
  status: "OPEN",
};
const debit = createAccount({
  id: "account-1",
  organizationId: "org-1",
  code: "1000",
  name: "Cash",
  type: "ASSET",
});
const credit = createAccount({
  id: "account-2",
  organizationId: "org-1",
  code: "4000",
  name: "Revenue",
  type: "REVENUE",
});
const amount = createMoney(1000n, "USD");
const balancedLines = [
  { account: debit, side: "DEBIT", money: amount },
  { account: credit, side: "CREDIT", money: amount },
];

test("Money rejects invalid amount representations and currency codes", () => {
  for (const value of [0n, -1n, 1, 1.5, "1000"])
    assert.throws(() => createMoney(value, "USD"), MoneyValidationError);
  for (const currency of ["US", "USDD", "1SD", ""])
    assert.throws(() => createMoney(1n, currency), MoneyValidationError);
  assert.deepEqual(createMoney(1n, "usd"), {
    amountMinor: 1n,
    currency: "USD",
  });
});

test("createAccountingPeriod creates only an OPEN finite ordered period", () => {
  const created = createAccountingPeriod({
    id: "period-1",
    organizationId: "org-1",
    startsAt: new Date("2026-08-01T00:00:00.000Z"),
    endsAt: new Date("2026-08-31T23:59:59.999Z"),
  });
  assert.deepEqual(created, {
    id: "period-1",
    organizationId: "org-1",
    startsAt: new Date("2026-08-01T00:00:00.000Z"),
    endsAt: new Date("2026-08-31T23:59:59.999Z"),
    status: "OPEN",
  });
  assert.ok(Object.isFrozen(created));
  assert.throws(
    () =>
      createAccountingPeriod({
        id: "period-2",
        organizationId: "org-1",
        startsAt: new Date("invalid"),
        endsAt: new Date("2026-08-31"),
      }),
    LedgerValidationError,
  );
  assert.throws(
    () =>
      createAccountingPeriod({
        id: "period-3",
        organizationId: "org-1",
        startsAt: new Date("2026-09-01"),
        endsAt: new Date("2026-08-31"),
      }),
    /range/,
  );
});

test("createAccount rejects unsupported account types", () => {
  assert.throws(
    () =>
      createAccount({
        id: "account-invalid",
        organizationId: "org-1",
        code: "9999",
        name: "Invalid",
        type: "NOT_A_TYPE",
      }),
    LedgerValidationError,
  );
});

test("draft rejects one-line, mixed-currency, invalid-side, and cross-organization intents", () => {
  assert.throws(
    () =>
      createJournalDraft({
        id: "entry-1",
        organizationId: "org-1",
        reference: "sale",
        reason: "sale",
        actorId: "user-1",
        createdAt: now,
        lines: [balancedLines[0]],
      }),
    LedgerValidationError,
  );
  assert.throws(
    () =>
      createJournalDraft({
        id: "entry-1",
        organizationId: "org-1",
        reference: "sale",
        reason: "sale",
        actorId: "user-1",
        createdAt: now,
        lines: [
          { ...balancedLines[0], money: createMoney(1n, "EUR") },
          balancedLines[1],
        ],
      }),
    /currency/,
  );
  assert.throws(
    () =>
      createJournalDraft({
        id: "entry-1",
        organizationId: "org-1",
        reference: "sale",
        reason: "sale",
        actorId: "user-1",
        createdAt: now,
        lines: [
          { ...balancedLines[0], side: "DEBIT", money: createMoney(0n, "USD") },
          balancedLines[1],
        ],
      }),
    /positive/,
  );
  assert.throws(
    () =>
      createJournalDraft({
        id: "entry-1",
        organizationId: "org-1",
        reference: "sale",
        reason: "sale",
        actorId: "user-1",
        createdAt: now,
        lines: [
          {
            ...balancedLines[0],
            account: { ...debit, organizationId: "org-2" },
          },
          balancedLines[1],
        ],
      }),
    /organization/,
  );
});

test("balanced draft posts once in an open containing period", () => {
  const draft = createJournalDraft({
    id: "entry-1",
    organizationId: "org-1",
    reference: "sale",
    reason: "sale",
    actorId: "user-1",
    createdAt: now,
    lines: balancedLines,
  });
  const posted = postJournalEntry(draft, period, now);
  assert.equal(posted.status, "POSTED");
  assert.equal(posted.postedAt, now);
  assert.throws(() => postJournalEntry(posted, period, now), LedgerStateError);
  assert.ok(Object.isFrozen(posted));
});

test("unbalanced drafts and invalid periods cannot post", () => {
  const unbalanced = createJournalDraft({
    id: "entry-2",
    organizationId: "org-1",
    reference: "sale",
    reason: "sale",
    actorId: "user-1",
    createdAt: now,
    lines: [
      { ...balancedLines[0], money: createMoney(1200n, "USD") },
      balancedLines[1],
    ],
  });
  assert.throws(
    () => postJournalEntry(unbalanced, period, now),
    LedgerValidationError,
  );
  assert.throws(
    () =>
      postJournalEntry(
        createJournalDraft({
          id: "entry-3",
          organizationId: "org-1",
          reference: "sale",
          reason: "sale",
          actorId: "user-1",
          createdAt: now,
          lines: balancedLines,
        }),
        { ...period, status: "CLOSED" },
        now,
      ),
    LedgerStateError,
  );
  assert.throws(
    () =>
      postJournalEntry(
        createJournalDraft({
          id: "entry-4",
          organizationId: "org-1",
          reference: "sale",
          reason: "sale",
          actorId: "user-1",
          createdAt: now,
          lines: balancedLines,
        }),
        { ...period, organizationId: "org-2" },
        now,
      ),
    /organization/,
  );
  assert.throws(
    () =>
      postJournalEntry(
        createJournalDraft({
          id: "entry-5",
          organizationId: "org-1",
          reference: "sale",
          reason: "sale",
          actorId: "user-1",
          createdAt: now,
          lines: balancedLines,
        }),
        { ...period, startsAt: new Date("2026-08-14T00:00:00.000Z") },
        now,
      ),
    /period/,
  );
  assert.throws(
    () =>
      postJournalEntry(
        createJournalDraft({
          id: "entry-6",
          organizationId: "org-1",
          reference: "sale",
          reason: "sale",
          actorId: "user-1",
          createdAt: now,
          lines: balancedLines,
        }),
        undefined,
        now,
      ),
    /period/,
  );
  assert.throws(
    () =>
      postJournalEntry(
        createJournalDraft({
          id: "entry-9",
          organizationId: "org-1",
          reference: "sale",
          reason: "sale",
          actorId: "user-1",
          createdAt: now,
          lines: balancedLines,
        }),
        { ...period, startsAt: new Date("invalid") },
        now,
      ),
    /period date/,
  );
  assert.throws(
    () =>
      postJournalEntry(
        createJournalDraft({
          id: "entry-10",
          organizationId: "org-1",
          reference: "sale",
          reason: "sale",
          actorId: "user-1",
          createdAt: now,
          lines: balancedLines,
        }),
        { ...period, endsAt: new Date("invalid") },
        now,
      ),
    /period date/,
  );
  assert.throws(
    () =>
      postJournalEntry(
        createJournalDraft({
          id: "entry-11",
          organizationId: "org-1",
          reference: "sale",
          reason: "sale",
          actorId: "user-1",
          createdAt: now,
          lines: balancedLines,
        }),
        {
          ...period,
          startsAt: new Date("2026-09-01T00:00:00.000Z"),
          endsAt: new Date("2026-08-01T00:00:00.000Z"),
        },
        now,
      ),
    /period range/,
  );
});

test("reversal creates a draft with swapped sides and original reference", () => {
  const posted = postJournalEntry(
    createJournalDraft({
      id: "entry-7",
      organizationId: "org-1",
      reference: "sale",
      reason: "sale",
      actorId: "user-1",
      createdAt: now,
      lines: balancedLines,
    }),
    period,
    now,
  );
  const reversal = reversePostedEntry(posted, {
    id: "entry-8",
    actorId: "user-2",
    createdAt: now,
  });
  assert.equal(reversal.status, "DRAFT");
  assert.equal(reversal.reversalOfEntryId, posted.id);
  assert.deepEqual(
    reversal.lines.map(({ account, side, money }) => ({
      account: account.id,
      side,
      money,
    })),
    [
      { account: "account-1", side: "CREDIT", money: amount },
      { account: "account-2", side: "DEBIT", money: amount },
    ],
  );
});
