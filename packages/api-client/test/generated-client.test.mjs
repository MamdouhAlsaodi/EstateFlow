import assert from "node:assert/strict";
import test from "node:test";
import { createEstateFlowClient } from "../dist/generated.js";
import { generateOpenApiClient } from "../../../scripts/openapi-client-template.mjs";

test("generator rejects unsupported Lead mutation operations with a diagnostic", () => {
  const document = {
    paths: {
      "/health/live": {
        get: {
          operationId: "getLiveHealth",
          responses: {
            200: {
              content: {
                "application/json": {
                  schema: { properties: { status: { enum: ["ok"] } } },
                },
              },
            },
          },
        },
      },
      "/health/ready": {
        get: {
          operationId: "getReadyHealth",
          responses: {
            200: {
              content: {
                "application/json": {
                  schema: { properties: { status: { enum: ["ok"] } } },
                },
              },
            },
          },
        },
      },
      "/organizations/{organizationId}/leads": {
        get: {
          operationId: "LeadController_list",
          parameters: [
            { name: "organizationId", in: "path" },
            { name: "stage", in: "query", schema: { type: "string" } },
            { name: "cursor", in: "query", schema: { type: "string" } },
            { name: "limit", in: "query", schema: { type: "integer" } },
          ],
        },
        post: { operationId: "UnexpectedMutation" },
      },
      "/organizations/{organizationId}/leads/{leadId}": {
        get: {
          operationId: "LeadController_find",
          parameters: [
            { name: "organizationId", in: "path" },
            { name: "leadId", in: "path" },
          ],
        },
      },
    },
  };

  assert.throws(() => generateOpenApiClient(document), {
    message:
      /Unsupported OpenAPI non-GET operation POST \/organizations\/{organizationId}\/leads/,
  });
});

test("generator rejects an unsupported CommissionController operation", async () => {
  const { readFile } = await import("node:fs/promises");
  const document = JSON.parse(
    await readFile(new URL("../openapi.json", import.meta.url), "utf8"),
  );
  document.paths["/organizations/{organizationId}/finance/commission-plans"] = {
    post: { operationId: "CommissionController_listPlans" },
  };

  assert.throws(() => generateOpenApiClient(document), {
    message:
      /Unsupported OpenAPI CommissionController operation POST \/organizations\/{organizationId}\/finance\/commission-plans/,
  });
});

test("generator emits the Commission plan as an exact two-branch union", async () => {
  const { readFile } = await import("node:fs/promises");
  const document = JSON.parse(
    await readFile(new URL("../openapi.json", import.meta.url), "utf8"),
  );
  const generated = generateOpenApiClient(document);

  assert.match(
    generated,
    /body: \(\{ version: number \} \| \{ version: number; rateBps: number; recipients: \{ order: number; kind: "BROKER" \| "OFFICE"; splitBps: number \}\[\] \}\)/,
  );
  assert.doesNotMatch(generated, /rateBps\?: number/);
  assert.doesNotMatch(generated, /recipients\?: \{/);

  const permissive = structuredClone(document);
  const schema =
    permissive.paths[
      "/organizations/{organizationId}/finance/commission-plan-versions"
    ].post.requestBody.content["application/json"].schema;
  delete schema.oneOf;
  schema.anyOf = [
    { required: ["version"] },
    { required: ["version", "rateBps", "recipients"] },
  ];
  assert.throws(
    () => generateOpenApiClient(permissive),
    /exact JSON body contract/,
  );
});

test("generated client serializes the three Commission commands without invented headers", async () => {
  const requests = [];
  const client = createEstateFlowClient({
    baseUrl: "https://example.test/api/",
    fetch: async (input, init) => {
      requests.push({ input, init });
      return { ok: true, json: async () => ({}) };
    },
  });
  await client.createCommissionPlanVersion(
    { organizationId: "org/1" },
    {
      version: 2,
      rateBps: 500,
      recipients: [{ order: 1, kind: "BROKER", splitBps: 10000 }],
    },
  );
  await client.captureCommissionableValue(
    { organizationId: "org/1", dealId: "deal?2" },
    {
      valueId: "value/1",
      amountMinor: "9007199254740993",
      currency: "USD",
      capturedAt: "2026-08-15T00:00:00.000Z",
    },
  );
  await client.createExpectedAccrual(
    { organizationId: "org/1", dealId: "deal?2" },
    {
      accrualId: "accrual/1",
      commissionableValueId: "value/1",
      commissionPlanVersionId: "version/1",
      dealClosedWonEventId: "event/1",
    },
  );
  assert.deepEqual(requests, [
    {
      input:
        "https://example.test/api/organizations/org%2F1/finance/commission-plan-versions",
      init: {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          version: 2,
          rateBps: 500,
          recipients: [{ order: 1, kind: "BROKER", splitBps: 10000 }],
        }),
      },
    },
    {
      input:
        "https://example.test/api/organizations/org%2F1/finance/deals/deal%3F2/commissionable-values",
      init: {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          valueId: "value/1",
          amountMinor: "9007199254740993",
          currency: "USD",
          capturedAt: "2026-08-15T00:00:00.000Z",
        }),
      },
    },
    {
      input:
        "https://example.test/api/organizations/org%2F1/finance/deals/deal%3F2/expected-commissions",
      init: {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          accrualId: "accrual/1",
          commissionableValueId: "value/1",
          commissionPlanVersionId: "version/1",
          dealClosedWonEventId: "event/1",
        }),
      },
    },
  ]);
});

