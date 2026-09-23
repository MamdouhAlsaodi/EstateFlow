const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const MONEY = /^[1-9]\d*$/;
const SIGNED_MONEY = /^(0|-?[1-9]\d*)$/;
const CURRENCY = /^[A-Z]{3}$/;
const AGING_BUCKETS = [
  "CURRENT",
  "DAYS_1_30",
  "DAYS_31_60",
  "DAYS_61_90",
  "DAYS_91_PLUS",
] as const;
const COMMISSION_ITEM_STATUSES = [
  "EXPECTED",
  "CONFIRMED",
  "DUE",
  "PAID",
  "CANCELLED",
] as const;
const EXPENSE_CATEGORIES = ["OFFICE", "CAMPAIGN", "PROPERTY", "OTHER"] as const;

export type AgingBucket = (typeof AGING_BUCKETS)[number];
export type CommissionItemStatus = (typeof COMMISSION_ITEM_STATUSES)[number];

export type MoneyTotal = Readonly<{
  currency: string;
  count: number;
  amountMinor: string;
}>;
export type NetCashRow = Readonly<{ currency: string; amountMinor: string }>;
export type OwnerCashFlow = Readonly<{
  asOf: string;
  cashIn: readonly MoneyTotal[];
  cashOut: readonly MoneyTotal[];
  netCash: readonly NetCashRow[];
}>;
export type OwnerPaymentItem = Readonly<{
  paymentId: string;
  receivableId: string;
  invoiceId: string;
  dealId: string;
  propertyId: string;
  currency: string;
  amountMinor: string;
  recordedAt: string;
}>;
export type OwnerExpenseItem = Readonly<{
  expenseId: string;
  category: string;
  vendorReference: string;
  currency: string;
  amountMinor: string;
  decidedAt: string;
  campaignReference?: string;
  dealId?: string;
  propertyId?: string;
}>;
export type OwnerAgingBucketRow = Readonly<{
  bucket: AgingBucket;
  currency: string;
  count: number;
  outstandingMinor: string;
}>;
export type OwnerAgingItem = Readonly<{
  receivableId: string;
  invoiceId: string;
  dealId: string;
  currency: string;
  originalAmountMinor: string;
  outstandingMinor: string;
  status: "OPEN" | "PARTIALLY_PAID";
  issuedAt: string;
  dueAt: string;
  daysPastDue: number;
  bucket: AgingBucket;
}>;
export type OwnerAgingItemPage = Readonly<{
  asOf: string;
  items: readonly OwnerAgingItem[];
  nextCursor?: string;
}>;
export type OwnerAgingSummary = Readonly<{
  asOf: string;
  buckets: readonly OwnerAgingBucketRow[];
}>;
export const AGING_BUCKET_ORDER: readonly AgingBucket[] = Object.freeze([
  "CURRENT",
  "DAYS_1_30",
  "DAYS_31_60",
  "DAYS_61_90",
  "DAYS_91_PLUS",
]);
export type OwnerCommissionSummary = Readonly<{
  asOf: string;
  expected: readonly MoneyTotal[];
  due: readonly MoneyTotal[];
  paid: readonly MoneyTotal[];
}>;
export type OwnerCommissionItem = Readonly<{
  accrualId: string;
  dealId: string;
  status: CommissionItemStatus;
  currency: string;
  amountMinor: string;
  createdAt: string;
  splits: readonly {
    order: number;
    kind: "BROKER" | "OFFICE";
    amountMinor: string;
  }[];
}>;
export type OwnerPerformanceRow = Readonly<{
  keyId: string;
  currency: string;
  revenueMinor: string;
  costsMinor: string;
  marginMinor: string;
  paymentCount: number;
  expenseCount: number;
}>;
export type OwnerPerformance = Readonly<{
  asOf: string;
  deals: readonly OwnerPerformanceRow[];
  properties: readonly OwnerPerformanceRow[];
}>;

