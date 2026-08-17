import { randomUUID } from "node:crypto";
import {
  LedgerStateError,
  LedgerValidationError,
  createAccount,
  createAccountingPeriod,
  createJournalDraft,
  createMoney,
  postJournalEntry,
  reversePostedEntry,
} from "../domain/ledger.js";
import type {
  Account,
  AccountType,
  AccountingPeriodInput,
} from "../domain/ledger.js";
import type {
  LedgerAccountCreationResult,
  LedgerDraftLineCommand,
  LedgerMutationResult,
  LedgerPeriodCreationResult,
  LedgerPostResult,
  LedgerRepository,
  LedgerReversalResult,
} from "./ledger-repository.js";

export type LedgerActor = Readonly<{ verified: boolean }>;
export type LedgerMembership = Readonly<{
  organizationId: string;
  role: "OWNER" | "MANAGER" | "BROKER" | "CLIENT";
  status: "ACTIVE" | "PENDING" | "SUSPENDED" | "REVOKED";
}>;
export interface LedgerMembershipReader {
  findMembership(
    organizationId: string,
    userId: string,
  ): Promise<LedgerMembership | null>;
}
type AccessDenied = Readonly<{ kind: "access-denied" }>;
type CommandBase = Readonly<{
  actor: LedgerActor;
  userId: string;
  organizationId: string;
}>;
type AccountCommand = CommandBase &
  Readonly<{ id: string; code: string; name: string; type: AccountType }>;
type DraftCommand = CommandBase &
  Readonly<{
    entryId: string;
    reference: string;
    reason: string;
    createdAt: Date;
    lines: readonly LedgerDraftLineCommand[];
  }>;

export class LedgerApplication {
  constructor(
    private readonly repository: LedgerRepository,
    private readonly membershipReader: LedgerMembershipReader,
  ) {}

  async createAccount(
    input: AccountCommand,
  ): Promise<LedgerAccountCreationResult | AccessDenied> {
    const access = await this.authorize(input);
    if (access.kind !== "authorized") return access.result;
    const account = createAccount({
      id: input.id,
      organizationId: input.organizationId,
      code: input.code,
      name: input.name,
      type: input.type,
    });
    return this.repository.createAccount({ account });
  }

  async createAccountingPeriod(
    input: CommandBase & { period: AccountingPeriodInput },
  ): Promise<LedgerPeriodCreationResult | AccessDenied> {
    const access = await this.authorize(input);
    if (access.kind !== "authorized") return access.result;
    if (input.period.organizationId !== input.organizationId)
      return { kind: "access-denied" };
    const period = createAccountingPeriod(input.period);
    return this.repository.createAccountingPeriod({ period });
  }

  async createDraft(
    input: DraftCommand,
  ): Promise<
    | LedgerMutationResult
    | AccessDenied
    | Readonly<{ kind: "not-found"; resource: "account" }>
  > {
    const access = await this.authorize(input);
    if (access.kind !== "authorized") return access.result;
    if (input.lines.length < 2)
      throw new LedgerValidationError("Journal entry needs at least two lines");
    const accounts = new Map<string, Account | null>();
    for (const line of input.lines) {
      if (!accounts.has(line.accountId))
        accounts.set(
          line.accountId,
          await this.repository.findAccount(
            input.organizationId,
            line.accountId,
          ),
        );
    }
    const resolvedLines: Array<{
      account: Account;
      side: "DEBIT" | "CREDIT";
      money: ReturnType<typeof createMoney>;
    }> = [];
    for (const line of input.lines) {
      const account = accounts.get(line.accountId);
      if (!account) return { kind: "not-found", resource: "account" };
      resolvedLines.push({
        account,
        side: line.side,
        money: createMoney(line.amountMinor, line.currency),
      });
    }
    const entry = createJournalDraft({
      id: input.entryId,
      organizationId: input.organizationId,
      reference: input.reference,
      reason: input.reason,
      actorId: input.userId,
      createdAt: input.createdAt,
      lines: resolvedLines,
    });
    return this.repository.createDraft({ entry });
  }

  async post(
    input: CommandBase & { entryId: string; periodId: string; postedAt: Date },
  ): Promise<LedgerPostResult | AccessDenied> {
    const access = await this.authorize(input);
    if (access.kind !== "authorized") return access.result;
    const entry = await this.repository.findJournalEntry(
      input.organizationId,
      input.entryId,
    );
    if (!entry) return { kind: "not-found", resource: "journal-entry" };
    if (entry.status !== "DRAFT")
      throw new LedgerStateError("Only draft entries can be posted");
    const period = await this.repository.findAccountingPeriod(
      input.organizationId,
      input.periodId,
    );
    if (!period) return { kind: "not-found", resource: "accounting-period" };
    const postedEntry = postJournalEntry(entry, period, input.postedAt);
    return this.repository.post({ entry: postedEntry, period });
  }

  async reverse(
    input: CommandBase & { entryId: string },
  ): Promise<LedgerReversalResult | AccessDenied> {
    const access = await this.authorize(input);
    if (access.kind !== "authorized") return access.result;
    const originalEntry = await this.repository.findJournalEntry(
      input.organizationId,
      input.entryId,
    );
    if (!originalEntry) return { kind: "not-found", resource: "journal-entry" };
    if (originalEntry.status !== "POSTED")
      throw new LedgerStateError("Only posted entries can be reversed");
    const reversalEntry = reversePostedEntry(originalEntry, {
      id: randomUUID(),
      actorId: input.userId,
      createdAt: new Date(),
    });
    return this.repository.createReversal({
      entry: reversalEntry,
      originalEntryId: originalEntry.id,
    });
  }

  private async authorize(
    input: CommandBase,
  ): Promise<
    { kind: "authorized" } | { kind: "denied"; result: AccessDenied }
  > {
    if (!input.actor.verified || input.userId.trim().length === 0)
      return { kind: "denied", result: { kind: "access-denied" } };
    const membership = await this.membershipReader.findMembership(
      input.organizationId,
      input.userId,
    );
    if (
      !membership ||
      membership.organizationId !== input.organizationId ||
      membership.status !== "ACTIVE" ||
      (membership.role !== "OWNER" && membership.role !== "MANAGER")
    )
      return { kind: "denied", result: { kind: "access-denied" } };
    return { kind: "authorized" };
  }
}
