import { arMessages, type MessageKey } from "../../i18n";
import type { ApiError } from "../../lib/api-client/index";

export type ExpenseCommand =
  "draft" | "evidence" | "submit" | "decision" | "policy";
export type ExpenseMessage = Readonly<{
  kind: "success" | "error" | "validation";
  text: string;
}>;
export type ExpenseFormState = Readonly<{
  category: string;
  vendorReference: string;
  amountMinor: string;
  currency: string;
  campaignReference: string;
  propertyId: string;
  dealId: string;
  expenseId: string;
  evidenceId: string;
  mediaType: string;
  byteSize: string;
  note: string;
  attachedAt: string;
  decision: string;
  decisionReason: string;
  thresholdMinor: string;
  policyCurrency: string;
}>;

export const EMPTY_EXPENSE_FORM: ExpenseFormState = {
  category: "OFFICE",
  vendorReference: "",
  amountMinor: "",
  currency: "SAR",
  campaignReference: "",
  propertyId: "",
  dealId: "",
  expenseId: "",
  evidenceId: "",
  mediaType: "PDF",
  byteSize: "",
  note: "",
  attachedAt: "",
  decision: "APPROVED",
  decisionReason: "",
  thresholdMinor: "",
  policyCurrency: "SAR",
};

export const EXPENSE_CATEGORY_VALUES = [
  "OFFICE",
  "CAMPAIGN",
  "PROPERTY",
  "OTHER",
] as const;
export const EXPENSE_MEDIA_TYPE_VALUES = [
  "PDF",
  "JPEG",
  "PNG",
  "WEBP",
] as const;

/** EF-630 — success feedback is a catalog key resolved by the caller. */
export function expenseSuccessMessage(command: ExpenseCommand): MessageKey {
  if (command === "draft") return "finance.expense.createdDraft";
  if (command === "evidence") return "finance.expense.evidenceAttached";
  if (command === "submit") return "finance.expense.submitted";
  if (command === "decision") return "finance.expense.decisionRecorded";
  return "finance.expense.policySaved";
}
export function isExpenseReplay(response: unknown): boolean {
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
export function isByteSize(value: string): boolean {
  return /^[1-9]\d*$/.test(value) && Number(value) <= 100_000_000;
}
export function isText(value: string, maxLength: number): boolean {
  const canonical = value.trim();
  return canonical.length > 0 && canonical.length <= maxLength;
}
export function isCategory(value: string): boolean {
  return (EXPENSE_CATEGORY_VALUES as readonly string[]).includes(value);
}
export function isMediaType(value: string): boolean {
  return (EXPENSE_MEDIA_TYPE_VALUES as readonly string[]).includes(value);
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
  return message.includes(arMessages["finance.expense.sessionExpired"]);
}
