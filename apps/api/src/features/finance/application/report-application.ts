import { classifyReceivableAging } from "../domain/receivable.js";
import type { AgingBucket } from "../domain/receivable.js";
import { ReceivableValidationError } from "../domain/receivable.js";
import type {
  CashFlowSummary,
  MoneyTotalRow,
  NetCashRow,
  ReportAgingItemRow,
  ReportAgingQuery,
  ReportAgingSummaryRow,
  ReportCommissionItemRow,
  ReportCommissionQuery,
  ReportCommissionSummaryRow,
  ReportCursor,
  ReportDimension,
  ReportExpenseRow,
  ReportListQuery,
  ReportMembershipReader,
  ReportPaymentRow,
  ReportPerformanceRow,
  ReportQueryWindow,
  ReportRepository,
} from "./report-repository.js";

/**
 * EF-235 / FIN-05 owner finance dashboard application.
 *
 * Read-only, Owner-only composition of the existing EF-231/232/233/234
 * finance state. No mutable finance state is introduced here.
 */

export type ReportActor = Readonly<{ verified: boolean }>;

export type ReportBaseCommand = Readonly<{
  actor: ReportActor;
  userId: string;
  organizationId: string;
}>;

export type CashFlowCommand = ReportBaseCommand &
  Readonly<{ window: ReportQueryWindow }>;

export type ReportPageCommand = ReportBaseCommand &
  Readonly<{
    window: ReportQueryWindow;
    dimension: ReportDimension;
    cursor?: string;
    limit?: number;
  }>;

export type AgingSummaryCommand = ReportBaseCommand;

export type AgingItemsCommand = ReportBaseCommand &
  Readonly<{
    bucket: AgingBucket;
    cursor?: string;
    limit?: number;
  }>;

export type CommissionSummaryCommand = ReportBaseCommand;

export type CommissionItemsCommand = ReportBaseCommand &
  Readonly<{
    status: "EXPECTED" | "CONFIRMED" | "DUE" | "PAID" | "CANCELLED";
    cursor?: string;
    limit?: number;
  }>;

export type PerformanceCommand = ReportBaseCommand &
  Readonly<{ window: ReportQueryWindow }>;

export type ReportAccessDenied = Readonly<{ kind: "access-denied" }>;

export type CashFlowResult = Readonly<{
  asOf: Date;
  cashIn: readonly MoneyTotalRow[];
  cashOut: readonly MoneyTotalRow[];
  netCash: readonly NetCashRow[];
}>;

export type ReportPaymentPage = Readonly<{
  asOf: Date;
  items: readonly ReportPaymentRow[];
  nextCursor?: string;
}>;

export type ReportExpensePage = Readonly<{
  asOf: Date;
  items: readonly ReportExpenseRow[];
  nextCursor?: string;
}>;

export type AgingSummaryResult = Readonly<{
  asOf: Date;
  buckets: readonly ReportAgingSummaryRow[];
}>;

export type AgingItemsResult = Readonly<{
  asOf: Date;
  items: readonly ReportAgingItemRow[];
  nextCursor?: string;
}>;

export type CommissionTotalRow = Readonly<{
  currency: string;
  count: number;
  amountMinor: bigint;
}>;

export type CommissionSummaryResult = Readonly<{
  asOf: Date;
  expected: readonly CommissionTotalRow[];
  due: readonly CommissionTotalRow[];
  paid: readonly CommissionTotalRow[];
}>;

export type CommissionItemsResult = Readonly<{
  asOf: Date;
  items: readonly ReportCommissionItemRow[];
  nextCursor?: string;
}>;

export type PerformanceResult = Readonly<{
  asOf: Date;
  deals: readonly ReportPerformanceRow[];
  properties: readonly ReportPerformanceRow[];
}>;

export const AGING_BUCKET_ORDER: readonly AgingBucket[] = [
  "CURRENT",
  "DAYS_1_30",
  "DAYS_31_60",
  "DAYS_61_90",
  "DAYS_91_PLUS",
];

const COMMISSION_ITEM_STATUSES = [
  "EXPECTED",
  "CONFIRMED",
  "DUE",
  "PAID",
  "CANCELLED",
] as const;

const CURSOR_DATE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_PAGE_LIMIT = 100;
const DEFAULT_PAGE_LIMIT = 50;

