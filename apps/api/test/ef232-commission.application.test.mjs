import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { CommissionApplication } from "../dist/features/finance/application/commission-application.js";
import {
  createDefaultCommissionPlanVersion,
  createCommissionableValue,
} from "../dist/features/finance/domain/commission.js";

const now = new Date("2026-08-20T10:00:00.000Z");
const plan = createDefaultCommissionPlanVersion({
  id: "plan-1",
  organizationId: "org-1",
  version: 1,
});
const value = createCommissionableValue({
  id: "value-1",
  dealId: "deal-1",
  organizationId: "org-1",
  amountMinor: 10000n,
  currency: "USD",
  capturedBy: "u1",
  capturedAt: now,
});
const event = {
  id: "event-1",
  schemaVersion: 1,
  type: "DEAL_CLOSED_WON",
  organizationId: "org-1",
  dealId: "deal-1",
};
const deal = { id: "deal-1", organizationId: "org-1" };
const commandBase = {
  actor: { verified: true },
  userId: "u1",
  organizationId: "org-1",
};
function repo(calls, overrides = {}) {
  return {
    calls,
    async findDeal(org, id) {
      calls.push(["deal", org, id]);
      return overrides.deal === undefined ? deal : overrides.deal;
    },
    async findDealClosedWonEvent(org, id) {
      calls.push(["event", org, id]);
      return overrides.event === undefined ? event : overrides.event;
    },
    async findCommissionableValue(org, id) {
      calls.push(["value", org, id]);
      return overrides.value === undefined ? value : overrides.value;
    },
    async findPlanVersion(org, id) {
      calls.push(["plan", org, id]);
      return overrides.plan === undefined ? plan : overrides.plan;
    },
    async captureCommissionableValue(input) {
      calls.push(["capture", input]);
      return { kind: "captured", value: input.value };
    },
    async createExpectedAccrual(input) {
      calls.push(["accrue", input]);
      return { kind: "created", accrual: input.accrual };
    },
    async createPlanVersion(input) {
      calls.push(["plan-create", input]);
      return overrides.planResult ?? { kind: "created-plan", plan: input.plan };
    },
  };
}
const membershipReader = {
  async findMembership() {
    return { organizationId: "org-1", role: "OWNER", status: "ACTIVE" };
  },
};

test("createPlanVersion narrows explicit policy without unsafe assertions", () => {
  const source = readFileSync(
    new URL(
      "../src/features/finance/application/commission-application.ts",
      import.meta.url,
    ),
    "utf8",
  );
  assert.doesNotMatch(
    source,
    /as (number|readonly CommissionRecipient\\[\\]|any|unknown as)/,
  );
});

test("createPlanVersion uses the immutable default and ignores forged aggregate extras", async () => {
  const calls = [];
  const result = await new CommissionApplication(
    repo(calls),
    membershipReader,
  ).createPlanVersion({
    ...commandBase,
    id: "plan-2",
    version: 2,
    plan: { id: "forged", organizationId: "org-2", rateBps: 1, recipients: [] },
  });
  assert.equal(result.kind, "created-plan");
  assert.deepEqual(
    calls.map(([kind]) => kind),
    ["plan-create"],
  );
  assert.deepEqual(calls[0][1].plan, {
    id: "plan-2",
    organizationId: "org-1",
    version: 2,
    rateBps: 500,
    recipients: [
      { order: 1, kind: "BROKER", splitBps: 6000 },
      { order: 2, kind: "OFFICE", splitBps: 4000 },
    ],
  });
  assert.equal(Object.isFrozen(calls[0][1].plan), true);
});

test("createPlanVersion delegates explicit policy validation and returns repository result unchanged", async () => {
  const calls = [];
  const repositoryResult = { kind: "repository-result" };
  const result = await new CommissionApplication(
    repo(calls, { planResult: repositoryResult }),
    membershipReader,
  ).createPlanVersion({
    ...commandBase,
    id: "plan-3",
    version: 3,
    rateBps: 750,
    recipients: [
      { order: 2, kind: "OFFICE", splitBps: 4000 },
      { order: 1, kind: "BROKER", splitBps: 6000 },
    ],
  });
  assert.strictEqual(result, repositoryResult);
  assert.deepEqual(calls[0][1].plan.recipients, [
    { order: 1, kind: "BROKER", splitBps: 6000 },
    { order: 2, kind: "OFFICE", splitBps: 4000 },
  ]);
  const invalidCalls = [];
  await assert.rejects(() =>
    new CommissionApplication(
      repo(invalidCalls),
      membershipReader,
    ).createPlanVersion({
      ...commandBase,
      id: "bad",
      version: 1,
      rateBps: 750,
      recipients: [{ order: 1, kind: "BROKER", splitBps: 1 }],
    }),
  );
  assert.equal(invalidCalls.length, 0);
});