test("generated client serializes exactly the five Receivable commands", async () => {
  const requests = [];
  const client = createEstateFlowClient({
    baseUrl: "https://example.test/api/",
    fetch: async (input, init) => {
      requests.push({ input, init });
      return { ok: true, json: async () => ({}) };
    },
  });

  await client.createInvoiceDraft(
    { organizationId: "org/1", dealId: "deal?2" },
    { amountMinor: "9007199254740993", currency: "USD" },
  );
  await client.issueInvoice(
    { organizationId: "org/1", invoiceId: "invoice?2" },
    {
      receivableId: "receivable/1",
      issuedAt: "2026-08-17T10:00:00.000Z",
      dueAt: "2026-09-17T10:00:00.000Z",
    },
  );
  await client.cancelInvoice(
    { organizationId: "org/1", invoiceId: "invoice?2" },
    { reason: "Customer request" },
  );
  await client.getReceivableAging({
    organizationId: "org/1",
    cursor: "next/page",
    limit: 25,
  });
  await client.getReceivableAging({ organizationId: "org/1" });
  await client.recordReceivablePayment(
    {
      organizationId: "org/1",
      receivableId: "receivable?2",
      idempotencyKey: "payment-key",
    },
    {
      amountMinor: "500",
      currency: "USD",
      recordedAt: "2026-08-18T10:00:00.000Z",
    },
  );

  assert.deepEqual(requests, [
    {
      input:
        "https://example.test/api/organizations/org%2F1/finance/deals/deal%3F2/invoices",
      init: {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          amountMinor: "9007199254740993",
          currency: "USD",
        }),
      },
    },
    {
      input:
        "https://example.test/api/organizations/org%2F1/finance/invoices/invoice%3F2/issue",
      init: {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          receivableId: "receivable/1",
          issuedAt: "2026-08-17T10:00:00.000Z",
          dueAt: "2026-09-17T10:00:00.000Z",
        }),
      },
    },
    {
      input:
        "https://example.test/api/organizations/org%2F1/finance/invoices/invoice%3F2/cancel",
      init: {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ reason: "Customer request" }),
      },
    },
    {
      input:
        "https://example.test/api/organizations/org%2F1/finance/receivables/aging?cursor=next%2Fpage&limit=25",
      init: { method: "GET" },
    },
    {
      input:
        "https://example.test/api/organizations/org%2F1/finance/receivables/aging",
      init: { method: "GET" },
    },
    {
      input:
        "https://example.test/api/organizations/org%2F1/finance/receivables/receivable%3F2/payments",
      init: {
        method: "POST",
        headers: {
          "Idempotency-Key": "payment-key",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          amountMinor: "500",
          currency: "USD",
          recordedAt: "2026-08-18T10:00:00.000Z",
        }),
      },
    },
  ]);
});

test("generated source exposes exact receivable aging types and signature", async () => {
  const { readFile } = await import("node:fs/promises");
  const generated = await readFile(
    new URL("../src/generated.ts", import.meta.url),
    "utf8",
  );
  assert.ok(generated.includes("export type ReceivableAgingBucket ="));
  assert.ok(generated.includes("bucket: ReceivableAgingBucket;"));
  assert.ok(generated.includes("export type ReceivableAgingResponse ="));
  assert.ok(generated.includes("items: ReceivableAgingItem[];"));
  assert.match(generated, /getReceivableAging:/);
});

