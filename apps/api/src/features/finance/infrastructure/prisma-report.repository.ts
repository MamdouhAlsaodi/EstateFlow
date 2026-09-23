import { Prisma, type PrismaClient } from "@prisma/client";
import type { AgingBucket } from "../domain/receivable.js";
import type {
  CashFlowSummary,
  CampaignPerformanceQuery,
  MoneyTotalRow,
  ReportAgingItemRow,
  ReportAgingQuery,
  ReportAgingSummaryRow,
  ReportCommissionItemRow,
  ReportCommissionQuery,
  ReportCommissionSplitRow,
  ReportCommissionSummaryRow,
  ReportCursor,
  ReportDimension,
  ReportExpenseRow,
  ReportListQuery,
  ReportPaymentRow,
  ReportPerformanceRow,
  ReportQueryWindow,
  ReportRepository,
} from "../application/report-repository.js";

/**
 * Read-only EF-235 reporting queries over the existing EF-231..EF-234 tables.
 * Every query is organization-scoped; money sums never cross currencies.
 *
 * The aging bucket boundaries below are the exact SQL rendering of the EF-233
 * domain classifier `classifyReceivableAging`: daysPastDue is
 * ceil((asOf - dueAt) / 86400000) when dueAt < asOf and zero otherwise, so
 * the DAYS_1_30 bucket is dueAt >= asOf - 30d AND dueAt < asOf, and so on.
 */

const DAY_MS = 86_400_000;
const PAGE_LIMIT_MAX = 101;

type MoneyRow = { currency: string; count: number; total: string };
type BucketMoneyRow = MoneyRow & { bucket: AgingBucket };
type StatusMoneyRow = MoneyRow & { status: string };
type DimensionMoneyRow = {
  keyId: string;
  currency: string;
  count: number;
  total: string;
};
type PaymentSqlRow = {
  paymentId: string;
  receivableId: string;
  invoiceId: string;
  dealId: string;
  propertyId: string;
  currency: string;
  amountMinor: bigint;
  recordedAt: Date;
};
type ExpenseSqlRow = {
  expenseId: string;
  category: string;
  vendorReference: string;
  currency: string;
  amountMinor: bigint;
  decidedAt: Date;
  campaignReference: string | null;
  campaignId: string | null;
  dealId: string | null;
  propertyId: string | null;
};
type ReceivableSqlRow = {
  receivableId: string;
  invoiceId: string;
  dealId: string;
  currency: string;
  originalAmountMinor: bigint;
  outstandingMinor: bigint;
  status: string;
  issuedAt: Date;
  dueAt: Date;
};
type AccrualSqlRow = {
  accrualId: string;
  dealId: string;
  status: string;
  currency: string;
  amountMinor: bigint;
  createdAt: Date;
};
type SplitSqlRow = {
  accrualId: string;
  order: number;
  kind: string;
  amountMinor: bigint;
};

/** Literal column/table fragments only; never user input. */
function fragment(sql: Prisma.Sql): Prisma.Sql {
  return sql;
}

