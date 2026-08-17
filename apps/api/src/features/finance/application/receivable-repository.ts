import type {
  Invoice,
  PaymentRecord,
  Receivable,
} from "../domain/receivable.js";

export type ReceivableDeal = Readonly<{ id: string; organizationId: string }>;
export type ReceivableNotFoundResource = "deal" | "invoice" | "receivable";
export type ReceivableNotFound = Readonly<{
  kind: "not-found";
  resource: ReceivableNotFoundResource;
}>;
export type ReceivablePersistenceConflictReason =
  | "invoice-ownership-or-id-conflict"
  | "receivable-ownership-or-id-conflict"
  | "idempotency-payload-conflict";
export type ReceivablePersistenceConflict = Readonly<{
  kind: "conflict";
  reason: ReceivablePersistenceConflictReason;
}>;
export type InvoiceDraftCommand = Readonly<{ invoice: Invoice }>;
export type InvoiceIssueCommand = Readonly<{
  invoice: Invoice;
  receivable: Receivable;
}>;
export type ReceivablePaymentCommandScope = "RECEIVABLE_PAYMENT_RECORD";
export type PaymentIdempotencyCommand = Readonly<{
  scope: ReceivablePaymentCommandScope;
  organizationId: string;
  receivableId: string;
  idempotencyKey: string;
  commandPayloadHash: string;
}>;
export type PaymentCommand = Readonly<{
  scope: ReceivablePaymentCommandScope;
  payment: PaymentRecord;
  receivable: Receivable;
  commandPayloadHash: string;
}>;
export type PaymentIdempotencyResolution =
  | Readonly<{ kind: "absent" }>
  | Readonly<{
      kind: "replayed";
      payment: PaymentRecord;
      receivable: Receivable;
    }>
  | Readonly<{ kind: "conflict"; reason: "idempotency-payload-conflict" }>;
export type ReceivableMutationResult =
  | Readonly<{ kind: "created"; invoice: Invoice }>
  | Readonly<{ kind: "issued"; invoice: Invoice; receivable: Receivable }>
  | Readonly<{
      kind: "recorded";
      payment: PaymentRecord;
      receivable: Receivable;
    }>
  | Readonly<{
      kind: "replayed";
      payment: PaymentRecord;
      receivable: Receivable;
    }>
  | Readonly<{ kind: "replayed"; invoice: Invoice; receivable: Receivable }>
  | ReceivablePersistenceConflict;

export interface ReceivableRepository {
  findDeal(
    organizationId: string,
    dealId: string,
  ): Promise<ReceivableDeal | null>;
  findInvoice(
    organizationId: string,
    invoiceId: string,
  ): Promise<Invoice | null>;
  findReceivable(
    organizationId: string,
    receivableId: string,
  ): Promise<Receivable | null>;
  findReceivableByInvoice(
    organizationId: string,
    invoiceId: string,
  ): Promise<Receivable | null>;
  resolvePaymentIdempotency(
    input: PaymentIdempotencyCommand,
  ): Promise<PaymentIdempotencyResolution>;
  createInvoiceDraft(
    input: InvoiceDraftCommand,
  ): Promise<ReceivableMutationResult>;
  issueInvoice(input: InvoiceIssueCommand): Promise<ReceivableMutationResult>;
  recordPayment(input: PaymentCommand): Promise<ReceivableMutationResult>;
}
