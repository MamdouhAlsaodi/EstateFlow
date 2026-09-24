import type { ApiError } from "../../lib/api-client/index";
import type { ReceivableAgingItem } from "../../lib/api-client/receivable-aging";
import type { MessageKey } from "../../i18n";

/**
 * EF-630 — labels are catalog keys; the Arabic/English text lives in the
 * translation catalog (`src/i18n/messages/finance.ts`).
 */
export const AGING_BUCKET_LABELS: Readonly<Record<AgingBucket, MessageKey>> = {
  CURRENT: "finance.agingBucketCurrent",
  DAYS_1_30: "finance.agingBucket1To30",
  DAYS_31_60: "finance.agingBucket31To60",
  DAYS_61_90: "finance.agingBucket61To90",
  DAYS_91_PLUS: "finance.agingBucket91Plus",
};

export const AGING_STATUS_LABELS: Readonly<Record<AgingStatus, MessageKey>> = {
  OPEN: "finance.receivableStatusOpen",
  PARTIALLY_PAID: "finance.receivableStatusPartiallyPaid",
};

export type AgingBucket =
  "CURRENT" | "DAYS_1_30" | "DAYS_31_60" | "DAYS_61_90" | "DAYS_91_PLUS";
export type AgingStatus = "OPEN" | "PARTIALLY_PAID";
export type { ReceivableAgingItem };
export type ReceivableAgingResponse = Readonly<{
  asOf: string;
  items: readonly ReceivableAgingItem[];
  nextCursor?: string;
}>;

export function appendAgingItems(
  current: readonly ReceivableAgingItem[],
  next: readonly ReceivableAgingItem[],
): ReceivableAgingItem[] {
  const ids = new Set(current.map((entry) => entry.receivableId));
  const appended: ReceivableAgingItem[] = [];
  for (const entry of next) {
    if (ids.has(entry.receivableId)) continue;
    ids.add(entry.receivableId);
    appended.push(entry);
  }
  return [...current, ...appended];
}

/**
 * Classifies the failure; the message key is resolved by the caller so the
 * model stays free of rendered text.
 */
export function agingErrorKey(error: unknown): {
  key: MessageKey;
  authorizedIssue: boolean;
} {
  const apiError = error as Partial<ApiError>;
  if (apiError.status === 401 || apiError.status === 403)
    return { key: "finance.agingNotAuthorized", authorizedIssue: true };
  return { key: "finance.agingLoadFailed", authorizedIssue: false };
}
