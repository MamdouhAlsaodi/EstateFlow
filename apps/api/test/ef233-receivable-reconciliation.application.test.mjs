import test from "node:test";
import assert from "node:assert/strict";
import { ReceivableApplication } from "../dist/features/finance/application/receivable-application.js";
import {
  cancelInvoice,
  classifyReceivableAging,
  createInvoiceDraft,
  issueInvoice,
  ReceivableStateError,
  ReceivableValidationError,
} from "../dist/features/finance/domain/receivable.js";

const issuedAt = new Date("2026-08-20T10:00:00.000Z");
const dueAt = new Date("2026-08-25T10:00:00.000Z");
const cancellationAt = new Date("2026-08-26T10:00:00.000Z");
const baseInvoice = createInvoiceDraft({
  id: "invoice-1",
  organizationId: "org-1",
  dealId: "deal-1",
  amountMinor: 100n,
  currency: "USD",
  createdBy: "u1",
  createdAt: issuedAt,
});
const issued = issueInvoice(baseInvoice, {
  issuedBy: "u1",
  issuedAt,
  dueAt,
  receivableId: "receivable-1",
});
const base = {
  actor: { verified: true },
  userId: "u1",
  organizationId: "org-1",
};

function cancellationInput(overrides = {}) {
  return {
    invoice: issued.invoice,
    receivable: issued.receivable,
    cancelledBy: "u2",
    cancelledAt: cancellationAt,
    reason: "customer request",
    hasPayments: false,
    ...overrides,
  };
}

function repository(calls, overrides = {}) {
  return {
    binding: "receivable-repository",
    async findInvoice(org, id) {
      calls.push(["invoice", org, id]);
      return Object.hasOwn(overrides, "invoice")
        ? overrides.invoice
        : issued.invoice;
    },
    async findReceivableByInvoice(org, id) {
      calls.push(["receivable-by-invoice", org, id]);
      return Object.hasOwn(overrides, "receivable")
        ? overrides.receivable
        : issued.receivable;
    },
    async hasPayments(org, id) {
      assert.equal(this.binding, "receivable-repository");
      calls.push(["has-payments", org, id]);
      return Object.hasOwn(overrides, "hasPayments")
        ? overrides.hasPayments
        : false;
    },
    async cancelInvoice(input) {
      assert.equal(this.binding, "receivable-repository");
      calls.push(["cancel", input]);
      return {
        kind: "cancelled",
        invoice: input.invoice,
        receivable: input.receivable,
      };
    },
  };
}

const membership = {
  async findMembership() {
    return { organizationId: "org-1", role: "OWNER", status: "ACTIVE" };
  },
};

function cancellationApplication(calls, overrides = {}, member = membership) {
  return new ReceivableApplication(repository(calls, overrides), member);
}

function cancelCommand(overrides = {}) {
  return {
    ...base,
    invoiceId: "invoice-1",
    cancelledAt: cancellationAt,
    reason: "customer request",
    ...overrides,
  };
}

test("domain cancellation preserves snapshots and writes cancellation audit", () => {
  const result = cancelInvoice(cancellationInput());

  assert.equal(result.invoice.status, "CANCELLED");
  assert.equal(result.receivable.status, "CANCELLED");
  assert.equal(result.invoice.cancellationReason, "customer request");
  assert.equal(result.invoice.cancelledBy, "u2");
  assert.equal(
    result.invoice.cancelledAt?.toISOString(),
    cancellationAt.toISOString(),
  );
  assert.equal(result.receivable.outstandingMinor, 100n);
  assert.equal(result.receivable.originalMoney.amountMinor, 100n);
  assert.equal(result.invoice.money.amountMinor, 100n);
  assert.equal(
    result.receivable.issuedAt.toISOString(),
    issuedAt.toISOString(),
  );
  assert.equal(result.receivable.dueAt.toISOString(), dueAt.toISOString());
});

test("domain cancellation rejects mismatched cancellation resources", () => {
  const variants = [
    [
      "organization",
      { invoice: { ...issued.invoice, organizationId: "org-2" } },
    ],
    ["invoice identity", { invoice: { ...issued.invoice, id: "invoice-2" } }],
    ["deal", { invoice: { ...issued.invoice, dealId: "deal-2" } }],
    [
      "original amount",
      {
        receivable: {
          ...issued.receivable,
          originalMoney: {
            ...issued.receivable.originalMoney,
            amountMinor: 101n,
          },
          outstandingMinor: 101n,
        },
      },
    ],
    [
      "currency",
      {
        receivable: {
          ...issued.receivable,
          originalMoney: {
            ...issued.receivable.originalMoney,
            currency: "EUR",
          },
        },
      },
    ],
    [
      "issuedAt",
      {
        receivable: {
          ...issued.receivable,
          issuedAt: new Date("2026-08-21T10:00:00.000Z"),
        },
      },
    ],
    [
      "dueAt",
      {
        receivable: {
          ...issued.receivable,
          dueAt: new Date("2026-08-26T10:00:00.000Z"),
        },
      },
    ],
  ];

  for (const [name, overrides] of variants) {
    assert.throws(
      () => cancelInvoice(cancellationInput(overrides)),
      ReceivableStateError,
      name,
    );
  }
});

