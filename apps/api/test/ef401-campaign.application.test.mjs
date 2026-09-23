import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { Buffer } from "node:buffer";
import { CampaignApplication } from "../dist/features/campaigns/application/campaign-application.js";
import {
  decodeCursor,
  encodeCursor,
} from "../dist/features/campaigns/application/campaign-application.js";

const org = "11111111-1111-4111-8111-111111111111";
const otherOrg = "22222222-2222-4222-8222-222222222222";
const owner = "33333333-3333-4333-8333-333333333333";
const manager = "44444444-4444-4444-8444-444444444444";
const campaignId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const leadId = "44444444-4444-4444-8444-444444444444";
const now = new Date("2026-10-01T10:00:00.000Z");

function membership(role, status = "ACTIVE", organizationId = org) {
  return { organizationId, role, status };
}
function verified(userId, organizationId = org) {
  return { actor: { verified: true }, userId, organizationId };
}
function unverified(userId) {
  return { actor: { verified: false }, userId, organizationId: org };
}

function createInput(overrides = {}) {
  return {
    campaignId,
    name: "Ramadan",
    objective: "Leads",
    channel: "META",
    startsAt: new Date("2026-10-01T00:00:00.000Z"),
    endsAt: new Date("2026-10-30T00:00:00.000Z"),
    budgetPlannedMinor: 100000n,
    currency: "SAR",
    utm: { utmSource: "meta" },
    createdAt: now,
    ...overrides,
  };
}

function repository(overrides = {}, calls = []) {
  const state = {
    campaign: null,
    leads: new Set([leadId]),
    campaigns: new Set([campaignId]),
    transitions: [],
    ...overrides,
  };
  return {
    calls,
    async createCampaign(campaign) {
      calls.push(["createCampaign", campaign.id]);
      state.campaign = campaign;
    },
    async findCampaign(organizationId, id) {
      calls.push(["findCampaign", organizationId, id]);
      if (
        state.campaign &&
        state.campaign.organizationId === organizationId &&
        state.campaign.id === id
      )
        return state.campaign;
      return null;
    },
    async campaignActualByCurrency() {
      return [];
    },
    async listCampaignTransitions() {
      return state.transitions;
    },
    async listBudgetCorrections() {
      return [];
    },
    async recordCampaignTransition(input) {
      calls.push(["recordCampaignTransition", input.transition.toStatus]);
      state.transitions.push(input.transition);
      state.campaign = input.campaign;
      return input.transition;
    },
    async recordBudgetCorrection(input) {
      state.campaign = input.campaign;
      return input.correction;
    },
    async leadExistsInOrganization(organizationId, id) {
      calls.push(["leadExists", organizationId, id]);
      return organizationId === org && state.leads.has(id);
    },
    async campaignExistsInOrganization(organizationId, id) {
      return organizationId === org && state.campaigns.has(id);
    },
    async getLeadAttribution() {
      return {};
    },
    async insertAttributionCorrection() {},
    async insertLeadTouch(touch) {
      calls.push(["insertLeadTouch", touch.leadId]);
      return touch;
    },
    async listLeadTouches() {
      return [];
    },
    ...overrides.repository,
  };
}

test("EF-401 campaign commands follow the Owner/Manager authority matrix", async () => {
  const cases = [
    ["OWNER", true],
    ["MANAGER", true],
    ["BROKER", false],
    ["CLIENT", false],
  ];
  for (const [role, allowed] of cases) {
    const repo = repository();
    const application = new CampaignApplication(repo, {
      async findMembership() {
        return membership(role);
      },
    });
    const result = await application.createCampaign({
      ...verified(owner),
      ...createInput(),
    });
    assert.equal(result.kind, allowed ? "created" : "access-denied");
    assert.equal(repo.calls.length > 0, allowed);
  }
  // Suspended and revoked members are denied, even Owners.
  for (const status of ["SUSPENDED", "REVOKED", "PENDING"]) {
    const application = new CampaignApplication(repository(), {
      async findMembership() {
        return membership("OWNER", status);
      },
    });
    assert.equal(
      (
        await application.createCampaign({
          ...verified(owner),
          ...createInput(),
        })
      ).kind,
      "access-denied",
    );
  }
  // Unverified actors are denied.
  const unverifiedApp = new CampaignApplication(repository(), {
    async findMembership() {
      return membership("OWNER");
    },
  });
  assert.equal(
    (
      await unverifiedApp.createCampaign({
        ...unverified(owner),
        ...createInput(),
      })
    ).kind,
    "access-denied",
  );
});