export class PrismaReportRepository implements ReportRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async getCashFlowSummary(
    organizationId: string,
    window: ReportQueryWindow,
  ): Promise<CashFlowSummary> {
    const cashIn = await this.prisma.$queryRaw<MoneyRow[]>`
        SELECT "currency", COUNT(*)::int AS "count", SUM("amountMinor")::text AS "total"
        FROM "PaymentRecord"
        WHERE "organizationId" = ${organizationId}::uuid
          ${fragment(windowRange('"recordedAt"', window))}
        GROUP BY "currency"`;
    const cashOut = await this.prisma.$queryRaw<MoneyRow[]>`
        SELECT "currency", COUNT(*)::int AS "count", SUM("amountMinor")::text AS "total"
        FROM "Expense"
        WHERE "organizationId" = ${organizationId}::uuid
          AND "status" = 'APPROVED'
          ${fragment(windowRange('"decidedAt"', window))}
        GROUP BY "currency"`;
    return {
      cashIn: moneyRows(cashIn),
      cashOut: moneyRows(cashOut),
      netCash: [],
    };
  }

  async listPaymentRows(
    query: ReportListQuery,
  ): Promise<readonly ReportPaymentRow[]> {
    assertPageLimit(query.limit);
    const rows = await this.prisma.$queryRaw<PaymentSqlRow[]>`
        SELECT p."id" AS "paymentId", p."receivableId", r."invoiceId", r."dealId",
          d."propertyId", p."currency", p."amountMinor", p."recordedAt"
        FROM "PaymentRecord" p
        JOIN "Receivable" r
          ON r."organizationId" = p."organizationId" AND r."id" = p."receivableId"
        JOIN "Deal" d
          ON d."organizationId" = r."organizationId" AND d."id" = r."dealId"
        WHERE p."organizationId" = ${query.organizationId}::uuid
          ${fragment(dealDimensionFilter("d", query.dimension))}
          ${fragment(windowRange('p."recordedAt"', query.window))}
          ${fragment(descCursor('p."recordedAt"', 'p."id"', query.after))}
        ORDER BY p."recordedAt" DESC, p."id" DESC
        LIMIT ${query.limit}`;
    return Object.freeze(
      rows.map((row) =>
        Object.freeze({
          paymentId: row.paymentId,
          receivableId: row.receivableId,
          invoiceId: row.invoiceId,
          dealId: row.dealId,
          propertyId: row.propertyId,
          currency: row.currency,
          amountMinor: row.amountMinor,
          recordedAt: new Date(row.recordedAt.getTime()),
        }),
      ),
    );
  }

  async listExpenseRows(
    query: ReportListQuery,
  ): Promise<readonly ReportExpenseRow[]> {
    assertPageLimit(query.limit);
    const rows = await this.prisma.$queryRaw<ExpenseSqlRow[]>`
        SELECT e."id" AS "expenseId", e."category", e."vendorReference",
          e."currency", e."amountMinor", e."decidedAt",
          e."campaignReference", e."campaignId", e."dealId", e."propertyId"
        FROM "Expense" e
        WHERE e."organizationId" = ${query.organizationId}::uuid
          AND e."status" = 'APPROVED'
          ${fragment(dimensionFilter("e", query.dimension))}
          ${fragment(windowRange('e."decidedAt"', query.window))}
          ${fragment(descCursor('e."decidedAt"', 'e."id"', query.after))}
        ORDER BY e."decidedAt" DESC, e."id" DESC
        LIMIT ${query.limit}`;
    return Object.freeze(
      rows.map((row) =>
        Object.freeze({
          expenseId: row.expenseId,
          category: row.category,
          vendorReference: row.vendorReference,
          currency: row.currency,
          amountMinor: row.amountMinor,
          decidedAt: new Date(row.decidedAt.getTime()),
          ...(row.campaignReference === null
            ? {}
            : { campaignReference: row.campaignReference }),
          ...(row.campaignId === null ? {} : { campaignId: row.campaignId }),
          ...(row.dealId === null ? {} : { dealId: row.dealId }),
          ...(row.propertyId === null ? {} : { propertyId: row.propertyId }),
        }),
      ),
    );
  }

  async getAgingSummary(
    organizationId: string,
    asOf: Date,
  ): Promise<readonly ReportAgingSummaryRow[]> {
    const rows = await this.prisma.$queryRaw<BucketMoneyRow[]>`
        SELECT ${fragment(agingBucketCase(asOf))} AS "bucket", "currency",
          COUNT(*)::int AS "count", SUM("outstandingMinor")::text AS "total"
        FROM "Receivable"
        WHERE "organizationId" = ${organizationId}::uuid
          AND "status" IN ('OPEN', 'PARTIALLY_PAID')
        GROUP BY 1, "currency"`;
    return Object.freeze(
      rows.map((row) =>
        Object.freeze({
          bucket: row.bucket,
          currency: row.currency,
          count: row.count,
          outstandingMinor: BigInt(row.total),
        }),
      ),
    );
  }

  async listAgingItemRows(
    query: ReportAgingQuery,
  ): Promise<readonly ReportAgingItemRow[]> {
    assertPageLimit(query.limit);
    const rows = await this.prisma.$queryRaw<ReceivableSqlRow[]>`
        SELECT "id" AS "receivableId", "invoiceId", "dealId", "currency",
          "originalAmountMinor", "outstandingMinor", "status", "issuedAt", "dueAt"
        FROM "Receivable"
        WHERE "organizationId" = ${query.organizationId}::uuid
          AND "status" IN ('OPEN', 'PARTIALLY_PAID')
          AND ${fragment(agingBucketCase(query.asOf))} = ${query.bucket}::text
          ${fragment(agingCursor(query.after))}
        ORDER BY "dueAt" ASC, "id" ASC
        LIMIT ${query.limit}`;
    return Object.freeze(rows.map((row) => agingItemRow(row, query.asOf)));
  }

  async getCommissionSummary(
    organizationId: string,
  ): Promise<readonly ReportCommissionSummaryRow[]> {
    const rows = await this.prisma.$queryRaw<StatusMoneyRow[]>`
        SELECT "status", "currency", COUNT(*)::int AS "count",
          SUM("totalAmountMinor")::text AS "total"
        FROM "CommissionAccrual"
        WHERE "organizationId" = ${organizationId}::uuid
          AND "status" IN ('EXPECTED', 'DUE', 'PAID')
        GROUP BY "status", "currency"`;
    return Object.freeze(
      rows.map((row) =>
        Object.freeze({
          status: assertSummaryCommissionStatus(row.status),
          currency: row.currency,
          count: row.count,
          amountMinor: BigInt(row.total),
        }),
      ),
    );
  }

  async listCommissionItemRows(
    query: ReportCommissionQuery,
  ): Promise<readonly ReportCommissionItemRow[]> {
    assertPageLimit(query.limit);
    const rows = await this.prisma.$queryRaw<AccrualSqlRow[]>`
        SELECT "id" AS "accrualId", "dealId", "status", "currency",
          "totalAmountMinor" AS "amountMinor", "createdAt"
        FROM "CommissionAccrual"
        WHERE "organizationId" = ${query.organizationId}::uuid
          AND "status" = ${query.status}::text
          ${fragment(descCursor('"createdAt"', '"id"', query.after))}
        ORDER BY "createdAt" DESC, "id" DESC
        LIMIT ${query.limit}`;
    if (rows.length === 0) return Object.freeze([]);
    const splits = await this.prisma.$queryRaw<SplitSqlRow[]>`
        SELECT "accrualId", "order", "kind", "amountMinor"
        FROM "CommissionAccrualSplit"
        WHERE "organizationId" = ${query.organizationId}::uuid
          AND "accrualId" IN (${Prisma.join(rows.map((row) => Prisma.sql`${row.accrualId}::uuid`))})
        ORDER BY "accrualId" ASC, "order" ASC`;
    const splitsByAccrual = new Map<string, ReportCommissionSplitRow[]>();
    for (const split of splits) {
      const list = splitsByAccrual.get(split.accrualId) ?? [];
      list.push(
        Object.freeze({
          order: split.order,
          kind: split.kind,
          amountMinor: split.amountMinor,
        }),
      );
      splitsByAccrual.set(split.accrualId, list);
    }
    return Object.freeze(
      rows.map((row) =>
        Object.freeze({
          accrualId: row.accrualId,
          dealId: row.dealId,
          status: assertCommissionStatus(row.status),
          currency: row.currency,
          amountMinor: row.amountMinor,
          createdAt: new Date(row.createdAt.getTime()),
          splits: Object.freeze(splitsByAccrual.get(row.accrualId) ?? []),
        }),
      ),
    );
  }

  async getDealPerformance(
    organizationId: string,
    window: ReportQueryWindow,
  ): Promise<readonly ReportPerformanceRow[]> {
    const revenue = await this.prisma.$queryRaw<DimensionMoneyRow[]>`
        SELECT r."dealId" AS "keyId", p."currency", COUNT(*)::int AS "count",
          SUM(p."amountMinor")::text AS "total"
        FROM "PaymentRecord" p
        JOIN "Receivable" r
          ON r."organizationId" = p."organizationId" AND r."id" = p."receivableId"
        WHERE p."organizationId" = ${organizationId}::uuid
          ${fragment(windowRange('p."recordedAt"', window))}
        GROUP BY r."dealId", p."currency"`;
    const costs = await this.prisma.$queryRaw<DimensionMoneyRow[]>`
        SELECT "dealId" AS "keyId", "currency", COUNT(*)::int AS "count",
          SUM("amountMinor")::text AS "total"
        FROM "Expense"
        WHERE "organizationId" = ${organizationId}::uuid
          AND "status" = 'APPROVED' AND "dealId" IS NOT NULL
          ${fragment(windowRange('"decidedAt"', window))}
        GROUP BY "dealId", "currency"`;
    return mergePerformance(revenue, costs);
  }

  async getPropertyPerformance(
    organizationId: string,
    window: ReportQueryWindow,
  ): Promise<readonly ReportPerformanceRow[]> {
    const revenue = await this.prisma.$queryRaw<DimensionMoneyRow[]>`
        SELECT d."propertyId" AS "keyId", p."currency", COUNT(*)::int AS "count",
          SUM(p."amountMinor")::text AS "total"
        FROM "PaymentRecord" p
        JOIN "Receivable" r
          ON r."organizationId" = p."organizationId" AND r."id" = p."receivableId"
        JOIN "Deal" d
          ON d."organizationId" = r."organizationId" AND d."id" = r."dealId"
        WHERE p."organizationId" = ${organizationId}::uuid
          ${fragment(windowRange('p."recordedAt"', window))}
        GROUP BY d."propertyId", p."currency"`;
    const costs = await this.prisma.$queryRaw<DimensionMoneyRow[]>`
        SELECT "propertyId" AS "keyId", "currency", COUNT(*)::int AS "count",
          SUM("amountMinor")::text AS "total"
        FROM "Expense"
        WHERE "organizationId" = ${organizationId}::uuid
          AND "status" = 'APPROVED' AND "propertyId" IS NOT NULL
          ${fragment(windowRange('"decidedAt"', window))}
        GROUP BY "propertyId", "currency"`;
    return mergePerformance(revenue, costs);
  }

  /**
   * EF-401: revenue and approved costs per campaign. A deal attributes to the
   * campaign of its lead's first (or last) campaign-bound touch, then the
   * latest append-only attribution correction wins. Costs come from approved
   * expenses bound to the campaign through the EF-234 composite tenant FK, so
   * campaign totals reconcile to Finance Core.
   */
  async getCampaignPerformance(
    query: CampaignPerformanceQuery,
  ): Promise<readonly ReportPerformanceRow[]> {
    const touchOrder =
      query.model === "FIRST_TOUCH"
        ? Prisma.sql`ORDER BY t."occurredAt" ASC, t."id" ASC`
        : Prisma.sql`ORDER BY t."occurredAt" DESC, t."id" DESC`;
    const revenue = await this.prisma.$queryRaw<DimensionMoneyRow[]>`
        WITH attribution AS (
          SELECT l."id" AS "leadId",
            COALESCE(k."correctedCampaignId", a."campaignId") AS "campaignId"
          FROM "Lead" l
          LEFT JOIN LATERAL (
            SELECT t."campaignId" FROM "LeadTouch" t
            WHERE t."organizationId" = l."organizationId"
              AND t."leadId" = l."id"
              AND t."campaignId" IS NOT NULL
              ${touchOrder}
            LIMIT 1
          ) a ON TRUE
          LEFT JOIN LATERAL (
            SELECT k."correctedCampaignId" FROM "LeadAttributionCorrection" k
            WHERE k."organizationId" = l."organizationId"
              AND k."leadId" = l."id"
            ORDER BY k."createdAt" DESC, k."id" DESC
            LIMIT 1
          ) k ON TRUE
          WHERE l."organizationId" = ${query.organizationId}::uuid
        )
        SELECT x."campaignId" AS "keyId", p."currency",
          COUNT(*)::int AS "count", SUM(p."amountMinor")::text AS "total"
        FROM "PaymentRecord" p
        JOIN "Receivable" r
          ON r."organizationId" = p."organizationId" AND r."id" = p."receivableId"
        JOIN "Deal" d
          ON d."organizationId" = r."organizationId" AND d."id" = r."dealId"
        JOIN attribution x ON x."leadId" = d."leadId"
        WHERE p."organizationId" = ${query.organizationId}::uuid
          AND x."campaignId" IS NOT NULL
          ${fragment(windowRange('p."recordedAt"', query.window))}
        GROUP BY x."campaignId", p."currency"`;
    const costs = await this.prisma.$queryRaw<DimensionMoneyRow[]>`
        SELECT e."campaignId" AS "keyId", e."currency",
          COUNT(*)::int AS "count", SUM(e."amountMinor")::text AS "total"
        FROM "Expense" e
        WHERE e."organizationId" = ${query.organizationId}::uuid
          AND e."status" = 'APPROVED' AND e."campaignId" IS NOT NULL
          ${fragment(windowRange('e."decidedAt"', query.window))}
        GROUP BY e."campaignId", e."currency"`;
    return mergePerformance(revenue, costs);
  }
}

