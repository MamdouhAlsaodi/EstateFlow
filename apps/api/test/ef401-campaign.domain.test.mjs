import test from "node:test";
import assert from "node:assert/strict";
import {
  createCampaign,
  correctCampaignBudget,
  createCampaignPerformanceEntry,
  transitionCampaign,
  campaignTransitionIsAllowed,
  CampaignStateError,
  CampaignValidationError,
} from "../dist/features/campaigns/domain/campaign.js";
import {
  applyAttributionOverride,
  createAttributionCorrection,
  createLeadTouch,
  deriveTouchAttribution,
  latestCorrection,
} from "../dist/features/campaigns/domain/attribution.js";

const org = "11111111-1111-4111-8111-111111111111";
const actor = "33333333-3333-4333-8333-333333333333";
const lead = "44444444-4444-4444-8444-444444444444";
const campaignA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const campaignB = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const now = new Date("2026-10-01T10:00:00.000Z");

function campaign(overrides = {}) {
  return createCampaign({
    id: campaignA,
    organizationId: org,
    name: "Ramadan",
    objective: "Ramadan leads",
    channel: "META",
    startsAt: new Date("2026-10-01T00:00:00.000Z"),
    endsAt: new Date("2026-10-30T00:00:00.000Z"),
    budgetPlannedMinor: 100000n,
    currency: "SAR",
    utm: { utmSource: "meta", utmCampaign: "ramadan" },
    createdBy: actor,
    createdAt: now,
    ...overrides,
  });
}

function touch(id, overrides = {}) {
  return createLeadTouch({
    id,
    organizationId: org,
    leadId: lead,
    campaignId: campaignA,
    channel: "WEBSITE",
    utm: { utmSource: "meta" },
    occurredAt: new Date(60000),
    createdBy: actor,
    createdAt: now,
    ...overrides,
  });
}

function correction(overrides = {}) {
  return createAttributionCorrection({
    id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
    organizationId: org,
    leadId: lead,
    correctedCampaignId: campaignB,
    reason: "wrong campaign tag",
    createdBy: actor,
    createdAt: now,
    ...overrides,
  });
}

test("EF-401 campaign creation validates scope, dates, budget, and UTM tags", () => {
  const created = campaign();
  assert.equal(created.status, "DRAFT");
  assert.equal(created.budget.amountMinor, 100000n);
  assert.equal(created.budget.currency, "SAR");
  assert.deepEqual(created.utm, { utmSource: "meta", utmCampaign: "ramadan" });
  for (const overrides of [
    { name: "  " },
    { objective: "" },
    { channel: "TELEPORT" },
    { budgetPlannedMinor: 0n },
    { budgetPlannedMinor: -5n },
    { organizationId: "not-a-uuid" },
    {
      startsAt: new Date("2026-10-30T00:00:00.000Z"),
      endsAt: new Date("2026-10-01T00:00:00.000Z"),
    },
    { utm: { utmSource: "" } },
    { utm: { utmSource: "x".repeat(101) } },
  ]) {
    assert.throws(() => campaign(overrides));
  }
  assert.throws(
    () => campaign({ utm: { utmSource: "" } }),
    CampaignValidationError,
  );
});

test("EF-401 lifecycle is draft→active→completed/cancelled only, and every accepted transition is audited", () => {
  assert.equal(campaignTransitionIsAllowed("DRAFT", "ACTIVE"), true);
  assert.equal(campaignTransitionIsAllowed("DRAFT", "CANCELLED"), true);
  assert.equal(campaignTransitionIsAllowed("ACTIVE", "COMPLETED"), true);
  assert.equal(campaignTransitionIsAllowed("ACTIVE", "CANCELLED"), true);
  assert.equal(campaignTransitionIsAllowed("DRAFT", "COMPLETED"), false);
  assert.equal(campaignTransitionIsAllowed("COMPLETED", "ACTIVE"), false);
  assert.equal(campaignTransitionIsAllowed("CANCELLED", "ACTIVE"), false);

  const activated = transitionCampaign(campaign(), {
    toStatus: "ACTIVE",
    actorId: actor,
    at: new Date("2026-10-02T00:00:00.000Z"),
  });
  assert.equal(activated.campaign.status, "ACTIVE");
  assert.equal(activated.transition.fromStatus, "DRAFT");
  assert.equal(activated.transition.toStatus, "ACTIVE");
  assert.equal(activated.transition.actorId, actor);
  assert.equal(activated.transition.reason, undefined);

  assert.throws(
    () =>
      transitionCampaign(campaign(), {
        toStatus: "COMPLETED",
        actorId: actor,
        at: now,
      }),
    CampaignStateError,
  );
  assert.throws(
    () =>
      transitionCampaign(activated.campaign, {
        toStatus: "ACTIVE",
        actorId: actor,
        at: now,
      }),
    CampaignStateError,
  );
});

