import { createMoney } from "./money.js";
import type { Money } from "./money.js";
export { createMoney };
export { MoneyValidationError } from "./money.js";

export class ExpenseValidationError extends Error {
  readonly code = "EXPENSE_VALIDATION_ERROR" as const;
  constructor(message: string) {
    super(message);
    this.name = "ExpenseValidationError";
  }
}

export class ExpenseStateError extends Error {
  readonly code = "EXPENSE_STATE_ERROR" as const;
  constructor(message: string) {
    super(message);
    this.name = "ExpenseStateError";
  }
}

export type ExpenseCategory = "OFFICE" | "CAMPAIGN" | "PROPERTY" | "OTHER";
export type ExpenseStatus = "DRAFT" | "SUBMITTED" | "APPROVED" | "REJECTED";
export type ExpenseDecision = "APPROVED" | "REJECTED";
export type ExpenseEvidenceMediaType = "PDF" | "JPEG" | "PNG" | "WEBP";

export const EXPENSE_CATEGORIES: readonly ExpenseCategory[] = [
  "OFFICE",
  "CAMPAIGN",
  "PROPERTY",
  "OTHER",
];
export const EXPENSE_EVIDENCE_MEDIA_TYPES: readonly ExpenseEvidenceMediaType[] =
  ["PDF", "JPEG", "PNG", "WEBP"];
export const AUTO_APPROVAL_REASON = "BELOW_THRESHOLD_AUTO_APPROVAL";
export const MAX_EVIDENCE_BYTE_SIZE = 100_000_000;

export type ExpenseDimensions = Readonly<{
  campaignReference?: string;
  /** EF-401: real composite tenant FK to the Campaign aggregate. */
  campaignId?: string;
  propertyId?: string;
  dealId?: string;
}>;

export type Expense = Readonly<{
  id: string;
  organizationId: string;
  category: ExpenseCategory;
  vendorReference: string;
  money: Money;
  dimensions: ExpenseDimensions;
  status: ExpenseStatus;
  draftCreatedBy: string;
  draftCreatedAt: Date;
  submittedBy?: string;
  submittedAt?: Date;
  decidedBy?: string;
  decidedAt?: Date;
  decision?: ExpenseDecision;
  decisionReason?: string;
}>;

export type ExpenseEvidenceMetadata = Readonly<{
  id: string;
  organizationId: string;
  expenseId: string;
  mediaType: ExpenseEvidenceMediaType;
  byteSize: number;
  note?: string;
  attachedBy: string;
  attachedAt: Date;
  commandPayloadHash: string;
}>;

export type ExpenseApprovalPolicy = Readonly<{
  organizationId: string;
  /** `null` means every expense requires independent approval; no default amount is hard-coded. */
  thresholdMinor: bigint | null;
  currency: string;
}>;

export type ExpenseApprovalRequirement = "REQUIRED" | "AUTO_APPROVED";

type DraftInput = Readonly<{
  id: string;
  organizationId: string;
  category: ExpenseCategory;
  vendorReference: string;
  amountMinor: bigint;
  currency: string;
  dimensions: ExpenseDimensions;
  createdBy: string;
  createdAt: Date;
}>;

type SubmitInput = Readonly<{
  submittedBy: string;
  submittedAt: Date;
}>;

type DecideInput = Readonly<{
  decidedBy: string;
  decidedAt: Date;
  decision: ExpenseDecision;
  reason?: string;
}>;

type EvidenceInput = Readonly<{
  id: string;
  organizationId: string;
  expenseId: string;
  mediaType: ExpenseEvidenceMediaType;
  byteSize: number;
  note?: string;
  attachedBy: string;
  attachedAt: Date;
  commandPayloadHash: string;
}>;

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const HASH = /^[0-9a-f]{64}$/;

