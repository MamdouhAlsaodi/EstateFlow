import test from "node:test";
import assert from "node:assert/strict";
import {
  ReceivableStateError,
  ReceivableValidationError,
  createInvoiceDraft,
  issueInvoice,
  recordPayment,
} from "../dist/features/finance/domain/receivable.js";

const issuedAt = new Date("2026-08-20T10:00:00.000Z");
const dueAt = new Date("2026-08-25T10:00:00.000Z");
const draft = createInvoiceDraft({
  id: "invoice-1",
  organizationId: "org-1",
  dealId: "deal-1",
  amountMinor: 100n,
  currency: "usd",
  createdBy: "owner-1",
  createdAt: issuedAt,
});

test("creates immutable invoice drafts with positive bigint money and bounded identity", () => {
  assert.equal(draft.status, "DRAFT");
  assert.equal(draft.money.amountMinor, 100n);
  assert.equal(draft.money.currency, "USD");
  assert.ok(Object.isFrozen(draft));
  for (const amountMinor of [0n, -1n, 1, 1.5, "100"])
    assert.throws(
      () =>
        createInvoiceDraft({
          id: "i",
          organizationId: "o",
          dealId: "d",
          amountMinor,
          currency: "USD",
          createdBy: "u",
          createdAt: issuedAt,
        }),
      ReceivableValidationError,
    );
  assert.throws(
    () =>
      createInvoiceDraft({
        id: "i",
        organizationId: "o",
        dealId: "d",
        amountMinor: 1n,
        currency: "US",
        createdBy: "u",
        createdAt: issuedAt,
      }),
    ReceivableValidationError,
  );
  assert.throws(
    () =>
      createInvoiceDraft({
        id: "",
        organizationId: "o",
        dealId: "d",
        amountMinor: 1n,
        currency: "USD",
        createdBy: "u",
        createdAt: new Date("invalid"),
      }),
    ReceivableValidationError,
  );
});

test("issue snapshots one open receivable and rejects invalid lifecycle or due dates", () => {
  const result = issueInvoice(draft, {
    issuedBy: "owner-1",
    issuedAt,
    dueAt,
    receivableId: "receivable-1",
  });
  assert.equal(result.invoice.status, "ISSUED");
  assert.equal(result.invoice.money.amountMinor, 100n);
  assert.equal(result.receivable.status, "OPEN");
  assert.equal(result.receivable.outstandingMinor, 100n);
  assert.equal(result.receivable.invoiceId, draft.id);
  assert.ok(Object.isFrozen(result.invoice));
  assert.ok(Object.isFrozen(result.receivable));
  assert.throws(
    () =>
      issueInvoice(result.invoice, {
        issuedBy: "u",
        issuedAt,
        dueAt,
        receivableId: "r",
      }),
    ReceivableStateError,
  );
  assert.throws(
    () =>
      issueInvoice(draft, {
        issuedBy: "u",
        issuedAt,
        dueAt: new Date("2026-08-19T00:00:00.000Z"),
        receivableId: "r",
      }),
    ReceivableValidationError,
  );
  assert.throws(
    () =>
      issueInvoice(draft, {
        issuedBy: "u",
        issuedAt: new Date("invalid"),
        dueAt,
        receivableId: "r",
      }),
    ReceivableValidationError,
  );
});

test("records exact-currency payments and derives partial then paid status", () => {
  const issued = issueInvoice(draft, {
    issuedBy: "owner-1",
    issuedAt,
    dueAt,
    receivableId: "receivable-1",
  });
  const first = recordPayment(issued.receivable, {
    id: "payment-1",
    amountMinor: 30n,
    currency: "USD",
    recordedAt: new Date("2026-08-21T10:00:00.000Z"),
    recordedBy: "owner-1",
    idempotencyKey: "pay-1",
    commandPayloadHash: "hash-1",
  });
  assert.equal(first.receivable.outstandingMinor, 70n);
  assert.equal(first.receivable.status, "PARTIALLY_PAID");
  const second = recordPayment(first.receivable, {
    id: "payment-2",
    amountMinor: 70n,
    currency: "USD",
    recordedAt: new Date("2026-08-22T10:00:00.000Z"),
    recordedBy: "owner-1",
    idempotencyKey: "pay-2",
    commandPayloadHash: "hash-2",
  });
  assert.equal(second.receivable.outstandingMinor, 0n);
  assert.equal(second.receivable.status, "PAID");
  assert.ok(Object.isFrozen(first.payment));
  assert.ok(Object.isFrozen(second.payment));
  for (const input of [
    { amountMinor: 0n },
    { amountMinor: -1n },
    { amountMinor: 71n },
    { amountMinor: 30n, currency: "EUR" },
    { amountMinor: 30n, recordedAt: new Date("invalid") },
  ]) {
    assert.throws(
      () =>
        recordPayment(first.receivable, {
          id: "p",
          amountMinor: 30n,
          currency: "USD",
          recordedAt: issuedAt,
          recordedBy: "u",
          idempotencyKey: "key",
          commandPayloadHash: "hash",
          ...input,
        }),
      ReceivableValidationError,
    );
  }
  assert.throws(
    () =>
      recordPayment(
        { ...first.receivable, status: "CANCELLED" },
        {
          id: "p",
          amountMinor: 1n,
          currency: "USD",
          recordedAt: issuedAt,
          recordedBy: "u",
          idempotencyKey: "key",
          commandPayloadHash: "hash",
        },
      ),
    ReceivableStateError,
  );
});