test("EF-401 cancelling a campaign requires a mandatory audit reason", () => {
  const activated = transitionCampaign(campaign(), {
    toStatus: "ACTIVE",
    actorId: actor,
    at: now,
  });
  assert.throws(
    () =>
      transitionCampaign(activated.campaign, {
        toStatus: "CANCELLED",
        actorId: actor,
        at: now,
      }),
    CampaignValidationError,
  );
  const cancelled = transitionCampaign(activated.campaign, {
    toStatus: "CANCELLED",
    reason: "budget frozen",
    actorId: actor,
    at: now,
  });
  assert.equal(cancelled.transition.reason, "budget frozen");
});

test("EF-401 budget corrections are append-only adjustments with mandatory reason and a real delta", () => {
  assert.throws(
    () =>
      correctCampaignBudget(campaign(), {
        correctedMinor: 100000n,
        reason: "no change",
        actorId: actor,
        at: now,
      }),
    CampaignValidationError,
  );
  assert.throws(
    () =>
      correctCampaignBudget(campaign(), {
        correctedMinor: 200000n,
        reason: "   ",
        actorId: actor,
        at: now,
      }),
    CampaignValidationError,
  );
  assert.throws(
    () =>
      correctCampaignBudget(campaign(), {
        correctedMinor: 0n,
        reason: "zero",
        actorId: actor,
        at: now,
      }),
    CampaignValidationError,
  );
  const corrected = correctCampaignBudget(campaign(), {
    correctedMinor: 150000n,
    reason: "scope grew",
    actorId: actor,
    at: now,
  });
  assert.equal(corrected.correction.previousMinor, 100000n);
  assert.equal(corrected.correction.correctedMinor, 150000n);
  assert.equal(corrected.correction.currency, "SAR");
  assert.equal(corrected.correction.reason, "scope grew");
  assert.equal(corrected.campaign.budget.amountMinor, 150000n);

  const cancelled = transitionCampaign(corrected.campaign, {
    toStatus: "CANCELLED",
    reason: "stop",
    actorId: actor,
    at: now,
  });
  assert.throws(
    () =>
      correctCampaignBudget(cancelled.campaign, {
        correctedMinor: 999n,
        reason: "late",
        actorId: actor,
        at: now,
      }),
    CampaignStateError,
  );
});

test("EF-401 manual performance entries validate bounded non-negative metrics", () => {
  const entry = createCampaignPerformanceEntry({
    id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
    organizationId: org,
    campaignId: campaignA,
    occurredAt: now,
    impressions: 1200,
    clicks: 340,
    leadsCount: 12,
    createdBy: actor,
    createdAt: now,
  });
  assert.equal(entry.leadsCount, 12);
  assert.equal(entry.note, undefined);
  for (const overrides of [
    { impressions: -1 },
    { clicks: 1.5 },
    { leadsCount: 1_000_000_001 },
    { campaignId: "nope" },
    { note: "" },
  ]) {
    assert.throws(
      () =>
        createCampaignPerformanceEntry({
          id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
          organizationId: org,
          campaignId: campaignA,
          occurredAt: now,
          impressions: 0,
          clicks: 0,
          leadsCount: 0,
          createdBy: actor,
          createdAt: now,
          ...overrides,
        }),
      CampaignValidationError,
    );
  }
});

