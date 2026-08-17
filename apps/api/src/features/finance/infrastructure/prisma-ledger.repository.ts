import { Prisma } from "@prisma/client";
import type { PrismaClient } from "@prisma/client";
import {
  LedgerStateError,
  createAccount,
  createMoney,
} from "../domain/ledger.js";
import type {
  Account,
  AccountingPeriod,
  DraftJournalEntry,
  JournalEntry,
  JournalLine,
  PostedJournalEntry,
} from "../domain/ledger.js";
import type {
  LedgerAccountCreationCommand,
  LedgerAccountCreationResult,
  LedgerDraftCommand,
  LedgerMutationResult,
  LedgerPeriodCreationCommand,
  LedgerPeriodCreationResult,
  LedgerPostCommand,
  LedgerRepository,
  LedgerReversalCommand,
} from "../application/ledger-repository.js";

type Db = Prisma.TransactionClient;
type PersistedJournalEntry = Prisma.JournalEntryGetPayload<{
  include: { lines: { include: { account: true } } };
}>;
type PersistedDraft = Prisma.JournalEntryGetPayload<{
  include: { lines: true };
}>;

function mapPersistedJournalEntry(entry: PersistedJournalEntry): JournalEntry {
  const lines = entry.lines.map((line) => ({
    account: createAccount({
      id: line.account.id,
      organizationId: line.account.organizationId,
      code: line.account.code,
      name: line.account.name,
      type: line.account.type,
    }),
    side: line.side,
    money: createMoney(line.amountMinor, line.currency),
  }));
  const base = {
    id: entry.id,
    organizationId: entry.organizationId,
    reference: entry.reference,
    reason: entry.reason,
    actorId: entry.actorId,
    createdAt: entry.createdAt,
    currency: entry.currency,
    lines,
    ...(entry.reversalOfEntryId
      ? { reversalOfEntryId: entry.reversalOfEntryId }
      : {}),
  };
  if (entry.status === "POSTED") {
    if (!entry.postedAt)
      throw new LedgerStateError(
        "Persisted posted journal entry has no posting time",
      );
    return { ...base, status: "POSTED", postedAt: entry.postedAt };
  }
  return { ...base, status: "DRAFT" };
}

function assertPersistedDraftIsBalanced(
  entry: PersistedDraft | null,
): asserts entry is PersistedDraft & { status: "DRAFT" } {
  if (!entry || entry.status !== "DRAFT" || entry.lines.length < 2)
    throw new LedgerStateError(
      "Persisted journal entry is not a valid balanced draft",
    );
  let debit = 0n;
  let credit = 0n;
  for (const line of entry.lines) {
    if (line.currency !== entry.currency || line.amountMinor <= 0n)
      throw new LedgerStateError(
        "Persisted journal entry is not a valid balanced draft",
      );
    if (line.side === "DEBIT") debit += line.amountMinor;
    else credit += line.amountMinor;
  }
  if (debit !== credit)
    throw new LedgerStateError(
      "Persisted journal entry is not a valid balanced draft",
    );
}

export class PrismaLedgerRepository implements LedgerRepository {
  public constructor(private readonly prisma: PrismaClient) {}

  public async findAccountingPeriod(
    organizationId: string,
    periodId: string,
  ): Promise<AccountingPeriod | null> {
    const period = await this.prisma.accountingPeriod.findUnique({
      where: { organizationId_id: { organizationId, id: periodId } },
      select: {
        id: true,
        organizationId: true,
        startsAt: true,
        endsAt: true,
        status: true,
      },
    });
    return period;
  }

  public async findJournalEntry(
    organizationId: string,
    entryId: string,
  ): Promise<JournalEntry | null> {
    const entry = await this.prisma.journalEntry.findUnique({
      where: { organizationId_id: { organizationId, id: entryId } },
      include: { lines: { include: { account: true } } },
    });
    return entry ? mapPersistedJournalEntry(entry) : null;
  }

  public async findAccount(
    organizationId: string,
    accountId: string,
  ): Promise<Account | null> {
    const account = await this.prisma.account.findUnique({
      where: { organizationId_id: { organizationId, id: accountId } },
      select: {
        id: true,
        organizationId: true,
        code: true,
        name: true,
        type: true,
      },
    });
    return account ? createAccount(account) : null;
  }

