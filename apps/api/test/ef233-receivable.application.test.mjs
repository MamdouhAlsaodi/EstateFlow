import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { ReceivableApplication } from "../dist/features/finance/application/receivable-application.js";
import {
  createInvoiceDraft,
  issueInvoice,
} from "../dist/features/finance/domain/receivable.js";

const now = new Date("2026-08-20T10:00:00.000Z");
const deal = { id: "deal-1", organizationId: "org-1" };
const invoice = createInvoiceDraft({
  id: "invoice-1",
  organizationId: "org-1",
  dealId: "deal-1",
  amountMinor: 100n,
  currency: "USD",
  createdBy: "u1",
  createdAt: now,
});
const receivable = issueInvoice(
  createInvoiceDraft({
    id: "invoice-1",
    organizationId: "org-1",
    dealId: "deal-1",
    amountMinor: 100n,
    currency: "USD",
    createdBy: "u1",
    createdAt: now,
  }),
  {
    issuedBy: "u1",
    issuedAt: now,
    dueAt: new Date("2026-08-25T10:00:00.000Z"),
    receivableId: "receivable-1",
  },
).receivable;
const base = {
  actor: { verified: true },
  userId: "u1",
  organizationId: "org-1",
};

function repository(calls, overrides = {}) {
  return {
    async findDeal(org, id) {
      calls.push(["deal", org, id]);
      return overrides.deal === undefined ? deal : overrides.deal;
    },
    async findInvoice(org, id) {
      calls.push(["invoice", org, id]);
      return overrides.invoice === undefined ? invoice : overrides.invoice;
    },
    async findReceivable(org, id) {
      calls.push(["receivable", org, id]);
      return overrides.receivable === undefined
        ? receivable
        : overrides.receivable;
    },
    async resolvePaymentIdempotency(input) {
      calls.push(["payment-replay", input]);
      return overrides.paymentReplay ?? { kind: "absent" };
    },
    async findReceivableByInvoice(org, invoiceId) {
      calls.push(["receivable-by-invoice", org, invoiceId]);
      return overrides.receivableByInvoice === undefined
        ? receivable
        : overrides.receivableByInvoice;
    },
    async createInvoiceDraft(input) {
      calls.push(["create-draft", input]);
      return { kind: "created", invoice: input.invoice };
    },
    async issueInvoice(input) {
      calls.push(["issue", input]);
      return {
        kind: "issued",
        invoice: input.invoice,
        receivable: input.receivable,
      };
    },
    async recordPayment(input) {
      calls.push(["payment", input]);
      return (
        overrides.paymentResult ?? {
          kind: "recorded",
          payment: input.payment,
          receivable: input.receivable,
        }
      );
    },
  };
}

const membership = {
  async findMembership() {
    return { organizationId: "org-1", role: "OWNER", status: "ACTIVE" };
  },
};

test("authorized draft creation uses persisted deal authority and one mutation", async () => {
  const calls = [];
  const result = await new ReceivableApplication(
    repository(calls),
    membership,
  ).createInvoiceDraft({
    ...base,
    invoiceId: "invoice-new",
    dealId: "deal-1",
    amountMinor: 100n,
    currency: "USD",
    createdAt: now,
  });
  assert.equal(result.kind, "created");
  assert.deepEqual(
    calls.map(([kind]) => kind),
    ["deal", "create-draft"],
  );
  assert.equal(calls[1][1].invoice.dealId, "deal-1");
  assert.equal(calls[1][1].invoice.organizationId, "org-1");
});

test("issue and payment resolve persisted authority before typed mutation ports", async () => {
  const calls = [];
  const app = new ReceivableApplication(repository(calls), membership);
  assert.equal(
    (
      await app.issueInvoice({
        ...base,
        invoiceId: "invoice-1",
        receivableId: "receivable-1",
        issuedAt: now,
        dueAt: new Date("2026-08-25T10:00:00.000Z"),
      })
    ).kind,
    "issued",
  );
  assert.equal(
    (
      await app.recordPayment({
        ...base,
        receivableId: "receivable-1",
        paymentId: "payment-1",
        amountMinor: 10n,
        currency: "USD",
        recordedAt: now,
        idempotencyKey: "key-1",
      })
    ).kind,
    "recorded",
  );
  assert.deepEqual(
    calls.map(([kind]) => kind),
    ["invoice", "issue", "payment-replay", "receivable", "payment"],
  );
  assert.equal(calls[1][1].receivable.id, "receivable-1");
});

