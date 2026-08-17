import test from "node:test";
import assert from "node:assert/strict";
import {
  CommissionStateError,
  CommissionValidationError,
  MoneyValidationError,
  createCommissionPlanVersion,
  createDefaultCommissionPlanVersion,
  createCommissionableValue,
  createExpectedAccrual,
  confirmCommission,
  markCommissionDue,
  markCommissionPaid,
  cancelCommission,
} from "../dist/features/finance/domain/commission.js";

const now = new Date("2026-08-20T10:00:00.000Z");
const plan = createDefaultCommissionPlanVersion({
  id: "plan-v1",
  organizationId: "org-1",
  version: 1,
});
const value = createCommissionableValue({
  id: "value-1",
  dealId: "deal-1",
  organizationId: "org-1",
  amountMinor: 19999n,
  currency: "USD",
  capturedBy: "owner-1",
  capturedAt: now,
});
const deal = { id: "deal-1", organizationId: "org-1" };
const event = {
  id: "event-1",
  schemaVersion: 1,
  type: "DEAL_CLOSED_WON",
  organizationId: "org-1",
  dealId: "deal-1",
};

test("default plan is immutable and uses the approved ordered policy", () => {
  assert.deepEqual(plan, {
    id: "plan-v1",
    organizationId: "org-1",
    version: 1,
    rateBps: 500,
    recipients: [
      { order: 1, kind: "BROKER", splitBps: 6000 },
      { order: 2, kind: "OFFICE", splitBps: 4000 },
    ],
  });
  assert.ok(Object.isFrozen(plan));
  assert.ok(Object.isFrozen(plan.recipients));
  assert.throws(
    () =>
      createCommissionPlanVersion({
        id: "x",
        organizationId: "org-1",
        version: 1,
        rateBps: 0,
        recipients: [],
      }),
    CommissionValidationError,
  );
  assert.throws(
    () =>
      createCommissionPlanVersion({
        id: "x",
        organizationId: "org-1",
        version: 1,
        rateBps: 500,
        recipients: [
          { order: 1, kind: "BROKER", splitBps: 9000 },
          { order: 1, kind: "OFFICE", splitBps: 1000 },
        ],
      }),
    CommissionValidationError,
  );
});

test("commissionable value accepts only positive bigint money and is immutable", () => {
  assert.ok(Object.isFrozen(value));
  assert.throws(
    () =>
      createCommissionableValue({
        id: "x",
        dealId: "deal-1",
        organizationId: "org-1",
        amountMinor: 1,
        currency: "USD",
        capturedBy: "u",
        capturedAt: now,
      }),
    MoneyValidationError,
  );
  assert.throws(
    () =>
      createCommissionableValue({
        id: "x",
        dealId: "deal-1",
        organizationId: "org-1",
        amountMinor: 0n,
        currency: "US",
        capturedBy: "u",
        capturedAt: now,
      }),
    MoneyValidationError,
  );
  assert.throws(
    () =>
      createCommissionableValue({
        id: "x",
        dealId: "deal-1",
        organizationId: "org-1",
        amountMinor: 1n,
        currency: "USD",
        capturedBy: "u",
        capturedAt: new Date("invalid"),
      }),
    CommissionValidationError,
  );
});

test("expected accrual ignores caller extras and allocates rounded residual to final recipient", () => {
  const accrual = createExpectedAccrual({
    id: "accrual-1",
    deal,
    event,
    value,
    plan,
    createdAt: now,
    status: "PAID",
    totalMinor: 1n,
    splits: [],
  });
  assert.equal(accrual.status, "EXPECTED");
  assert.equal(accrual.totalMoney.amountMinor, 999n);
  assert.deepEqual(
    accrual.splits.map((split) => ({
      kind: split.kind,
      amountMinor: split.money.amountMinor,
    })),
    [
      { kind: "BROKER", amountMinor: 599n },
      { kind: "OFFICE", amountMinor: 400n },
    ],
  );
  assert.equal(
    accrual.splits.reduce((sum, split) => sum + split.money.amountMinor, 0n),
    accrual.totalMoney.amountMinor,
  );
  assert.throws(
    () =>
      createExpectedAccrual({
        id: "x",
        deal,
        event: { ...event, dealId: "other" },
        value,
        plan,
        createdAt: now,
      }),
    CommissionValidationError,
  );
});

test("lifecycle and maker-checker policy are explicit", () => {
  const expected = createExpectedAccrual({
    id: "a",
    deal,
    event,
    value,
    plan,
    createdAt: now,
  });
  const confirmed = confirmCommission(expected, {
    actorId: "owner-1",
    policy: { enabled: false },
  });
  const due = markCommissionDue(confirmed, { triggerId: "approval-1" });
  assert.equal(due.status, "DUE");
  assert.equal(
    markCommissionPaid(due, { triggerId: "payment-1" }).status,
    "PAID",
  );
  assert.throws(
    () =>
      confirmCommission(expected, {
        actorId: "owner-1",
        policy: { enabled: true },
      }),
    CommissionStateError,
  );
  assert.throws(
    () => markCommissionDue(confirmed, { triggerId: "" }),
    CommissionValidationError,
  );
  assert.throws(() => cancelCommission(due), CommissionStateError);
});