test("generated client passes through typed aging JSON at runtime", async () => {
  const expected = {
    asOf: "2026-08-17T00:00:00.000Z",
    items: [],
    nextCursor: "abc_123",
  };
  const client = createEstateFlowClient({
    baseUrl: "https://example.test",
    fetch: async () => ({ ok: true, json: async () => expected }),
  });
  assert.deepEqual(
    await client.getReceivableAging({ organizationId: "org" }),
    expected,
  );
});

test("generator rejects a Receivable payment contract without its required idempotency header", async () => {
  const { readFile } = await import("node:fs/promises");
  const document = JSON.parse(
    await readFile(new URL("../openapi.json", import.meta.url), "utf8"),
  );
  const operation =
    document.paths[
      "/organizations/{organizationId}/finance/receivables/{receivableId}/payments"
    ].post;
  operation.parameters = operation.parameters.filter(
    ({ name }) => name !== "Idempotency-Key",
  );

  assert.throws(() => generateOpenApiClient(document), {
    message: /must define exactly its required parameters/,
  });
});

test("generator rejects mutated Receivable aging and cancellation contracts", async () => {
  const { readFile } = await import("node:fs/promises");
  const document = JSON.parse(
    await readFile(new URL("../openapi.json", import.meta.url), "utf8"),
  );
  const aging =
    document.paths["/organizations/{organizationId}/finance/receivables/aging"]
      .get;
  aging.parameters.push({
    name: "asOf",
    in: "query",
    required: false,
    schema: { type: "string" },
  });
  assert.throws(
    () => generateOpenApiClient(document),
    /must define exactly its required parameters/,
  );
  const cancellation = JSON.parse(
    await readFile(new URL("../openapi.json", import.meta.url), "utf8"),
  );
  const cancel =
    cancellation.paths[
      "/organizations/{organizationId}/finance/invoices/{invoiceId}/cancel"
    ].post;
  cancel.requestBody.content["application/json"].schema.properties.actor = {
    type: "string",
  };
  assert.throws(
    () => generateOpenApiClient(cancellation),
    /exact JSON body contract/,
  );
  const response = JSON.parse(
    await readFile(new URL("../openapi.json", import.meta.url), "utf8"),
  );
  delete response.paths[
    "/organizations/{organizationId}/finance/receivables/aging"
  ].get.responses["200"].content["application/json"].schema.properties.items;
  assert.throws(
    () => generateOpenApiClient(response),
    /exact 200 response schema/,
  );
  const wrongQuery = JSON.parse(
    await readFile(new URL("../openapi.json", import.meta.url), "utf8"),
  );
  wrongQuery.paths[
    "/organizations/{organizationId}/finance/receivables/aging"
  ].get.parameters.find(({ name }) => name === "limit").schema.maximum = 99;
  assert.throws(() => generateOpenApiClient(wrongQuery), /required parameters/);
  const wrongCancel = JSON.parse(
    await readFile(new URL("../openapi.json", import.meta.url), "utf8"),
  );
  const cancelOperation =
    wrongCancel.paths[
      "/organizations/{organizationId}/finance/invoices/{invoiceId}/cancel"
    ].post;
  cancelOperation.parameters.push({
    name: "Idempotency-Key",
    in: "header",
    required: true,
    schema: { type: "string" },
  });
  assert.throws(
    () => generateOpenApiClient(wrongCancel),
    /required parameters/,
  );
  cancelOperation.parameters.pop();
  delete cancelOperation.responses["409"];
  assert.throws(() => generateOpenApiClient(wrongCancel), /error status 409/);
});

test("generator rejects an unsupported ReceivableController operation", async () => {
  const { readFile } = await import("node:fs/promises");
  const document = JSON.parse(
    await readFile(new URL("../openapi.json", import.meta.url), "utf8"),
  );
  document.paths["/organizations/{organizationId}/finance/receivables"] = {
    get: { operationId: "ReceivableController_list" },
  };

  assert.throws(() => generateOpenApiClient(document), {
    message:
      /Unsupported OpenAPI ReceivableController operation GET \/organizations\/{organizationId}\/finance\/receivables/,
  });
});

