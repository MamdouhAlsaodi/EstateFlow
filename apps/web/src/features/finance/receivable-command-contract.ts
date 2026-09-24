import { arMessages, type MessageKey } from "../../i18n";
import type { ApiError } from "../../lib/api-client/index";

export type ReceivableCommand = "draft" | "issue" | "payment";
export type ReceivableMessage = Readonly<{
  kind: "success" | "error" | "validation";
  text: string;
}>;
export type ReceivableFormState = Readonly<{
  dealId: string;
  draftAmountMinor: string;
  draftCurrency: string;
  invoiceId: string;
  receivableId: string;
  issuedAt: string;
  dueAt: string;
  paymentReceivableId: string;
  paymentAmountMinor: string;
  paymentCurrency: string;
  recordedAt: string;
}>;

export const EMPTY_RECEIVABLE_FORM: ReceivableFormState = {
  dealId: "",
  draftAmountMinor: "",
  draftCurrency: "USD",
  invoiceId: "",
  receivableId: "",
  issuedAt: "",
  dueAt: "",
  paymentReceivableId: "",
  paymentAmountMinor: "",
  paymentCurrency: "USD",
  recordedAt: "",
};

/** EF-630 — success feedback is a catalog key resolved by the caller. */
export function receivableSuccessMessage(
  command: ReceivableCommand,
): MessageKey {
  if (command === "draft") return "finance.receivable.createdDraft";
  if (command === "issue") return "finance.receivable.issued";
  return "finance.receivable.paymentRecorded";
}
export function isReceivableReplay(response: unknown): boolean {
  return (
    typeof response === "object" &&
    response !== null &&
    "kind" in response &&
    response.kind === "replayed"
  );
}
export function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}
export function isAmount(value: string): boolean {
  return /^[1-9]\d*$/.test(value);
}
export function isCurrency(value: string): boolean {
  return /^[A-Z]{3}$/.test(value);
}
export function isUtc(value: string): boolean {
  return (
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value) &&
    !Number.isNaN(Date.parse(value))
  );
}

export function isSessionError(value: unknown): boolean {
  return (
    value instanceof Error &&
    ((value as ApiError).status === 401 || (value as ApiError).status === 403)
  );
}

export function isSessionErrorMessage(message: string): boolean {
  // The session-expired wording lives in the catalog; match the same visible
  // message without hardcoding Arabic text in feature code.
  return message.includes(arMessages["finance.receivable.sessionExpired"]);
}