  public async createAccount(
    input: LedgerAccountCreationCommand,
  ): Promise<LedgerAccountCreationResult> {
    try {
      const account = await this.prisma.account.create({
        data: {
          id: input.account.id,
          organizationId: input.account.organizationId,
          code: input.account.code,
          name: input.account.name,
          type: input.account.type,
        },
      });
      return { kind: "created", account: createAccount(account) };
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        (error.code === "P2002" || error.code === "P2003")
      ) {
        return {
          kind: "conflict",
          reason: "account-ownership-code-or-id-conflict",
        };
      }
      throw error;
    }
  }

  public async createAccountingPeriod(
    input: LedgerPeriodCreationCommand,
  ): Promise<LedgerPeriodCreationResult> {
    try {
      await this.prisma.accountingPeriod.create({
        data: {
          id: input.period.id,
          organizationId: input.period.organizationId,
          startsAt: input.period.startsAt,
          endsAt: input.period.endsAt,
          status: "OPEN",
        },
      });
      return { kind: "created", period: input.period };
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        (error.code === "P2002" || error.code === "P2003")
      ) {
        return { kind: "conflict", reason: "period-ownership-or-id-conflict" };
      }
      throw error;
    }
  }

  public async createDraft(
    input: LedgerDraftCommand,
  ): Promise<LedgerMutationResult> {
    await this.prisma.$transaction(async (tx) => {
      await tx.journalEntry.create({ data: this.entryData(input.entry) });
      await tx.journalLine.createMany({ data: this.lineData(input.entry) });
    });
    return { kind: "created", entry: input.entry };
  }

  public async post(input: LedgerPostCommand): Promise<LedgerMutationResult> {
    const entry = input.entry;
    const postedAt = entry.postedAt;
    const updatedCount = await this.prisma.$transaction(async (tx) => {
      const period = await tx.accountingPeriod.findUnique({
        where: {
          organizationId_id: {
            organizationId: entry.organizationId,
            id: input.period.id,
          },
        },
      });
      if (
        input.period.organizationId !== entry.organizationId ||
        input.period.status !== "OPEN" ||
        input.period.startsAt > input.period.endsAt ||
        !period ||
        period.status !== "OPEN" ||
        period.startsAt > postedAt ||
        period.endsAt < postedAt
      )
        throw new LedgerStateError(
          "Accounting period is invalid for organization or posting date",
        );
      const persistedEntry = await tx.journalEntry.findUnique({
        where: {
          organizationId_id: {
            organizationId: entry.organizationId,
            id: entry.id,
          },
        },
        include: { lines: true },
      });
      assertPersistedDraftIsBalanced(persistedEntry);
      const updated = await tx.journalEntry.updateMany({
        where: {
          organizationId: entry.organizationId,
          id: entry.id,
          status: "DRAFT",
        },
        data: { status: "POSTED", postedAt, periodId: period.id },
      });
      if (updated.count !== 1)
        throw new LedgerStateError("Journal entry is not an owned draft");
      return updated.count;
    });
    if (updatedCount !== 1)
      throw new LedgerStateError("Journal entry was not posted");
    return { kind: "posted", entry };
  }

  public async createReversal(
    input: LedgerReversalCommand,
  ): Promise<LedgerMutationResult> {
    const entry = input.entry;
    await this.prisma.$transaction(async (tx) => {
      const original = await tx.journalEntry.findUnique({
        where: {
          organizationId_id: {
            organizationId: entry.organizationId,
            id: input.originalEntryId,
          },
        },
      });
      if (!original || original.status !== "POSTED")
        throw new LedgerStateError(
          "Original journal entry is not an owned posted entry",
        );
      await this.persistAccounts(
        tx,
        entry.organizationId,
        entry.lines.map((line) => line.account),
      );
      await tx.journalEntry.create({
        data: this.entryData({ ...entry, reversalOfEntryId: original.id }),
      });
      await tx.journalLine.createMany({ data: this.lineData(entry) });
    });
    return { kind: "created", entry };
  }

  private async persistAccounts(
    tx: Db,
    organizationId: string,
    accounts: readonly Account[],
  ): Promise<void> {
    for (const account of accounts) {
      if (account.organizationId !== organizationId)
        throw new LedgerStateError("Account organization mismatch");
      const existing = await tx.account.findUnique({
        where: { organizationId_code: { organizationId, code: account.code } },
      });
      if (existing && existing.id !== account.id)
        throw new LedgerStateError(
          "Account code already exists in organization",
        );
      if (!existing) {
        await tx.account.create({
          data: {
            id: account.id,
            organizationId,
            code: account.code,
            name: account.name,
            type: account.type,
          },
        });
      }
    }
  }

  private entryData(
    entry: DraftJournalEntry | PostedJournalEntry,
  ): Prisma.JournalEntryUncheckedCreateInput {
    return {
      id: entry.id,
      organizationId: entry.organizationId,
      status: entry.status,
      currency: entry.currency,
      reference: entry.reference,
      reason: entry.reason,
      actorId: entry.actorId,
      createdAt: entry.createdAt,
      postedAt: entry.status === "POSTED" ? entry.postedAt : null,
      reversalOfEntryId: entry.reversalOfEntryId ?? null,
    };
  }

  private lineData(
    entry: DraftJournalEntry | PostedJournalEntry,
  ): Prisma.JournalLineCreateManyInput[] {
    return entry.lines.map((line: JournalLine) => ({
      organizationId: entry.organizationId,
      entryId: entry.id,
      accountId: line.account.id,
      side: line.side,
      amountMinor: line.money.amountMinor,
      currency: line.money.currency,
    }));
  }
}