test("generator accepts the two documented Lead close operations", async () => {
  const { readFile } = await import("node:fs/promises");
  const document = JSON.parse(
    await readFile(new URL("../openapi.json", import.meta.url), "utf8"),
  );
  const generated = generateOpenApiClient(document);

  assert.match(generated, /closeLeadWon: \(params:/);
  assert.match(generated, /closeLeadLost: \(params:/);
});

test("client calls documented health endpoints through injected fetch", async () => {
  const requests = [];
  const client = createEstateFlowClient({
    baseUrl: "https://example.test/api/",
    fetch: async (input, init) => {
      requests.push({ input, init });
      return {
        ok: true,
        json: async () => ({ status: "ok" }),
      };
    },
  });

  assert.deepEqual(await client.getLiveHealth(), { status: "ok" });
  assert.deepEqual(await client.getReadyHealth(), { status: "ok" });
  assert.deepEqual(requests, [
    { input: "https://example.test/api/health/live", init: { method: "GET" } },
    { input: "https://example.test/api/health/ready", init: { method: "GET" } },
  ]);
});

test("generator rejects undocumented Lead GET query parameters with a diagnostic", () => {
  const document = {
    paths: {
      "/health/live": {
        get: {
          operationId: "getLiveHealth",
          responses: {
            200: {
              content: {
                "application/json": {
                  schema: { properties: { status: { enum: ["ok"] } } },
                },
              },
            },
          },
        },
      },
      "/health/ready": {
        get: {
          operationId: "getReadyHealth",
          responses: {
            200: {
              content: {
                "application/json": {
                  schema: { properties: { status: { enum: ["ok"] } } },
                },
              },
            },
          },
        },
      },
      "/organizations/{organizationId}/leads": {
        get: {
          operationId: "LeadController_list",
          parameters: [
            { name: "organizationId", in: "path" },
            { name: "owner", in: "query", schema: { type: "string" } },
          ],
        },
      },
      "/organizations/{organizationId}/leads/{leadId}": {
        get: {
          operationId: "LeadController_find",
          parameters: [
            { name: "organizationId", in: "path" },
            { name: "leadId", in: "path" },
          ],
        },
      },
    },
  };

  assert.throws(() => generateOpenApiClient(document), {
    message: /Unexpected OpenAPI GET query parameter owner/,
  });
});

test("client encodes present Lead board query values and omits absent values", async () => {
  const requests = [];
  const client = createEstateFlowClient({
    baseUrl: "https://example.test/api/",
    fetch: async (input, init) => {
      requests.push({ input, init });
      return { ok: true, json: async () => ({}) };
    },
  });

  await client.LeadController_list({
    organizationId: "org/1",
    stage: "new & warm",
    cursor: "next/page",
    limit: 25,
  });
  await client.LeadController_list({ organizationId: "org/1" });

  assert.deepEqual(requests, [
    {
      input:
        "https://example.test/api/organizations/org%2F1/leads?stage=new+%26+warm&cursor=next%2Fpage&limit=25",
      init: { method: "GET" },
    },
    {
      input: "https://example.test/api/organizations/org%2F1/leads",
      init: { method: "GET" },
    },
  ]);
});

test("client reads the closed Lead workspace detail response with bounded timeline query", async () => {
  const requests = [];
  const client = createEstateFlowClient({
    baseUrl: "https://example.test/api/",
    fetch: async (input, init) => {
      requests.push({ input, init });
      return {
        ok: true,
        json: async () => ({
          notes: [
            {
              id: "note-1",
              body: "Note",
              createdAt: "2026-08-04T10:00:00.000Z",
            },
          ],
          tasks: [
            {
              id: "task-1",
              title: "Call",
              dueAt: "2026-08-05T10:00:00.000Z",
              status: "OPEN",
              createdAt: "2026-08-04T10:00:00.000Z",
              completedAt: null,
              version: 1,
            },
          ],
        }),
      };
    },
  });

  const response = await client.LeadController_find({
    organizationId: "org/1",
    leadId: "lead?2",
    cursor: "event/3",
    limit: 10,
  });
  assert.equal(response.notes[0].body, "Note");
  assert.equal(response.tasks[0].version, 1);
  assert.deepEqual(requests, [
    {
      input:
        "https://example.test/api/organizations/org%2F1/leads/lead%3F2?cursor=event%2F3&limit=10",
      init: { method: "GET" },
    },
  ]);
});

test("client calls documented Lead board and detail endpoints with encoded path values", async () => {
  const requests = [];
  const client = createEstateFlowClient({
    baseUrl: "https://example.test/api/",
    fetch: async (input, init) => {
      requests.push({ input, init });
      return { ok: true, json: async () => ({}) };
    },
  });

  await client.LeadController_list({ organizationId: "org/1" });
  await client.LeadController_find({
    organizationId: "org/1",
    leadId: "lead?2",
  });

  assert.deepEqual(requests, [
    {
      input: "https://example.test/api/organizations/org%2F1/leads",
      init: { method: "GET" },
    },
    {
      input: "https://example.test/api/organizations/org%2F1/leads/lead%3F2",
      init: { method: "GET" },
    },
  ]);
});

test("generator rejects an unexpected Lead operation outside the closed-world contract", async () => {
  const { readFile } = await import("node:fs/promises");
  const document = JSON.parse(
    await readFile(new URL("../openapi.json", import.meta.url), "utf8"),
  );
  document.paths["/organizations/{organizationId}/leads/{leadId}/unsupported"] =
    {
      post: { operationId: "LeadController_unsupported" },
    };

  assert.throws(() => generateOpenApiClient(document), {
    message:
      /Unsupported OpenAPI LeadController operation POST \/organizations\/{organizationId}\/leads\/{leadId}\/unsupported/,
  });
});

test("client calls CRM-04 Lead note and task commands with encoded paths, JSON bodies and idempotency headers", async () => {
  const requests = [];
  const client = createEstateFlowClient({
    baseUrl: "https://example.test/api/",
    fetch: async (input, init) => {
      requests.push({ input, init });
      return { ok: true, json: async () => ({}) };
    },
  });

  await client.createLeadNote(
    { organizationId: "org/1", leadId: "lead?2", idempotencyKey: "note-key" },
    { body: "Called & emailed" },
  );
  await client.createLeadTask(
    { organizationId: "org/1", leadId: "lead?2", idempotencyKey: "task-key" },
    { title: "Follow up", dueAt: "2026-08-12T10:00:00Z" },
  );
  await client.completeLeadTask(
    {
      organizationId: "org/1",
      leadId: "lead?2",
      taskId: "task/3",
      idempotencyKey: "complete-key",
    },
    { expectedVersion: 4 },
  );
  await client.rescheduleLeadTask(
    {
      organizationId: "org/1",
      leadId: "lead?2",
      taskId: "task/3",
      idempotencyKey: "reschedule-key",
    },
    { expectedVersion: 5, dueAt: "2026-08-13T10:00:00Z" },
  );

  assert.deepEqual(requests, [
    {
      input:
        "https://example.test/api/organizations/org%2F1/leads/lead%3F2/notes",
      init: {
        method: "POST",
        headers: {
          "Idempotency-Key": "note-key",
          "content-type": "application/json",
        },
        body: JSON.stringify({ body: "Called & emailed" }),
      },
    },
    {
      input:
        "https://example.test/api/organizations/org%2F1/leads/lead%3F2/tasks",
      init: {
        method: "POST",
        headers: {
          "Idempotency-Key": "task-key",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          title: "Follow up",
          dueAt: "2026-08-12T10:00:00Z",
        }),
      },
    },
    {
      input:
        "https://example.test/api/organizations/org%2F1/leads/lead%3F2/tasks/task%2F3/complete",
      init: {
        method: "POST",
        headers: {
          "Idempotency-Key": "complete-key",
          "content-type": "application/json",
        },
        body: JSON.stringify({ expectedVersion: 4 }),
      },
    },
    {
      input:
        "https://example.test/api/organizations/org%2F1/leads/lead%3F2/tasks/task%2F3/reschedule",
      init: {
        method: "POST",
        headers: {
          "Idempotency-Key": "reschedule-key",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          expectedVersion: 5,
          dueAt: "2026-08-13T10:00:00Z",
        }),
      },
    },
  ]);
});

