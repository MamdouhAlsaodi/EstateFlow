import type { ApiError } from "../../lib/api-client/index";
import type { ReceivableAgingItem } from "../../lib/api-client/receivable-aging";

export const AGING_BUCKET_LABELS = {
  CURRENT: "حالي",
  DAYS_1_30: "من يوم إلى 30 يومًا",
  DAYS_31_60: "من 31 إلى 60 يومًا",
  DAYS_61_90: "من 61 إلى 90 يومًا",
  DAYS_91_PLUS: "أكثر من 90 يومًا",
} as const;

export const AGING_STATUS_LABELS = {
  OPEN: "مفتوح",
  PARTIALLY_PAID: "مدفوع جزئيًا",
} as const;

export type AgingBucket = keyof typeof AGING_BUCKET_LABELS;
export type AgingStatus = keyof typeof AGING_STATUS_LABELS;
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

export function presentAgingError(error: unknown): string {
  const apiError = error as Partial<ApiError>;
  if (apiError.status === 401 || apiError.status === 403)
    return "لا تملك صلاحية عرض مستحقات هذه المؤسسة.";
  return "تعذر تحميل أعمار المستحقات. تحقق من الاتصال ثم أعد المحاولة.";
}
