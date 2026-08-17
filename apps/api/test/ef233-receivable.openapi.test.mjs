import assert from "node:assert/strict";
import test from "node:test";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "../dist/app.module.js";
import { buildOpenApiDocument } from "../dist/openapi.js";

Object.assign(globalThis.process.env, {
  NODE_ENV: "test",
  ESTATEFLOW_BROWSER_ORIGIN: "https://app.estateflow.test",
  ESTATEFLOW_AUTH_HASH_KEY: "a".repeat(32),
  ESTATEFLOW_AUDIT_HASH_KEY: "b".repeat(32),
  ESTATEFLOW_AUTH_FAKE_DELIVERY: "true",
});

const uuid = { type: "string", format: "uuid" };
const amountMinor = { type: "string", pattern: "^[1-9]\\d*$" };
const currency = { type: "string", pattern: "^[A-Z]{3}$" };
const instant = {
  type: "string",
  format: "date-time",
  pattern: "^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}\\.\\d{3}Z$",
};
const cancellationBody = {
  type: "object",
  required: ["reason"],
  additionalProperties: false,
  properties: {
    reason: { type: "string", minLength: 1, maxLength: 500, pattern: "\\S" },
  },
};
const agingItem = {
  type: "object",
  required: [
    "receivableId",
    "invoiceId",
    "dealId",
    "currency",
    "originalAmountMinor",
    "outstandingMinor",
    "status",
    "issuedAt",
    "dueAt",
    "daysPastDue",
    "bucket",
  ],
  additionalProperties: false,
  properties: {
    receivableId: uuid,
    invoiceId: uuid,
    dealId: uuid,
    currency,
    originalAmountMinor: amountMinor,
    outstandingMinor: amountMinor,
    status: { type: "string", enum: ["OPEN", "PARTIALLY_PAID"] },
    issuedAt: instant,
    dueAt: instant,
    daysPastDue: { type: "integer", minimum: 0 },
    bucket: {
      type: "string",
      enum: [
        "CURRENT",
        "DAYS_1_30",
        "DAYS_31_60",
        "DAYS_61_90",
        "DAYS_91_PLUS",
      ],
    },
  },
};
const agingResponse = {
  type: "object",
  required: ["asOf", "items"],
  additionalProperties: false,
  properties: {
    asOf: instant,
    items: { type: "array", items: agingItem },
    nextCursor: {
      type: "string",
      minLength: 1,
      maxLength: 512,
      pattern: "^[A-Za-z0-9_-]+$",
    },
  },
};

const operations = [
  [
    "/organizations/{organizationId}/finance/deals/{dealId}/invoices",
    "post",
    "ReceivableController_createDraft",
  ],
  [
    "/organizations/{organizationId}/finance/invoices/{invoiceId}/issue",
    "post",
    "ReceivableController_issue",
  ],
  [
    "/organizations/{organizationId}/finance/invoices/{invoiceId}/cancel",
    "post",
    "ReceivableController_cancel",
  ],
  [
    "/organizations/{organizationId}/finance/receivables/aging",
    "get",
    "ReceivableController_getAging",
  ],
  [
    "/organizations/{organizationId}/finance/receivables/{receivableId}/payments",
    "post",
    "ReceivableController_recordPayment",
  ],
];

function parameters(operation) {
  return [...(operation.parameters ?? [])].sort((a, b) =>
    `${a.in}/${a.name}`.localeCompare(`${b.in}/${b.name}`),
  );
}
function pathParameters(...names) {
  return names.map((name) => ({
    name,
    required: true,
    in: "path",
    schema: uuid,
  }));
}
function responseStatuses(operation) {
  return Object.keys(operation.responses).sort();
}

test("EF-233 publishes exactly five closed receivable contracts", async () => {
  const app = await NestFactory.create(AppModule, { logger: false });
  try {
    const document = buildOpenApiDocument(app);
    assert.deepEqual(
      Object.entries(document.paths).flatMap(([path, item]) =>
        Object.entries(item)
          .filter(([, operation]) =>
            operation.operationId?.startsWith("ReceivableController_"),
          )
          .map(([method, operation]) => [path, method, operation.operationId]),
      ),
      operations,
    );

    const draft = document.paths[operations[0][0]].post;
    assert.deepEqual(
      parameters(draft),
      pathParameters("organizationId", "dealId").sort((a, b) =>
        a.name.localeCompare(b.name),
      ),
    );
    assert.deepEqual(draft.requestBody.content["application/json"].schema, {
      type: "object",
      required: ["amountMinor", "currency"],
      additionalProperties: false,
      properties: { amountMinor, currency },
    });
    assert.deepEqual(responseStatuses(draft), ["201"]);

    const issue = document.paths[operations[1][0]].post;
    assert.deepEqual(
      parameters(issue),
      pathParameters("organizationId", "invoiceId").sort((a, b) =>
        a.name.localeCompare(b.name),
      ),
    );
    assert.deepEqual(responseStatuses(issue), ["200", "201"]);

    const cancel = document.paths[operations[2][0]].post;
    assert.deepEqual(
      parameters(cancel),
      pathParameters("organizationId", "invoiceId").sort((a, b) =>
        a.name.localeCompare(b.name),
      ),
    );
    assert.deepEqual(
      cancel.requestBody.content["application/json"].schema,
      cancellationBody,
    );
    assert.deepEqual(responseStatuses(cancel), [
      "200",
      "400",
      "401",
      "403",
      "404",
      "409",
    ]);
    assert.equal(
      cancel.parameters.some(({ name }) =>
        ["Idempotency-Key", "asOf", "actor", "timestamp"].includes(name),
      ),
      false,
    );

    const aging = document.paths[operations[3][0]].get;
    assert.deepEqual(
      parameters(aging),
      [
        { name: "organizationId", required: true, in: "path", schema: uuid },
        {
          name: "cursor",
          required: false,
          in: "query",
          schema: {
            type: "string",
            minLength: 1,
            maxLength: 512,
            pattern: "^[A-Za-z0-9_-]+$",
          },
        },
        {
          name: "limit",
          required: false,
          in: "query",
          schema: { type: "integer", minimum: 1, maximum: 100, default: 50 },
        },
      ].sort((a, b) => `${a.in}/${a.name}`.localeCompare(`${b.in}/${b.name}`)),
    );
    assert.equal("requestBody" in aging, false);
    assert.deepEqual(
      aging.responses["200"].content["application/json"].schema,
      agingResponse,
    );
    assert.deepEqual(responseStatuses(aging), ["200", "400", "401", "403"]);
    assert.equal(
      aging.parameters.some(({ name }) =>
        ["asOf", "actor", "timestamp", "Idempotency-Key"].includes(name),
      ),
      false,
    );

    const payment = document.paths[operations[4][0]].post;
    assert.deepEqual(responseStatuses(payment), ["200", "201"]);
  } finally {
    await app.close();
  }
});
