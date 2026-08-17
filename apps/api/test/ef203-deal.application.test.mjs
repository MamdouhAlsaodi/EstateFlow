import test from "node:test";
import assert from "node:assert/strict";
import { LeadApplication } from "../dist/features/leads/application/lead-application.js";
import { LeadStage, createLead } from "../dist/features/leads/domain/lead.js";

const now = new Date("2026-08-04T10:00:00.000Z");
const lead = Object.freeze({
  ...createLead({
    id: "lead-1",
    organizationId: "org-1",
    ownerId: "owner-1",
    nextAction: "Call",
    source: "WEBSITE",
    now,
  }),
  stage: LeadStage.QUALIFIED,
  version: 3,
});
const actor = { verified: true };
const membershipReader = {
  async findMembership() {
    return { organizationId: "org-1", role: "BROKER", status: "ACTIVE" };
  },
};

function repositoryFor(initialLead = lead) {
  let currentLead = initialLead;
  const outcomes = new Map();
  const calls = [];
  return {
    calls,
    async findLead(organizationId, leadId) {
      calls.push(["read", organizationId, leadId]);
      return currentLead;
    },
    async preflightClose(input) {
      calls.push(["preflight", input]);
      const prior = outcomes.get(input.idempotencyKey);
      if (!prior) return { kind: "no-prior-command" };
      const samePayload =
        input.scope === prior.scope &&
        input.expectedVersion === prior.expectedVersion &&
        (input.scope === "CLOSE_WON"
          ? input.propertyId === prior.propertyId &&
            input.brokerId === prior.brokerId
          : input.reason === prior.reason);
      return samePayload
        ? prior.replay
        : {
            kind: "idempotency-conflict",
            idempotencyKey: input.idempotencyKey,
          };
    },
    async closeWon(input) {
      calls.push(["won", input]);
      const result = {
        kind: "ok",
        lead: input.lead,
        deal: input.deal,
        timelineEvent: input.timelineEvent,
        event: input.event,
      };
      outcomes.set(input.idempotencyKey, {
        scope: "CLOSE_WON",
        expectedVersion: input.expectedVersion,
        propertyId: input.deal.propertyId,
        brokerId: input.deal.brokerId,
        replay: { ...result, kind: "idempotent-replay" },
      });
      currentLead = input.lead;
      return result;
    },
    async closeLost(input) {
      calls.push(["lost", input]);
      const result = {
        kind: "ok",
        lead: input.lead,
        timelineEvent: input.timelineEvent,
      };
      outcomes.set(input.idempotencyKey, {
        scope: "CLOSE_LOST",
        expectedVersion: input.expectedVersion,
        reason: input.timelineEvent.data.reason,
        replay: { ...result, kind: "idempotent-replay" },
      });
      currentLead = input.lead;
      return result;
    },
  };
}

const command = {
  actor,
  userId: "user-1",
  organizationId: "org-1",
  leadId: "lead-1",
  expectedVersion: 3,
  idempotencyKey: "close-1",
  propertyId: "property-1",
  brokerId: "broker-1",
  now,
};

test("closeWon authorizes, preflights, reads scoped lead, and sends one typed deal close intent", async () => {
  const repository = repositoryFor();
  const result = await new LeadApplication(
    repository,
    membershipReader,
  ).closeWon(command);
  assert.equal(result.kind, "ok");
  assert.deepEqual(
    repository.calls.map(([kind]) => kind),
    ["preflight", "read", "won"],
  );
  const preflight = repository.calls[0][1];
  assert.deepEqual(preflight, {
    organizationId: "org-1",
    leadId: "lead-1",
    actor: "user-1",
    scope: "CLOSE_WON",
    idempotencyKey: "close-1",
    expectedVersion: 3,
    propertyId: "property-1",
    brokerId: "broker-1",
  });
  const input = repository.calls[2][1];
  assert.equal(input.timelineEvent.type, "LEAD_CLOSED_WON");
  assert.equal(input.event.schemaVersion, 1);
  assert.equal(input.deal.status, "OPEN");
  assert.equal(input.deal.version, 1);
});

