import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { ExpenseApplication } from "../dist/features/finance/application/expense-application.js";
import {
  createExpenseApprovalPolicy,
  createExpenseDraft,
  createExpenseEvidenceMetadata,
  decideExpense,
  submitExpenseWithPolicy,
} from "../dist/features/finance/domain/expense.js";

const org = "11111111-1111-4111-8111-111111111111";
const otherOrg = "22222222-2222-4222-8222-222222222222";
const owner = "33333333-3333-4333-8333-333333333333";
const manager = "44444444-4444-4444-8444-444444444444";
const broker = "55555555-5555-4555-8555-555555555555";
const approver = "66666666-6666-4666-8666-666666666666";
const property = "77777777-7777-4777-8777-777777777777";
const deal = "88888888-8888-4888-8888-888888888888";
const expenseId = "99999999-9999-4999-8999-999999999999";
const evidenceId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const now = new Date("2026-09-21T10:00:00.000Z");

function membership(role, status = "ACTIVE") {
  return { organizationId: org, role, status };
}
function verified(userId) {
  return { actor: { verified: true }, userId, organizationId: org };
}
function draft(overrides = {}) {
  return createExpenseDraft({
    id: expenseId,
    organizationId: org,
    category: "OFFICE",
    vendorReference: "Vendor",
    amountMinor: 5000n,
    currency: "SAR",
    dimensions: {},
    createdBy: owner,
    createdAt: now,
    ...overrides,
  });
}
function submittedExpense(overrides = {}) {
  return submitExpenseWithPolicy(draft(overrides), null, {
    submittedBy: manager,
    submittedAt: now,
  });
}
function decidedExpense(decision, reason) {
  return decideExpense(submittedExpense(), {
    decidedBy: approver,
    decidedAt: now,
    decision,
    ...(reason === undefined ? {} : { reason }),
  });
}
function evidence(overrides = {}) {
  return createExpenseEvidenceMetadata({
    id: evidenceId,
    organizationId: org,
    expenseId,
    mediaType: "PDF",
    byteSize: 1024,
    attachedBy: owner,
    attachedAt: now,
    commandPayloadHash: "a".repeat(64),
    ...overrides,
  });
}
const policy = createExpenseApprovalPolicy({
  organizationId: org,
  thresholdMinor: 1000n,
  currency: "SAR",
});

function repository(overrides = {}, calls = []) {
  return {
    calls,
    async findProperty(organizationId, id) {
      calls.push(["property", organizationId, id]);
      return overrides.property === undefined
        ? { id, organizationId }
        : overrides.property;
    },
    async findDeal(organizationId, id) {
      calls.push(["deal", organizationId, id]);
      return overrides.deal === undefined ? { id, organizationId } : overrides.deal;
    },
    async findExpense(organizationId, id) {
      calls.push(["expense", organizationId, id]);
      return overrides.expense === undefined ? null : overrides.expense;
    },
    async findApprovalPolicy(organizationId) {
      calls.push(["policy", organizationId]);
      return overrides.policy ?? null;
    },
    async resolveEvidenceIdempotency(input) {
      calls.push(["evidence-replay", input]);
      return overrides.evidenceReplay ?? { kind: "absent" };
    },
    async createExpenseDraft(input) {
      calls.push(["create", input.expense.id]);
      return { kind: "created", expense: input.expense };
    },
    async attachExpenseEvidence(input) {
      calls.push(["attach", input.evidence.id]);
      return { kind: "attached", evidence: input.evidence };
    },
    async submitExpense(input) {
      calls.push(["submit", input.expense.status]);
      return {
        kind: input.expense.status === "APPROVED" ? "auto-approved" : "submitted",
        expense: input.expense,
      };
    },
    async decideExpense(input) {
      calls.push(["decide", input.expense.status]);
      return { kind: "decided", expense: input.expense };
    },
    async saveApprovalPolicy(input) {
      calls.push(["save-policy", input.policy.organizationId]);
      return overrides.policySave ?? { kind: "saved", policy: input.policy };
    },
  };
}

