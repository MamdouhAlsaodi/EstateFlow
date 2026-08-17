import {
  createMoney,
  LedgerStateError,
  LedgerValidationError,
  MoneyValidationError,
} from "./money.js";
import type { Money } from "./money.js";
export {
  createMoney,
  LedgerStateError,
  LedgerValidationError,
  MoneyValidationError,
};
export type AccountType =
  "ASSET" | "LIABILITY" | "EQUITY" | "REVENUE" | "EXPENSE";
export type JournalSide = "DEBIT" | "CREDIT";
export type JournalStatus = "DRAFT" | "POSTED";
export type PeriodStatus = "OPEN" | "CLOSED";

export type Account = Readonly<{
  id: string;
  organizationId: string;
  code: string;
  name: string;
  type: AccountType;
}>;
export type JournalLine = Readonly<{
  account: Account;
  side: JournalSide;
  money: Money;
}>;
export type AccountingPeriod = Readonly<{
  id: string;
  organizationId: string;
  startsAt: Date;
  endsAt: Date;
  status: PeriodStatus;
}>;
export type JournalEntryBase = Readonly<{
  id: string;
  organizationId: string;
  status: JournalStatus;
  reference: string;
  reason: string;
  actorId: string;
  createdAt: Date;
  lines: readonly JournalLine[];
  currency: string;
  reversalOfEntryId?: string;
}>;
export type DraftJournalEntry = JournalEntryBase &
  Readonly<{ status: "DRAFT"; postedAt?: undefined }>;
export type PostedJournalEntry = JournalEntryBase &
  Readonly<{ status: "POSTED"; postedAt: Date }>;
export type JournalEntry = DraftJournalEntry | PostedJournalEntry;

export type AccountingPeriodInput = Readonly<{
  id: string;
  organizationId: string;
  startsAt: Date;
  endsAt: Date;
}>;
type AccountInput = {
  id: string;
  organizationId: string;
  code: string;
  name: string;
  type: AccountType;
};
type JournalLineInput = { account: Account; side: JournalSide; money: Money };

function text(value: string, field: string): string {
  if (
    typeof value !== "string" ||
    value.trim().length === 0 ||
    value.length > 200
  )
    throw new LedgerValidationError(`Invalid ${field}`);
  return value.trim();
}
function validDate(value: Date, field: string): Date {
  if (!(value instanceof Date) || !Number.isFinite(value.getTime()))
    throw new LedgerValidationError(`Invalid ${field}`);
  return value;
}
function validSide(value: JournalSide): JournalSide {
  if (value !== "DEBIT" && value !== "CREDIT")
    throw new LedgerValidationError("Invalid journal side");
  return value;
}
function validAccountType(value: AccountType): AccountType {
  if (
    value !== "ASSET" &&
    value !== "LIABILITY" &&
    value !== "EQUITY" &&
    value !== "REVENUE" &&
    value !== "EXPENSE"
  )
    throw new LedgerValidationError("Invalid account type");
  return value;
}

export function createAccount(input: AccountInput): Account {
  return Object.freeze({
    id: text(input.id, "account id"),
    organizationId: text(input.organizationId, "organization"),
    code: text(input.code, "account code"),
    name: text(input.name, "account name"),
    type: validAccountType(input.type),
  });
}

export function createAccountingPeriod(
  input: AccountingPeriodInput,
): AccountingPeriod {
  const startsAt = validDate(input.startsAt, "period startsAt");
  const endsAt = validDate(input.endsAt, "period endsAt");
  if (startsAt > endsAt)
    throw new LedgerValidationError("Invalid period range");
  return Object.freeze({
    id: text(input.id, "period id"),
    organizationId: text(input.organizationId, "organization"),
    startsAt,
    endsAt,
    status: "OPEN" as const,
  });
}

export function createJournalDraft(input: {
  id: string;
  organizationId: string;
  reference: string;
  reason: string;
  actorId: string;
  createdAt: Date;
  lines: readonly JournalLineInput[];
  reversalOfEntryId?: string;
}): DraftJournalEntry {
  const organizationId = text(input.organizationId, "organization");
  if (!Array.isArray(input.lines) || input.lines.length < 2)
    throw new LedgerValidationError("Journal entry needs at least two lines");
  const lines = input.lines.map((line) => {
    if (line.account.organizationId !== organizationId)
      throw new LedgerValidationError("Account organization mismatch");
    if (line.money.amountMinor <= 0n)
      throw new LedgerValidationError("Journal line amount must be positive");
    return Object.freeze({
      account: line.account,
      side: validSide(line.side),
      money: line.money,
    });
  });
  const currency = lines[0].money.currency;
  if (lines.some((line) => line.money.currency !== currency))
    throw new LedgerValidationError("Journal entry currency mismatch");
  return Object.freeze({
    id: text(input.id, "entry id"),
    organizationId,
    status: "DRAFT" as const,
    reference: text(input.reference, "reference"),
    reason: text(input.reason, "reason"),
    actorId: text(input.actorId, "actor"),
    createdAt: validDate(input.createdAt, "createdAt"),
    lines: Object.freeze(lines),
    currency,
    ...(input.reversalOfEntryId === undefined
      ? {}
      : {
          reversalOfEntryId: text(
            input.reversalOfEntryId,
            "reversal reference",
          ),
        }),
  });
}

export function postJournalEntry(
  entry: JournalEntry,
  period: AccountingPeriod | undefined,
  postedAt: Date,
): PostedJournalEntry {
  if (entry.status !== "DRAFT")
    throw new LedgerStateError("Posted entries are immutable");
  if (!period) throw new LedgerStateError("Accounting period is required");
  if (period.organizationId !== entry.organizationId)
    throw new LedgerStateError("Period organization mismatch");
  const timestamp = validDate(postedAt, "postedAt");
  const startsAt = validDate(period.startsAt, "period date startsAt");
  const endsAt = validDate(period.endsAt, "period date endsAt");
  if (startsAt > endsAt)
    throw new LedgerValidationError("Invalid period range");
  if (period.status !== "OPEN")
    throw new LedgerStateError("Accounting period is closed");
  if (timestamp < startsAt || timestamp > endsAt)
    throw new LedgerStateError("Posted date is outside accounting period");
  let debit = 0n;
  let credit = 0n;
  for (const line of entry.lines) {
    if (line.account.organizationId !== entry.organizationId)
      throw new LedgerValidationError("Account organization mismatch");
    if (line.side === "DEBIT") debit += line.money.amountMinor;
    else credit += line.money.amountMinor;
  }
  if (debit !== credit)
    throw new LedgerValidationError("Journal entry is not balanced");
  return Object.freeze({ ...entry, status: "POSTED" as const, postedAt });
}

export function reversePostedEntry(
  entry: PostedJournalEntry,
  input: { id: string; actorId: string; createdAt: Date },
): DraftJournalEntry {
  if (entry.status !== "POSTED")
    throw new LedgerStateError("Only posted entries can be reversed");
  return createJournalDraft({
    id: input.id,
    organizationId: entry.organizationId,
    reference: `Reversal of ${entry.reference}`,
    reason: `Reversal of ${entry.reason}`,
    actorId: input.actorId,
    createdAt: input.createdAt,
    reversalOfEntryId: entry.id,
    lines: entry.lines.map((line) => ({
      account: line.account,
      side: line.side === "DEBIT" ? "CREDIT" : "DEBIT",
      money: line.money,
    })),
  });
}
