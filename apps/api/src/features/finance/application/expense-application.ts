import { createHash } from "node:crypto";
import {
  createExpenseApprovalPolicy,
  createExpenseDraft,
  createExpenseEvidenceMetadata,
  decideExpense,
  sameDecisionAudit,
  submitExpenseWithPolicy,
  ExpenseStateError,
  ExpenseValidationError,
  expenseAcceptsEvidence,
  expenseIsDecided,
} from "../domain/expense.js";
import type {
  Expense,
  ExpenseApprovalPolicy,
  ExpenseDecision,
  ExpenseDimensions,
  ExpenseEvidenceMediaType,
} from "../domain/expense.js";
import type {
  ExpenseMutationResult,
  ExpenseNotFound,
  ExpenseRepository,
} from "./expense-repository.js";

export type ExpenseActor = Readonly<{ verified: boolean }>;
export type ExpenseMembership = Readonly<{
  organizationId: string;
  role: "OWNER" | "MANAGER" | "BROKER" | "CLIENT";
  status: "ACTIVE" | "PENDING" | "SUSPENDED" | "REVOKED";
}>;
export interface ExpenseMembershipReader {
  findMembership(
    organizationId: string,
    userId: string,
  ): Promise<ExpenseMembership | null>;
}
type AccessDenied = Readonly<{ kind: "access-denied" }>;
type CommandBase = Readonly<{
  actor: ExpenseActor;
  userId: string;
  organizationId: string;
}>;
type CreateDraftCommand = CommandBase &
  Readonly<{
    id: string;
    category: Expense["category"];
    vendorReference: string;
    amountMinor: bigint;
    currency: string;
    dimensions: ExpenseDimensions;
    createdAt: Date;
  }>;
type AttachEvidenceCommand = CommandBase &
  Readonly<{
    expenseId: string;
    evidenceId: string;
    mediaType: ExpenseEvidenceMediaType;
    byteSize: number;
    note?: string;
    attachedAt: Date;
  }>;
type SubmitCommand = CommandBase &
  Readonly<{ expenseId: string; submittedAt: Date }>;
type DecideCommand = CommandBase &
  Readonly<{
    expenseId: string;
    decision: ExpenseDecision;
    reason?: string;
    decidedAt: Date;
  }>;
type SetPolicyCommand = CommandBase &
  Readonly<{ thresholdMinor: bigint | null; currency: string }>;
export type ExpenseCommandResult =
  ExpenseMutationResult | AccessDenied | ExpenseNotFound;

export class ExpenseApplication {
  constructor(
    private readonly repository: ExpenseRepository,
    private readonly membershipReader: ExpenseMembershipReader,
  ) {}

  async createExpenseDraft(
    input: CreateDraftCommand,
  ): Promise<ExpenseCommandResult> {
    const access = await this.authorize(input);
    if (access.kind !== "authorized") return access.result;
    const dimensions: {
      campaignReference?: string;
      campaignId?: string;
      propertyId?: string;
      dealId?: string;
    } = {};
    if (input.dimensions.propertyId !== undefined) {
      const property = await this.repository.findProperty(
        input.organizationId,
        input.dimensions.propertyId,
      );
      if (
        !property ||
        property.organizationId !== input.organizationId ||
        property.id !== input.dimensions.propertyId
      )
        return { kind: "not-found", resource: "property" };
      dimensions.propertyId = property.id;
    }
    if (input.dimensions.dealId !== undefined) {
      const deal = await this.repository.findDeal(
        input.organizationId,
        input.dimensions.dealId,
      );
      if (
        !deal ||
        deal.organizationId !== input.organizationId ||
        deal.id !== input.dimensions.dealId
      )
        return { kind: "not-found", resource: "deal" };
      dimensions.dealId = deal.id;
    }
    if (input.dimensions.campaignId !== undefined) {
      const campaign = await this.repository.findCampaign(
        input.organizationId,
        input.dimensions.campaignId,
      );
      if (
        !campaign ||
        campaign.organizationId !== input.organizationId ||
        campaign.id !== input.dimensions.campaignId
      )
        return { kind: "not-found", resource: "campaign" };
      dimensions.campaignId = campaign.id;
    }
    if (input.dimensions.campaignReference !== undefined)
      dimensions.campaignReference = input.dimensions.campaignReference;
    const expense = createExpenseDraft({
      id: input.id,
      organizationId: input.organizationId,
      category: input.category,
      vendorReference: input.vendorReference,
      amountMinor: input.amountMinor,
      currency: input.currency,
      dimensions,
      createdBy: input.userId,
      createdAt: input.createdAt,
    });
    return this.repository.createExpenseDraft({ expense });
  }

