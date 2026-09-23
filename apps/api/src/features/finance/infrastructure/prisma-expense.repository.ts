import { Prisma, type PrismaClient } from "@prisma/client";
import {
  decideExpense as decideDomainExpense,
  submitExpenseWithPolicy,
  sameDecisionAudit,
  ExpenseStateError,
  ExpenseValidationError,
} from "../domain/expense.js";
import type {
  Expense,
  ExpenseApprovalPolicy,
  ExpenseEvidenceMetadata,
} from "../domain/expense.js";
import type {
  ExpenseDecisionCommand,
  ExpenseEvidenceCommand,
  ExpenseEvidenceResolution,
  ExpenseMutationResult,
  ExpensePolicyCommand,
  ExpenseRepository,
  ExpenseScopedReference,
  ExpenseSubmitCommand,
} from "../application/expense-repository.js";

type Db = Prisma.TransactionClient;
type ExpenseRow = {
  id: string;
  organizationId: string;
  category: string;
  vendorReference: string;
  amountMinor: bigint;
  currency: string;
  campaignReference: string | null;
  campaignId: string | null;
  propertyId: string | null;
  dealId: string | null;
  status: string;
  draftCreatedBy: string;
  draftCreatedAt: Date;
  submittedBy: string | null;
  submittedAt: Date | null;
  decidedBy: string | null;
  decidedAt: Date | null;
  decision: string | null;
  decisionReason: string | null;
};
type EvidenceRow = {
  id: string;
  organizationId: string;
  expenseId: string;
  mediaType: string;
  byteSize: number;
  note: string | null;
  attachedBy: string;
  attachedAt: Date;
  commandPayloadHash: string;
};
type PolicyRow = {
  organizationId: string;
  thresholdMinor: bigint | null;
  currency: string;
  updatedBy: string;
  updatedAt: Date;
};
const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_RETRIES = 6;

function isConstraint(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    (error.code === "P2002" || error.code === "P2003")
  );
}
function isSerialization(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  const directCode = "code" in error ? error.code : undefined;
  if (directCode === "P2034" || directCode === "40001") return true;
  if (
    !("meta" in error) ||
    typeof error.meta !== "object" ||
    error.meta === null
  )
    return false;
  return "code" in error.meta && error.meta.code === "40001";
}

function mapDimensions(row: ExpenseRow): Expense["dimensions"] {
  return Object.freeze({
    ...(row.campaignReference === null
      ? {}
      : { campaignReference: row.campaignReference }),
    ...(row.campaignId === null ? {} : { campaignId: row.campaignId }),
    ...(row.propertyId === null ? {} : { propertyId: row.propertyId }),
    ...(row.dealId === null ? {} : { dealId: row.dealId }),
  });
}

function mapExpense(row: ExpenseRow): Expense {
  return Object.freeze({
    id: row.id,
    organizationId: row.organizationId,
    category: row.category as Expense["category"],
    vendorReference: row.vendorReference,
    money: Object.freeze({
      amountMinor: row.amountMinor,
      currency: row.currency,
    }),
    dimensions: mapDimensions(row),
    status: row.status as Expense["status"],
    draftCreatedBy: row.draftCreatedBy,
    draftCreatedAt: row.draftCreatedAt,
    ...(row.submittedBy === null ? {} : { submittedBy: row.submittedBy }),
    ...(row.submittedAt === null ? {} : { submittedAt: row.submittedAt }),
    ...(row.decidedBy === null ? {} : { decidedBy: row.decidedBy }),
    ...(row.decidedAt === null ? {} : { decidedAt: row.decidedAt }),
    ...(row.decision === null
      ? {}
      : { decision: row.decision as Expense["decision"] }),
    ...(row.decisionReason === null
      ? {}
      : { decisionReason: row.decisionReason }),
  });
}

function mapEvidence(row: EvidenceRow): ExpenseEvidenceMetadata {
  return Object.freeze({
    id: row.id,
    organizationId: row.organizationId,
    expenseId: row.expenseId,
    mediaType: row.mediaType as ExpenseEvidenceMetadata["mediaType"],
    byteSize: row.byteSize,
    ...(row.note === null ? {} : { note: row.note }),
    attachedBy: row.attachedBy,
    attachedAt: row.attachedAt,
    commandPayloadHash: row.commandPayloadHash,
  });
}

function mapPolicy(row: PolicyRow): ExpenseApprovalPolicy {
  return Object.freeze({
    organizationId: row.organizationId,
    thresholdMinor: row.thresholdMinor,
    currency: row.currency,
  });
}

function samePolicy(
  left: ExpenseApprovalPolicy,
  right: ExpenseApprovalPolicy,
): boolean {
  return (
    left.organizationId === right.organizationId &&
    left.currency === right.currency &&
    left.thresholdMinor === right.thresholdMinor
  );
}