test("commands deny unverified actors and non-Owner/Manager memberships", async () => {
  const repositoryStub = repository();
  const application = new ExpenseApplication(repositoryStub, {
    async findMembership(organizationId, userId) {
      if (userId === broker) return membership("BROKER");
      if (userId === "suspended") return membership("OWNER", "SUSPENDED");
      return null;
    },
  });
  const denied = { kind: "access-denied" };
  assert.deepEqual(
    await application.createExpenseDraft({
      ...verified(owner),
      actor: { verified: false },
      id: expenseId,
      category: "OFFICE",
      vendorReference: "v",
      amountMinor: 1n,
      currency: "SAR",
      dimensions: {},
      createdAt: now,
    }),
    denied,
  );
  assert.deepEqual(
    await application.createExpenseDraft({
      ...verified(broker),
      id: expenseId,
      category: "OFFICE",
      vendorReference: "v",
      amountMinor: 1n,
      currency: "SAR",
      dimensions: {},
      createdAt: now,
    }),
    denied,
  );
  assert.deepEqual(
    await application.setExpenseApprovalPolicy({
      ...verified(broker),
      thresholdMinor: null,
      currency: "SAR",
    }),
    denied,
  );
  assert.deepEqual(
    await application.submitExpenseForApproval({
      ...verified("suspended"),
      expenseId,
      submittedAt: now,
    }),
    denied,
  );
  assert.equal(repositoryStub.calls.length, 0);
});

test("createExpenseDraft resolves dimensions inside the organization and rejects foreign references", async () => {
  const calls = [];
  const repositoryStub = repository({}, calls);
  const application = new ExpenseApplication(repositoryStub, {
    async findMembership() {
      return membership("MANAGER");
    },
  });
  const created = await application.createExpenseDraft({
    ...verified(manager),
    id: expenseId,
    category: "CAMPAIGN",
    vendorReference: "Ads",
    amountMinor: 2500n,
    currency: "SAR",
    dimensions: { propertyId: property, dealId: deal },
    createdAt: now,
  });
  assert.equal(created.kind, "created");
  assert.deepEqual(created.expense.dimensions, {
    propertyId: property,
    dealId: deal,
  });
  assert.deepEqual(calls[0], ["property", org, property]);
  assert.deepEqual(calls[1], ["deal", org, deal]);
  assert.deepEqual(
    await new ExpenseApplication(repository({ property: null }), {
      async findMembership() {
        return membership("MANAGER");
      },
    }).createExpenseDraft({
      ...verified(manager),
      id: expenseId,
      category: "OFFICE",
      vendorReference: "Ads",
      amountMinor: 2500n,
      currency: "SAR",
      dimensions: { propertyId: property },
      createdAt: now,
    }),
    { kind: "not-found", resource: "property" },
  );
  const foreign = repository({ deal: { id: deal, organizationId: otherOrg } }, []);
  assert.deepEqual(
    await new ExpenseApplication(foreign, {
      async findMembership() {
        return membership("OWNER");
      },
    }).createExpenseDraft({
      ...verified(owner),
      id: expenseId,
      category: "OFFICE",
      vendorReference: "Ads",
      amountMinor: 2500n,
      currency: "SAR",
      dimensions: { dealId: deal },
      createdAt: now,
    }),
    { kind: "not-found", resource: "deal" },
  );
});

