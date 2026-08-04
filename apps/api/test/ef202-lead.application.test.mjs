import test from "node:test";
import assert from "node:assert/strict";
import { LeadApplication } from "../dist/features/leads/application/lead-application.js";
import { createLead } from "../dist/features/leads/domain/lead.js";

const baseInputNow = new Date("2026-08-04T10:00:00.000Z");
const lead = createLead({ id: "lead-1", organizationId: "org-1", ownerId: "owner-1", nextAction: "Call", source: "REFERRAL", now: baseInputNow });
const actor = { verified: true };
const userId = "user-1";
const activeAllowedMembershipReader = {
  async findMembership(organizationId, membershipUserId) {
    if (organizationId !== "org-1" || membershipUserId !== userId) return null;
    return { organizationId, role: "OWNER", status: "ACTIVE" };
  },
};

test("application create succeeds with an immutable create timeline intent", async () => {
  let command;
  const repository = {
    async createLead(input) { command = input; return { kind: "ok", lead: input.lead, timelineEvents: input.timelineEvents }; },
  };
  const result = await new LeadApplication(repository, activeAllowedMembershipReader).create({ actor, userId, organizationId: "org-1", lead: { id: "lead-created", ownerId: "owner-1", nextAction: "Call", source: "WEBSITE" }, idempotencyKey: "create-1", now: baseInputNow });
  assert.equal(result.kind, "ok");
  assert.equal(command.timelineEvents[0].type, "LEAD_CREATED");
  assert.ok(Object.isFrozen(command.timelineEvents));
  assert.ok(Object.isFrozen(command.timelineEvents[0]));
  assert.ok(Object.isFrozen(command.timelineEvents[0].data));
});

test("unverified actor is denied before repository access", async () => {
  let calls = 0;
  const repository = { async createLead() { calls += 1; throw new Error("must not call repository"); } };
  const result = await new LeadApplication(repository, activeAllowedMembershipReader).create({ actor: { verified: false }, userId, organizationId: "org-1", lead: { id: "lead-denied", ownerId: "owner-1", nextAction: "Call", source: "WEBSITE" }, idempotencyKey: "denied-1" });
  assert.deepEqual(result, { kind: "access-denied" });
  assert.equal(calls, 0);
});

test("invalid or empty idempotency keys do not call the repository", async () => {
  let calls = 0;
  const repository = { async createLead() { calls += 1; throw new Error("must not call repository"); } };
  const application = new LeadApplication(repository, activeAllowedMembershipReader);
  for (const idempotencyKey of ["", "   ", "x".repeat(256)]) {
    const result = await application.create({ actor, userId, organizationId: "org-1", lead: { id: "lead-invalid", ownerId: "owner-1", nextAction: "Call", source: "WEBSITE" }, idempotencyKey });
    assert.deepEqual(result, { kind: "invalid-idempotency-key" });
  }
  assert.equal(calls, 0);
});

test("application transition carries organization ownership, optimistic version and idempotency key", async () => {
  const calls = [];
  const repository = {
    async findLead(organizationId, leadId) { return organizationId === "org-1" && leadId === lead.id ? lead : null; },
    async updateLead(input) { calls.push(input); return { kind: "ok", lead: input.lead, timelineEvents: input.timelineEvents }; },
  };
  const result = await new LeadApplication(repository, activeAllowedMembershipReader).transition({ actor, userId, organizationId: "org-1", leadId: lead.id, expectedVersion: 1, to: "CONTACTED", idempotencyKey: "idem-1", now: new Date("2026-08-04T11:00:00.000Z") });
  assert.equal(result.kind, "ok");
  assert.equal(result.lead.stage, "CONTACTED");
  assert.equal(calls[0].organizationId, "org-1");
  assert.equal(calls[0].expectedVersion, 1);
  assert.equal(calls[0].idempotencyKey, "idem-1");
  assert.equal(calls[0].timelineEvents[0].type, "LEAD_STAGE_CHANGED");
});

test("application returns typed stale-version and ownership conflicts without repository mutation", async () => {
  const repository = {
    async findLead() { return { ...lead, version: 2 }; },
    async updateLead() { throw new Error("must not mutate stale lead"); },
  };
  const application = new LeadApplication(repository, activeAllowedMembershipReader);
  assert.deepEqual(await application.assign({ actor, userId, organizationId: "org-1", leadId: lead.id, expectedVersion: 1, ownerId: "owner-2", idempotencyKey: "idem-2" }), { kind: "stale-version-conflict", expectedVersion: 1, actualVersion: 2 });
  assert.deepEqual(await application.assign({ actor, userId, organizationId: "org-2", leadId: lead.id, expectedVersion: 1, ownerId: "owner-2", idempotencyKey: "idem-3" }), { kind: "ownership-conflict" });
});

test("repository fake replays the original result without duplicate timeline append intent", async () => {
  const accepted = new Map();
  let updateCalls = 0;
  const repository = {
    async findLead() { return lead; },
    async updateLead(input) {
      updateCalls += 1;
      const prior = accepted.get(input.idempotencyKey);
      if (prior) return { kind: "idempotent-replay", lead: prior.lead, timelineEvents: prior.timelineEvents };
      const result = { kind: "ok", lead: input.lead, timelineEvents: input.timelineEvents };
      accepted.set(input.idempotencyKey, result);
      return result;
    },
  };
  const application = new LeadApplication(repository, activeAllowedMembershipReader);
  const command = { actor, userId, organizationId: "org-1", leadId: lead.id, expectedVersion: 1, nextAction: "Email", idempotencyKey: "idem-replay" };
  const first = await application.setNextAction(command);
  const replay = await application.setNextAction(command);
  assert.equal(first.kind, "ok");
  assert.equal(replay.kind, "idempotent-replay");
  assert.strictEqual(replay.lead, first.lead);
  assert.strictEqual(replay.timelineEvents, first.timelineEvents);
  assert.equal(updateCalls, 2);
  assert.equal("deleteTimelineEvent" in repository, false);
});