test("closeWon replays the original result after the real Lead version advances", async () => {
  const repository = repositoryFor();
  const application = new LeadApplication(repository, membershipReader);
  const first = await application.closeWon(command);
  const replay = await application.closeWon(command);

  assert.equal(first.kind, "ok");
  assert.equal(replay.kind, "idempotent-replay");
  assert.strictEqual(replay.lead, first.lead);
  assert.strictEqual(replay.deal, first.deal);
  assert.strictEqual(replay.timelineEvent, first.timelineEvent);
  assert.strictEqual(replay.event, first.event);
  assert.equal(replay.lead.version, 4);
  assert.deepEqual(
    repository.calls.map(([kind]) => kind),
    ["preflight", "read", "won", "preflight"],
  );
});

test("different payload with the same key conflicts before Lead read and close mutation", async () => {
  const repository = repositoryFor();
  const application = new LeadApplication(repository, membershipReader);
  await application.closeWon(command);
  const conflict = await application.closeWon({
    ...command,
    propertyId: "property-2",
  });

  assert.deepEqual(conflict, {
    kind: "idempotency-conflict",
    idempotencyKey: "close-1",
  });
  assert.deepEqual(
    repository.calls.map(([kind]) => kind),
    ["preflight", "read", "won", "preflight"],
  );
});

test("changed expectedVersion with the same key conflicts before Lead read and close mutation", async () => {
  const repository = repositoryFor();
  const application = new LeadApplication(repository, membershipReader);
  await application.closeWon(command);
  const conflict = await application.closeWon({
    ...command,
    expectedVersion: 4,
  });

  assert.deepEqual(conflict, {
    kind: "idempotency-conflict",
    idempotencyKey: "close-1",
  });
  assert.deepEqual(
    repository.calls.map(([kind]) => kind),
    ["preflight", "read", "won", "preflight"],
  );
});

test("closeLost sends normalized reason through the explicit lost close port", async () => {
  const repository = repositoryFor();
  const result = await new LeadApplication(
    repository,
    membershipReader,
  ).closeLost({
    ...command,
    idempotencyKey: "lost-1",
    reason: "  No budget  ",
  });
  assert.equal(result.kind, "ok");
  assert.deepEqual(
    repository.calls.map(([kind]) => kind),
    ["preflight", "read", "lost"],
  );
  assert.deepEqual(repository.calls[0][1].reason, "No budget");
  assert.deepEqual(repository.calls[2][1].timelineEvent.data, {
    reason: "No budget",
  });
  assert.equal("deal" in repository.calls[2][1], false);
});

test("authorization and invalid idempotency reject before preflight or Lead reads", async () => {
  let membershipCalls = 0;
  const deniedMemberships = {
    async findMembership() {
      membershipCalls += 1;
      return { organizationId: "org-1", role: "CLIENT", status: "ACTIVE" };
    },
  };
  const denied = repositoryFor();
  assert.deepEqual(
    await new LeadApplication(denied, deniedMemberships).closeWon(command),
    { kind: "access-denied" },
  );
  assert.equal(denied.calls.length, 0);
  assert.equal(membershipCalls, 1);

  const invalid = repositoryFor();
  assert.deepEqual(
    await new LeadApplication(invalid, membershipReader).closeLost({
      ...command,
      idempotencyKey: "",
      reason: "reason",
    }),
    { kind: "invalid-idempotency-key" },
  );
  assert.equal(invalid.calls.length, 0);
});

test("normal ownership and stale version checks remain before close mutation", async () => {
  const missing = repositoryFor(null);
  assert.deepEqual(
    await new LeadApplication(missing, membershipReader).closeWon(command),
    { kind: "ownership-conflict" },
  );
  assert.deepEqual(
    missing.calls.map(([kind]) => kind),
    ["preflight", "read"],
  );

  const stale = repositoryFor(Object.freeze({ ...lead, version: 4 }));
  assert.deepEqual(
    await new LeadApplication(stale, membershipReader).closeLost({
      ...command,
      reason: "reason",
    }),
    { kind: "stale-version-conflict", expectedVersion: 3, actualVersion: 4 },
  );
  assert.deepEqual(
    stale.calls.map(([kind]) => kind),
    ["preflight", "read"],
  );
});