function moneyRows(rows: readonly MoneyRow[]): readonly MoneyTotalRow[] {
  return Object.freeze(
    rows.map((row) =>
      Object.freeze({
        currency: row.currency,
        count: row.count,
        amountMinor: BigInt(row.total),
      }),
    ),
  );
}

function mergePerformance(
  revenue: readonly DimensionMoneyRow[],
  costs: readonly DimensionMoneyRow[],
): readonly ReportPerformanceRow[] {
  const merged = new Map<string, ReportPerformanceRow>();
  const keyOf = (keyId: string, currency: string) =>
    `${keyId}\u0000${currency}`;
  for (const row of revenue)
    merged.set(keyOf(row.keyId, row.currency), {
      keyId: row.keyId,
      currency: row.currency,
      revenueMinor: BigInt(row.total),
      costsMinor: 0n,
      paymentCount: row.count,
      expenseCount: 0,
    });
  for (const row of costs) {
    const key = keyOf(row.keyId, row.currency);
    const existing = merged.get(key);
    merged.set(
      key,
      existing
        ? {
            ...existing,
            costsMinor: BigInt(row.total),
            expenseCount: row.count,
          }
        : {
            keyId: row.keyId,
            currency: row.currency,
            revenueMinor: 0n,
            costsMinor: BigInt(row.total),
            paymentCount: 0,
            expenseCount: row.count,
          },
    );
  }
  return Object.freeze(
    [...merged.values()].sort(
      (left, right) =>
        left.keyId.localeCompare(right.keyId) ||
        left.currency.localeCompare(right.currency),
    ),
  );
}