function text(value: string, field: string, limit: number): string {
  if (typeof value !== "string")
    throw new ExpenseValidationError(`Invalid ${field}`);
  const canonical = value.trim();
  if (canonical.length === 0 || canonical.length > limit)
    throw new ExpenseValidationError(`Invalid ${field}`);
  return canonical;
}
function identifier(value: string, field: string): string {
  const canonical = text(value, field, 64);
  if (!UUID.test(canonical))
    throw new ExpenseValidationError(`Invalid ${field}`);
  return canonical.toLowerCase();
}
function date(value: Date, field: string): Date {
  if (!(value instanceof Date) || !Number.isFinite(value.getTime()))
    throw new ExpenseValidationError(`Invalid ${field}`);
  return Object.freeze(new Date(value.getTime()));
}
function category(value: ExpenseCategory): ExpenseCategory {
  if (
    typeof value !== "string" ||
    !EXPENSE_CATEGORIES.includes(value as ExpenseCategory)
  )
    throw new ExpenseValidationError("Invalid expense category");
  return value;
}
function mediaType(value: ExpenseEvidenceMediaType): ExpenseEvidenceMediaType {
  if (
    typeof value !== "string" ||
    !EXPENSE_EVIDENCE_MEDIA_TYPES.includes(value as ExpenseEvidenceMediaType)
  )
    throw new ExpenseValidationError("Invalid evidence media type");
  return value;
}
function byteSize(value: number): number {
  if (!Number.isInteger(value) || value <= 0 || value > MAX_EVIDENCE_BYTE_SIZE)
    throw new ExpenseValidationError("Invalid evidence byte size");
  return value;
}
function dimensions(input: ExpenseDimensions): ExpenseDimensions {
  const result: {
    campaignReference?: string;
    campaignId?: string;
    propertyId?: string;
    dealId?: string;
  } = {};
  if (input.campaignReference !== undefined)
    result.campaignReference = text(
      input.campaignReference,
      "campaign dimension",
      100,
    );
  if (input.campaignId !== undefined)
    result.campaignId = identifier(input.campaignId, "campaign dimension");
  if (input.propertyId !== undefined)
    result.propertyId = identifier(input.propertyId, "property dimension");
  if (input.dealId !== undefined)
    result.dealId = identifier(input.dealId, "deal dimension");
  return Object.freeze(result);
}
function decisionReason(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  return text(value, "decision reason", 500);
}
function payloadHash(value: string): string {
  if (typeof value !== "string" || !HASH.test(value))
    throw new ExpenseValidationError("Invalid command payload hash");
  return value;
}

export function createExpenseDraft(input: DraftInput): Expense {
  return Object.freeze({
    id: identifier(input.id, "expense id"),
    organizationId: identifier(input.organizationId, "organization"),
    category: category(input.category),
    vendorReference: text(input.vendorReference, "vendor/payee reference", 200),
    money: createMoney(input.amountMinor, input.currency),
    dimensions: dimensions(input.dimensions),
    status: "DRAFT" as const,
    draftCreatedBy: identifier(input.createdBy, "draft actor"),
    draftCreatedAt: date(input.createdAt, "draft time"),
  });
}

/**
 * The approval threshold governs which submitted amounts need an independent
 * approver (maker-checker). Expenses below the threshold in the policy currency
 * are auto-approved on submission; everything else — including any expense in a
 * currency the policy does not cover — requires an independent approver.
 */
export function expenseApprovalRequirement(
  policy: ExpenseApprovalPolicy | null,
  money: Money,
): ExpenseApprovalRequirement {
  if (!policy || policy.thresholdMinor === null) return "REQUIRED";
  if (policy.currency !== money.currency) return "REQUIRED";
  return money.amountMinor < policy.thresholdMinor
    ? "AUTO_APPROVED"
    : "REQUIRED";
}

/**
 * Applies the organization approval policy to a draft expense and returns the
 * submitted expense. Amounts below the threshold are approved immediately with
 * the recorded auto-approval reason; no other self-approval is ever allowed.
 */