test("client serializes exactly the two Lead close operations", async () => {
  const requests = [];
  const client = createEstateFlowClient({
    baseUrl: "https://example.test/api/",
    fetch: async (input, init) => {
      requests.push({ input, init });
      return { ok: true, json: async () => ({}) };
    },
  });

  await client.closeLeadWon(
    { organizationId: "org/1", leadId: "lead?2", idempotencyKey: "won-key" },
    { propertyId: "property/1", brokerId: "broker/2", expectedVersion: 7 },
  );
  await client.closeLeadLost(
    { organizationId: "org/1", leadId: "lead?2", idempotencyKey: "lost-key" },
    { reason: "No budget", expectedVersion: 8 },
  );

  assert.deepEqual(requests, [
    {
      input:
        "https://example.test/api/organizations/org%2F1/leads/lead%3F2/close-won",
      init: {
        method: "POST",
        headers: {
          "Idempotency-Key": "won-key",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          propertyId: "property/1",
          brokerId: "broker/2",
          expectedVersion: 7,
        }),
      },
    },
    {
      input:
        "https://example.test/api/organizations/org%2F1/leads/lead%3F2/close-lost",
      init: {
        method: "POST",
        headers: {
          "Idempotency-Key": "lost-key",
          "content-type": "application/json",
        },
        body: JSON.stringify({ reason: "No budget", expectedVersion: 8 }),
      },
    },
  ]);
});

