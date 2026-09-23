import assert from "node:assert/strict";
import test from "node:test";
import {
  normalizeCampaignDetail,
  normalizeCampaignList,
  normalizeLeadAttribution,
  normalizeLeadTouches,
  normalizePerformanceEntries,
} from "../features/campaigns/campaign-contract";
import {
  attributionModelLabels,
  campaignChannelLabels,
  campaignStatusLabels,
  touchChannelLabels,
} from "../features/campaigns/campaign-labels";

const orgId = "11111111-1111-4111-8111-111111111111";
const campaignId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const leadId = "44444444-4444-4444-8444-444444444444";
const actorId = "33333333-3333-4333-8333-333333333333";
const campaignB = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

const validCampaignItem = {
  id: campaignId,
  name: "Ramadan",
  objective: "Seller leads",
  channel: "META",
  status: "ACTIVE",
  startsAt: "2026-10-01T00:00:00.000Z",
  endsAt: "2026-10-30T00:00:00.000Z",
  budgetPlannedMinor: "1000000",
  currency: "SAR",
  budgetActualMinor: "300000",
  touchCount: 4,
  createdAt: "2026-09-30T00:00:00.000Z",
};

const validTouch = {
  id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
  organizationId: orgId,
  leadId,
  campaignId,
  channel: "WEBSITE",
  source: "landing page",
  utm: { utmSource: "meta", utmCampaign: "ramadan" },
  occurredAt: "2026-10-02T08:00:00.000Z",
  createdBy: actorId,
  createdAt: "2026-10-02T08:00:01.000Z",
};

test("EF-401 campaign list normalizer accepts the typed page and rejects unknown fields", () => {
  const page = normalizeCampaignList({
    items: [validCampaignItem],
    nextCursor: "abc",
  });
  assert.equal(page.items.length, 1);
  assert.equal(page.items[0].budgetActualMinor, "300000");
  assert.equal(page.nextCursor, "abc");
  assert.throws(() =>
    normalizeCampaignList({ items: [validCampaignItem], extra: 1 }),
  );
  assert.throws(() =>
    normalizeCampaignList({
      items: [{ ...validCampaignItem, status: "PAUSED" }],
    }),
  );
  assert.throws(() =>
    normalizeCampaignList({
      items: [{ ...validCampaignItem, budgetPlannedMinor: "-4" }],
    }),
  );
});

test("EF-401 campaign detail normalizer validates budget, transitions, and corrections", () => {
  const detail = normalizeCampaignDetail({
    campaign: {
      id: campaignId,
      organizationId: orgId,
      name: "Ramadan",
      objective: "Seller leads",
      channel: "META",
      status: "ACTIVE",
      startsAt: "2026-10-01T00:00:00.000Z",
      endsAt: "2026-10-30T00:00:00.000Z",
      budget: { amountMinor: "1200000", currency: "SAR" },
      utm: { utmSource: "meta" },
      createdBy: actorId,
      createdAt: "2026-09-30T00:00:00.000Z",
      updatedAt: "2026-10-01T00:00:00.000Z",
    },
    actualByCurrency: [{ currency: "SAR", count: 1, amountMinor: "300000" }],
    transitions: [
      {
        id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
        organizationId: orgId,
        campaignId,
        fromStatus: "DRAFT",
        toStatus: "ACTIVE",
        actorId,
        createdAt: "2026-10-01T00:00:00.000Z",
      },
    ],
    budgetCorrections: [
      {
        id: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
        organizationId: orgId,
        campaignId,
        previousMinor: "1000000",
        correctedMinor: "1200000",
        currency: "SAR",
        reason: "media plan expanded",
        createdBy: actorId,
        createdAt: "2026-10-01T00:00:00.000Z",
      },
    ],
  });
  assert.equal(detail.campaign.budgetPlannedMinor, "1200000");
  assert.equal(detail.budgetCorrections[0].reason, "media plan expanded");
  assert.throws(() =>
    normalizeCampaignDetail({
      campaign: { nope: true },
      actualByCurrency: [],
      transitions: [],
      budgetCorrections: [],
    }),
  );
});

test("EF-401 touches and attribution normalizers reject malformed or extra fields", () => {
  const touches = normalizeLeadTouches({ items: [validTouch] });
  assert.equal(touches.items[0].channel, "WEBSITE");
  assert.throws(() =>
    normalizeLeadTouches({ items: [validTouch, { channel: "X" }] }),
  );
  assert.throws(() =>
    normalizeLeadTouches({ items: [{ ...validTouch, secret: "x" }] }),
  );

  const attribution = normalizeLeadAttribution({
    attribution: {
      firstTouch: validTouch,
      lastTouch: { ...validTouch, campaignId: campaignB },
      firstCampaignId: campaignId,
      lastCampaignId: campaignB,
      override: {
        id: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
        organizationId: orgId,
        leadId,
        previousCampaignId: campaignB,
        correctedCampaignId: campaignId,
        reason: "UTM tag was misconfigured",
        createdBy: actorId,
        createdAt: "2026-10-04T00:00:00.000Z",
      },
    },
  });
  assert.equal(
    attribution.attribution.override?.correctedCampaignId,
    campaignId,
  );
  assert.throws(() =>
    normalizeLeadAttribution({ attribution: { firstCampaignId: "nope" } }),
  );
});

test("EF-401 performance entry normalizer accepts manual metrics and rejects negatives", () => {
  const page = normalizePerformanceEntries({
    items: [
      {
        id: "ffffffff-ffff-4fff-8fff-ffffffffffff",
        organizationId: orgId,
        campaignId,
        occurredAt: "2026-10-05T00:00:00.000Z",
        impressions: 5000,
        clicks: 400,
        leadsCount: 9,
        createdBy: actorId,
        createdAt: "2026-10-05T00:00:00.000Z",
      },
    ],
  });
  assert.equal(page.items[0].leadsCount, 9);
  assert.throws(() =>
    normalizePerformanceEntries({
      items: [
        {
          id: "ffffffff-ffff-4fff-8fff-ffffffffffff",
          organizationId: orgId,
          campaignId,
          occurredAt: "2026-10-05T00:00:00.000Z",
          impressions: -1,
          clicks: 0,
          leadsCount: 0,
          createdBy: actorId,
          createdAt: "2026-10-05T00:00:00.000Z",
        },
      ],
    }),
  );
});

test("EF-401 Arabic labels are complete for every status, channel, and model", () => {
  for (const status of ["DRAFT", "ACTIVE", "COMPLETED", "CANCELLED"] as const)
    assert.ok(campaignStatusLabels[status].length > 0);
  for (const channel of [
    "META",
    "GOOGLE",
    "SNAPCHAT",
    "TIKTOK",
    "X",
    "LINKEDIN",
    "PRINT",
    "OUTDOOR",
    "REFERRAL",
    "OTHER",
  ] as const)
    assert.ok(campaignChannelLabels[channel].length > 0);
  for (const channel of [
    "WEBSITE",
    "WHATSAPP",
    "PHONE_CALL",
    "WALK_IN",
    "REFERRAL",
    "META",
    "GOOGLE",
    "SNAPCHAT",
    "TIKTOK",
    "X",
    "OTHER",
  ] as const)
    assert.ok(touchChannelLabels[channel].length > 0);
  assert.equal(attributionModelLabels.FIRST_TOUCH, "أول لمسة");
  assert.equal(attributionModelLabels.LAST_TOUCH, "آخر لمسة");
});
