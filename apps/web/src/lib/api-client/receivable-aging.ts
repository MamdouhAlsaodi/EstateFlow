export type ReceivableAgingBucket =
  "CURRENT" | "DAYS_1_30" | "DAYS_31_60" | "DAYS_61_90" | "DAYS_91_PLUS";
export type ReceivableAgingStatus = "OPEN" | "PARTIALLY_PAID";

export type ReceivableAgingItem = Readonly<{
  receivableId: string;
  invoiceId: string;
  dealId: string;
  currency: string;
  originalAmountMinor: string;
  outstandingMinor: string;
  status: ReceivableAgingStatus;
  issuedAt: string;
  dueAt: string;
  daysPastDue: number;
  bucket: ReceivableAgingBucket;
}>;

export type ReceivableAgingResponse = Readonly<{
  asOf: string;
  items: readonly ReceivableAgingItem[];
  nextCursor?: string;
}>;

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const MONEY = /^[1-9]\d*$/;
const CURRENCY = /^[A-Z]{3}$/;
const BUCKETS: readonly ReceivableAgingBucket[] = [
  "CURRENT",
  "DAYS_1_30",
  "DAYS_31_60",
  "DAYS_61_90",
  "DAYS_91_PLUS",
];
const STATUSES: readonly ReceivableAgingStatus[] = ["OPEN", "PARTIALLY_PAID"];

export function normalizeReceivableAging(
  value: unknown,
): ReceivableAgingResponse {
  const response = record(value);
  assertKeys(response, ["asOf", "items", "nextCursor"], ["asOf", "items"]);
  assertUtc(response.asOf);
  if (!Array.isArray(response.items))
    throw new TypeError("Invalid aging items");
  const normalized = response.items.map(normalizeAgingItem);
  if (
    new Set(normalized.map((item) => item.receivableId)).size !==
    normalized.length
  )
    throw new TypeError("Duplicate aging receivable");
  if (response.nextCursor !== undefined) assertCursor(response.nextCursor);
  return {
    asOf: response.asOf,
    items: normalized,
    ...(response.nextCursor === undefined
      ? {}
      : { nextCursor: response.nextCursor }),
  };
}

function normalizeAgingItem(value: unknown): ReceivableAgingItem {
  const item = record(value);
  const fields = [
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
  ];
  assertKeys(item, fields, fields);
  assertUuid(item.receivableId);
  assertUuid(item.invoiceId);
  assertUuid(item.dealId);
  if (typeof item.currency !== "string" || !CURRENCY.test(item.currency))
    throw new TypeError("Invalid aging currency");
  assertMoney(item.originalAmountMinor);
  assertMoney(item.outstandingMinor);
  if (
    typeof item.status !== "string" ||
    !STATUSES.includes(item.status as ReceivableAgingStatus)
  )
    throw new TypeError("Invalid aging status");
  assertUtc(item.issuedAt);
  assertUtc(item.dueAt);
  if (
    typeof item.daysPastDue !== "number" ||
    !Number.isSafeInteger(item.daysPastDue) ||
    item.daysPastDue < 0
  )
    throw new TypeError("Invalid daysPastDue");
  if (
    typeof item.bucket !== "string" ||
    !BUCKETS.includes(item.bucket as ReceivableAgingBucket)
  )
    throw new TypeError("Invalid aging bucket");
  return item as ReceivableAgingItem;
}

function record(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    throw new TypeError("Expected object");
  return value as Record<string, unknown>;
}
function assertKeys(
  value: Record<string, unknown>,
  keys: readonly string[],
  required: readonly string[],
): void {
  const allowed = new Set(keys);
  if (Object.keys(value).some((key) => !allowed.has(key)))
    throw new TypeError("Unknown aging field");
  if (required.some((key) => !(key in value)))
    throw new TypeError("Missing aging field");
}
function assertUuid(value: unknown): asserts value is string {
  if (typeof value !== "string" || !UUID.test(value))
    throw new TypeError("Invalid UUID");
}
function assertUtc(value: unknown): asserts value is string {
  if (
    typeof value !== "string" ||
    !UTC.test(value) ||
    Number.isNaN(Date.parse(value))
  )
    throw new TypeError("Invalid UTC timestamp");
}
function assertMoney(value: unknown): asserts value is string {
  if (typeof value !== "string" || !MONEY.test(value))
    throw new TypeError("Invalid money");
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