test("domain cancellation requires issued metadata and cannot precede issue time", () => {
  assert.throws(
    () =>
      cancelInvoice(
        cancellationInput({
          invoice: { ...issued.invoice, issuedBy: undefined },
        }),
      ),
    ReceivableStateError,
  );
  assert.throws(
    () =>
      cancelInvoice(
        cancellationInput({
          cancelledAt: new Date("2026-08-20T09:59:59.999Z"),
        }),
      ),
    ReceivableValidationError,
  );
});

test("domain cancellation rejects each non-open receivable state", () => {
  for (const status of ["PARTIALLY_PAID", "PAID", "CANCELLED"]) {
    assert.throws(
      () =>
        cancelInvoice(
          cancellationInput({ receivable: { ...issued.receivable, status } }),
        ),
      ReceivableStateError,
      status,
    );
  }
});

test("domain cancellation rejects invoice state, payment, date, and reason violations", () => {
  assert.throws(
    () => cancelInvoice(cancellationInput({ invoice: baseInvoice })),
    ReceivableStateError,
  );
  assert.throws(
    () => cancelInvoice(cancellationInput({ hasPayments: true })),
    ReceivableStateError,
  );
  assert.throws(
    () =>
      cancelInvoice(cancellationInput({ cancelledAt: new Date("invalid") })),
    ReceivableValidationError,
  );
  assert.throws(
    () => cancelInvoice(cancellationInput({ reason: "😀".repeat(501) })),
    ReceivableValidationError,
  );
});

test("aging uses UTC ceiling boundaries and excludes settled rows", () => {
  const at = (milliseconds) => new Date(dueAt.getTime() + milliseconds);

  assert.deepEqual(classifyReceivableAging(issued.receivable, dueAt), {
    daysPastDue: 0,
    bucket: "CURRENT",
  });
  assert.deepEqual(classifyReceivableAging(issued.receivable, at(1)), {
    daysPastDue: 1,
    bucket: "DAYS_1_30",
  });
  for (const [days, bucket] of [
    [30, "DAYS_1_30"],
    [31, "DAYS_31_60"],
    [60, "DAYS_31_60"],
    [61, "DAYS_61_90"],
    [90, "DAYS_61_90"],
    [91, "DAYS_91_PLUS"],
  ]) {
    assert.equal(
      classifyReceivableAging(issued.receivable, at(days * 86400000)).bucket,
      bucket,
    );
  }
  assert.equal(
    classifyReceivableAging({ ...issued.receivable, status: "PAID" }, dueAt),
    null,
  );
  assert.equal(
    classifyReceivableAging(
      { ...issued.receivable, status: "CANCELLED" },
      dueAt,
    ),
    null,
  );
  assert.throws(
    () => classifyReceivableAging(issued.receivable, new Date("invalid")),
    ReceivableValidationError,
  );
});

test("aging authorizes before cursor validation and reads bounded rows", async () => {
  const calls = [];
  const agingRepository = {
    ...repository(calls),
    async listOutstandingReceivables(query) {
      calls.push(["aging", query]);
      return [issued.receivable];
    },
  };
  const app = new ReceivableApplication(agingRepository, membership);
  const result = await app.getReceivableAging({
    actor: { verified: true },
    userId: "u1",
    organizationId: "org-1",
    asOf: new Date("2026-08-26T10:00:00.000Z"),
    limit: 1,
  });

  assert.equal(result.items.length, 1);
  assert.equal(result.items[0].bucket, "DAYS_1_30");
  assert.equal(calls[0][0], "aging");
  assert.equal(calls[0][1].limit, 2);
});

test("cancellation authorizes before lookup and orders preflight before one mutation", async () => {
  const calls = [];
  const result =
    await cancellationApplication(calls).cancelInvoice(cancelCommand());

  assert.equal(result.kind, "cancelled");
  assert.deepEqual(
    calls.map(([kind]) => kind),
    ["invoice", "receivable-by-invoice", "has-payments", "cancel"],
  );

  const deniedCalls = [];
  const denied = await cancellationApplication(
    deniedCalls,
    {},
    {
      async findMembership() {
        return { organizationId: "org-1", role: "BROKER", status: "ACTIVE" };
      },
    },
  ).cancelInvoice(cancelCommand());
  assert.deepEqual(denied, { kind: "access-denied" });
  assert.equal(deniedCalls.length, 0);

  const invalidActorCalls = [];
  const invalidActor = await cancellationApplication(
    invalidActorCalls,
  ).cancelInvoice(cancelCommand({ userId: "", reason: "   " }));
  assert.deepEqual(invalidActor, { kind: "access-denied" });
  assert.equal(invalidActorCalls.length, 0);
});

