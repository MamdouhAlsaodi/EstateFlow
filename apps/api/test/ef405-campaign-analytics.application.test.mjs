import assert from "node:assert/strict";
import test from "node:test";
import { CampaignApplication } from "../dist/features/campaigns/application/campaign-application.js";

const org = "11111111-1111-4111-8111-111111111111";
const otherOrg = "22222222-2222-4222-8222-222222222222";
const owner = "33333333-3333-4333-8333-333333333333";
const campaignId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const now = new Date("2026-10-01T00:00:00.000Z");
const campaign = {
  id: campaignId,
  organizationId: org,
  name: "Campaign",
  objective: "Leads",
  channel: "META",
  status: "ACTIVE",
  startsAt: now,
  endsAt: new Date("2026-10-31T00:00:00.000Z"),
  budget: { amountMinor: 100000n, currency: "SAR" },
  utm: {},
  createdBy: owner,
  createdAt: now,
  updatedAt: now,
};

function rollup() {
  return {
    campaignId,
    plannedBudget: [{ currency: "SAR", count: 1, amountMinor: 100000n }],
    approvedSpend: [{ currency: "SAR", count: 1, amountMinor: 2500n }],
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
  };
}

function repository() {
  return {
    async findCampaign(organizationId, id) {
      return organizationId === org && id === campaignId ? campaign : null;
    },
    async getCampaignAnalytics() {
      return rollup();
    },
    async getOrganizationAnalytics() {
      return { ...rollup(), campaignCount: 1 };
    },
  };
}

function membership(role, organizationId = org, status = "ACTIVE") {
  return { role, organizationId, status };
}

function actor(organizationId = org) {
  return { actor: { verified: true }, userId: owner, organizationId };
}

test("EF-405 analytics reads are Owner/Manager-only and freshness-stamped", async () => {
  for (const role of ["OWNER", "MANAGER"]) {
    const app = new CampaignApplication(repository(), {
      async findMembership() {
        return membership(role);
      },
    });
    const result = await app.getCampaignAnalytics({
      ...actor(),
      campaignId,
    });
    assert.equal(result.analytics.touchCount, 3);
    assert.equal(result.analytics.approvedSpend[0].amountMinor, 2500n);
    assert.ok(result.asOf instanceof Date);
    assert.equal(result.metrics.firstTouch[0].cpl, "1250");
    assert.equal(result.metrics.firstTouch[0].cac, "2500");
    assert.equal(result.metrics.firstTouch[0].roi, "not enough data");
  }
  for (const role of ["BROKER", "CLIENT"]) {
    const app = new CampaignApplication(repository(), {
      async findMembership() {
        return membership(role);
      },
    });
    assert.deepEqual(await app.getOrganizationAnalytics(actor()), {
      kind: "access-denied",
    });
  }
});

test("EF-405 campaign analytics is tenant-safe", async () => {
  const app = new CampaignApplication(repository(), {
    async findMembership(organizationId) {
      return membership("OWNER", organizationId);
    },
  });
  assert.deepEqual(
    await app.getCampaignAnalytics({ ...actor(otherOrg), campaignId }),
    { kind: "not-found", resource: "campaign" },
  );
});
