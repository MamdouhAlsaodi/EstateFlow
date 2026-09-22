import test from "node:test";
import assert from "node:assert/strict";
import {
  AUTO_APPROVAL_REASON,
  createExpenseApprovalPolicy,
  createExpenseDraft,
  createExpenseEvidenceMetadata,
  decideExpense,
  expenseApprovalRequirement,
  sameDecisionAudit,
  submitExpenseWithPolicy,
  ExpenseStateError,
  ExpenseValidationError,
  expenseAcceptsEvidence,
  expenseIsDecided,
} from "../dist/features/finance/domain/expense.js";
import {
  createMoney,
  MoneyValidationError,
} from "../dist/features/finance/domain/money.js";

const org = "11111111-1111-4111-8111-111111111111";
const actor = "22222222-2222-4222-8222-222222222222";
const other = "33333333-3333-4333-8333-333333333333";
const property = "44444444-4444-4444-8444-444444444444";
const deal = "55555555-5555-4555-8555-555555555555";
const now = new Date("2026-09-21T10:00:00.000Z");

function draft(overrides = {}) {
  return createExpenseDraft({
    id: "66666666-6666-4666-8666-666666666666",
    organizationId: org,
    category: "OFFICE",
    vendorReference: "Office supplies co",
    amountMinor: 50000n,
    currency: "SAR",
    dimensions: {
      propertyId: property,
      dealId: deal,
      campaignReference: "ramadan-2026",
    },
    createdBy: actor,
    createdAt: now,
    ...overrides,
  });
}

test("createExpenseDraft validates identity, money, category, and dimensions", () => {
  const expense = draft();
  assert.equal(expense.status, "DRAFT");
  assert.equal(expense.money.currency, "SAR");
  assert.deepEqual(expense.dimensions, {
    propertyId: property,
    dealId: deal,
    campaignReference: "ramadan-2026",
  });
  assert.throws(() => draft({ amountMinor: 0n }), MoneyValidationError);
  assert.throws(() => draft({ currency: "us" }), MoneyValidationError);
  assert.throws(() => draft({ category: "TRAVEL" }), ExpenseValidationError);
  assert.throws(
    () => draft({ vendorReference: "   " }),
    ExpenseValidationError,
  );
  assert.throws(
    () => draft({ dimensions: { propertyId: "not-a-uuid" } }),
    ExpenseValidationError,
  );
  assert.throws(
    () => draft({ dimensions: { campaignReference: "" } }),
    ExpenseValidationError,
  );
  assert.throws(
    () =>
      draft({
        dimensions: { campaignReference: "x".repeat(101) },
      }),
    ExpenseValidationError,
  );
  assert.deepEqual(draft({ dimensions: {} }).dimensions, {});
});

test("expenseApprovalRequirement applies the threshold only in the policy currency", () => {
  const money = createMoney(900n, "SAR");
  const policy = createExpenseApprovalPolicy({
    organizationId: org,
    thresholdMinor: 1000n,
    currency: "SAR",
  });
  assert.equal(expenseApprovalRequirement(null, money), "REQUIRED");
  assert.equal(
    expenseApprovalRequirement(
      createExpenseApprovalPolicy({
        organizationId: org,
        thresholdMinor: null,
        currency: "SAR",
      }),
      money,
    ),
    "REQUIRED",
  );
  assert.equal(expenseApprovalRequirement(policy, money), "AUTO_APPROVED");
  assert.equal(
    expenseApprovalRequirement(policy, createMoney(1000n, "SAR")),
    "REQUIRED",
  );
  assert.equal(
    expenseApprovalRequirement(policy, createMoney(900n, "USD")),
    "REQUIRED",
  );
  assert.throws(
    () =>
      createExpenseApprovalPolicy({
        organizationId: org,
        thresholdMinor: 0n,
        currency: "SAR",
      }),
    ExpenseValidationError,
  );
});

test("submission below the threshold auto-approves with the recorded reason", () => {
  const policy = createExpenseApprovalPolicy({
    organizationId: org,
    thresholdMinor: 1000n,
    currency: "SAR",
  });
  const submitted = submitExpenseWithPolicy(
    draft({ amountMinor: 900n }),
    policy,
    {
      submittedBy: actor,
      submittedAt: now,
    },
  );
  assert.equal(submitted.status, "APPROVED");
  assert.equal(submitted.decisionReason, AUTO_APPROVAL_REASON);
  assert.equal(submitted.decidedBy, actor);
  const above = submitExpenseWithPolicy(draft({ amountMinor: 5000n }), policy, {
    submittedBy: actor,
    submittedAt: now,
  });
  assert.equal(above.status, "SUBMITTED");
  const absentPolicy = submitExpenseWithPolicy(draft(), null, {
    submittedBy: actor,
    submittedAt: now,
  });
  assert.equal(absentPolicy.status, "SUBMITTED");
});

