import type { AgingBucket } from "../domain/receivable.js";

/**
 * EF-235 / FIN-05 read-only reporting port.
 *
 * The reporting slice owns no mutable finance state. Every query reads the
 * EF-231 ledger/expenses, EF-232 commission snapshots, and EF-233
 * receivables/payments tables through organization-scoped SQL aggregations.
 */

export type ReportMembership = Readonly<{
  organizationId: string;
  role: "OWNER" | "MANAGER" | "BROKER" | "CLIENT";
  status: "ACTIVE" | "PENDING" | "SUSPENDED" | "REVOKED";
}>;

export interface ReportMembershipReader {
  findMembership(
    organizationId: string,
    userId: string,
  ): Promise<ReportMembership | null>;
}

export type ReportQueryWindow = Readonly<{
  from?: Date;
  to?: Date;
}>;

export type MoneyTotalRow = Readonly<{
  currency: string;
  count: number;
  amountMinor: bigint;
}>;

export type NetCashRow = Readonly<{
  currency: string;
  amountMinor: bigint;
}>;

export type CashFlowSummary = Readonly<{
  cashIn: readonly MoneyTotalRow[];
  cashOut: readonly MoneyTotalRow[];
  netCash: readonly NetCashRow[];
}>;

export type ReportCursor = Readonly<{ at: Date; id: string }>;

export type ReportPaymentRow = Readonly<{
  paymentId: string;
  receivableId: string;
  invoiceId: string;
  dealId: string;
  propertyId: string;
  currency: string;
  amountMinor: bigint;
  recordedAt: Date;
}>;

export type ReportExpenseRow = Readonly<{
  expenseId: string;
  category: string;
  vendorReference: string;
  currency: string;
  amountMinor: bigint;
  decidedAt: Date;
  campaignReference?: string;
  /** EF-401: present when the expense is bound to a real campaign. */
  campaignId?: string;
  dealId?: string;
  propertyId?: string;
}>;

export type ReportAgingSummaryRow = Readonly<{
  bucket: AgingBucket;
  currency: string;
  count: number;
  outstandingMinor: bigint;
}>;

export type ReportAgingItemRow = Readonly<{
  receivableId: string;
  invoiceId: string;
  dealId: string;
  currency: string;
  originalAmountMinor: bigint;
  outstandingMinor: bigint;
  status: "OPEN" | "PARTIALLY_PAID";
  issuedAt: Date;
  dueAt: Date;
  daysPastDue: number;
  bucket: AgingBucket;
}>;

export type ReportCommissionSummaryRow = Readonly<{
  status: "EXPECTED" | "DUE" | "PAID";
  currency: string;
  count: number;
  amountMinor: bigint;
}>;

export type ReportCommissionSplitRow = Readonly<{
  order: number;
  kind: string;
  amountMinor: bigint;
}>;

export type ReportCommissionItemRow = Readonly<{
  accrualId: string;
  dealId: string;
  status: ReportCommissionItemStatus;
  currency: string;
  amountMinor: bigint;
  createdAt: Date;
  splits: readonly ReportCommissionSplitRow[];
}>;

export type ReportPerformanceRow = Readonly<{
  keyId: string;
  currency: string;
  revenueMinor: bigint;
  costsMinor: bigint;
  paymentCount: number;
  expenseCount: number;
}>;

export type ReportDimension = Readonly<{
  dealId?: string;
  propertyId?: string;
  /** EF-401: the campaign dimension is now a real aggregate reference. */
  campaignId?: string;
}>;

export type ReportListQuery = Readonly<{
  organizationId: string;
  window: ReportQueryWindow;
  dimension: ReportDimension;
  after?: ReportCursor;
  limit: number;
}>;

export type ReportAgingQuery = Readonly<{
  organizationId: string;
  asOf: Date;
  bucket: AgingBucket;
  after?: ReportCursor;
  limit: number;
}>;

export type ReportCommissionItemStatus =
  "EXPECTED" | "CONFIRMED" | "DUE" | "PAID" | "CANCELLED";

export type ReportCommissionQuery = Readonly<{
  organizationId: string;
  status: ReportCommissionItemStatus;
  after?: ReportCursor;
  limit: number;
}>;

/** EF-401: attribution model used to assign deals to campaigns. */
export type CampaignAttributionModel = "FIRST_TOUCH" | "LAST_TOUCH";

export type CampaignPerformanceQuery = Readonly<{
  organizationId: string;
  model: CampaignAttributionModel;
  window: ReportQueryWindow;
}>;

export interface ReportRepository {
  getCashFlowSummary(
    organizationId: string,
    window: ReportQueryWindow,
  ): Promise<CashFlowSummary>;
  listPaymentRows(query: ReportListQuery): Promise<readonly ReportPaymentRow[]>;
  listExpenseRows(query: ReportListQuery): Promise<readonly ReportExpenseRow[]>;
  getAgingSummary(
    organizationId: string,
    asOf: Date,
  ): Promise<readonly ReportAgingSummaryRow[]>;
  listAgingItemRows(
    query: ReportAgingQuery,
  ): Promise<readonly ReportAgingItemRow[]>;
  getCommissionSummary(
    organizationId: string,
  ): Promise<readonly ReportCommissionSummaryRow[]>;
  listCommissionItemRows(
    query: ReportCommissionQuery,
  ): Promise<readonly ReportCommissionItemRow[]>;
  getDealPerformance(
    organizationId: string,
    window: ReportQueryWindow,
  ): Promise<readonly ReportPerformanceRow[]>;
  getPropertyPerformance(
    organizationId: string,
    window: ReportQueryWindow,
  ): Promise<readonly ReportPerformanceRow[]>;
  /** EF-401: revenue/costs/margin by campaign under first/last-touch attribution. */
  getCampaignPerformance(
    query: CampaignPerformanceQuery,
  ): Promise<readonly ReportPerformanceRow[]>;
}