export function prepareReportWindow(
  window: ReportQueryWindow,
): ReportQueryWindow {
  const from = cloneInstant(window.from, "window start");
  const to = cloneInstant(window.to, "window end");
  if (from && to && from.getTime() > to.getTime())
    throw new ReceivableValidationError("Invalid report window");
  return { ...(from ? { from } : {}), ...(to ? { to } : {}) };
}

export function prepareReportPage(input: { cursor?: string; limit?: number }): {
  after?: ReportCursor;
  limit: number;
} {
  const limit = input.limit ?? DEFAULT_PAGE_LIMIT;
  if (
    !Number.isInteger(limit) ||
    limit < 1 ||
    limit > MAX_PAGE_LIMIT ||
    !Number.isSafeInteger(limit)
  )
    throw new ReceivableValidationError("Invalid report page limit");
  return {
    limit: limit + 1,
    ...(input.cursor === undefined
      ? {}
      : { after: decodeReportCursor(input.cursor) }),
  };
}

export function decodeReportCursor(value: string): ReportCursor {
  if (
    value.length === 0 ||
    value.length > 512 ||
    value.length % 4 === 1 ||
    !/^[A-Za-z0-9_-]+$/.test(value)
  )
    throw new ReceivableValidationError("Invalid report cursor");
  const bytes = Buffer.from(value, "base64url");
  if (bytes.toString("base64url") !== value)
    throw new ReceivableValidationError("Invalid report cursor");
  let parsed: unknown;
  try {
    parsed = JSON.parse(bytes.toString("utf8"));
  } catch (error) {
    if (error instanceof SyntaxError)
      throw new ReceivableValidationError("Invalid report cursor");
    throw error;
  }
  if (!isRecord(parsed))
    throw new ReceivableValidationError("Invalid report cursor");
  const keys = Object.keys(parsed);
  const at = parsed.at;
  if (
    keys.length !== 3 ||
    !keys.every((key) => ["v", "at", "id"].includes(key)) ||
    parsed.v !== 1 ||
    typeof at !== "string" ||
    !CURSOR_DATE.test(at) ||
    !isCanonicalUtcInstant(at) ||
    typeof parsed.id !== "string" ||
    !UUID.test(parsed.id) ||
    Buffer.from(JSON.stringify(parsed)).toString("base64url") !== value
  )
    throw new ReceivableValidationError("Invalid report cursor");
  return { at: new Date(at), id: parsed.id };
}

export function encodeReportCursor(cursor: ReportCursor): string {
  return Buffer.from(
    JSON.stringify({
      v: 1,
      at: cursor.at.toISOString(),
      id: cursor.id,
    }),
  ).toString("base64url");
}

export function prepareReportDimension(
  dimension: ReportDimension | undefined,
): ReportDimension {
  if (dimension === undefined) return {};
  const keys = Object.keys(dimension);
  if (keys.length > 1)
    throw new ReceivableValidationError(
      "Report dimension accepts only one of dealId or propertyId",
    );
  if (dimension.dealId !== undefined && !UUID.test(dimension.dealId))
    throw new ReceivableValidationError("Invalid report deal dimension");
  if (dimension.propertyId !== undefined && !UUID.test(dimension.propertyId))
    throw new ReceivableValidationError("Invalid report property dimension");
  return dimension;
}

export function assembleCashFlow(
  summary: CashFlowSummary,
  asOf: Date,
): CashFlowResult {
  const currencies = [
    ...new Set(
      [...summary.cashIn, ...summary.cashOut].map((row) => row.currency),
    ),
  ].sort();
  const netCash = currencies.map((currency) => {
    const inflow = summary.cashIn.find(
      (row) => row.currency === currency,
    )?.amountMinor;
    const outflow = summary.cashOut.find(
      (row) => row.currency === currency,
    )?.amountMinor;
    return {
      currency,
      amountMinor: (inflow ?? 0n) - (outflow ?? 0n),
    };
  });
  return {
    asOf,
    cashIn: sortTotals(summary.cashIn),
    cashOut: sortTotals(summary.cashOut),
    netCash,
  };
}

