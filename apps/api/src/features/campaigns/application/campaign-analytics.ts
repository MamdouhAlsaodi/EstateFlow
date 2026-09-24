export const NOT_ENOUGH_DATA = "not enough data" as const;
export type AnalyticsMetricValue = string | typeof NOT_ENOUGH_DATA;

export type AnalyticsMoneyRow = Readonly<{
  currency: string;
  count: number;
  amountMinor: bigint;
}>;

export type CampaignAttributionRollup = Readonly<{
  firstTouchLeadCount: number;
  firstTouchQualifiedLeadCount: number;
  firstTouchWinCount: number;
  firstTouchAttributedRevenue: readonly AnalyticsMoneyRow[];
  lastTouchLeadCount: number;
  lastTouchQualifiedLeadCount: number;
  lastTouchWinCount: number;
  lastTouchAttributedRevenue: readonly AnalyticsMoneyRow[];
}>;

export type PublishedContentCount = Readonly<{
  channel: string;
  count: number;
}>;

export type AnalyticsMetricRow = Readonly<{
  currency: string;
  cpl: AnalyticsMetricValue;
  cac: AnalyticsMetricValue;
  roi: AnalyticsMetricValue;
}>;

export type CampaignAnalyticsRollup = Readonly<{
  campaignId: string;
  plannedBudget: readonly AnalyticsMoneyRow[];
  approvedSpend: readonly AnalyticsMoneyRow[];
  touchCount: number;
  attribution: CampaignAttributionRollup;
  publishedContent: readonly PublishedContentCount[];
}>;

export type OrganizationAnalyticsRollup = Readonly<{
  campaignCount: number;
  plannedBudget: readonly AnalyticsMoneyRow[];
  approvedSpend: readonly AnalyticsMoneyRow[];
  touchCount: number;
  attribution: CampaignAttributionRollup;
  publishedContent: readonly PublishedContentCount[];
}>;

export type AnalyticsRepository = Readonly<{
  getCampaignAnalytics(
    organizationId: string,
    campaignId: string,
  ): Promise<CampaignAnalyticsRollup>;
  getOrganizationAnalytics(
    organizationId: string,
  ): Promise<OrganizationAnalyticsRollup>;
}>;

export function analyticsMetricRows(
  spend: readonly AnalyticsMoneyRow[],
  attribution: CampaignAttributionRollup,
): Readonly<{
  firstTouch: readonly AnalyticsMetricRow[];
  lastTouch: readonly AnalyticsMetricRow[];
}> {
  const currencies = new Set([
    ...spend.map((row) => row.currency),
    ...attribution.firstTouchAttributedRevenue.map((row) => row.currency),
    ...attribution.lastTouchAttributedRevenue.map((row) => row.currency),
  ]);
  const rows = (model: "firstTouch" | "lastTouch") =>
    [...currencies].sort().map((currency) => {
      const spendMinor =
        spend.find((row) => row.currency === currency)?.amountMinor ?? 0n;
      const revenue =
        model === "firstTouch"
          ? attribution.firstTouchAttributedRevenue.find(
              (row) => row.currency === currency,
            )
          : attribution.lastTouchAttributedRevenue.find(
              (row) => row.currency === currency,
            );
      const leads =
        model === "firstTouch"
          ? attribution.firstTouchLeadCount
          : attribution.lastTouchLeadCount;
      const wins =
        model === "firstTouch"
          ? attribution.firstTouchWinCount
          : attribution.lastTouchWinCount;
      return Object.freeze({
        currency,
        cpl: ratio(spendMinor, BigInt(leads)),
        cac: ratio(spendMinor, BigInt(wins)),
        roi:
          spendMinor === 0n || revenue === undefined
            ? NOT_ENOUGH_DATA
            : decimal(revenue.amountMinor - spendMinor, spendMinor),
      });
    });
  return Object.freeze({
    firstTouch: Object.freeze(rows("firstTouch")),
    lastTouch: Object.freeze(rows("lastTouch")),
  });
}

function ratio(numerator: bigint, denominator: bigint): AnalyticsMetricValue {
  return denominator === 0n ? NOT_ENOUGH_DATA : decimal(numerator, denominator);
}

function decimal(numerator: bigint, denominator: bigint): string {
  const negative = numerator < 0n;
  const absolute = negative ? -numerator : numerator;
  const whole = absolute / denominator;
  const remainder = (absolute % denominator) * 1_000_000n;
  const fraction = (remainder / denominator)
    .toString()
    .padStart(6, "0")
    .slice(0, 6);
  const trimmed = fraction.replace(/0+$/, "");
  return `${negative ? "-" : ""}${whole.toString()}${trimmed ? `.${trimmed}` : ""}`;
}