export const AGING_BUCKET_LABELS: Readonly<Record<AgingBucket, string>> =
  Object.freeze({
    CURRENT: "غير مستحق بعد",
    DAYS_1_30: "متأخر ١–٣٠ يومًا",
    DAYS_31_60: "متأخر ٣١–٦٠ يومًا",
    DAYS_61_90: "متأخر ٦١–٩٠ يومًا",
    DAYS_91_PLUS: "متأخر أكثر من ٩٠ يومًا",
  });

export const COMMISSION_STATUS_LABELS: Readonly<
  Record<CommissionItemStatus, string>
> = Object.freeze({
  EXPECTED: "متوقعة",
  CONFIRMED: "مؤكدة",
  DUE: "مستحقة",
  PAID: "مدفوعة",
  CANCELLED: "ملغاة",
});

export function normalizeOwnerCashFlow(value: unknown): OwnerCashFlow {
  const body = record(value, "cash flow");
  assertKeys(body, ["asOf", "cashIn", "cashOut", "netCash"]);
  return {
    asOf: utc(body.asOf),
    cashIn: moneyTotals(body.cashIn),
    cashOut: moneyTotals(body.cashOut),
    netCash: netRows(body.netCash),
  };
}

export function normalizeOwnerPaymentPage(value: unknown): {
  asOf: string;
  items: readonly OwnerPaymentItem[];
  nextCursor?: string;
} {
  const body = record(value, "payments");
  const items = array(body.items).map((item) => {
    const row = record(item, "payment item");
    assertKeys(row, [
      "paymentId",
      "receivableId",
      "invoiceId",
      "dealId",
      "propertyId",
      "currency",
      "amountMinor",
      "recordedAt",
    ]);
    return {
      paymentId: uuid(row.paymentId),
      receivableId: uuid(row.receivableId),
      invoiceId: uuid(row.invoiceId),
      dealId: uuid(row.dealId),
      propertyId: uuid(row.propertyId),
      currency: currencyCode(row.currency),
      amountMinor: money(row.amountMinor),
      recordedAt: utc(row.recordedAt),
    };
  });
  return {
    asOf: utc(body.asOf),
    items,
    ...optionalCursor(body.nextCursor),
  };
}

export function normalizeOwnerExpensePage(value: unknown): {
  asOf: string;
  items: readonly OwnerExpenseItem[];
  nextCursor?: string;
} {
  const body = record(value, "expenses");
  const items = array(body.items).map((item) => {
    const row = record(item, "expense item");
    const optionalKeys = new Set(["campaignReference", "dealId", "propertyId"]);
    assertKeys(
      row,
      [
        "expenseId",
        "category",
        "vendorReference",
        "currency",
        "amountMinor",
        "decidedAt",
      ],
      optionalKeys,
    );
    const output: Record<string, unknown> = {
      expenseId: uuid(row.expenseId),
      category: category(row.category),
      vendorReference: text(row.vendorReference),
      currency: currencyCode(row.currency),
      amountMinor: money(row.amountMinor),
      decidedAt: utc(row.decidedAt),
    };
    if (row.campaignReference !== undefined)
      output.campaignReference = text(row.campaignReference);
    if (row.dealId !== undefined) output.dealId = uuid(row.dealId);
    if (row.propertyId !== undefined) output.propertyId = uuid(row.propertyId);
    return output as OwnerExpenseItem;
  });
  return {
    asOf: utc(body.asOf),
    items,
    ...optionalCursor(body.nextCursor),
  };
}

export function normalizeOwnerAgingSummary(value: unknown): {
  asOf: string;
  buckets: readonly OwnerAgingBucketRow[];
} {
  const body = record(value, "aging summary");
  const buckets = array(body.buckets).map((item) => {
    const row = record(item, "aging bucket");
    assertKeys(row, ["bucket", "currency", "count", "outstandingMinor"]);
    return {
      bucket: bucket(row.bucket),
      currency: currencyCode(row.currency),
      count: nonNegativeInt(row.count),
      outstandingMinor: money(row.outstandingMinor),
    };
  });
  return { asOf: utc(body.asOf), buckets };
}