export class PrismaExpenseRepository implements ExpenseRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findProperty(
    organizationId: string,
    propertyId: string,
  ): Promise<ExpenseScopedReference | null> {
    return this.prisma.property.findUnique({
      where: { organizationId_id: { organizationId, id: propertyId } },
      select: { id: true, organizationId: true },
    });
  }

  async findDeal(
    organizationId: string,
    dealId: string,
  ): Promise<ExpenseScopedReference | null> {
    return this.prisma.deal.findUnique({
      where: { organizationId_id: { organizationId, id: dealId } },
      select: { id: true, organizationId: true },
    });
  }

  async findCampaign(
    organizationId: string,
    campaignId: string,
  ): Promise<ExpenseScopedReference | null> {
    return this.prisma.campaign.findUnique({
      where: { organizationId_id: { organizationId, id: campaignId } },
      select: { id: true, organizationId: true },
    });
  }

  async findExpense(
    organizationId: string,
    expenseId: string,
  ): Promise<Expense | null> {
    if (!UUID.test(expenseId)) return null;
    const row = await this.prisma.expense.findUnique({
      where: { organizationId_id: { organizationId, id: expenseId } },
    });
    return row ? mapExpense(row) : null;
  }

  async findApprovalPolicy(
    organizationId: string,
  ): Promise<ExpenseApprovalPolicy | null> {
    const row = await this.prisma.expenseApprovalPolicy.findUnique({
      where: { organizationId },
    });
    return row ? mapPolicy(row) : null;
  }

  async resolveEvidenceIdempotency(input: {
    organizationId: string;
    expenseId: string;
    evidenceId: string;
    commandPayloadHash: string;
  }): Promise<ExpenseEvidenceResolution> {
    const row = await this.prisma.expenseEvidenceMetadata.findUnique({
      where: {
        organizationId_id: {
          organizationId: input.organizationId,
          id: input.evidenceId,
        },
      },
    });
    if (!row) return { kind: "absent" };
    if (
      row.expenseId !== input.expenseId ||
      row.commandPayloadHash !== input.commandPayloadHash
    )
      return {
        kind: "conflict",
        reason: "evidence-idempotency-payload-conflict",
      };
    return { kind: "replayed", evidence: mapEvidence(row) };
  }

  async createExpenseDraft(input: {
    expense: Expense;
  }): Promise<ExpenseMutationResult> {
    try {
      await this.prisma.expense.create({
        data: {
          id: input.expense.id,
          organizationId: input.expense.organizationId,
          category: input.expense.category,
          vendorReference: input.expense.vendorReference,
          amountMinor: input.expense.money.amountMinor,
          currency: input.expense.money.currency,
          campaignReference: input.expense.dimensions.campaignReference ?? null,
          campaignId: input.expense.dimensions.campaignId ?? null,
          propertyId: input.expense.dimensions.propertyId ?? null,
          dealId: input.expense.dimensions.dealId ?? null,
          status: input.expense.status,
          draftCreatedBy: input.expense.draftCreatedBy,
          draftCreatedAt: input.expense.draftCreatedAt,
        },
      });
      return { kind: "created", expense: input.expense };
    } catch (error) {
      if (isConstraint(error))
        return {
          kind: "conflict",
          reason: "expense-ownership-or-id-conflict",
        };
      throw error;
    }
  }

  async attachExpenseEvidence(
    input: ExpenseEvidenceCommand,
  ): Promise<ExpenseMutationResult> {
    try {
      await this.prisma.expenseEvidenceMetadata.create({
        data: {
          id: input.evidence.id,
          organizationId: input.evidence.organizationId,
          expenseId: input.evidence.expenseId,
          mediaType: input.evidence.mediaType,
          byteSize: input.evidence.byteSize,
          note: input.evidence.note ?? null,
          attachedBy: input.evidence.attachedBy,
          attachedAt: input.evidence.attachedAt,
          commandPayloadHash: input.evidence.commandPayloadHash,
        },
      });
      return { kind: "attached", evidence: input.evidence };
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        const resolution = await this.resolveEvidenceIdempotency({
          organizationId: input.evidence.organizationId,
          expenseId: input.evidence.expenseId,
          evidenceId: input.evidence.id,
          commandPayloadHash: input.evidence.commandPayloadHash,
        });
        if (resolution.kind === "replayed")
          return { kind: "replayed", evidence: resolution.evidence };
        return {
          kind: "conflict",
          reason: "evidence-idempotency-payload-conflict",
        };
      }
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2003"
      )
        return { kind: "conflict", reason: "expense-ownership-or-id-conflict" };
      throw error;
    }
  }

  async submitExpense(
    input: ExpenseSubmitCommand,
  ): Promise<ExpenseMutationResult> {
    try {
      return await this.withRetry(() =>
        this.prisma.$transaction((tx) => this.submitInTransaction(tx, input), {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        }),
      );
    } catch (error) {
      if (
        error instanceof ExpenseStateError ||
        error instanceof ExpenseValidationError
      )
        return { kind: "conflict", reason: "expense-state-conflict" };
      throw error;
    }
  }

  private async submitInTransaction(
    tx: Db,
    input: ExpenseSubmitCommand,
  ): Promise<ExpenseMutationResult> {
    const existing = await tx.expense.findUnique({
      where: {
        organizationId_id: {
          organizationId: input.expense.organizationId,
          id: input.expense.id,
        },
      },
    });
    if (!existing)
      return { kind: "conflict", reason: "expense-ownership-or-id-conflict" };
    const authoritative = mapExpense(existing);
    if (authoritative.status !== "DRAFT")
      return { kind: "conflict", reason: "expense-state-conflict" };
    const submitted = submitExpenseWithPolicy(authoritative, input.policy, {
      submittedBy: input.submittedBy,
      submittedAt: input.submittedAt,
    });
    await tx.expense.update({
      where: {
        organizationId_id: {
          organizationId: authoritative.organizationId,
          id: authoritative.id,
        },
      },
      data: {
        status: submitted.status,
        submittedBy: submitted.submittedBy,
        submittedAt: submitted.submittedAt,
        ...(submitted.decidedBy === undefined
          ? {}
          : {
              decidedBy: submitted.decidedBy,
              decidedAt: submitted.decidedAt,
              decision: submitted.decision,
              decisionReason: submitted.decisionReason,
            }),
      },
    });
    return {
      kind: submitted.status === "APPROVED" ? "auto-approved" : "submitted",
      expense: submitted,
    };
  }

  async decideExpense(
    input: ExpenseDecisionCommand,
  ): Promise<ExpenseMutationResult> {
    try {
      return await this.withRetry(() =>
        this.prisma.$transaction((tx) => this.decideInTransaction(tx, input), {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        }),
      );
    } catch (error) {
      if (
        error instanceof ExpenseStateError ||
        error instanceof ExpenseValidationError
      )
        return { kind: "conflict", reason: "expense-state-conflict" };
      throw error;
    }
  }

  private async decideInTransaction(
    tx: Db,
    input: ExpenseDecisionCommand,
  ): Promise<ExpenseMutationResult> {
    const existing = await tx.expense.findUnique({
      where: {
        organizationId_id: {
          organizationId: input.expense.organizationId,
          id: input.expense.id,
        },
      },
    });
    if (!existing)
      return { kind: "conflict", reason: "expense-ownership-or-id-conflict" };
    const authoritative = mapExpense(existing);
    if (
      authoritative.status === "APPROVED" ||
      authoritative.status === "REJECTED"
    )
      return sameDecisionAudit(authoritative, {
        decidedBy: input.decidedBy,
        decidedAt: authoritative.decidedAt as Date,
        decision: input.decision,
        reason: input.reason,
      })
        ? { kind: "replayed", expense: authoritative }
        : { kind: "conflict", reason: "expense-state-conflict" };
    if (authoritative.status !== "SUBMITTED")
      return { kind: "conflict", reason: "expense-state-conflict" };
    const decided = decideDomainExpense(authoritative, {
      decidedBy: input.decidedBy,
      decidedAt: input.decidedAt,
      decision: input.decision,
      reason: input.reason,
    });
    await tx.expense.update({
      where: {
        organizationId_id: {
          organizationId: authoritative.organizationId,
          id: authoritative.id,
        },
      },
      data: {
        status: decided.status,
        decidedBy: decided.decidedBy,
        decidedAt: decided.decidedAt,
        decision: decided.decision,
        decisionReason: decided.decisionReason ?? null,
      },
    });
    return { kind: "decided", expense: decided };
  }

  async saveApprovalPolicy(
    input: ExpensePolicyCommand,
  ): Promise<ExpenseMutationResult> {
    const existing = await this.prisma.expenseApprovalPolicy.findUnique({
      where: { organizationId: input.policy.organizationId },
    });
    if (existing) {
      const mapped = mapPolicy(existing);
      if (samePolicy(mapped, input.policy))
        return { kind: "replayed", policy: mapped };
    }
    await this.prisma.expenseApprovalPolicy.upsert({
      where: { organizationId: input.policy.organizationId },
      create: {
        organizationId: input.policy.organizationId,
        thresholdMinor: input.policy.thresholdMinor,
        currency: input.policy.currency,
        updatedBy: input.updatedBy,
      },
      update: {
        thresholdMinor: input.policy.thresholdMinor,
        currency: input.policy.currency,
        updatedBy: input.updatedBy,
      },
    });
    return { kind: "saved", policy: input.policy };
  }

  private async withRetry<T>(operation: () => Promise<T>): Promise<T> {
    for (let attempt = 0; attempt < MAX_RETRIES; attempt += 1) {
      try {
        return await operation();
      } catch (error) {
        if (!isSerialization(error) || attempt === MAX_RETRIES - 1) throw error;
        await new Promise((resolve) => setTimeout(resolve, 10 * (attempt + 1)));
      }
    }
    throw new Error("Serializable transaction retries exhausted");
  }
}