test("exact payment replay resolves before current balance validation or mutation", async () => {
  const calls = [];
  const original = {
    id: "payment-1",
    organizationId: "org-1",
    receivableId: "receivable-1",
    money: { amountMinor: 100n, currency: "USD" },
    recordedAt: now,
    recordedBy: "u1",
    idempotencyKey: "key-1",
    commandPayloadHash: "hash-1",
  };
  const paid = { ...receivable, outstandingMinor: 0n, status: "PAID" };
  const result = await new ReceivableApplication(
    repository(calls, {
      receivable: paid,
      paymentReplay: { kind: "replayed", payment: original, receivable: paid },
    }),
    membership,
  ).recordPayment({
    ...base,
    receivableId: "receivable-1",
    paymentId: "payment-1",
    amountMinor: 100n,
    currency: "USD",
    recordedAt: now,
    idempotencyKey: "key-1",
  });
  assert.deepEqual(result, {
    kind: "replayed",
    payment: original,
    receivable: paid,
  });
  assert.deepEqual(
    calls.map(([kind]) => kind),
    ["payment-replay"],
  );
});

test("conflicting payment replay resolves before authority lookup or mutation", async () => {
  const calls = [];
  const result = await new ReceivableApplication(
    repository(calls, {
      paymentReplay: {
        kind: "conflict",
        reason: "idempotency-payload-conflict",
      },
    }),
    membership,
  ).recordPayment({
    ...base,
    receivableId: "receivable-1",
    paymentId: "payment-1",
    amountMinor: 10n,
    currency: "USD",
    recordedAt: now,
    idempotencyKey: "key-1",
  });
  assert.deepEqual(result, {
    kind: "conflict",
    reason: "idempotency-payload-conflict",
  });
  assert.deepEqual(
    calls.map(([kind]) => kind),
    ["payment-replay"],
  );
});

test("same issued invoice replays only for an identical persisted snapshot", async () => {
  const issued = issueInvoice(invoice, {
    issuedBy: "u1",
    issuedAt: now,
    dueAt: new Date("2026-08-25T10:00:00.000Z"),
    receivableId: "receivable-1",
  }).invoice;
  const calls = [];
  const result = await new ReceivableApplication(
    repository(calls, { invoice: issued }),
    membership,
  ).issueInvoice({
    ...base,
    invoiceId: "invoice-1",
    receivableId: "receivable-1",
    issuedAt: now,
    dueAt: new Date("2026-08-25T10:00:00.000Z"),
  });
  assert.deepEqual(result, { kind: "replayed", invoice: issued, receivable });
  assert.deepEqual(
    calls.map(([kind]) => kind),
    ["invoice", "receivable-by-invoice"],
  );
});

test("changed issued snapshot is a typed conflict without mutation", async () => {
  const issued = issueInvoice(invoice, {
    issuedBy: "u1",
    issuedAt: now,
    dueAt: new Date("2026-08-25T10:00:00.000Z"),
    receivableId: "receivable-1",
  }).invoice;
  const calls = [];
  const result = await new ReceivableApplication(
    repository(calls, { invoice: issued }),
    membership,
  ).issueInvoice({
    ...base,
    invoiceId: "invoice-1",
    receivableId: "receivable-1",
    issuedAt: now,
    dueAt: new Date("2026-08-26T10:00:00.000Z"),
  });
  assert.deepEqual(result, {
    kind: "conflict",
    reason: "invoice-ownership-or-id-conflict",
  });
  assert.deepEqual(
    calls.map(([kind]) => kind),
    ["invoice", "receivable-by-invoice"],
  );
});

