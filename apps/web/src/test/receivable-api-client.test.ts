import assert from "node:assert/strict";
import test from "node:test";
import { createApiClient } from "../lib/api-client/index";
import { createReceivableAdapter } from "../lib/api-client/receivable";

const organizationId = "11111111-1111-4111-8111-111111111101";
const dealId = "11111111-1111-4111-8111-111111111102";
const invoiceId = "11111111-1111-4111-8111-111111111103";
const receivableId = "11111111-1111-4111-8111-111111111104";

function response(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

test("receivable adapter serializes exact commands with payment-only idempotency", async () => {
  const calls: Request[] = [];
  const client = createApiClient({
    fetch: async (input, init) => {
      calls.push(
        new Request(new URL(input as string | URL, "http://localhost"), init),
      );
      return response({ kind: "ok" });
    },
    requestId: () => "receivable-request",
  });
  const receivables = createReceivableAdapter(client);
  await receivables.createInvoiceDraft(
    { organizationId, dealId, csrfToken: "csrf" },
    { amountMinor: "9007199254740993", currency: "USD" },
  );
  await receivables.issueInvoice(
    { organizationId, invoiceId, csrfToken: "csrf" },
    {
      receivableId,
      issuedAt: "2026-08-17T10:00:00.000Z",
      dueAt: "2026-09-17T10:00:00.000Z",
    },
  );
  await receivables.recordReceivablePayment(
    {
      organizationId,
      receivableId,
      csrfToken: "csrf",
      idempotencyKey: "pay-1",
    },
    {
      amountMinor: "500",
      currency: "USD",
      recordedAt: "2026-08-18T10:00:00.000Z",
    },
  );

  assert.deepEqual(
    calls.map((call) => [call.url, call.method]),
    [
      [
        `http://localhost/api/organizations/${organizationId}/finance/deals/${dealId}/invoices`,
        "POST",
      ],
      [
        `http://localhost/api/organizations/${organizationId}/finance/invoices/${invoiceId}/issue`,
        "POST",
      ],
      [
        `http://localhost/api/organizations/${organizationId}/finance/receivables/${receivableId}/payments`,
        "POST",
      ],
    ],
  );
  assert.deepEqual(await calls[0]?.json(), {
    amountMinor: "9007199254740993",
    currency: "USD",
  });
  assert.deepEqual(await calls[1]?.json(), {
    receivableId,
    issuedAt: "2026-08-17T10:00:00.000Z",
    dueAt: "2026-09-17T10:00:00.000Z",
  });
  assert.deepEqual(await calls[2]?.json(), {
    amountMinor: "500",
    currency: "USD",
    recordedAt: "2026-08-18T10:00:00.000Z",
  });
  assert.equal(calls[0]?.headers.get("idempotency-key"), null);
  assert.equal(calls[1]?.headers.get("idempotency-key"), null);
  assert.equal(calls[2]?.headers.get("idempotency-key"), "pay-1");
  for (const call of calls) {
    assert.equal(call.headers.get("x-csrf-token"), "csrf");
    assert.equal(call.credentials, "include");
  }
});

test("cancellation and aging preserve the HTTP contract", async () => {
  const calls: Request[] = [];
  const client = createApiClient({
    fetch: async (input, init) => {
      calls.push(
        new Request(new URL(input as string | URL, "http://localhost"), init),
      );
      return response({
        asOf: "2026-08-17T10:00:00.000Z",
        items: [],
        nextCursor: "eyJ2IjoxfQ",
      });
    },
    requestId: () => "contract-request",
  });
  const adapter = createReceivableAdapter(client);
  await adapter.cancelInvoice(
    { organizationId, invoiceId, csrfToken: "csrf" },
    { reason: "  سبب عربي  " },
  );
  await adapter.getReceivableAging({
    organizationId,
    cursor: "eyJ2IjoxfQ",
    limit: 50,
  });
  assert.equal(calls[0]?.method, "POST");
  assert.deepEqual(await calls[0]?.json(), { reason: "سبب عربي" });
  assert.equal(calls[0]?.headers.get("x-csrf-token"), "csrf");
  assert.equal(calls[0]?.headers.get("idempotency-key"), null);
  assert.equal(calls[1]?.method, "GET");
  assert.match(calls[1]?.url ?? "", /cursor=eyJ2IjoxfQ&limit=50/);
  assert.equal(calls[1]?.headers.get("x-csrf-token"), null);
  assert.equal(await calls[1]?.text(), "");
});

test("aging rejects invalid query values before fetch", async () => {
  let called = false;
  const adapter = createReceivableAdapter(
    createApiClient({
      fetch: async () => {
        called = true;
        return response({});
      },
    }),
  );
  assert.throws(() =>
    adapter.getReceivableAging({ organizationId, cursor: "bad cursor" }),
  );
  assert.throws(() =>
    adapter.getReceivableAging({ organizationId, limit: 101 }),
  );
  assert.equal(called, false);
});

test("receivable adapter rejects invalid contexts and forged DTO fields before fetch", () => {
  let called = false;
  const adapter = createReceivableAdapter(
    createApiClient({
      fetch: async () => {
        called = true;
        return response({});
      },
    }),
  );
  assert.throws(() =>
    adapter.createInvoiceDraft(
      { organizationId, dealId: "bad", csrfToken: "csrf" },
      { amountMinor: "1", currency: "USD" },
    ),
  );
  assert.throws(() =>
    adapter.createInvoiceDraft({ organizationId, dealId, csrfToken: "csrf" }, {
      amountMinor: 1,
      currency: "USD",
    } as never),
  );
  assert.throws(() =>
    adapter.issueInvoice({ organizationId, invoiceId, csrfToken: "csrf" }, {
      receivableId,
      issuedAt: "2026-08-17T10:00:00Z",
      dueAt: "2026-09-17T10:00:00.000Z",
      invoiceId,
    } as never),
  );
  assert.throws(() =>
    adapter.recordReceivablePayment(
      { organizationId, receivableId, csrfToken: "csrf", idempotencyKey: " " },
      {
        amountMinor: "01",
        currency: "usd",
        recordedAt: "bad",
      },
    ),
  );
  assert.equal(called, false);
});