export function assemblePerformance(
  deals: readonly ReportPerformanceRow[],
  properties: readonly ReportPerformanceRow[],
  asOf: Date,
): PerformanceResult {
  return {
    asOf,
    deals: deals.map(mergePerformanceRow),
    properties: properties.map(mergePerformanceRow),
  };
}

export function assembleAgingSummary(
  rows: readonly ReportAgingSummaryRow[],
  asOf: Date,
): AgingSummaryResult {
  return {
    asOf,
    buckets: [...rows].sort(
      (left, right) =>
        AGING_BUCKET_ORDER.indexOf(left.bucket) -
          AGING_BUCKET_ORDER.indexOf(right.bucket) ||
        left.currency.localeCompare(right.currency),
    ),
  };
}

export function assembleCommissionSummary(
  rows: readonly ReportCommissionSummaryRow[],
  asOf: Date,
): CommissionSummaryResult {
  const pick = (status: "EXPECTED" | "DUE" | "PAID") =>
    rows
      .filter((row) => row.status === status)
      .map(({ currency, count, amountMinor }) => ({
        currency,
        count,
        amountMinor,
      }))
      .sort((left, right) => left.currency.localeCompare(right.currency));
  return {
    asOf,
    expected: pick("EXPECTED"),
    due: pick("DUE"),
    paid: pick("PAID"),
  };
}

export class ReportApplication {
  constructor(
    private readonly repository: ReportRepository,
    private readonly membershipReader: ReportMembershipReader,
  ) {}

  async getCashFlow(
    input: CashFlowCommand,
  ): Promise<CashFlowResult | ReportAccessDenied> {
    const access = await this.authorizeOwner(input);
    if (access.kind !== "authorized") return access.result;
    const asOf = new Date();
    const window = prepareReportWindow(input.window);
    return assembleCashFlow(
      await this.repository.getCashFlowSummary(input.organizationId, window),
      asOf,
    );
  }

  async listCashInflowItems(
    input: ReportPageCommand,
  ): Promise<ReportPaymentPage | ReportAccessDenied> {
    const access = await this.authorizeOwner(input);
    if (access.kind !== "authorized") return access.result;
    return this.paymentPage(input, new Date());
  }

  async listCashOutflowItems(
    input: ReportPageCommand,
  ): Promise<ReportExpensePage | ReportAccessDenied> {
    const access = await this.authorizeOwner(input);
    if (access.kind !== "authorized") return access.result;
    return this.expensePage(input, new Date());
  }

  async getAgingSummary(
    input: AgingSummaryCommand,
  ): Promise<AgingSummaryResult | ReportAccessDenied> {
    const access = await this.authorizeOwner(input);
    if (access.kind !== "authorized") return access.result;
    const asOf = new Date();
    return assembleAgingSummary(
      await this.repository.getAgingSummary(input.organizationId, asOf),
      asOf,
    );
  }

  async listAgingItems(
    input: AgingItemsCommand,
  ): Promise<AgingItemsResult | ReportAccessDenied> {
    const access = await this.authorizeOwner(input);
    if (access.kind !== "authorized") return access.result;
    const asOf = new Date();
    const page = prepareReportPage(input);
    const rows = await this.repository.listAgingItemRows({
      organizationId: input.organizationId,
      asOf,
      bucket: input.bucket,
      ...(page.after ? { after: page.after } : {}),
      limit: page.limit,
    } satisfies ReportAgingQuery);
    return this.pageResult(rows, asOf, page.limit, (row) => ({
      at: row.dueAt,
      id: row.receivableId,
    }));
  }

  async getCommissionSummary(
    input: CommissionSummaryCommand,
  ): Promise<CommissionSummaryResult | ReportAccessDenied> {
    const access = await this.authorizeOwner(input);
    if (access.kind !== "authorized") return access.result;
    return assembleCommissionSummary(
      await this.repository.getCommissionSummary(input.organizationId),
      new Date(),
    );
  }

  async listCommissionItems(
    input: CommissionItemsCommand,
  ): Promise<CommissionItemsResult | ReportAccessDenied> {
    const access = await this.authorizeOwner(input);
    if (access.kind !== "authorized") return access.result;
    if (!COMMISSION_ITEM_STATUSES.includes(input.status))
      throw new ReceivableValidationError("Invalid commission report status");
    const asOf = new Date();
    const page = prepareReportPage(input);
    const rows = await this.repository.listCommissionItemRows({
      organizationId: input.organizationId,
      status: input.status,
      ...(page.after ? { after: page.after } : {}),
      limit: page.limit,
    } satisfies ReportCommissionQuery);
    return this.pageResult(rows, asOf, page.limit, (row) => ({
      at: row.createdAt,
      id: row.accrualId,
    }));
  }

