import type { ApiClient } from "./index";
import {
  normalizeReceivableAging,
  type ReceivableAgingResponse,
} from "./receivable-aging";

export type InvoiceDraftInput = Readonly<{
  amountMinor: string;
  currency: string;
}>;
export type InvoiceIssueInput = Readonly<{
  receivableId: string;
  issuedAt: string;
  dueAt: string;
}>;
export type ReceivablePaymentInput = Readonly<{
  amountMinor: string;
  currency: string;
  recordedAt: string;
}>;
export type CancellationInput = Readonly<{ reason: string }>;
type CommandContext = Readonly<{ organizationId: string; csrfToken: string }>;
type DraftContext = Readonly<CommandContext & { dealId: string }>;
type IssueContext = Readonly<CommandContext & { invoiceId: string }>;
type PaymentContext = Readonly<
  CommandContext & { receivableId: string; idempotencyKey: string }
>;
type CancellationContext = Readonly<CommandContext & { invoiceId: string }>;
type AgingContext = Readonly<{
  organizationId: string;
  cursor?: string;
  limit?: number;
}>;

export type ReceivableAdapter = Readonly<{
  createInvoiceDraft(
    context: DraftContext,
    input: InvoiceDraftInput,
  ): Promise<unknown>;
  issueInvoice(
    context: IssueContext,
    input: InvoiceIssueInput,
  ): Promise<unknown>;
  cancelInvoice(
    context: CancellationContext,
    input: CancellationInput,
  ): Promise<unknown>;
  getReceivableAging(context: AgingContext): Promise<ReceivableAgingResponse>;
  recordReceivablePayment(
    context: PaymentContext,
    input: ReceivablePaymentInput,
  ): Promise<unknown>;
}>;

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const AMOUNT = /^[1-9]\d*$/;
const CURRENCY = /^[A-Z]{3}$/;

export function createReceivableAdapter(
  client: Pick<ApiClient, "request">,
): ReceivableAdapter {
  return {
    createInvoiceDraft: (context, input) => {
      assertUuidContext(context.organizationId, context.dealId);
      assertExactKeys(input, ["amountMinor", "currency"]);
      assertMoney(input.amountMinor, input.currency);
      return client.request(
        `/organizations/${encodeURIComponent(context.organizationId)}/finance/deals/${encodeURIComponent(context.dealId)}/invoices`,
        { method: "POST", csrfToken: context.csrfToken, body: input },
      );
    },
    issueInvoice: (context, input) => {
      assertUuidContext(context.organizationId, context.invoiceId);
      assertExactKeys(input, ["receivableId", "issuedAt", "dueAt"]);
      assertUuid(input.receivableId);
      assertUtc(input.issuedAt);
      assertUtc(input.dueAt);
      return client.request(
        `/organizations/${encodeURIComponent(context.organizationId)}/finance/invoices/${encodeURIComponent(context.invoiceId)}/issue`,
        { method: "POST", csrfToken: context.csrfToken, body: input },
      );
    },
    cancelInvoice: (context, input) => {
      assertUuidContext(context.organizationId, context.invoiceId);
      assertExactKeys(input, ["reason"]);
      const reason = normalizeReason(input.reason);
      return client.request(
        `/organizations/${encodeURIComponent(context.organizationId)}/finance/invoices/${encodeURIComponent(context.invoiceId)}/cancel`,
        { method: "POST", csrfToken: context.csrfToken, body: { reason } },
      );
    },
    getReceivableAging: (context) => {
      assertUuid(context.organizationId);
      if (context.cursor !== undefined) assertCursor(context.cursor);
      if (context.limit !== undefined) assertLimit(context.limit);
      const query = new URLSearchParams();
      if (context.cursor !== undefined) query.set("cursor", context.cursor);
      if (context.limit !== undefined)
        query.set("limit", String(context.limit));
      const suffix = query.toString() ? `?${query.toString()}` : "";
      return client
        .request(
          `/organizations/${encodeURIComponent(context.organizationId)}/finance/receivables/aging${suffix}`,
        )
        .then(normalizeReceivableAging);
    },
    recordReceivablePayment: (context, input) => {
      assertUuidContext(context.organizationId, context.receivableId);
      assertExactKeys(input, ["amountMinor", "currency", "recordedAt"]);
      assertMoney(input.amountMinor, input.currency);
      assertUtc(input.recordedAt);
      const idempotencyKey = normalizeIdempotencyKey(context.idempotencyKey);
      return client.request(
        `/organizations/${encodeURIComponent(context.organizationId)}/finance/receivables/${encodeURIComponent(context.receivableId)}/payments`,
        {
          method: "POST",
          csrfToken: context.csrfToken,
          idempotencyKey,
          body: input,
        },
      );
    },
  };
}

function normalizeReason(value: unknown): string {
  if (typeof value !== "string")
    throw new TypeError("Invalid cancellation reason");
  const reason = value.trim();
  if (Array.from(reason).length < 1 || Array.from(reason).length > 500)
    throw new TypeError("Invalid cancellation reason");
  return reason;
}
function assertMoney(amountMinor: unknown, currency: unknown): void {
  if (typeof amountMinor !== "string" || !AMOUNT.test(amountMinor))
    throw new TypeError("Invalid amountMinor");
  if (typeof currency !== "string" || !CURRENCY.test(currency))
    throw new TypeError("Invalid currency");
}
function assertUtc(value: unknown): asserts value is string {
  if (
    typeof value !== "string" ||
    !UTC.test(value) ||
    Number.isNaN(Date.parse(value))
  )
    throw new TypeError("Invalid UTC timestamp");
}
function assertUuidContext(organizationId: unknown, resourceId: unknown): void {
  assertUuid(organizationId);
  assertUuid(resourceId);
}
function assertUuid(value: unknown): asserts value is string {
  if (typeof value !== "string" || !UUID.test(value))
    throw new TypeError("Invalid UUID");
}
function assertExactKeys(value: object, keys: readonly string[]): void {
  if (Object.keys(value).some((key) => !keys.includes(key)))
    throw new TypeError("Unknown receivable field");
}
function assertCursor(value: unknown): asserts value is string {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > 512 ||
    !/^[A-Za-z0-9_-]+$/.test(value)
  )
    throw new TypeError("Invalid cursor");
}
function assertLimit(value: unknown): asserts value is number {
  if (
    typeof value !== "number" ||
    !Number.isInteger(value) ||
    value < 1 ||
    value > 100
  )
    throw new TypeError("Invalid limit");
}
function normalizeIdempotencyKey(value: unknown): string {
  if (typeof value !== "string") throw new TypeError("Invalid idempotency key");
  const normalized = value.trim();
  if (normalized.length === 0 || normalized.length > 200)
    throw new TypeError("Invalid idempotency key");
  return normalized;
}