export function submitExpenseWithPolicy(
  expense: Expense,
  policy: ExpenseApprovalPolicy | null,
  input: SubmitInput,
): Expense {
  const submittedBy = identifier(input.submittedBy, "submitting actor");
  const submittedAt = date(input.submittedAt, "submission time");
  if (expense.status !== "DRAFT")
    throw new ExpenseStateError("Only draft expenses can be submitted");
  if (expenseApprovalRequirement(policy, expense.money) === "AUTO_APPROVED")
    return Object.freeze({
      ...expense,
      status: "APPROVED" as const,
      submittedBy,
      submittedAt,
      decidedBy: submittedBy,
      decidedAt: submittedAt,
      decision: "APPROVED" as const,
      decisionReason: AUTO_APPROVAL_REASON,
    });
  return Object.freeze({
    ...expense,
    status: "SUBMITTED" as const,
    submittedBy,
    submittedAt,
  });
}

export function canonicalDecisionAudit(input: DecideInput): Readonly<{
  decidedBy: string;
  decidedAt: Date;
  decision: ExpenseDecision;
  reason?: string;
}> {
  if (input.decision !== "APPROVED" && input.decision !== "REJECTED")
    throw new ExpenseValidationError("Invalid approval decision");
  const reason = decisionReason(input.reason);
  if (
    input.decision === "REJECTED" &&
    (reason === undefined || reason.length === 0)
  )
    throw new ExpenseValidationError("A rejected expense requires a reason");
  return Object.freeze({
    decidedBy: identifier(input.decidedBy, "deciding actor"),
    decidedAt: date(input.decidedAt, "decision time"),
    decision: input.decision,
    ...(reason === undefined ? {} : { reason }),
  });
}

export function sameDecisionAudit(
  expense: Expense,
  input: DecideInput,
): boolean {
  const audit = canonicalDecisionAudit(input);
  return (
    expense.decision === audit.decision &&
    expense.decidedBy === audit.decidedBy &&
    expense.decidedAt !== undefined &&
    expense.decisionReason === audit.reason
  );
}

export function decideExpense(expense: Expense, input: DecideInput): Expense {
  if (expense.status !== "SUBMITTED")
    throw new ExpenseStateError(
      "Only submitted expenses can receive an approval decision",
    );
  const audit = canonicalDecisionAudit(input);
  if (audit.decidedBy === expense.submittedBy)
    throw new ExpenseStateError(
      "Maker-checker requires an approver other than the submitter",
    );
  if (audit.decidedAt < (expense.submittedAt as Date))
    throw new ExpenseValidationError(
      "Decision time cannot precede submission time",
    );
  return Object.freeze({
    ...expense,
    status: audit.decision,
    decidedBy: audit.decidedBy,
    decidedAt: audit.decidedAt,
    decision: audit.decision,
    decisionReason: audit.reason,
  });
}

export function createExpenseEvidenceMetadata(
  input: EvidenceInput,
): ExpenseEvidenceMetadata {
  return Object.freeze({
    id: identifier(input.id, "evidence id"),
    organizationId: identifier(input.organizationId, "organization"),
    expenseId: identifier(input.expenseId, "expense id"),
    mediaType: mediaType(input.mediaType),
    byteSize: byteSize(input.byteSize),
    ...(input.note === undefined
      ? {}
      : { note: text(input.note, "evidence note", 500) }),
    attachedBy: identifier(input.attachedBy, "attaching actor"),
    attachedAt: date(input.attachedAt, "attachment time"),
    commandPayloadHash: payloadHash(input.commandPayloadHash),
  });
}

export function createExpenseApprovalPolicy(input: {
  organizationId: string;
  thresholdMinor: bigint | null;
  currency: string;
}): ExpenseApprovalPolicy {
  if (
    input.thresholdMinor !== null &&
    (typeof input.thresholdMinor !== "bigint" || input.thresholdMinor <= 0n)
  )
    throw new ExpenseValidationError(
      "Approval threshold must be a positive bigint or null",
    );
  return Object.freeze({
    organizationId: identifier(input.organizationId, "organization"),
    thresholdMinor: input.thresholdMinor,
    currency: text(input.currency, "policy currency", 3).toUpperCase(),
  });
}

export function expenseIsDecided(expense: Expense): boolean {
  return expense.status === "APPROVED" || expense.status === "REJECTED";
}

export function expenseAcceptsEvidence(expense: Expense): boolean {
  return expense.status === "DRAFT" || expense.status === "SUBMITTED";
}
