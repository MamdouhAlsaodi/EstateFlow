export class ReceivableValidationError extends Error {
  readonly code = "RECEIVABLE_VALIDATION_ERROR" as const;
  constructor(message: string) {
    super(message);
    this.name = "ReceivableValidationError";
  }
}

export class ReceivableStateError extends Error {
  readonly code = "RECEIVABLE_STATE_ERROR" as const;
  constructor(message: string) {
    super(message);
    this.name = "ReceivableStateError";
  }
}

export type InvoiceStatus = "DRAFT" | "ISSUED" | "CANCELLED";
export type ReceivableStatus = "OPEN" | "PARTIALLY_PAID" | "PAID" | "CANCELLED";
export type Money = Readonly<{ amountMinor: bigint; currency: string }>;
export type Invoice = Readonly<{
  id: string;
  organizationId: string;
  dealId: string;
  money: Money;
  status: InvoiceStatus;
  draftCreatedBy: string;
  draftCreatedAt: Date;
  issuedBy?: string;
  issuedAt?: Date;
  dueAt?: Date;
  cancelledBy?: string;
  cancelledAt?: Date;
  cancellationReason?: string;
}>;
export type Receivable = Readonly<{
  id: string;
  organizationId: string;
  invoiceId: string;
  dealId: string;
  originalMoney: Money;
  outstandingMinor: bigint;
  status: ReceivableStatus;
  issuedAt: Date;
  dueAt: Date;
}>;
export type PaymentRecord = Readonly<{
  id: string;
  organizationId: string;
  receivableId: string;
  money: Money;
  recordedAt: Date;
  recordedBy: string;
  idempotencyKey: string;
  commandPayloadHash: string;
}>;

type DraftInput = Readonly<{
  id: string;
  organizationId: string;
  dealId: string;
  amountMinor: bigint;
  currency: string;
  createdBy: string;
  createdAt: Date;
}>;
type IssueInput = Readonly<{
  issuedBy: string;
  issuedAt: Date;
  dueAt: Date;
  receivableId: string;
}>;
type PaymentInput = Readonly<{
  id: string;
  amountMinor: bigint;
  currency: string;
  recordedAt: Date;
  recordedBy: string;
  idempotencyKey: string;
  commandPayloadHash: string;
}>;
export type CancellationAudit = Readonly<{
  cancelledBy: string;
  cancelledAt: Date;
  reason: string;
}>;
export type InvoiceCancellationInput = Readonly<{
  invoice: Invoice;
  receivable: Receivable;
  cancelledBy: string;
  cancelledAt: Date;
  reason: string;
  hasPayments: boolean;
}>;
export type AgingBucket =
  "CURRENT" | "DAYS_1_30" | "DAYS_31_60" | "DAYS_61_90" | "DAYS_91_PLUS";
export type ReceivableAging = Readonly<{
  daysPastDue: number;
  bucket: AgingBucket;
}>;

function text(value: string, field: string): string {
  if (
    typeof value !== "string" ||
    value.trim().length === 0 ||
    value.length > 200
  )
    throw new ReceivableValidationError(`Invalid ${field}`);
  return value.trim();
}
function date(value: Date, field: string): Date {
  if (!(value instanceof Date) || !Number.isFinite(value.getTime()))
    throw new ReceivableValidationError(`Invalid ${field}`);
  return Object.freeze(new Date(value.getTime()));
}
function money(amountMinor: bigint, currency: string): Money {
  if (typeof amountMinor !== "bigint" || amountMinor <= 0n)
    throw new ReceivableValidationError(
      "Money amount must be a positive bigint",
    );
  if (typeof currency !== "string" || !/^[A-Za-z]{3}$/.test(currency))
    throw new ReceivableValidationError("Currency must be a three-letter code");
  return Object.freeze({ amountMinor, currency: currency.toUpperCase() });
}
function cancellationReason(value: string): string {
  if (typeof value !== "string")
    throw new ReceivableValidationError("Invalid cancellation reason");
  const canonical = value.trim();
  if (canonical.length === 0 || Array.from(canonical).length > 500)
    throw new ReceivableValidationError("Invalid cancellation reason");
  return canonical;
}
export function canonicalCancellationAudit(
  input: Readonly<{
    cancelledBy: string;
    cancelledAt: Date;
    reason: string;
  }>,
): CancellationAudit {
  return Object.freeze({
    cancelledBy: text(input.cancelledBy, "cancellation actor"),
    cancelledAt: date(input.cancelledAt, "cancellation time"),
    reason: cancellationReason(input.reason),
  });
}
export function sameCancellationAudit(
  invoice: Invoice,
  input: Readonly<{
    cancelledBy: string;
    cancelledAt: Date;
    reason: string;
  }>,
): boolean {
  const audit = canonicalCancellationAudit(input);
  return (
    invoice.cancelledBy === audit.cancelledBy &&
    invoice.cancelledAt?.getTime() === audit.cancelledAt.getTime() &&
    invoice.cancellationReason === audit.reason
  );
}
function sameCancellationResource(
  invoice: Invoice,
  receivable: Receivable,
): boolean {
  return (
    invoice.id === receivable.invoiceId &&
    invoice.organizationId === receivable.organizationId &&
    invoice.dealId === receivable.dealId &&
    receivable.originalMoney.amountMinor === invoice.money.amountMinor &&
    receivable.originalMoney.currency === invoice.money.currency &&
    invoice.issuedBy !== undefined &&
    invoice.issuedAt !== undefined &&
    invoice.dueAt !== undefined &&
    receivable.issuedAt.getTime() === invoice.issuedAt.getTime() &&
    receivable.dueAt.getTime() === invoice.dueAt.getTime()
  );
}
function agingBucket(daysPastDue: number): AgingBucket {
  if (daysPastDue <= 30) return "DAYS_1_30";
  if (daysPastDue <= 60) return "DAYS_31_60";
  if (daysPastDue <= 90) return "DAYS_61_90";
  return "DAYS_91_PLUS";
}

