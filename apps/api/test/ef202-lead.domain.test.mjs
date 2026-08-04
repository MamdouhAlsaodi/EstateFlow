import test from "node:test";
import assert from "node:assert/strict";
import {
  LeadStage,
  LeadOwnershipConflictError,
  LeadVersionConflictError,
  createLead,
  transitionLead,
  assignLead,
  setLeadNextAction,
} from "../dist/features/leads/domain/lead.js";

const baseInput = {
  id: "lead-1",
  organizationId: "org-1",
  ownerId: "owner-1",
  nextAction: "Call the client",
  source: "WEBSITE",
  utm: { source: "google", medium: "cpc", campaign: "summer" },
  now: new Date("2026-08-04T10:00:00.000Z"),
};

test("lead creation uses exactly the four approved stages and version one", () => {
  const lead = createLead(baseInput);
  assert.deepEqual(LeadStage, { NEW: "NEW", CONTACTED: "CONTACTED", QUALIFIED: "QUALIFIED", NURTURING: "NURTURING" });
  assert.equal(lead.stage, "NEW");
  assert.equal(lead.version, 1);
  assert.equal(lead.organizationId, "org-1");
  assert.deepEqual(lead.utm, baseInput.utm);
});

test("lead creation requires organization ownership, owner assignment and next action", () => {
  assert.throws(() => createLead({ ...baseInput, organizationId: "" }), LeadOwnershipConflictError);
  assert.throws(() => createLead({ ...baseInput, ownerId: null }), /owner/);
  assert.throws(() => createLead({ ...baseInput, nextAction: "" }), /next action/);
});

test("only the approved lead transitions are accepted", () => {
  const allowed = [["NEW", "CONTACTED"], ["CONTACTED", "QUALIFIED"], ["QUALIFIED", "NURTURING"], ["CONTACTED", "NEW"], ["QUALIFIED", "CONTACTED"], ["NURTURING", "CONTACTED"]];
  for (const [from, to] of allowed) {
    const lead = { ...createLead(baseInput), stage: from, version: 4 };
    const result = transitionLead(lead, to, 4, baseInput.now);
    assert.equal(result.lead.stage, to);
    assert.equal(result.lead.version, 5);
    assert.equal(result.timelineEvent.type, "LEAD_STAGE_CHANGED");
  }
  assert.throws(() => transitionLead(createLead(baseInput), "NURTURING", 1, baseInput.now), /transition/);
  assert.throws(() => transitionLead(createLead(baseInput), "WON", 1, baseInput.now), /stage/);
});

test("assignment and next-action changes produce explicit timeline intents", () => {
  const lead = createLead(baseInput);
  const assigned = assignLead(lead, "owner-2", 1, baseInput.now);
  assert.equal(assigned.lead.ownerId, "owner-2");
  assert.equal(assigned.timelineEvent.type, "LEAD_ASSIGNED");
  const nextAction = setLeadNextAction(assigned.lead, "Send brochure", 2, baseInput.now);
  assert.equal(nextAction.lead.nextAction, "Send brochure");
  assert.equal(nextAction.timelineEvent.type, "LEAD_NEXT_ACTION_CHANGED");
});

test("domain mutations reject stale versions", () => {
  const lead = createLead(baseInput);
  assert.throws(() => assignLead(lead, "owner-2", 0, baseInput.now), LeadVersionConflictError);
});