test("close operation generator validation rejects missing contract fields", async () => {
  const { readFile } = await import("node:fs/promises");
  const document = JSON.parse(
    await readFile(new URL("../openapi.json", import.meta.url), "utf8"),
  );
  const operation =
    document.paths["/organizations/{organizationId}/leads/{leadId}/close-lost"]
      .post;
  delete operation.parameters.find(({ name }) => name === "Idempotency-Key")
    .required;

  assert.throws(() => generateOpenApiClient(document), {
    message:
      /must define exactly the required path and Idempotency-Key parameters/,
  });
});

test("client rejects non-OK responses without exposing response body", async () => {
  const client = createEstateFlowClient({
    baseUrl: "https://example.test",
    fetch: async () => ({
      ok: false,
      json: async () => ({ message: "private diagnostic" }),
    }),
  });

  await assert.rejects(client.getReadyHealth(), {
    message: "EstateFlow API request failed",
  });
});

test("client exposes every documented PropertyController operation", () => {
  const client = createEstateFlowClient({
    baseUrl: "https://example.test",
    fetch: async () => ({ ok: true, json: async () => ({}) }),
  });

  for (const method of [
    "PropertyController_create",
    "PropertyController_list",
    "PropertyController_update",
    "PropertyController_find",
    "PropertyController_createListing",
    "PropertyController_getListing",
    "PropertyController_publish",
    "PropertyController_archive",
    "PropertyController_addImage",
    "PropertyController_listImages",
  ]) {
    assert.equal(typeof client[method], "function", method);
  }
});

test("client encodes Property list query values and JSON mutation requests", async () => {
  const requests = [];
  const client = createEstateFlowClient({
    baseUrl: "https://example.test/api/",
    fetch: async (input, init) => {
      requests.push({ input, init });
      return { ok: true, json: async () => ({}) };
    },
  });

  await client.PropertyController_list({
    organizationId: "org/1",
    search: "sea & rch",
    cursor: "next/page",
    limit: 25,
  });
  await client.PropertyController_list({ organizationId: "org/1" });
  await client.PropertyController_update(
    { organizationId: "org/1", propertyId: "property?2" },
    { version: 3, title: "Updated" },
  );

  assert.deepEqual(requests, [
    {
      input:
        "https://example.test/api/organizations/org%2F1/properties?search=sea+%26+rch&cursor=next%2Fpage&limit=25",
      init: { method: "GET" },
    },
    {
      input: "https://example.test/api/organizations/org%2F1/properties",
      init: { method: "GET" },
    },
    {
      input:
        "https://example.test/api/organizations/org%2F1/properties/property%3F2",
      init: {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ version: 3, title: "Updated" }),
      },
    },
  ]);
});