test("EF-401 reads and commands are tenant-safe: foreign ids resolve to typed not-found", async () => {
  // The actor holds memberships in both orgs, but the lead exists only in org.
  const app = new CampaignApplication(repository(), {
    async findMembership(organizationId) {
      return membership("OWNER", "ACTIVE", organizationId);
    },
  });
  assert.equal(
    (
      await app.recordLeadTouch({
        ...verified(owner, otherOrg),
        leadId,
        touchId: randomUUID(),
        channel: "WEBSITE",
        utm: {},
        occurredAt: now,
        createdAt: now,
      })
    ).kind,
    "not-found",
  );
  assert.deepEqual(
    (
      await app.recordLeadTouch({
        ...verified(owner),
        leadId,
        touchId: randomUUID(),
        channel: "WEBSITE",
        utm: {},
        occurredAt: now,
        createdAt: now,
      })
    ).kind,
    "touched",
  );
});

test("EF-401 transitions persist the audit record and map lost races to conflict", async () => {
  const repo = repository();
  const app = new CampaignApplication(repo, {
    async findMembership() {
      return membership("MANAGER");
    },
  });
  await app.createCampaign({ ...verified(manager), ...createInput() });
  const transitioned = await app.transitionCampaign({
    ...verified(manager),
    campaignId,
    toStatus: "ACTIVE",
    at: now,
  });
  assert.equal(transitioned.kind, "transitioned");
  assert.equal(transitioned.transition.fromStatus, "DRAFT");
  assert.equal(transitioned.transition.toStatus, "ACTIVE");
  assert.deepEqual(repo.calls.at(-1), ["recordCampaignTransition", "ACTIVE"]);

  // Repository returning null models a concurrent transition that won.
  const racingRepo = repository({
    repository: {
      async recordCampaignTransition() {
        return null;
      },
    },
  });
  const racing = new CampaignApplication(racingRepo, {
    async findMembership() {
      return membership("MANAGER");
    },
  });
  await racing.createCampaign({ ...verified(manager), ...createInput() });
  assert.deepEqual(
    await racing.transitionCampaign({
      ...verified(manager),
      campaignId,
      toStatus: "ACTIVE",
      at: now,
    }),
    { kind: "conflict", reason: "campaign-state-conflict" },
  );

  // A foreign campaign id is a tenant-safe 404 before any write.
  assert.deepEqual(
    await app.transitionCampaign({
      ...verified(manager),
      campaignId: randomUUID(),
      toStatus: "ACTIVE",
      at: now,
    }),
    { kind: "not-found", resource: "campaign" },
  );
});

test("EF-401 attribution corrections require a lead in the organization and a real target campaign", async () => {
  const app = new CampaignApplication(repository(), {
    async findMembership() {
      return membership("OWNER");
    },
  });
  assert.deepEqual(
    await app.correctLeadAttribution({
      ...verified(owner),
      leadId: randomUUID(),
      reason: "miscategorized",
      createdAt: now,
    }),
    { kind: "not-found", resource: "lead" },
  );
  assert.deepEqual(
    await app.correctLeadAttribution({
      ...verified(owner),
      leadId,
      correctedCampaignId: randomUUID(),
      reason: "miscategorized",
      createdAt: now,
    }),
    { kind: "not-found", resource: "campaign" },
  );
  const corrected = await app.correctLeadAttribution({
    ...verified(owner),
    leadId,
    correctedCampaignId: campaignId,
    reason: "miscategorized",
    createdAt: now,
  });
  assert.equal(corrected.kind, "attribution-corrected");
});

test("EF-401 cursor codec round-trips and rejects malformed cursors", () => {
  const cursor = { at: new Date("2026-10-01T10:00:00.000Z"), id: campaignId };
  const encoded = encodeCursor(cursor);
  assert.deepEqual(decodeCursor(encoded), cursor);
  for (const bad of [
    "",
    "!!!!",
    Buffer.from(
      '{"v":2,"at":"2026-10-01T10:00:00.000Z","id":"' + campaignId + '"}',
    ).toString("base64url"),
    Buffer.from(
      '{"v":1,"at":"2026-10-01T10:00:00Z","id":"' + campaignId + '"}',
    ).toString("base64url"),
    Buffer.from(
      '{"v":1,"at":"2026-10-01T10:00:00.000Z","id":"not-a-uuid"}',
    ).toString("base64url"),
  ]) {
    assert.throws(() => decodeCursor(bad));
  }
});

test("EF-401 unbounded or non-integer page limits are rejected", async () => {
  const app = new CampaignApplication(repository(), {
    async findMembership() {
      return membership("OWNER");
    },
  });
  for (const limit of [0, -1, 101, 1.5]) {
    await assert.rejects(() =>
      app.listCampaigns({ ...verified(owner), limit }),
    );
  }
});
