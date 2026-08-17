import type {
  Invoice,
  PaymentRecord,
  Receivable,
} from "../domain/receivable.js";

export type InvoiceRow = {
  id: string;
  organizationId: string;
  dealId: string;
  amountMinor: bigint;
  currency: string;
  status: string;
  draftCreatedBy: string;
  draftCreatedAt: Date;
  issuedBy: string | null;
  issuedAt: Date | null;
  dueAt: Date | null;
  cancelledBy: string | null;
  cancelledAt: Date | null;
  cancellationReason: string | null;
};
export type ReceivableRow = {
  id: string;
  organizationId: string;
  invoiceId: string;
  dealId: string;
  originalAmountMinor: bigint;
  outstandingMinor: bigint;
  currency: string;
  status: string;
  issuedAt: Date;
  dueAt: Date;
};
export type PaymentRow = {
  id: string;
  organizationId: string;
  receivableId: string;
  amountMinor: bigint;
  currency: string;
  recordedAt: Date;
  recordedBy: string;
  commandScope: string;
  idempotencyKey: string;
  commandPayloadHash: string;
};

const PAYMENT_SCOPE = "RECEIVABLE_PAYMENT_RECORD";

function invoiceStatus(value: string): Invoice["status"] {
  if (value === "DRAFT" || value === "ISSUED" || value === "CANCELLED")
    return value;
  throw new Error("Persisted invoice status is invalid");
}
function receivableStatus(value: string): Receivable["status"] {
  if (
    value === "OPEN" ||
    value === "PARTIALLY_PAID" ||
    value === "PAID" ||
    value === "CANCELLED"
  )
    return value;
  throw new Error("Persisted receivable status is invalid");
}
function money(
  amountMinor: bigint,
  currency: string,
): { amountMinor: bigint; currency: string } {
  if (amountMinor <= 0n || !/^[A-Za-z]{3}$/.test(currency))
    throw new Error("Persisted receivable money is invalid");
  return { amountMinor, currency: currency.toUpperCase() };
}
export function mapInvoice(row: InvoiceRow): Invoice {
  const m = money(row.amountMinor, row.currency);
  if (row.status !== "DRAFT" && (!row.issuedBy || !row.issuedAt || !row.dueAt))
    throw new Error("Persisted issued invoice facts are invalid");
  return Object.freeze({
    id: row.id,
    organizationId: row.organizationId,
    dealId: row.dealId,
    money: Object.freeze(m),
    status: invoiceStatus(row.status),
    draftCreatedBy: row.draftCreatedBy,
    draftCreatedAt: new Date(row.draftCreatedAt.getTime()),
    ...(row.issuedBy ? { issuedBy: row.issuedBy } : {}),
    ...(row.issuedAt ? { issuedAt: new Date(row.issuedAt.getTime()) } : {}),
    ...(row.dueAt ? { dueAt: new Date(row.dueAt.getTime()) } : {}),
    ...(row.cancelledBy ? { cancelledBy: row.cancelledBy } : {}),
    ...(row.cancelledAt
      ? { cancelledAt: new Date(row.cancelledAt.getTime()) }
      : {}),
    ...(row.cancellationReason
      ? { cancellationReason: row.cancellationReason }
      : {}),
  });
}
export function mapReceivable(row: ReceivableRow): Receivable {
  const original = money(row.originalAmountMinor, row.currency);
  if (
    row.outstandingMinor < 0n ||
    row.outstandingMinor > row.originalAmountMinor
  )
    throw new Error("Persisted receivable balance is invalid");
  return Object.freeze({
    id: row.id,
    organizationId: row.organizationId,
    invoiceId: row.invoiceId,
    dealId: row.dealId,
    originalMoney: Object.freeze(original),
    outstandingMinor: row.outstandingMinor,
    status: receivableStatus(row.status),
    issuedAt: new Date(row.issuedAt.getTime()),
    dueAt: new Date(row.dueAt.getTime()),
  });
}
export function mapPayment(row: PaymentRow): PaymentRecord {
  const m = money(row.amountMinor, row.currency);
  if (row.commandScope !== PAYMENT_SCOPE)
    throw new Error("Persisted payment command scope is invalid");
  return Object.freeze({
    id: row.id,
    organizationId: row.organizationId,
    receivableId: row.receivableId,
    money: Object.freeze(m),
    recordedAt: new Date(row.recordedAt.getTime()),
    recordedBy: row.recordedBy,
    idempotencyKey: row.idempotencyKey,
    commandPayloadHash: row.commandPayloadHash,
  });
}