test("client calls every Ledger command with exact POST contracts and encoded UUID paths", async () => {
  const requests = [];
  const client = createEstateFlowClient({
    baseUrl: "https://example.test/api/",
    fetch: async (input, init) => {
      requests.push({ input, init });
      return { ok: true, json: async () => ({}) };
    },
  });
  await client.createAccount(
    { organizationId: "org/1" },
    { code: "1000", name: "Cash", type: "ASSET" },
  );
  await client.createAccountingPeriod(
    { organizationId: "org/1" },
    {
      startsAt: "2026-01-01T00:00:00.000Z",
      endsAt: "2026-12-31T23:59:59.999Z",
    },
  );
  await client.createDraft(
    { organizationId: "org/1" },
    {
      reference: "REF",
      reason: "Reason",
      lines: [
        {
          accountId: "account/1",
          side: "DEBIT",
          currency: "USD",
          amountMinor: "1000",
        },
        {
          accountId: "account/2",
          side: "CREDIT",
          currency: "USD",
          amountMinor: "1000",
        },
      ],
    },
  );
  await client.post(
    { organizationId: "org/1", entryId: "entry?2" },
    { periodId: "period/1", postedAt: "2026-01-02T00:00:00.000Z" },
  );
  await client.reverse({ organizationId: "org/1", entryId: "entry?2" });
  assert.deepEqual(requests, [
    {
      input: "https://example.test/api/organizations/org%2F1/finance/accounts",
      init: {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ code: "1000", name: "Cash", type: "ASSET" }),
      },
    },
    {
      input:
        "https://example.test/api/organizations/org%2F1/finance/accounting-periods",
      init: {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          startsAt: "2026-01-01T00:00:00.000Z",
          endsAt: "2026-12-31T23:59:59.999Z",
        }),
      },
    },
    {
      input:
        "https://example.test/api/organizations/org%2F1/finance/journal-drafts",
      init: {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          reference: "REF",
          reason: "Reason",
          lines: [
            {
              accountId: "account/1",
              side: "DEBIT",
              currency: "USD",
              amountMinor: "1000",
            },
            {
              accountId: "account/2",
              side: "CREDIT",
              currency: "USD",
              amountMinor: "1000",
            },
          ],
        }),
      },
    },
    {
      input:
        "https://example.test/api/organizations/org%2F1/finance/journal-entries/entry%3F2/post",
      init: {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          periodId: "period/1",
          postedAt: "2026-01-02T00:00:00.000Z",
        }),
      },
    },
    {
      input:
        "https://example.test/api/organizations/org%2F1/finance/journal-entries/entry%3F2/reverse",
      init: { method: "POST" },
    },
  ]);
});

test("generated Ledger client preserves amountMinor as a string and rejects undocumented Ledger mutations", async () => {
  const { readFile } = await import("node:fs/promises");
  const document = JSON.parse(
    await readFile(new URL("../openapi.json", import.meta.url), "utf8"),
  );
  document.paths["/organizations/{organizationId}/finance/undocumented"] = {
    post: { operationId: "LedgerController_undocumented" },
  };
  assert.throws(() => generateOpenApiClient(document), {
    message:
      /Unsupported OpenAPI LedgerController operation POST \/organizations\/\{organizationId\}\/finance\/undocumented/,
  });
  const client = createEstateFlowClient({
    baseUrl: "https://example.test",
    fetch: async (_input, init) => {
      assert.equal(
        init.body,
        JSON.stringify({
          reference: "R",
          reason: "R",
          lines: [
            {
              accountId: "a",
              side: "DEBIT",
              currency: "USD",
              amountMinor: "7",
            },
            {
              accountId: "b",
              side: "CREDIT",
              currency: "USD",
              amountMinor: "7",
            },
          ],
        }),
      );
      return { ok: true, json: async () => ({}) };
    },
  });
  await client.createDraft(
    { organizationId: "org" },
    {
      reference: "R",
      reason: "R",
      lines: [
        { accountId: "a", side: "DEBIT", currency: "USD", amountMinor: "7" },
        { accountId: "b", side: "CREDIT", currency: "USD", amountMinor: "7" },
      ],
    },
  );
});

test("generator rejects an unexpected PropertyController operation", async () => {
  const { readFile } = await import("node:fs/promises");
  const document = JSON.parse(
    await readFile(new URL("../openapi.json", import.meta.url), "utf8"),
  );
  document.paths["/organizations/{organizationId}/properties"].delete = {
    operationId: "PropertyController_destroy",
  };

  assert.throws(() => generateOpenApiClient(document), {
    message:
      /Unsupported OpenAPI PropertyController operation DELETE \/organizations\/{organizationId}\/properties/,
  });
});