function windowRange(column: string, window: ReportQueryWindow): Prisma.Sql {
  const from = window.from
    ? Prisma.sql` AND ${Prisma.raw(column)} >= ${window.from}`
    : Prisma.empty;
  const to = window.to
    ? Prisma.sql` AND ${Prisma.raw(column)} <= ${window.to}`
    : Prisma.empty;
  return Prisma.sql`${from}${to}`;
}

function dimensionFilter(
  table: string,
  dimension: ReportDimension,
): Prisma.Sql {
  if (dimension.dealId !== undefined)
    return Prisma.sql` AND ${Prisma.raw(`${table}."dealId"`)} = ${dimension.dealId}::uuid`;
  if (dimension.propertyId !== undefined)
    return Prisma.sql` AND ${Prisma.raw(`${table}."propertyId"`)} = ${dimension.propertyId}::uuid`;
  if (dimension.campaignId !== undefined)
    return Prisma.sql` AND ${Prisma.raw(`${table}."campaignId"`)} = ${dimension.campaignId}::uuid`;
  return Prisma.empty;
}

/** The Deal table carries its own id in "id", not "dealId". */
function dealDimensionFilter(
  table: string,
  dimension: ReportDimension,
): Prisma.Sql {
  if (dimension.dealId !== undefined)
    return Prisma.sql` AND ${Prisma.raw(`${table}."id"`)} = ${dimension.dealId}::uuid`;
  if (dimension.propertyId !== undefined)
    return Prisma.sql` AND ${Prisma.raw(`${table}."propertyId"`)} = ${dimension.propertyId}::uuid`;
  return Prisma.empty;
}