  async attachExpenseEvidence(
    input: AttachEvidenceCommand,
  ): Promise<ExpenseCommandResult> {
    const access = await this.authorize(input);
    if (access.kind !== "authorized") return access.result;
    const expense = await this.repository.findExpense(
      input.organizationId,
      input.expenseId,
    );
    if (
      !expense ||
      expense.organizationId !== input.organizationId ||
      expense.id !== input.expenseId
    )
      return { kind: "not-found", resource: "expense" };
    const commandPayloadHash = canonicalEvidencePayloadHash(input);
    const resolution = await this.repository.resolveEvidenceIdempotency({
      organizationId: input.organizationId,
      expenseId: input.expenseId,
      evidenceId: input.evidenceId,
      commandPayloadHash,
    });
    if (resolution.kind !== "absent") return resolution;
    if (!expenseAcceptsEvidence(expense))
      return { kind: "conflict", reason: "expense-state-conflict" };
    const evidence = createExpenseEvidenceMetadata({
      id: input.evidenceId,
      organizationId: input.organizationId,
      expenseId: input.expenseId,
      mediaType: input.mediaType,
      byteSize: input.byteSize,
      ...(input.note === undefined ? {} : { note: input.note }),
      attachedBy: input.userId,
      attachedAt: input.attachedAt,
      commandPayloadHash,
    });
    return this.repository.attachExpenseEvidence({ evidence });
  }

  async submitExpenseForApproval(
    input: SubmitCommand,
  ): Promise<ExpenseCommandResult> {
    const access = await this.authorize(input);
    if (access.kind !== "authorized") return access.result;
    const expense = await this.repository.findExpense(
      input.organizationId,
      input.expenseId,
    );
    if (
      !expense ||
      expense.organizationId !== input.organizationId ||
      expense.id !== input.expenseId
    )
      return { kind: "not-found", resource: "expense" };
    if (expenseIsDecided(expense) || expense.status === "SUBMITTED")
      return { kind: "conflict", reason: "expense-state-conflict" };
    const policy = await this.repository.findApprovalPolicy(
      input.organizationId,
    );
    const submitted = submitExpenseWithPolicy(expense, policy, {
      submittedBy: input.userId,
      submittedAt: input.submittedAt,
    });
    return this.repository.submitExpense({
      expense: submitted,
      policy,
      submittedBy: input.userId,
      submittedAt: input.submittedAt,
    });
  }

  async decideExpenseApproval(
    input: DecideCommand,
  ): Promise<ExpenseCommandResult> {
    const access = await this.authorize(input);
    if (access.kind !== "authorized") return access.result;
    canonicalDecisionAudit(input);
    const expense = await this.repository.findExpense(
      input.organizationId,
      input.expenseId,
    );
    if (
      !expense ||
      expense.organizationId !== input.organizationId ||
      expense.id !== input.expenseId
    )
      return { kind: "not-found", resource: "expense" };
    if (expenseIsDecided(expense)) {
      return sameDecisionAudit(expense, {
        decidedBy: input.userId,
        decidedAt: expense.decidedAt as Date,
        decision: input.decision,
        reason: input.reason,
      })
        ? { kind: "replayed", expense }
        : { kind: "conflict", reason: "expense-state-conflict" };
    }
    if (expense.status !== "SUBMITTED")
      return { kind: "conflict", reason: "expense-state-conflict" };
    let decided;
    try {
      decided = decideExpense(expense, {
        decidedBy: input.userId,
        decidedAt: input.decidedAt,
        decision: input.decision,
        reason: input.reason,
      });
    } catch (error) {
      if (error instanceof ExpenseStateError)
        return { kind: "conflict", reason: "expense-state-conflict" };
      throw error;
    }
    return this.repository.decideExpense({
      expense: decided,
      decidedBy: input.userId,
      decidedAt: input.decidedAt,
      decision: input.decision,
      reason: input.reason,
    });
  }

  async setExpenseApprovalPolicy(
    input: SetPolicyCommand,
  ): Promise<ExpenseCommandResult> {
    if (!input.actor.verified || input.userId.trim().length === 0)
      return { kind: "access-denied" };
    const membership = await this.membershipReader.findMembership(
      input.organizationId,
      input.userId,
    );
    if (
      !membership ||
      membership.organizationId !== input.organizationId ||
      membership.status !== "ACTIVE" ||
      membership.role !== "OWNER"
    )
      return { kind: "access-denied" };
    const policy: ExpenseApprovalPolicy = createExpenseApprovalPolicy({
      organizationId: input.organizationId,
      thresholdMinor: input.thresholdMinor,
      currency: input.currency,
    });
    return this.repository.saveApprovalPolicy({
      policy,
      updatedBy: input.userId,
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

function canonicalDecisionAudit(input: {
  decision: ExpenseDecision;
  reason?: string;
}): void {
  if (input.decision !== "APPROVED" && input.decision !== "REJECTED")
    throw new ExpenseValidationError("Invalid approval decision");
  if (input.reason !== undefined) {
    const canonical = input.reason.trim();
    if (canonical.length === 0 || input.reason.length > 500)
      throw new ExpenseValidationError("Invalid decision reason");
  }
}

function canonicalEvidencePayloadHash(input: AttachEvidenceCommand): string {
  const canonicalPayload = JSON.stringify({
    organizationId: input.organizationId,
    expenseId: input.expenseId,
    evidenceId: input.evidenceId,
    mediaType: input.mediaType,
    byteSize: input.byteSize,
    note: input.note ?? null,
    attachedBy: input.userId,
    attachedAt: input.attachedAt.toISOString(),
  });
  return createHash("sha256").update(canonicalPayload, "utf8").digest("hex");
}
