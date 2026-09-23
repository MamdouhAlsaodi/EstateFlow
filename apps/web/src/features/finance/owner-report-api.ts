import { createApiClient } from "../../lib/api-client/index";
import {
  normalizeOwnerAgingItemPage,
  normalizeOwnerAgingSummary,
  normalizeOwnerCampaignPerformance,
  normalizeOwnerCashFlow,
  normalizeOwnerCommissionItemPage,
  normalizeOwnerCommissionSummary,
  normalizeOwnerExpensePage,
  normalizeOwnerPaymentPage,
  normalizeOwnerPerformance,
  type AgingBucket,
  type CommissionItemStatus,
} from "./owner-report-model";

/**
 * EF-235 read-only owner report adapter. All reads are GET requests without
 * CSRF tokens; every payload is strictly normalized before it reaches the UI.
 */

export type ReportWindowInput = Readonly<{ from?: string; to?: string }>;
export type ReportPageInput = Readonly<{
  cursor?: string;
  limit?: number;
}>;
export type ReportDimensionInput = Readonly<{
  dealId?: string;
  propertyId?: string;
  /** EF-401: the campaign dimension is now a real aggregate reference. */
  campaignId?: string;
}>;

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

const apiClient = createApiClient();

function assertOrganization(organizationId: string): string {
  if (!UUID.test(organizationId))
    throw new TypeError("Invalid organization id");
  return encodeURIComponent(organizationId);
}
function assertUuid(name: string, value: string): string {
  if (!UUID.test(value)) throw new TypeError(`Invalid ${name}`);
  return encodeURIComponent(value);
}
function assertInstant(name: string, value: string): string {
  if (!UTC.test(value)) throw new TypeError(`Invalid ${name}`);
  return encodeURIComponent(value);
}
function serializeQuery(
  entries: readonly (readonly [string, string | number | undefined])[],
): string {
  const query = new URLSearchParams();
  for (const [name, value] of entries) {
    if (value === undefined) continue;
    query.set(name, String(value));
  }
  const serialized = query.toString();
  return serialized.length === 0 ? "" : `?${serialized}`;
}

export function getOwnerCashFlow(context: {
  organizationId: string;
  window?: ReportWindowInput;
}) {
  const organizationId = assertOrganization(context.organizationId);
  return apiClient
    .request(
      `/organizations/${organizationId}/finance/reports/cash-flow${serializeQuery(
        [
          [
            "from",
            context.window?.from && assertInstant("from", context.window.from),
          ],
          ["to", context.window?.to && assertInstant("to", context.window.to)],
        ],
      )}`,
    )
    .then(normalizeOwnerCashFlow);
}

export function listOwnerPaymentItems(context: {
  organizationId: string;
  window?: ReportWindowInput;
  dimension?: ReportDimensionInput;
  page?: ReportPageInput;
}) {
  const organizationId = assertOrganization(context.organizationId);
  if (
    context.dimension?.dealId !== undefined &&
    context.dimension?.propertyId !== undefined
  )
    throw new TypeError("Choose either dealId or propertyId");
  return apiClient
    .request(
      `/organizations/${organizationId}/finance/reports/payments${serializeQuery(
        [
          [
            "dealId",
            context.dimension?.dealId &&
              assertUuid("dealId", context.dimension.dealId),
          ],
          [
            "propertyId",
            context.dimension?.propertyId &&
              assertUuid("propertyId", context.dimension.propertyId),
          ],
          [
            "from",
            context.window?.from && assertInstant("from", context.window.from),
          ],
          ["to", context.window?.to && assertInstant("to", context.window.to)],
          ["cursor", context.page?.cursor],
          ["limit", context.page?.limit],
        ],
      )}`,
    )
    .then(normalizeOwnerPaymentPage);
}