test("EF-401 first/last-touch attribution is correct on seeded sequences with deterministic tie-breaking", () => {
  // Empty and organic-only sequences never attribute.
  assert.deepEqual(deriveTouchAttribution([]), {});
  assert.deepEqual(
    deriveTouchAttribution([
      touch("aaaaaaaa-0001-4aaa-8aaa-aaaaaaaaaaaa", { campaignId: undefined }),
    ]),
    {},
  );

  const early = touch("aaaaaaaa-0001-4aaa-8aaa-aaaaaaaaaaaa", {
    occurredAt: new Date(1000),
  });
  const middle = touch("aaaaaaaa-0002-4aaa-8aaa-aaaaaaaaaaaa", {
    occurredAt: new Date(2000),
    campaignId: campaignB,
  });
  const late = touch("aaaaaaaa-0003-4aaa-8aaa-aaaaaaaaaaaa", {
    occurredAt: new Date(3000),
  });
  const derived = deriveTouchAttribution([late, early, middle]);
  assert.equal(derived.firstTouch?.id, early.id);
  assert.equal(derived.lastTouch?.id, late.id);

  // Same occurredAt breaks the tie by the opaque touch id, so attribution is
  // deterministic regardless of insertion order.
  const tieA = touch("aaaaaaaa-0005-4aaa-8aaa-aaaaaaaaaaaa", {
    occurredAt: new Date(2000),
  });
  const tieB = touch("aaaaaaaa-0004-4aaa-8aaa-aaaaaaaaaaaa", {
    occurredAt: new Date(2000),
    campaignId: campaignB,
  });
  const orderedFirst = deriveTouchAttribution([tieA, tieB]);
  assert.equal(orderedFirst.firstTouch?.id, tieB.id);
  assert.equal(orderedFirst.lastTouch?.id, tieA.id);
  const reordered = deriveTouchAttribution([tieB, tieA]);
  assert.equal(reordered.firstTouch?.id, tieB.id);
  assert.equal(reordered.lastTouch?.id, tieA.id);
});

test("EF-401 append-only attribution corrections override the derived campaign without mutating touches", () => {
  const first = touch("aaaaaaaa-0001-4aaa-8aaa-aaaaaaaaaaaa", {
    occurredAt: new Date(1000),
  });
  const last = touch("aaaaaaaa-0002-4aaa-8aaa-aaaaaaaaaaaa", {
    occurredAt: new Date(2000),
    campaignId: campaignB,
  });
  const derived = deriveTouchAttribution([first, last]);
  assert.equal(derived.lastTouch?.campaignId, campaignB);

  const override = correction({
    previousCampaignId: campaignB,
    correctedCampaignId: campaignA,
  });
  const effective = applyAttributionOverride(derived, override);
  assert.equal(effective.firstCampaignId, campaignA);
  assert.equal(effective.lastCampaignId, campaignA);
  assert.equal(effective.override?.correctedCampaignId, campaignA);
  // The underlying touches remain untouched.
  assert.equal(effective.firstTouch?.campaignId, campaignA);
  assert.equal(effective.lastTouch?.campaignId, campaignB);

  // A correction with no target campaign clears attribution entirely.
  const cleared = applyAttributionOverride(
    derived,
    correction({ correctedCampaignId: undefined }),
  );
  assert.equal(cleared.firstCampaignId, undefined);
  assert.equal(cleared.lastCampaignId, undefined);
  // No correction leaves the derivation in place.
  const untouched = applyAttributionOverride(derived, undefined);
  assert.equal(untouched.firstCampaignId, campaignA);
  assert.equal(untouched.lastCampaignId, campaignB);
});

test("EF-401 corrections must change the attributed campaign and the latest one wins", () => {
  assert.throws(
    () =>
      correction({
        previousCampaignId: campaignB,
        correctedCampaignId: campaignB,
      }),
    CampaignValidationError,
  );
  assert.throws(() => correction({ reason: "" }), CampaignValidationError);

  const older = correction({
    id: "cccccccc-0001-4ccc-8ccc-cccccccccccc",
    createdAt: new Date(1000),
  });
  const newer = correction({
    id: "cccccccc-0002-4ccc-8ccc-cccccccccccc",
    createdAt: new Date(2000),
    correctedCampaignId: undefined,
  });
  assert.equal(latestCorrection([older, newer])?.id, newer.id);
  assert.equal(latestCorrection([newer, older])?.id, newer.id);
  assert.equal(latestCorrection([]), undefined);
  // Same timestamp breaks the tie by id.
  const tieLow = correction({
    id: "cccccccc-0003-4ccc-8ccc-cccccccccccc",
    createdAt: now,
  });
  const tieHigh = correction({
    id: "cccccccc-0004-4ccc-8ccc-cccccccccccc",
    createdAt: now,
  });
  assert.equal(latestCorrection([tieHigh, tieLow])?.id, tieHigh.id);
});