test("decisions require an independent approver and are one-way", () => {
  const expense = submitExpenseWithPolicy(draft({ amountMinor: 5000n }), null, {
    submittedBy: actor,
    submittedAt: now,
  });
  assert.throws(
    () =>
      decideExpense(expense, {
        decidedBy: actor,
        decidedAt: now,
        decision: "APPROVED",
      }),
    ExpenseStateError,
  );
  assert.throws(
    () =>
      decideExpense(expense, {
        decidedBy: other,
        decidedAt: new Date("2026-09-20T10:00:00.000Z"),
        decision: "APPROVED",
      }),
    ExpenseValidationError,
  );
  assert.throws(
    () =>
      decideExpense(expense, {
        decidedBy: other,
        decidedAt: now,
        decision: "REJECTED",
      }),
    ExpenseValidationError,
  );
  const rejected = decideExpense(expense, {
    decidedBy: other,
    decidedAt: now,
    decision: "REJECTED",
    reason: "Duplicate vendor invoice",
  });
  assert.equal(rejected.status, "REJECTED");
  assert.equal(rejected.decision, "REJECTED");
  assert.equal(rejected.decisionReason, "Duplicate vendor invoice");
  assert.ok(expenseIsDecided(rejected));
  assert.throws(
    () =>
      decideExpense(rejected, {
        decidedBy: actor,
        decidedAt: now,
        decision: "APPROVED",
      }),
    ExpenseStateError,
  );
  const approved = decideExpense(
    submitExpenseWithPolicy(draft({ amountMinor: 5000n }), null, {
      submittedBy: actor,
      submittedAt: now,
    }),
    { decidedBy: other, decidedAt: now, decision: "APPROVED" },
  );
  assert.equal(approved.status, "APPROVED");
  assert.equal(approved.decisionReason, undefined);
  assert.ok(
    sameDecisionAudit(approved, {
      decidedBy: other,
      decidedAt: approved.decidedAt,
      decision: "APPROVED",
    }),
  );
  assert.ok(
    !sameDecisionAudit(approved, {
      decidedBy: actor,
      decidedAt: approved.decidedAt,
      decision: "APPROVED",
    }),
  );
  assert.ok(
    !sameDecisionAudit(approved, {
      decidedBy: other,
      decidedAt: approved.decidedAt,
      decision: "REJECTED",
      reason: "x",
    }),
  );
});

test("only undecided expenses accept evidence metadata", () => {
  assert.ok(expenseAcceptsEvidence(draft()));
  const submitted = submitExpenseWithPolicy(draft(), null, {
    submittedBy: actor,
    submittedAt: now,
  });
  assert.ok(expenseAcceptsEvidence(submitted));
  assert.ok(
    !expenseAcceptsEvidence(
      submitExpenseWithPolicy(
        draft({ amountMinor: 900n }),
        createExpenseApprovalPolicy({
          organizationId: org,
          thresholdMinor: 1000n,
          currency: "SAR",
        }),
        { submittedBy: actor, submittedAt: now },
      ),
    ),
  );
  const rejected = decideExpense(submitted, {
    decidedBy: other,
    decidedAt: now,
    decision: "REJECTED",
    reason: "No receipt",
  });
  assert.ok(!expenseAcceptsEvidence(rejected));
});

test("evidence metadata is validated metadata only", () => {
  const evidence = createExpenseEvidenceMetadata({
    id: "77777777-7777-4777-8777-777777777777",
    organizationId: org,
    expenseId: draft().id,
    mediaType: "PDF",
    byteSize: 2048,
    note: "Signed receipt",
    attachedBy: actor,
    attachedAt: now,
    commandPayloadHash: "a".repeat(64),
  });
  assert.equal(evidence.mediaType, "PDF");
  assert.throws(
    () =>
      createExpenseEvidenceMetadata({
        id: "77777777-7777-4777-8777-777777777777",
        organizationId: org,
        expenseId: draft().id,
        mediaType: "DOCX",
        byteSize: 2048,
        attachedBy: actor,
        attachedAt: now,
        commandPayloadHash: "a".repeat(64),
      }),
    ExpenseValidationError,
  );
  assert.throws(
    () =>
      createExpenseEvidenceMetadata({
        id: "77777777-7777-4777-8777-777777777777",
        organizationId: org,
        expenseId: draft().id,
        mediaType: "PDF",
        byteSize: 0,
        attachedBy: actor,
        attachedAt: now,
        commandPayloadHash: "a".repeat(64),
      }),
    ExpenseValidationError,
  );
  assert.throws(
    () =>
      createExpenseEvidenceMetadata({
        id: "77777777-7777-4777-8777-777777777777",
        organizationId: org,
        expenseId: draft().id,
        mediaType: "PDF",
        byteSize: 10,
        attachedBy: actor,
        attachedAt: now,
        commandPayloadHash: "not-a-hash",
      }),
    ExpenseValidationError,
  );
  assert.throws(
    () =>
      createExpenseEvidenceMetadata({
        id: "77777777-7777-4777-8777-777777777777",
        organizationId: org,
        expenseId: draft().id,
        mediaType: "PNG",
        byteSize: 10,
        note: "  ",
        attachedBy: actor,
        attachedAt: now,
        commandPayloadHash: "a".repeat(64),
      }),
    ExpenseValidationError,
  );
});