export function normalizeOwnerAgingItemPage(value: unknown): {
  asOf: string;
  items: readonly OwnerAgingItem[];
  nextCursor?: string;
} {
  const body = record(value, "aging items");
  const items = array(body.items).map((item) => {
    const row = record(item, "aging item");
    assertKeys(row, [
      "receivableId",
      "invoiceId",
      "dealId",
      "currency",
      "originalAmountMinor",
      "outstandingMinor",
      "status",
      "issuedAt",
      "dueAt",
      "daysPastDue",
      "bucket",
    ]);
    if (row.status !== "OPEN" && row.status !== "PARTIALLY_PAID")
      throw new TypeError("Invalid aging status");
    const status = row.status as "OPEN" | "PARTIALLY_PAID";
    return {
      receivableId: uuid(row.receivableId),
      invoiceId: uuid(row.invoiceId),
      dealId: uuid(row.dealId),
      currency: currencyCode(row.currency),
      originalAmountMinor: money(row.originalAmountMinor),
      outstandingMinor: money(row.outstandingMinor),
      status,
      issuedAt: utc(row.issuedAt),
      dueAt: utc(row.dueAt),
      daysPastDue: nonNegativeInt(row.daysPastDue),
      bucket: bucket(row.bucket),
    };
  });
  return {
    asOf: utc(body.asOf),
    items,
    ...optionalCursor(body.nextCursor),
  };
}

export function normalizeOwnerCommissionSummary(
  value: unknown,
): OwnerCommissionSummary {
  const body = record(value, "commission summary");
  assertKeys(body, ["asOf", "expected", "due", "paid"]);
  return {
    asOf: utc(body.asOf),
    expected: moneyTotals(body.expected),
    due: moneyTotals(body.due),
    paid: moneyTotals(body.paid),
  };
}

export function normalizeOwnerCommissionItemPage(value: unknown): {
  asOf: string;
  items: readonly OwnerCommissionItem[];
  nextCursor?: string;
} {
  const body = record(value, "commission items");
  const items = array(body.items).map((item) => {
    const row = record(item, "commission item");
    assertKeys(row, [
      "accrualId",
      "dealId",
      "status",
      "currency",
      "amountMinor",
      "createdAt",
      "splits",
    ]);
    if (!COMMISSION_ITEM_STATUSES.includes(row.status as CommissionItemStatus))
      throw new TypeError("Invalid commission status");
    return {
      accrualId: uuid(row.accrualId),
      dealId: uuid(row.dealId),
      status: row.status as CommissionItemStatus,
      currency: currencyCode(row.currency),
      amountMinor: money(row.amountMinor),
      createdAt: utc(row.createdAt),
      splits: array(row.splits).map(
        (split): OwnerCommissionItem["splits"][number] => {
          const splitRow = record(split, "commission split");
          assertKeys(splitRow, ["order", "kind", "amountMinor"]);
          if (splitRow.kind !== "BROKER" && splitRow.kind !== "OFFICE")
            throw new TypeError("Invalid commission split kind");
          return {
            order: nonNegativeInt(splitRow.order),
            kind: splitRow.kind,
            amountMinor: money(splitRow.amountMinor),
          };
        },
      ),
    };
  });
  return {
    asOf: utc(body.asOf),
    items,
    ...optionalCursor(body.nextCursor),
  };
}