for (const role of ["BROKER", "CLIENT"])
  test(`${role} cannot reach repository`, async () => {
    const calls = [];
    const denied = new ReceivableApplication(repository(calls), {
      async findMembership() {
        return { organizationId: "org-1", role, status: "ACTIVE" };
      },
    });
    assert.deepEqual(
      await denied.createInvoiceDraft({
        ...base,
        invoiceId: "i",
        dealId: "d",
        amountMinor: 1n,
        currency: "USD",
        createdAt: now,
      }),
      { kind: "access-denied" },
    );
    assert.equal(calls.length, 0);
  });

test("unverified and inactive actors are denied before lookup", async () => {
  const calls = [];
  const inactive = new ReceivableApplication(repository(calls), {
    async findMembership() {
      return { organizationId: "org-1", role: "OWNER", status: "SUSPENDED" };
    },
  });
  assert.deepEqual(
    await inactive.issueInvoice({
      ...base,
      invoiceId: "i",
      issuedAt: now,
      dueAt: now,
    }),
    { kind: "access-denied" },
  );
  assert.deepEqual(
    await new ReceivableApplication(
      repository(calls),
      membership,
    ).recordPayment({
      ...base,
      actor: { verified: false },
      receivableId: "r",
      paymentId: "p",
      amountMinor: 1n,
      currency: "USD",
      recordedAt: now,
      idempotencyKey: "k",
    }),
    { kind: "access-denied" },
  );
  assert.equal(calls.length, 0);
});

for (const resource of ["deal", "invoice", "receivable"])
  test(`missing ${resource} returns generic not-found without mutation`, async () => {
    const calls = [];
    const result = await new ReceivableApplication(
      repository(calls, { [resource]: null }),
      membership,
    )[
      resource === "deal"
        ? "createInvoiceDraft"
        : resource === "invoice"
          ? "issueInvoice"
          : "recordPayment"
    ]({
      ...base,
      ...(resource === "deal"
        ? {
            invoiceId: "i",
            dealId: "d",
            amountMinor: 1n,
            currency: "USD",
            createdAt: now,
          }
        : resource === "invoice"
          ? { invoiceId: "i", issuedAt: now, dueAt: now }
          : {
              receivableId: "r",
              paymentId: "p",
              amountMinor: 1n,
              currency: "USD",
              recordedAt: now,
              idempotencyKey: "k",
            }),
    });
    assert.deepEqual(result, { kind: "not-found", resource });
    assert.equal(
      calls.some(([kind]) =>
        ["create-draft", "issue", "payment"].includes(kind),
      ),
      false,
    );
  });

test("payment identity is derived from exact authenticated business input", async () => {
  const captures = [];
  const command = {
    ...base,
    receivableId: "receivable-1",
    paymentId: "payment-1",
    amountMinor: 10n,
    currency: "usd",
    recordedAt: now,
    idempotencyKey: "key-identity",
  };
  const captureRepository = repository([], {
    paymentReplay: { kind: "conflict", reason: "idempotency-payload-conflict" },
  });
  captureRepository.resolvePaymentIdempotency = async (input) => {
    captures.push(input);
    return { kind: "conflict", reason: "idempotency-payload-conflict" };
  };
  const app = new ReceivableApplication(captureRepository, membership);
  assert.equal((await app.recordPayment(command)).kind, "conflict");
  assert.equal((await app.recordPayment({ ...command })).kind, "conflict");
  assert.equal(captures[0].scope, "RECEIVABLE_PAYMENT_RECORD");
  assert.equal(captures[0].commandPayloadHash, captures[1].commandPayloadHash);
  assert.equal(captures[0].organizationId, "org-1");

  for (const [field, value] of [
    ["amountMinor", 11n],
    ["currency", "EUR"],
    ["recordedAt", new Date("2026-08-20T10:00:01.000Z")],
    ["paymentId", "payment-2"],
    ["userId", "u2"],
    ["organizationId", "org-2"],
    ["receivableId", "receivable-2"],
  ]) {
    const changed = { ...command, [field]: value };
    const changedMembership = {
      async findMembership(organizationId) {
        return { organizationId, role: "OWNER", status: "ACTIVE" };
      },
    };
    const changedCaptures = [];
    const changedRepository = repository([], {
      paymentReplay: { kind: "absent" },
    });
    changedRepository.resolvePaymentIdempotency = async (input) => {
      changedCaptures.push(input);
      return { kind: "conflict", reason: "idempotency-payload-conflict" };
    };
    await new ReceivableApplication(
      changedRepository,
      changedMembership,
    ).recordPayment(changed);
    assert.notEqual(
      changedCaptures[0].commandPayloadHash,
      captures[0].commandPayloadHash,
      field,
    );
  }
});