export function listOwnerExpenseItems(context: {
  organizationId: string;
  window?: ReportWindowInput;
  dimension?: ReportDimensionInput;
  page?: ReportPageInput;
}) {
  const organizationId = assertOrganization(context.organizationId);
  if (
    [
      context.dimension?.dealId,
      context.dimension?.propertyId,
      context.dimension?.campaignId,
    ].filter((value) => value !== undefined).length > 1
  )
    throw new TypeError("Choose only one of dealId, propertyId, campaignId");
  return apiClient
    .request(
      `/organizations/${organizationId}/finance/reports/expenses${serializeQuery(
        [
          [
            "dealId",
            context.dimension?.dealId &&
              assertUuid("dealId", context.dimension.dealId),
          ],
          [
            "propertyId",
            context.dimension?.propertyId &&
              assertUuid("propertyId", context.dimension.propertyId),
          ],
          [
            "campaignId",
            context.dimension?.campaignId &&
              assertUuid("campaignId", context.dimension.campaignId),
          ],
          [
            "from",
            context.window?.from && assertInstant("from", context.window.from),
          ],
          ["to", context.window?.to && assertInstant("to", context.window.to)],
          ["cursor", context.page?.cursor],
          ["limit", context.page?.limit],
        ],
      )}`,
    )
    .then(normalizeOwnerExpensePage);
}

export function getOwnerAgingSummary(context: { organizationId: string }) {
  const organizationId = assertOrganization(context.organizationId);
  return apiClient
    .request(
      `/organizations/${organizationId}/finance/reports/receivables/aging`,
    )
    .then(normalizeOwnerAgingSummary);
}

export function listOwnerAgingItems(context: {
  organizationId: string;
  bucket: AgingBucket;
  page?: ReportPageInput;
}) {
  const organizationId = assertOrganization(context.organizationId);
  return apiClient
    .request(
      `/organizations/${organizationId}/finance/reports/receivables/aging/items${serializeQuery(
        [
          ["bucket", context.bucket],
          ["cursor", context.page?.cursor],
          ["limit", context.page?.limit],
        ],
      )}`,
    )
    .then(normalizeOwnerAgingItemPage);
}

export function getOwnerCommissionSummary(context: { organizationId: string }) {
  const organizationId = assertOrganization(context.organizationId);
  return apiClient
    .request(`/organizations/${organizationId}/finance/reports/commissions`)
    .then(normalizeOwnerCommissionSummary);
}

export function listOwnerCommissionItems(context: {
  organizationId: string;
  status: CommissionItemStatus;
  page?: ReportPageInput;
}) {
  const organizationId = assertOrganization(context.organizationId);
  return apiClient
    .request(
      `/organizations/${organizationId}/finance/reports/commissions/items${serializeQuery(
        [
          ["status", context.status],
          ["cursor", context.page?.cursor],
          ["limit", context.page?.limit],
        ],
      )}`,
    )
    .then(normalizeOwnerCommissionItemPage);
}

export function getOwnerPerformance(context: {
  organizationId: string;
  window?: ReportWindowInput;
}) {
  const organizationId = assertOrganization(context.organizationId);
  return apiClient
    .request(
      `/organizations/${organizationId}/finance/reports/performance${serializeQuery(
        [
          [
            "from",
            context.window?.from && assertInstant("from", context.window.from),
          ],
          ["to", context.window?.to && assertInstant("to", context.window.to)],
        ],
      )}`,
    )
    .then(normalizeOwnerPerformance);
}

/**
 * EF-401 — revenue/costs/margin by campaign under first/last-touch
 * attribution. Owner-only, read-only, strictly normalized.
 */
export function getOwnerCampaignPerformance(context: {
  organizationId: string;
  model: "FIRST_TOUCH" | "LAST_TOUCH";
  window?: ReportWindowInput;
}) {
  const organizationId = assertOrganization(context.organizationId);
  return apiClient
    .request(
      `/organizations/${organizationId}/finance/reports/campaigns/performance${serializeQuery(
        [
          ["model", context.model],
          [
            "from",
            context.window?.from && assertInstant("from", context.window.from),
          ],
          ["to", context.window?.to && assertInstant("to", context.window.to)],
        ],
      )}`,
    )
    .then(normalizeOwnerCampaignPerformance);
}
