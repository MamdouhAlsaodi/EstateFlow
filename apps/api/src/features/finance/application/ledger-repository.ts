import type {
  Account,
  AccountingPeriod,
  DraftJournalEntry,
  JournalEntry,
  PostedJournalEntry,
} from "../domain/ledger.js";

export type LedgerPeriodCreationCommand = Readonly<{
  period: AccountingPeriod;
}>;
export type LedgerPeriodCreationResult =
  | Readonly<{ kind: "created"; period: AccountingPeriod }>
  | Readonly<{ kind: "conflict"; reason: "period-ownership-or-id-conflict" }>;
export type LedgerAccountCreationCommand = Readonly<{ account: Account }>;
export type LedgerAccountCreationResult =
  | Readonly<{ kind: "created"; account: Account }>
  | Readonly<{
      kind: "conflict";
      reason: "account-ownership-code-or-id-conflict";
    }>;
export type LedgerDraftLineCommand = Readonly<{
  accountId: string;
  side: "DEBIT" | "CREDIT";
  amountMinor: bigint;
  currency: string;
}>;
export type LedgerDraftCommand = Readonly<{ entry: DraftJournalEntry }>;
export type LedgerPostCommand = Readonly<{
  entry: PostedJournalEntry;
  period: AccountingPeriod;
}>;
export type LedgerPostResult = LedgerMutationResult | LedgerNotFoundResult;
export type LedgerReversalCommand = Readonly<{
  entry: DraftJournalEntry;
  originalEntryId: string;
}>;
export type LedgerReversalResult = LedgerMutationResult | LedgerNotFoundResult;
export type LedgerNotFoundResult = Readonly<{
  kind: "not-found";
  resource: "journal-entry" | "accounting-period" | "account";
}>;
export type LedgerMutationResult =
  | Readonly<{ kind: "created"; entry: DraftJournalEntry }>
  | Readonly<{ kind: "posted"; entry: PostedJournalEntry }>;

export interface LedgerRepository {
  findAccountingPeriod(
    organizationId: string,
    periodId: string,
  ): Promise<AccountingPeriod | null>;
  findJournalEntry(
    organizationId: string,
    entryId: string,
  ): Promise<JournalEntry | null>;
  findAccount(
    organizationId: string,
    accountId: string,
  ): Promise<Account | null>;
  createAccountingPeriod(
    input: LedgerPeriodCreationCommand,
  ): Promise<LedgerPeriodCreationResult>;
  createAccount(
    input: LedgerAccountCreationCommand,
  ): Promise<LedgerAccountCreationResult>;
  createDraft(input: LedgerDraftCommand): Promise<LedgerMutationResult>;
  post(input: LedgerPostCommand): Promise<LedgerMutationResult>;
  createReversal(input: LedgerReversalCommand): Promise<LedgerMutationResult>;
}
