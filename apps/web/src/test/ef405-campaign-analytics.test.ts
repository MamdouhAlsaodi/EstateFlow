import assert from "node:assert/strict";
import test from "node:test";
import {
  normalizeCampaignAnalytics,
  normalizeOrganizationCampaignAnalytics,
} from "../features/campaigns/campaign-contract";

const response = {
  asOf: "2026-10-01T00:00:00.000Z",
  analytics: {
    campaignId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    plannedBudget: [{ currency: "SAR", count: 1, amountMinor: "100000" }],
    approvedSpend: [{ currency: "SAR", count: 1, amountMinor: "2500" }],
    touchCount: 3,
    attribution: {
      firstTouchLeadCount: 2,
      firstTouchQualifiedLeadCount: 1,
      firstTouchWinCount: 1,
      firstTouchAttributedRevenue: [],
      lastTouchLeadCount: 1,
      lastTouchQualifiedLeadCount: 1,
      lastTouchWinCount: 0,
      lastTouchAttributedRevenue: [],
    },
    publishedContent: [{ channel: "INSTAGRAM", count: 2 }],
  },
  metrics: {
    firstTouch: [
      { currency: "SAR", cpl: "1250", cac: "2500", roi: "not enough data" },
    ],
    lastTouch: [
      {
        currency: "SAR",
        cpl: "2500",
        cac: "not enough data",
        roi: "not enough data",
      },
    ],
  },
};

test("EF-405 web analytics normalizers preserve freshness and reject drift", () => {
  const normalized = normalizeCampaignAnalytics(response);
  assert.equal(normalized.asOf, response.asOf);
  assert.equal(normalized.analytics.approvedSpend[0].amountMinor, "2500");
  assert.equal(normalized.analytics.publishedContent[0].count, 2);
  assert.throws(() => normalizeCampaignAnalytics({ ...response, extra: true }));
  assert.throws(() =>
    normalizeCampaignAnalytics({
      ...response,
      analytics: {
        ...response.analytics,
        publishedContent: [{ channel: "UNKNOWN", count: 1 }],
      },
    }),
  );
});

test("EF-405 organization analytics requires an organization aggregate", () => {
  const organization = normalizeOrganizationCampaignAnalytics({
    ...response,
    analytics: {
      campaignCount: 2,
      plannedBudget: [{ currency: "SAR", count: 2, amountMinor: "300000" }],
      approvedSpend: response.analytics.approvedSpend,
      touchCount: 3,
      attribution: response.analytics.attribution,
      publishedContent: response.analytics.publishedContent,
    },
  });
  assert.equal(organization.analytics.campaignCount, 2);
  assert.equal(organization.analytics.campaignId, undefined);
});
