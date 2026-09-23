import type {
  Expense,
  ExpenseApprovalPolicy,
  ExpenseDecision,
  ExpenseEvidenceMetadata,
} from "../domain/expense.js";

export type ExpenseScopedReference = Readonly<{
  id: string;
  organizationId: string;
}>;
export type ExpenseNotFoundResource =
  "property" | "deal" | "campaign" | "expense";
export type ExpenseNotFound = Readonly<{
  kind: "not-found";
  resource: ExpenseNotFoundResource;
}>;
export type ExpensePersistenceConflictReason =
  | "expense-ownership-or-id-conflict"
  | "expense-state-conflict"
  | "evidence-idempotency-payload-conflict";
export type ExpensePersistenceConflict = Readonly<{
  kind: "conflict";
  reason: ExpensePersistenceConflictReason;
}>;
export type ExpenseDraftCommand = Readonly<{ expense: Expense }>;
export type ExpenseSubmitCommand = Readonly<{
  expense: Expense;
  policy: ExpenseApprovalPolicy | null;
  submittedBy: string;
  submittedAt: Date;
}>;
export type ExpenseDecisionCommand = Readonly<{
  expense: Expense;
  decidedBy: string;
  decidedAt: Date;
  decision: ExpenseDecision;
  reason?: string;
}>;
export type ExpenseEvidenceCommand = Readonly<{
  evidence: ExpenseEvidenceMetadata;
}>;
export type ExpensePolicyCommand = Readonly<{
  policy: ExpenseApprovalPolicy;
  updatedBy: string;
}>;
export type ExpenseMutationResult =
  | Readonly<{ kind: "created"; expense: Expense }>
  | Readonly<{ kind: "submitted"; expense: Expense }>
  | Readonly<{ kind: "auto-approved"; expense: Expense }>
  | Readonly<{ kind: "decided"; expense: Expense }>
  | Readonly<{ kind: "replayed"; expense: Expense }>
  | Readonly<{ kind: "attached"; evidence: ExpenseEvidenceMetadata }>
  | Readonly<{ kind: "replayed"; evidence: ExpenseEvidenceMetadata }>
  | Readonly<{ kind: "saved"; policy: ExpenseApprovalPolicy }>
  | Readonly<{ kind: "replayed"; policy: ExpenseApprovalPolicy }>
  | ExpensePersistenceConflict;
export type ExpenseEvidenceResolution =
  | Readonly<{ kind: "absent" }>
  | Readonly<{ kind: "replayed"; evidence: ExpenseEvidenceMetadata }>
  | Readonly<{
      kind: "conflict";
      reason: "evidence-idempotency-payload-conflict";
    }>;

export interface ExpenseRepository {
  findProperty(
    organizationId: string,
    propertyId: string,
  ): Promise<ExpenseScopedReference | null>;
  findDeal(
    organizationId: string,
    dealId: string,
  ): Promise<ExpenseScopedReference | null>;
  /** EF-401: resolves the campaign aggregate inside the organization. */
  findCampaign(
    organizationId: string,
    campaignId: string,
  ): Promise<ExpenseScopedReference | null>;
  findExpense(
    organizationId: string,
    expenseId: string,
  ): Promise<Expense | null>;
  findApprovalPolicy(
    organizationId: string,
  ): Promise<ExpenseApprovalPolicy | null>;
  resolveEvidenceIdempotency(input: {
    organizationId: string;
    expenseId: string;
    evidenceId: string;
    commandPayloadHash: string;
  }): Promise<ExpenseEvidenceResolution>;
  createExpenseDraft(
    input: ExpenseDraftCommand,
  ): Promise<ExpenseMutationResult>;
  attachExpenseEvidence(
    input: ExpenseEvidenceCommand,
  ): Promise<ExpenseMutationResult>;
  submitExpense(input: ExpenseSubmitCommand): Promise<ExpenseMutationResult>;
  decideExpense(input: ExpenseDecisionCommand): Promise<ExpenseMutationResult>;
  saveApprovalPolicy(
    input: ExpensePolicyCommand,
  ): Promise<ExpenseMutationResult>;
}

export type ExpenseDecisionKind = ExpenseDecision;