export function createInvoiceDraft(input: DraftInput): Invoice {
  return Object.freeze({
    id: text(input.id, "invoice id"),
    organizationId: text(input.organizationId, "organization"),
    dealId: text(input.dealId, "deal id"),
    money: money(input.amountMinor, input.currency),
    status: "DRAFT",
    draftCreatedBy: text(input.createdBy, "draft actor"),
    draftCreatedAt: date(input.createdAt, "draft time"),
  });
}

export function issueInvoice(
  invoice: Invoice,
  input: IssueInput,
): Readonly<{ invoice: Invoice; receivable: Receivable }> {
  if (invoice.status !== "DRAFT")
    throw new ReceivableStateError("Only draft invoices can be issued");
  const issuedAt = date(input.issuedAt, "issue time");
  const dueAt = date(input.dueAt, "due time");
  if (dueAt < issuedAt)
    throw new ReceivableValidationError("Due time cannot precede issue time");
  const issuedBy = text(input.issuedBy, "issue actor");
  const receivableId = text(input.receivableId, "receivable id");
  const issuedInvoice = Object.freeze({
    ...invoice,
    status: "ISSUED" as const,
    issuedBy,
    issuedAt,
    dueAt,
  });
  const receivable = Object.freeze({
    id: receivableId,
    organizationId: invoice.organizationId,
    invoiceId: invoice.id,
    dealId: invoice.dealId,
    originalMoney: invoice.money,
    outstandingMinor: invoice.money.amountMinor,
    status: "OPEN" as const,
    issuedAt,
    dueAt,
  });
  return Object.freeze({ invoice: issuedInvoice, receivable });
}

export function cancelInvoice(input: InvoiceCancellationInput): Readonly<{
  invoice: Invoice;
  receivable: Receivable;
}> {
  const audit = canonicalCancellationAudit(input);
  validateCancellationState(input, audit);
  return Object.freeze({
    invoice: Object.freeze({
      ...input.invoice,
      status: "CANCELLED" as const,
      cancelledBy: audit.cancelledBy,
      cancelledAt: audit.cancelledAt,
      cancellationReason: audit.reason,
    }),
    receivable: Object.freeze({
      ...input.receivable,
      status: "CANCELLED" as const,
    }),
  });
}

function validateCancellationState(
  input: InvoiceCancellationInput,
  audit: CancellationAudit,
): void {
  if (input.invoice.status !== "ISSUED")
    throw new ReceivableStateError("Only issued invoices can be cancelled");
  if (input.receivable.status !== "OPEN")
    throw new ReceivableStateError("Only open receivables can be cancelled");
  if (
    input.receivable.outstandingMinor !==
    input.receivable.originalMoney.amountMinor
  )
    throw new ReceivableStateError("Paid receivables cannot be cancelled");
  if (input.hasPayments)
    throw new ReceivableStateError(
      "Receivables with payments cannot be cancelled",
    );
  if (!sameCancellationResource(input.invoice, input.receivable))
    throw new ReceivableStateError("Invoice and receivable do not match");
  if (audit.cancelledAt < input.invoice.issuedAt!)
    throw new ReceivableValidationError(
      "Cancellation time cannot precede issue time",
    );
}

export function classifyReceivableAging(
  receivable: Receivable,
  asOf: Date,
): ReceivableAging | null {
  const instant = date(asOf, "as of time");
  if (receivable.status === "PAID" || receivable.status === "CANCELLED")
    return null;
  const elapsed = instant.getTime() - receivable.dueAt.getTime();
  if (elapsed <= 0) return { daysPastDue: 0, bucket: "CURRENT" };
  const daysPastDue = Math.ceil(elapsed / 86_400_000);
  return { daysPastDue, bucket: agingBucket(daysPastDue) };
}

export function recordPayment(
  receivable: Receivable,
  input: PaymentInput,
): Readonly<{ payment: PaymentRecord; receivable: Receivable }> {
  if (receivable.status !== "OPEN" && receivable.status !== "PARTIALLY_PAID")
    throw new ReceivableStateError("Only open receivables can record payments");
  const paymentMoney = money(input.amountMinor, input.currency);
  if (paymentMoney.currency !== receivable.originalMoney.currency)
    throw new ReceivableValidationError(
      "Payment currency must match receivable currency",
    );
  if (paymentMoney.amountMinor > receivable.outstandingMinor)
    throw new ReceivableValidationError("Payment exceeds outstanding amount");
  const payment: PaymentRecord = Object.freeze({
    id: text(input.id, "payment id"),
    organizationId: receivable.organizationId,
    receivableId: receivable.id,
    money: paymentMoney,
    recordedAt: date(input.recordedAt, "recorded time"),
    recordedBy: text(input.recordedBy, "payment actor"),
    idempotencyKey: text(input.idempotencyKey, "idempotency key"),
    commandPayloadHash: text(input.commandPayloadHash, "command payload hash"),
  });
  const outstandingMinor =
    receivable.outstandingMinor - paymentMoney.amountMinor;
  const status: ReceivableStatus =
    outstandingMinor === 0n ? "PAID" : "PARTIALLY_PAID";
  return Object.freeze({
    payment,
    receivable: Object.freeze({ ...receivable, outstandingMinor, status }),
  });
}
