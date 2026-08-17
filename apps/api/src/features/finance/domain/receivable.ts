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