export function normalizeOwnerPerformance(value: unknown): OwnerPerformance {
  const body = record(value, "performance");
  assertKeys(body, ["asOf", "deals", "properties"]);
  const rows = (value_: unknown) =>
    array(value_).map((item) => {
      const row = record(item, "performance row");
      assertKeys(row, [
        "keyId",
        "currency",
        "revenueMinor",
        "costsMinor",
        "marginMinor",
        "paymentCount",
        "expenseCount",
      ]);
      return {
        keyId: uuid(row.keyId),
        currency: currencyCode(row.currency),
        revenueMinor: signedMoney(row.revenueMinor),
        costsMinor: signedMoney(row.costsMinor),
        marginMinor: signedMoney(row.marginMinor),
        paymentCount: nonNegativeInt(row.paymentCount),
        expenseCount: nonNegativeInt(row.expenseCount),
      };
    });
  return {
    asOf: utc(body.asOf),
    deals: rows(body.deals),
    properties: rows(body.properties),
  };
}

function record(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    throw new TypeError(`Expected ${label} object`);
  return value as Record<string, unknown>;
}
function array(value: unknown): readonly unknown[] {
  if (!Array.isArray(value)) throw new TypeError("Expected array");
  return value;
}
function assertKeys(
  value: Record<string, unknown>,
  keys: readonly string[],
  optionalKeys: ReadonlySet<string> = new Set(),
): void {
  const allowed = new Set([...keys, ...optionalKeys]);
  if (Object.keys(value).some((key) => !allowed.has(key)))
    throw new TypeError("Unknown report field");
  for (const key of keys)
    if (!(key in value)) throw new TypeError(`Missing report field ${key}`);
}
function uuid(value: unknown): string {
  if (typeof value !== "string" || !UUID.test(value))
    throw new TypeError("Invalid UUID");
  return value;
}
function utc(value: unknown): string {
  if (
    typeof value !== "string" ||
    !UTC.test(value) ||
    Number.isNaN(Date.parse(value))
  )
    throw new TypeError("Invalid UTC timestamp");
  return value;
}
function money(value: unknown): string {
  if (typeof value !== "string" || !MONEY.test(value))
    throw new TypeError("Invalid money");
  return value;
}
function signedMoney(value: unknown): string {
  if (typeof value !== "string" || !SIGNED_MONEY.test(value))
    throw new TypeError("Invalid signed money");
  return value;
}
function currencyCode(value: unknown): string {
  if (typeof value !== "string" || !CURRENCY.test(value))
    throw new TypeError("Invalid currency");
  return value;
}
function text(value: unknown): string {
  if (typeof value !== "string" || value.trim().length === 0)
    throw new TypeError("Invalid text");
  return value;
}
function category(value: unknown): string {
  if (typeof value !== "string" || !EXPENSE_CATEGORIES.includes(value as never))
    throw new TypeError("Invalid expense category");
  return value;
}
function bucket(value: unknown): AgingBucket {
  if (typeof value !== "string" || !AGING_BUCKETS.includes(value as never))
    throw new TypeError("Invalid aging bucket");
  return value as AgingBucket;
}
function nonNegativeInt(value: unknown): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0)
    throw new TypeError("Invalid count");
  return value;
}
function moneyTotals(value: unknown): readonly MoneyTotal[] {
  return array(value).map((item) => {
    const row = record(item, "money total");
    assertKeys(row, ["currency", "count", "amountMinor"]);
    return {
      currency: currencyCode(row.currency),
      count: nonNegativeInt(row.count),
      amountMinor: money(row.amountMinor),
    };
  });
}
function netRows(value: unknown): readonly NetCashRow[] {
  return array(value).map((item) => {
    const row = record(item, "net cash row");
    assertKeys(row, ["currency", "amountMinor"]);
    return {
      currency: currencyCode(row.currency),
      amountMinor: signedMoney(row.amountMinor),
    };
  });
}
function optionalCursor(value: unknown): { nextCursor?: string } {
  if (value === undefined) return {};
  if (typeof value !== "string" || !/^[A-Za-z0-9_-]+$/.test(value))
    throw new TypeError("Invalid cursor");
  return { nextCursor: value };
}