test("attachExpenseEvidence replays identical payloads and conflicts on payload reuse", async () => {
  const base = {
    actor: { verified: true },
    userId: owner,
    organizationId: org,
    expenseId,
    evidenceId,
    mediaType: "PDF",
    byteSize: 1024,
    attachedAt: now,
  };
  const existing = evidence();
  const replay = repository({
    expense: draft(),
    evidenceReplay: { kind: "replayed", evidence: existing },
  });
  const replayApplication = new ExpenseApplication(replay, {
    async findMembership() {
      return membership("OWNER");
    },
  });
  const replayed = await replayApplication.attachExpenseEvidence(base);
  assert.deepEqual(replayed, { kind: "replayed", evidence: existing });
  const conflict = repository({
    expense: draft(),
    evidenceReplay: {
      kind: "conflict",
      reason: "evidence-idempotency-payload-conflict",
    },
  });
  assert.deepEqual(
    await new ExpenseApplication(conflict, {
      async findMembership() {
        return membership("OWNER");
      },
    }).attachExpenseEvidence({ ...base, byteSize: 9999 }),
    { kind: "conflict", reason: "evidence-idempotency-payload-conflict" },
  );
  const calls = [];
  const fresh = repository({ expense: draft() }, calls);
  const attached = await new ExpenseApplication(fresh, {
    async findMembership() {
      return membership("MANAGER");
    },
  }).attachExpenseEvidence(base);
  assert.equal(attached.kind, "attached");
  const hashInput = JSON.parse(
    JSON.stringify(fresh.calls.find(([kind]) => kind === "attach")),
  );
  assert.ok(hashInput);
  const [, resolution] = fresh.calls.find(
    ([kind]) => kind === "evidence-replay",
  );
  assert.equal(resolution.evidenceId, evidenceId);
  const expectedHash = createHash("sha256")
    .update(
      JSON.stringify({
        organizationId: org,
        expenseId,
        evidenceId,
        mediaType: "PDF",
        byteSize: 1024,
        note: null,
        attachedBy: owner,
        attachedAt: now.toISOString(),
      }),
      "utf8",
    )
    .digest("hex");
  assert.equal(attached.evidence.commandPayloadHash, expectedHash);
  const decided = repository({ expense: decidedExpense("APPROVED") });
  assert.deepEqual(
    await new ExpenseApplication(decided, {
      async findMembership() {
        return membership("OWNER");
      },
    }).attachExpenseEvidence(base),
    { kind: "conflict", reason: "expense-state-conflict" },
  );
  const missing = repository({ expense: null });
  assert.deepEqual(
    await new ExpenseApplication(missing, {
      async findMembership() {
        return membership("OWNER");
      },
    }).attachExpenseEvidence(base),
    { kind: "not-found", resource: "expense" },
  );
  const foreign = repository({ expense: draft({ organizationId: otherOrg }) });
  assert.deepEqual(
    await new ExpenseApplication(foreign, {
      async findMembership() {
        return membership("OWNER");
      },
    }).attachExpenseEvidence(base),
    { kind: "not-found", resource: "expense" },
  );
});

test("submission applies the organization policy and guards the draft state", async () => {
  const belowThreshold = repository({
    expense: draft({ amountMinor: 500n }),
    policy,
  });
  const autoApplication = new ExpenseApplication(belowThreshold, {
    async findMembership() {
      return membership("OWNER");
    },
  });
  const auto = await autoApplication.submitExpenseForApproval({
    ...verified(owner),
    expenseId,
    submittedAt: now,
  });
  assert.equal(auto.kind, "auto-approved");
  assert.equal(auto.expense.decisionReason, "BELOW_THRESHOLD_AUTO_APPROVAL");
  const above = repository({ expense: draft(), policy: null });
  const submitted = await new ExpenseApplication(above, {
    async findMembership() {
      return membership("MANAGER");
    },
  }).submitExpenseForApproval({
    ...verified(manager),
    expenseId,
    submittedAt: now,
  });
  assert.equal(submitted.kind, "submitted");
  assert.equal(submitted.expense.status, "SUBMITTED");
  const alreadySubmitted = repository({
    expense: submittedExpense(),
    policy: null,
  });
  assert.deepEqual(
    await new ExpenseApplication(alreadySubmitted, {
      async findMembership() {
        return membership("OWNER");
      },
    }).submitExpenseForApproval({
      ...verified(owner),
      expenseId,
      submittedAt: now,
    }),
    { kind: "conflict", reason: "expense-state-conflict" },
  );
  assert.deepEqual(
    await new ExpenseApplication(repository({ expense: null }), {
      async findMembership() {
        return membership("OWNER");
      },
    }).submitExpenseForApproval({
      ...verified(owner),
      expenseId,
      submittedAt: now,
    }),
    { kind: "not-found", resource: "expense" },
  );
});