function descCursor(
  atColumn: string,
  idColumn: string,
  after: ReportCursor | undefined,
): Prisma.Sql {
  if (!after) return Prisma.empty;
  return Prisma.sql` AND (${Prisma.raw(atColumn)} < ${after.at} OR (${Prisma.raw(atColumn)} = ${after.at} AND ${Prisma.raw(idColumn)} < ${after.id}::uuid))`;
}

function agingCursor(after: ReportCursor | undefined): Prisma.Sql {
  if (!after) return Prisma.empty;
  return Prisma.sql` AND ("dueAt" > ${after.at} OR ("dueAt" = ${after.at} AND "id" > ${after.id}::uuid))`;
}

function agingBucketCase(asOf: Date): Prisma.Sql {
  const day = (days: number) => new Date(asOf.getTime() - days * DAY_MS);
  return Prisma.sql`CASE
      WHEN "dueAt" >= ${asOf} THEN 'CURRENT'
      WHEN "dueAt" >= ${day(30)} THEN 'DAYS_1_30'
      WHEN "dueAt" >= ${day(60)} THEN 'DAYS_31_60'
      WHEN "dueAt" >= ${day(90)} THEN 'DAYS_61_90'
      ELSE 'DAYS_91_PLUS' END`;
}

function agingItemRow(row: ReceivableSqlRow, asOf: Date): ReportAgingItemRow {
  const elapsed = asOf.getTime() - row.dueAt.getTime();
  const daysPastDue = elapsed <= 0 ? 0 : Math.ceil(elapsed / DAY_MS);
  return Object.freeze({
    receivableId: row.receivableId,
    invoiceId: row.invoiceId,
    dealId: row.dealId,
    currency: row.currency,
    originalAmountMinor: row.originalAmountMinor,
    outstandingMinor: row.outstandingMinor,
    status: row.status as "OPEN" | "PARTIALLY_PAID",
    issuedAt: new Date(row.issuedAt.getTime()),
    dueAt: new Date(row.dueAt.getTime()),
    daysPastDue,
    bucket: agingBucket(daysPastDue),
  });
}

function agingBucket(daysPastDue: number): AgingBucket {
  if (daysPastDue <= 0) return "CURRENT";
  if (daysPastDue <= 30) return "DAYS_1_30";
  if (daysPastDue <= 60) return "DAYS_31_60";
  if (daysPastDue <= 90) return "DAYS_61_90";
  return "DAYS_91_PLUS";
}

function assertSummaryCommissionStatus(
  status: string,
): "EXPECTED" | "DUE" | "PAID" {
  if (status === "EXPECTED" || status === "DUE" || status === "PAID")
    return status;
  throw new RangeError("Unexpected commission status in report query");
}

function assertCommissionStatus(
  status: string,
): "EXPECTED" | "CONFIRMED" | "DUE" | "PAID" | "CANCELLED" {
  if (
    status === "EXPECTED" ||
    status === "CONFIRMED" ||
    status === "DUE" ||
    status === "PAID" ||
    status === "CANCELLED"
  )
    return status;
  throw new RangeError("Unexpected commission status in report query");
}

function assertPageLimit(limit: number): void {
  if (!Number.isInteger(limit) || limit < 1 || limit > PAGE_LIMIT_MAX)
    throw new RangeError("Report page limit must be an integer from 1 to 101");
}