test("canonical idempotency keys share lookup identity and payment payload identity", async () => {
  const captures = [];
  const payments = [];
  const captureRepository = repository(captures, {
    paymentReplay: { kind: "absent" },
  });
  captureRepository.recordPayment = async (input) => {
    payments.push(input);
    return {
      kind: "recorded",
      payment: input.payment,
      receivable: input.receivable,
    };
  };
  const app = new ReceivableApplication(captureRepository, membership);
  const command = {
    ...base,
    receivableId: "receivable-1",
    paymentId: "payment-1",
    amountMinor: 10n,
    currency: "USD",
    recordedAt: now,
  };

  assert.equal(
    (await app.recordPayment({ ...command, idempotencyKey: "key-canonical" }))
      .kind,
    "recorded",
  );
  assert.equal(
    (await app.recordPayment({ ...command, idempotencyKey: " key-canonical " }))
      .kind,
    "recorded",
  );
  const replayCalls = captures.filter(([kind]) => kind === "payment-replay");
  assert.equal(replayCalls[0][1].idempotencyKey, "key-canonical");
  assert.equal(replayCalls[1][1].idempotencyKey, "key-canonical");
  assert.equal(
    replayCalls[0][1].commandPayloadHash,
    replayCalls[1][1].commandPayloadHash,
  );
  assert.equal(payments[0].payment.idempotencyKey, "key-canonical");
  assert.equal(payments[1].payment.idempotencyKey, "key-canonical");
});

test("whitespace-only and non-string idempotency keys reject before repository lookup or mutation", async () => {
  for (const idempotencyKey of ["   ", 123, null]) {
    const calls = [];
    const app = new ReceivableApplication(repository(calls), membership);
    await assert.rejects(
      () =>
        app.recordPayment({
          ...base,
          receivableId: "receivable-1",
          paymentId: "payment-1",
          amountMinor: 10n,
          currency: "USD",
          recordedAt: now,
          idempotencyKey,
        }),
      /Invalid idempotency key/,
    );
    assert.equal(calls.length, 0);
  }
});

test("idempotency keys longer than 200 characters reject before repository lookup", async () => {
  const calls = [];
  const app = new ReceivableApplication(repository(calls), membership);
  await assert.rejects(
    () =>
      app.recordPayment({
        ...base,
        receivableId: "receivable-1",
        paymentId: "payment-1",
        amountMinor: 10n,
        currency: "USD",
        recordedAt: now,
        idempotencyKey: "k".repeat(201),
      }),
    /Invalid idempotency key/,
  );
  assert.equal(calls.length, 0);
});

test("application payment command has no caller payload hash", () => {
  const source = readFileSync(
    new URL(
      "../src/features/finance/application/receivable-application.ts",
      import.meta.url,
    ),
    "utf8",
  );
  assert.match(
    source,
    /type PaymentCommand\s*=\s*CommandBase\s*&\s*Readonly<\s*\{\s*receivableId:\s*string;\s*paymentId:\s*string;\s*amountMinor:\s*bigint;\s*currency:\s*string;\s*recordedAt:\s*Date;\s*idempotencyKey:\s*string;\s*\}\s*>/,
  );
});

test("repository port exposes only typed bounded intents", () => {
  const source = readFileSync(
    new URL(
      "../src/features/finance/application/receivable-repository.ts",
      import.meta.url,
    ),
    "utf8",
  );
  assert.doesNotMatch(source, /any|unknown as|\?\./);
  assert.doesNotMatch(source, /\b(ledger|gateway|bank|cancel|amend|aging)\b/i);
});