test("missing invoice and receivable return typed not-found without mutation", async () => {
  const missingInvoiceCalls = [];
  const missingInvoice = await cancellationApplication(missingInvoiceCalls, {
    invoice: null,
  }).cancelInvoice(cancelCommand({ invoiceId: "missing" }));
  assert.deepEqual(missingInvoice, { kind: "not-found", resource: "invoice" });
  assert.deepEqual(
    missingInvoiceCalls.map(([kind]) => kind),
    ["invoice"],
  );

  const missingReceivableCalls = [];
  const missingReceivable = await cancellationApplication(
    missingReceivableCalls,
    { receivable: null },
  ).cancelInvoice(cancelCommand());
  assert.deepEqual(missingReceivable, {
    kind: "not-found",
    resource: "receivable",
  });
  assert.deepEqual(
    missingReceivableCalls.map(([kind]) => kind),
    ["invoice", "receivable-by-invoice"],
  );
});

test("cross-tenant invoice and receivable return typed not-found without mutation", async () => {
  const invoiceCalls = [];
  const invoice = await cancellationApplication(invoiceCalls, {
    invoice: { ...issued.invoice, organizationId: "org-2" },
  }).cancelInvoice(cancelCommand());
  assert.deepEqual(invoice, { kind: "not-found", resource: "invoice" });
  assert.deepEqual(
    invoiceCalls.map(([kind]) => kind),
    ["invoice"],
  );

  const receivableCalls = [];
  const receivable = await cancellationApplication(receivableCalls, {
    receivable: { ...issued.receivable, organizationId: "org-2" },
  }).cancelInvoice(cancelCommand());
  assert.deepEqual(receivable, { kind: "not-found", resource: "receivable" });
  assert.deepEqual(
    receivableCalls.map(([kind]) => kind),
    ["invoice", "receivable-by-invoice"],
  );
});

test("invalid cancellation replay audit raises validation before payment preflight or mutation", async () => {
  const cancelled = cancelInvoice(cancellationInput({ cancelledBy: "u1" }));
  const invalidInputs = [
    { cancelledAt: new Date("invalid") },
    { reason: 42 },
    { reason: "   " },
    { reason: "x".repeat(501) },
  ];

  for (const invalid of invalidInputs) {
    const calls = [];
    await assert.rejects(
      () =>
        cancellationApplication(calls, {
          invoice: cancelled.invoice,
          receivable: cancelled.receivable,
        }).cancelInvoice(cancelCommand(invalid)),
      ReceivableValidationError,
    );
    assert.deepEqual(calls, []);
  }
});

test("changed cancellation replay actor conflicts without payment preflight or mutation", async () => {
  const cancelled = cancelInvoice(cancellationInput({ cancelledBy: "u1" }));
  const calls = [];
  const result = await cancellationApplication(calls, {
    invoice: cancelled.invoice,
    receivable: cancelled.receivable,
  }).cancelInvoice(cancelCommand({ userId: "u2" }));

  assert.deepEqual(result, {
    kind: "conflict",
    reason: "cancellation-replay-conflict",
  });
  assert.deepEqual(
    calls.map(([kind]) => kind),
    ["invoice", "receivable-by-invoice"],
  );
});

test("request-time changes do not break equivalent cancellation replay", async () => {
  const cancelled = cancelInvoice(cancellationInput({ cancelledBy: "u1" }));
  const calls = [];
  const result = await cancellationApplication(calls, {
    invoice: cancelled.invoice,
    receivable: cancelled.receivable,
  }).cancelInvoice(
    cancelCommand({ cancelledAt: new Date("2026-08-27T10:00:00.000Z") }),
  );

  assert.equal(result.kind, "replayed");
  assert.deepEqual(
    calls.map(([kind]) => kind),
    ["invoice", "receivable-by-invoice"],
  );
});

test("request-equivalent cancellation retry reuses persisted cancellation time", async () => {
  const cancelled = cancelInvoice(
    cancellationInput({ cancelledBy: "u1", cancelledAt: cancellationAt }),
  );
  const calls = [];
  const result = await cancellationApplication(calls, {
    invoice: cancelled.invoice,
    receivable: cancelled.receivable,
  }).cancelInvoice(
    cancelCommand({
      cancelledAt: new Date("2026-08-27T10:00:00.000Z"),
      userId: "u1",
    }),
  );

  assert.equal(result.kind, "replayed");
  assert.equal(result.invoice.cancelledAt?.getTime(), cancellationAt.getTime());
});

test("changed valid canonical cancellation reason conflicts without payment preflight or mutation", async () => {
  const cancelled = cancelInvoice(
    cancellationInput({ cancelledBy: "u1", reason: "request" }),
  );
  const calls = [];
  const result = await cancellationApplication(calls, {
    invoice: cancelled.invoice,
    receivable: cancelled.receivable,
  }).cancelInvoice(cancelCommand({ reason: "other reason" }));

  assert.deepEqual(result, {
    kind: "conflict",
    reason: "cancellation-replay-conflict",
  });
  assert.deepEqual(
    calls.map(([kind]) => kind),
    ["invoice", "receivable-by-invoice"],
  );
});