test("decisions require an independent approver and replay the recorded audit", async () => {
  const submitted = submittedExpense();
  const selfApproval = repository({ expense: submitted });
  assert.deepEqual(
    await new ExpenseApplication(selfApproval, {
      async findMembership() {
        return membership("OWNER");
      },
    }).decideExpenseApproval({
      ...verified(manager),
      expenseId,
      decision: "APPROVED",
      decidedAt: now,
    }),
    { kind: "conflict", reason: "expense-state-conflict" },
  );
  const calls = [];
  const decidable = repository({ expense: submitted }, calls);
  const decided = await new ExpenseApplication(decidable, {
    async findMembership() {
      return membership("OWNER");
    },
  }).decideExpenseApproval({
    ...verified(approver),
    expenseId,
    decision: "APPROVED",
    decidedAt: now,
  });
  assert.equal(decided.kind, "decided");
  assert.equal(decided.expense.decidedBy, approver);
  const recorded = decided.expense;
  const replayRepository = repository({ expense: recorded });
  const replayed = await new ExpenseApplication(replayRepository, {
    async findMembership() {
      return membership("OWNER");
    },
  }).decideExpenseApproval({
    ...verified(approver),
    expenseId,
    decision: "APPROVED",
    decidedAt: recorded.decidedAt,
  });
  assert.deepEqual(replayed, { kind: "replayed", expense: recorded });
  const contradictory = repository({ expense: recorded });
  assert.deepEqual(
    await new ExpenseApplication(contradictory, {
      async findMembership() {
        return membership("OWNER");
      },
    }).decideExpenseApproval({
      ...verified(manager),
      expenseId,
      decision: "APPROVED",
      decidedAt: recorded.decidedAt,
    }),
    { kind: "conflict", reason: "expense-state-conflict" },
  );
  assert.deepEqual(
    await new ExpenseApplication(repository({ expense: draft() }), {
      async findMembership() {
        return membership("OWNER");
      },
    }).decideExpenseApproval({
      ...verified(approver),
      expenseId,
      decision: "APPROVED",
      decidedAt: now,
    }),
    { kind: "conflict", reason: "expense-state-conflict" },
  );
});

test("approval policy is an Owner-only command with replay on identical upsert", async () => {
  const calls = [];
  const repositoryStub = repository({ policy }, calls);
  const application = new ExpenseApplication(repositoryStub, {
    async findMembership(_organizationId, userId) {
      return membership(userId === manager ? "MANAGER" : "OWNER");
    },
  });
  assert.deepEqual(
    await application.setExpenseApprovalPolicy({
      ...verified(manager),
      thresholdMinor: 2000n,
      currency: "SAR",
    }),
    { kind: "access-denied" },
  );
  assert.equal(repositoryStub.calls.length, 0);
  const saved = await application.setExpenseApprovalPolicy({
    ...verified(owner),
    thresholdMinor: 2000n,
    currency: "SAR",
  });
  assert.equal(saved.kind, "saved");
  assert.equal(saved.policy.thresholdMinor, 2000n);
  const replayRepository = repository({
    policy: createExpenseApprovalPolicy({
      organizationId: org,
      thresholdMinor: 2000n,
      currency: "SAR",
    }),
    policySave: (function () {
      const stored = createExpenseApprovalPolicy({
        organizationId: org,
        thresholdMinor: 2000n,
        currency: "SAR",
      });
      return { kind: "replayed", policy: stored };
    })(),
  });
  const replayed = await new ExpenseApplication(replayRepository, {
    async findMembership() {
      return membership("OWNER");
    },
  }).setExpenseApprovalPolicy({
    ...verified(owner),
    thresholdMinor: 2000n,
    currency: "SAR",
  });
  assert.equal(replayed.kind, "replayed");
  assert.deepEqual(
    await new ExpenseApplication(repository(), {
      async findMembership() {
        return membership("OWNER");
      },
    }).setExpenseApprovalPolicy({
      ...verified(owner),
      thresholdMinor: null,
      currency: "SAR",
    }),
    {
      kind: "saved",
      policy: {
        organizationId: org,
        thresholdMinor: null,
        currency: "SAR",
      },
    },
  );
});
