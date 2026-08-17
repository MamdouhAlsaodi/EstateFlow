import {
  classifyReceivableAging,
  ReceivableValidationError,
  type AgingBucket,
} from "../domain/receivable.js";
import type { Receivable } from "../domain/receivable.js";
import type {
  OutstandingReceivablesQuery,
  ReceivableAgingCursor,
} from "./receivable-repository.js";

export type ReceivableAgingCommand = Readonly<{
  actor: Readonly<{ verified: boolean }>;
  userId: string;
  organizationId: string;
  asOf: Date;
  cursor?: string;
  limit?: number;
}>;

export type ReceivableAgingItem = Readonly<{
  receivableId: string;
  invoiceId: string;
  dealId: string;
  currency: string;
  originalAmountMinor: bigint;
  outstandingMinor: bigint;
  status: Receivable["status"];
  issuedAt: Date;
  dueAt: Date;
  daysPastDue: number;
  bucket: AgingBucket;
}>;

export type ReceivableAgingResult = Readonly<{
  asOf: Date;
  items: readonly ReceivableAgingItem[];
  nextCursor?: string;
}>;

export type PreparedReceivableAging = Readonly<{
  asOf: Date;
  limit: number;
  query: OutstandingReceivablesQuery;
}>;

const AGING_CURSOR_DATE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function prepareReceivableAging(
  input: ReceivableAgingCommand,
): PreparedReceivableAging {
  if (!(input.asOf instanceof Date) || !Number.isFinite(input.asOf.getTime()))
    throw new ReceivableValidationError("Invalid as of time");
  const asOf = new Date(input.asOf.getTime());
  const limit = input.limit ?? 50;
  if (!Number.isInteger(limit) || limit < 1 || limit > 100)
    throw new ReceivableValidationError("Invalid aging limit");
  return {
    asOf,
    limit,
    query: {
      organizationId: input.organizationId,
      after: decodeAgingCursor(input.cursor),
      limit: limit + 1,
    },
  };
}

export function assembleReceivableAging(
  rows: readonly Receivable[],
  asOf: Date,
  limit: number,
): ReceivableAgingResult {
  const items = rows
    .map((receivable) => agingItem(receivable, asOf))
    .filter((item): item is ReceivableAgingItem => item !== null);
  const returnedItems = items.slice(0, limit);
  return {
    asOf,
    items: returnedItems,
    ...(items.length > limit && returnedItems.length > 0
      ? {
          nextCursor: createAgingCursor(returnedItems.at(-1)!),
        }
      : {}),
  };
}

function decodeAgingCursor(
  value: string | undefined,
): ReceivableAgingCursor | undefined {
  if (value === undefined) return undefined;
  if (
    value.length === 0 ||
    value.length > 512 ||
    value.length % 4 === 1 ||
    !/^[A-Za-z0-9_-]+$/.test(value)
  )
    throw new ReceivableValidationError("Invalid aging cursor");
  const bytes = Buffer.from(value, "base64url");
  if (bytes.toString("base64url") !== value)
    throw new ReceivableValidationError("Invalid aging cursor");
  let parsed: unknown;
  try {
    parsed = JSON.parse(bytes.toString("utf8"));
  } catch (error) {
    if (error instanceof SyntaxError)
      throw new ReceivableValidationError("Invalid aging cursor");
    throw error;
  }
  if (!isRecord(parsed))
    throw new ReceivableValidationError("Invalid aging cursor");
  const keys = Object.keys(parsed);
  const dueAt = parsed.dueAt;
  if (
    keys.length !== 3 ||
    !keys.every((key) => ["v", "dueAt", "receivableId"].includes(key)) ||
    parsed.v !== 1 ||
    typeof dueAt !== "string" ||
    !AGING_CURSOR_DATE.test(dueAt) ||
    !isCanonicalUtcInstant(dueAt) ||
    typeof parsed.receivableId !== "string" ||
    !UUID.test(parsed.receivableId) ||
    Buffer.from(JSON.stringify(parsed)).toString("base64url") !== value
  )
    throw new ReceivableValidationError("Invalid aging cursor");
  return { dueAt: new Date(dueAt), receivableId: parsed.receivableId };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isCanonicalUtcInstant(value: string): boolean {
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString() === value;
}

function agingItem(
  receivable: Receivable,
  asOf: Date,
): ReceivableAgingItem | null {
  const aging = classifyReceivableAging(receivable, asOf);
  if (!aging) return null;
  return {
    receivableId: receivable.id,
    invoiceId: receivable.invoiceId,
    dealId: receivable.dealId,
    currency: receivable.originalMoney.currency,
    originalAmountMinor: receivable.originalMoney.amountMinor,
    outstandingMinor: receivable.outstandingMinor,
    status: receivable.status,
    issuedAt: receivable.issuedAt,
    dueAt: receivable.dueAt,
    ...aging,
  };
}

function createAgingCursor(agingItem: ReceivableAgingItem): string {
  return Buffer.from(
    JSON.stringify({
      v: 1,
      dueAt: agingItem.dueAt.toISOString(),
      receivableId: agingItem.receivableId,
    }),
  ).toString("base64url");
}
