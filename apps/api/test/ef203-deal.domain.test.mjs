import test from "node:test";
import assert from "node:assert/strict";
import {
  LeadStage,
  LeadTransitionError,
  LeadValidationError,
  createLead,
  closeWon,
  closeLost,
} from "../dist/features/leads/domain/lead.js";

const now = new Date("2026-08-04T10:00:00.000Z");
const baseLead = createLead({
  id: "lead-1",
  organizationId: "org-1",
  ownerId: "owner-1",
  nextAction: "Call client",
  source: "WEBSITE",
  now,
});

function leadAt(stage) {
  return Object.freeze({
    ...baseLead,
    stage,
    version: 7,
    updatedAt: new Date("2026-08-04T09:00:00.000Z"),
  });
}

test("terminal stages close only qualified and nurturing leads", () => {
  assert.deepEqual(LeadStage, {
    NEW: "NEW",
    CONTACTED: "CONTACTED",
    QUALIFIED: "QUALIFIED",
    NURTURING: "NURTURING",
    CLOSED_WON: "CLOSED_WON",
    CLOSED_LOST: "CLOSED_LOST",
  });
  for (const stage of [LeadStage.QUALIFIED, LeadStage.NURTURING]) {
    assert.equal(
      closeWon({
        lead: leadAt(stage),
        dealId: "deal-1",
        propertyId: "property-1",
        brokerId: "broker-1",
        expectedVersion: 7,
        now,
      }).lead.stage,
      LeadStage.CLOSED_WON,
    );
    assert.equal(
      closeLost({
        lead: leadAt(stage),
        reason: "  Not interested  ",
        expectedVersion: 7,
        now,
      }).lead.stage,
      LeadStage.CLOSED_LOST,
    );
  }
  for (const stage of [
    LeadStage.NEW,
    LeadStage.CONTACTED,
    LeadStage.CLOSED_WON,
    LeadStage.CLOSED_LOST,
  ]) {
    assert.throws(
      () =>
        closeWon({
          lead: leadAt(stage),
          dealId: "deal-1",
          propertyId: "property-1",
          brokerId: "broker-1",
          expectedVersion: 7,
          now,
        }),
      LeadTransitionError,
    );
    assert.throws(
      () =>
        closeLost({
          lead: leadAt(stage),
          reason: "reason",
          expectedVersion: 7,
          now,
        }),
      LeadTransitionError,
    );
  }
});

test("closeWon preserves history, increments once, and emits exact deal and event intents", () => {
  const lead = leadAt(LeadStage.QUALIFIED);
  const result = closeWon({
    lead,
    dealId: "deal-1",
    propertyId: "property-1",
    brokerId: "broker-1",
    expectedVersion: 7,
    now,
  });
  assert.equal(result.lead.version, 8);
  assert.equal(result.lead.updatedAt, now);
  assert.equal(result.lead.createdAt, lead.createdAt);
  assert.equal(result.lead.ownerId, lead.ownerId);
  assert.equal(result.lead.nextAction, lead.nextAction);
  assert.deepEqual(result.timelineEvent, {
    type: "LEAD_CLOSED_WON",
    leadId: "lead-1",
    organizationId: "org-1",
    occurredAt: now,
    data: { dealId: "deal-1", propertyId: "property-1", brokerId: "broker-1" },
  });
  assert.deepEqual(result.deal, {
    id: "deal-1",
    organizationId: "org-1",
    leadId: "lead-1",
    propertyId: "property-1",
    brokerId: "broker-1",
    status: "OPEN",
    version: 1,
    createdAt: now,
    updatedAt: now,
  });
  assert.deepEqual(result.event, {
    schemaVersion: 1,
    organizationId: "org-1",
    dealId: "deal-1",
    leadId: "lead-1",
    propertyId: "property-1",
    brokerId: "broker-1",
    occurredAt: now,
  });
});

test("closeWon and closeLost validate identifiers, time, version, and bounded reason", () => {
  assert.throws(
    () =>
      closeWon({
        lead: leadAt(LeadStage.QUALIFIED),
        dealId: "",
        propertyId: "property-1",
        brokerId: "broker-1",
        expectedVersion: 7,
        now,
      }),
    LeadValidationError,
  );
  assert.throws(
    () =>
      closeWon({
        lead: leadAt(LeadStage.QUALIFIED),
        dealId: "deal-1",
        propertyId: "property-1",
        brokerId: "broker-1",
        expectedVersion: 6,
        now,
      }),
    /version/,
  );
  assert.throws(
    () =>
      closeWon({
        lead: leadAt(LeadStage.QUALIFIED),
        dealId: "deal-1",
        propertyId: "property-1",
        brokerId: "broker-1",
        expectedVersion: 7,
        now: new Date("invalid"),
      }),
    LeadValidationError,
  );
  for (const reason of ["", "   ", "x".repeat(1001)]) {
    assert.throws(
      () =>
        closeLost({
          lead: leadAt(LeadStage.QUALIFIED),
          reason,
          expectedVersion: 7,
          now,
        }),
      LeadValidationError,
    );
  }
  const lost = closeLost({
    lead: leadAt(LeadStage.QUALIFIED),
    reason: "  Lost to competitor  ",
    expectedVersion: 7,
    now,
  });
  assert.deepEqual(lost.timelineEvent.data, { reason: "Lost to competitor" });
  assert.equal("deal" in lost, false);
  assert.equal("event" in lost, false);
});