test("createPlanVersion rejects half-policy input before repository mutation", async () => {
  for (const policy of [
    { rateBps: 750 },
    { recipients: [{ order: 1, kind: "BROKER", splitBps: 10000 }] },
  ]) {
    const calls = [];
    await assert.rejects(() =>
      new CommissionApplication(
        repo(calls),
        membershipReader,
      ).createPlanVersion({
        ...commandBase,
        id: "bad-policy",
        version: 1,
        ...policy,
      }),
    );
    assert.equal(calls.length, 0);
  }
});

test("createPlanVersion authorizes before repository mutation", async () => {
  const calls = [];
  const denied = new CommissionApplication(repo(calls), {
    async findMembership() {
      return { organizationId: "org-1", role: "BROKER", status: "ACTIVE" };
    },
  });
  assert.deepEqual(
    await denied.createPlanVersion({
      ...commandBase,
      id: "plan-4",
      version: 1,
    }),
    { kind: "access-denied" },
  );
  assert.equal(calls.length, 0);
  const unverified = new CommissionApplication(repo(calls), membershipReader);
  assert.deepEqual(
    await unverified.createPlanVersion({
      ...commandBase,
      actor: { verified: false },
      id: "plan-5",
      version: 1,
    }),
    { kind: "access-denied" },
  );
  assert.equal(calls.length, 0);
});

test("authorization happens before lookup and broker is denied", async () => {
  const calls = [];
  const denied = new CommissionApplication(repo(calls), {
    async findMembership() {
      return { organizationId: "org-1", role: "BROKER", status: "ACTIVE" };
    },
  });
  assert.deepEqual(
    await denied.createExpectedAccrual({
      ...commandBase,
      dealId: "deal-1",
      commissionableValueId: "value-1",
      commissionPlanVersionId: "plan-1",
      dealClosedWonEventId: "event-1",
      accrualId: "a",
    }),
    { kind: "access-denied" },
  );
  assert.equal(calls.length, 0);
});

test("capture uses primitive command, scoped deal lookup, then one mutation", async () => {
  const calls = [];
  const result = await new CommissionApplication(
    repo(calls),
    membershipReader,
  ).captureCommissionableValue({
    ...commandBase,
    valueId: "value-1",
    dealId: "deal-1",
    amountMinor: 10000n,
    currency: "USD",
    capturedAt: now,
  });
  assert.equal(result.kind, "captured");
  assert.deepEqual(
    calls.map(([kind]) => kind),
    ["deal", "capture"],
  );
  assert.equal(calls[1][1].value.dealId, "deal-1");
});

test("accrual resolves all persisted authorities and ignores forged caller aggregates", async () => {
  const calls = [];
  const result = await new CommissionApplication(
    repo(calls),
    membershipReader,
  ).createExpectedAccrual({
    ...commandBase,
    dealId: "deal-1",
    commissionableValueId: "value-1",
    commissionPlanVersionId: "plan-1",
    dealClosedWonEventId: "event-1",
    accrualId: "a",
    totalMinor: 1n,
    status: "PAID",
  });
  assert.equal(result.kind, "created");
  assert.deepEqual(
    calls.map(([kind]) => kind),
    ["deal", "event", "value", "plan", "accrue"],
  );
  assert.equal(calls.at(-1)[1].accrual.totalMoney.amountMinor, 500n);
});

for (const missing of ["deal", "event", "value", "plan"])
  test(`missing ${missing} cannot reach mutation`, async () => {
    const calls = [];
    const result = await new CommissionApplication(
      repo(calls, { [missing]: null }),
      membershipReader,
    ).createExpectedAccrual({
      ...commandBase,
      dealId: "deal-1",
      commissionableValueId: "value-1",
      commissionPlanVersionId: "plan-1",
      dealClosedWonEventId: "event-1",
      accrualId: "a",
    });
    assert.deepEqual(result, { kind: "not-found", resource: missing });
    assert.equal(
      calls.some(([kind]) => kind === "accrue"),
      false,
    );
  });

test("cross-organization authority alignment fails before mutation", async () => {
  const calls = [];
  const result = await new CommissionApplication(
    repo(calls, { event: { ...event, organizationId: "org-2" } }),
    membershipReader,
  ).createExpectedAccrual({
    ...commandBase,
    dealId: "deal-1",
    commissionableValueId: "value-1",
    commissionPlanVersionId: "plan-1",
    dealClosedWonEventId: "event-1",
    accrualId: "a",
  });
  assert.deepEqual(result, { kind: "not-found", resource: "event" });
  assert.equal(
    calls.some(([kind]) => kind === "accrue"),
    false,
  );
});