  async getPerformance(
    input: PerformanceCommand,
  ): Promise<PerformanceResult | ReportAccessDenied> {
    const access = await this.authorizeOwner(input);
    if (access.kind !== "authorized") return access.result;
    const asOf = new Date();
    const window = prepareReportWindow(input.window);
    const [deals, properties] = await Promise.all([
      this.repository.getDealPerformance(input.organizationId, window),
      this.repository.getPropertyPerformance(input.organizationId, window),
    ]);
    return assemblePerformance(deals, properties, asOf);
  }

  private async paymentPage(
    input: ReportPageCommand,
    asOf: Date,
  ): Promise<ReportPaymentPage> {
    const page = prepareReportPage(input);
    const rows = await this.repository.listPaymentRows({
      organizationId: input.organizationId,
      window: prepareReportWindow(input.window),
      dimension: prepareReportDimension(input.dimension),
      ...(page.after ? { after: page.after } : {}),
      limit: page.limit,
    } satisfies ReportListQuery);
    return this.pageResult(rows, asOf, page.limit, (row) => ({
      at: row.recordedAt,
      id: row.paymentId,
    }));
  }

  private async expensePage(
    input: ReportPageCommand,
    asOf: Date,
  ): Promise<ReportExpensePage> {
    const page = prepareReportPage(input);
    const rows = await this.repository.listExpenseRows({
      organizationId: input.organizationId,
      window: prepareReportWindow(input.window),
      dimension: prepareReportDimension(input.dimension),
      ...(page.after ? { after: page.after } : {}),
      limit: page.limit,
    } satisfies ReportListQuery);
    return this.pageResult(rows, asOf, page.limit, (row) => ({
      at: row.decidedAt,
      id: row.expenseId,
    }));
  }

  private pageResult<Row>(
    rows: readonly Row[],
    asOf: Date,
    limitWithSentinel: number,
    cursorOf: (row: Row) => ReportCursor,
  ): { asOf: Date; items: readonly Row[]; nextCursor?: string } {
    const returned = rows.slice(0, limitWithSentinel - 1);
    const hasMore = rows.length >= limitWithSentinel;
    return {
      asOf,
      items: returned,
      ...(hasMore && returned.length > 0
        ? { nextCursor: encodeReportCursor(cursorOf(returned.at(-1)!)) }
        : {}),
    };
  }

  private async authorizeOwner(
    input: ReportBaseCommand,
  ): Promise<
    { kind: "authorized" } | { kind: "denied"; result: ReportAccessDenied }
  > {
    if (!input.actor.verified || input.userId.trim().length === 0)
      return { kind: "denied", result: { kind: "access-denied" } };
    const membership = await this.membershipReader.findMembership(
      input.organizationId,
      input.userId,
    );
    if (
      !membership ||
      membership.organizationId !== input.organizationId ||
      membership.status !== "ACTIVE" ||
      membership.role !== "OWNER"
    )
      return { kind: "denied", result: { kind: "access-denied" } };
    return { kind: "authorized" };
  }
}

function sortTotals(rows: readonly MoneyTotalRow[]): readonly MoneyTotalRow[] {
  return [...rows].sort((left, right) =>
    left.currency.localeCompare(right.currency),
  );
}

function mergePerformanceRow(row: ReportPerformanceRow): ReportPerformanceRow {
  return Object.freeze({
    ...row,
    marginMinor: row.revenueMinor - row.costsMinor,
  });
}

function cloneInstant(
  value: Date | undefined,
  field: string,
): Date | undefined {
  if (value === undefined) return undefined;
  if (!(value instanceof Date) || !Number.isFinite(value.getTime()))
    throw new ReceivableValidationError(`Invalid ${field}`);
  return new Date(value.getTime());
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isCanonicalUtcInstant(value: string): boolean {
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString() === value;
}

export { classifyReceivableAging };
