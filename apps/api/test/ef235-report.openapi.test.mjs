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
const signedAmountMinor = { type: "string", pattern: "^-?(0|[1-9]\\d*)$" };
const currency = { type: "string", pattern: "^[A-Z]{3}$" };
const instant = {
  type: "string",
  format: "date-time",
  pattern: "^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}\\.\\d{3}Z$",
};
const bucketEnum = [
  "CURRENT",
  "DAYS_1_30",
  "DAYS_31_60",
  "DAYS_61_90",
  "DAYS_91_PLUS",
];
const moneyTotal = {
  type: "object",
  required: ["currency", "count", "amountMinor"],
  additionalProperties: false,
  properties: { currency, count: { type: "integer", minimum: 0 }, amountMinor },
};
const paged = (itemSchema) => ({
  type: "object",
  required: ["asOf", "items"],
  additionalProperties: false,
  properties: {
    asOf: instant,
    items: { type: "array", items: itemSchema },
    nextCursor: {
      type: "string",
      minLength: 1,
      maxLength: 512,
      pattern: "^[A-Za-z0-9_-]+$",
    },
  },
});

test("EF-235 reporting publishes the exact read-only OpenAPI contract", async () => {
  const app = await NestFactory.create(AppModule, { logger: false });

  try {
    const document = buildOpenApiDocument(app);
    const base = "/organizations/{organizationId}/finance/reports";

    for (const path of [
      `${base}/cash-flow`,
      `${base}/payments`,
      `${base}/expenses`,
      `${base}/receivables/aging`,
      `${base}/receivables/aging/items`,
      `${base}/commissions`,
      `${base}/commissions/items`,
      `${base}/performance`,
    ]) {
      const operations = Object.keys(document.paths[path] ?? {});
      assert.deepEqual(operations, ["get"], path);
      assert.equal(
        document.paths[path].get.operationId.startsWith("ReportController_"),
        true,
        path,
      );
    }

    // Cash flow: exact response schema and window parameters.
    const sortedByName = (parameters) =>
      [...parameters].sort((left, right) =>
        left.name.localeCompare(right.name),
      );
    const cashFlow = document.paths[`${base}/cash-flow`].get;
    assert.deepEqual(sortedByName(cashFlow.parameters), [
      { name: "from", in: "query", required: false, schema: instant },
      { name: "organizationId", in: "path", required: true, schema: uuid },
      { name: "to", in: "query", required: false, schema: instant },
    ]);
    assert.deepEqual(
      cashFlow.responses["200"].content["application/json"].schema,
      {
        type: "object",
        required: ["asOf", "cashIn", "cashOut", "netCash"],
        additionalProperties: false,
        properties: {
          asOf: instant,
          cashIn: { type: "array", items: moneyTotal },
          cashOut: { type: "array", items: moneyTotal },
          netCash: {
            type: "array",
            items: {
              type: "object",
              required: ["currency", "amountMinor"],
              additionalProperties: false,
              properties: { currency, amountMinor: signedAmountMinor },
            },
          },
        },
      },
    );

    // Payments/expenses: dimension, window, and page parameters.
    for (const path of [`${base}/payments`, `${base}/expenses`]) {
      const operation = document.paths[path].get;
      const parameter = (parameterName) =>
        operation.parameters.find(({ name: n }) => n === parameterName);
      assert.deepEqual(parameter("dealId").schema, uuid);
      assert.deepEqual(parameter("propertyId").schema, uuid);
      assert.deepEqual(parameter("from").schema, instant);
      assert.deepEqual(parameter("to").schema, instant);
      assert.equal(parameter("cursor").required, false);
      assert.deepEqual(parameter("limit").schema, {
        type: "integer",
        minimum: 1,
        maximum: 100,
        default: 50,
      });
      const responseSchema =
        operation.responses["200"].content["application/json"].schema;
      assert.deepEqual(Object.keys(responseSchema.properties).sort(), [
        "asOf",
        "items",
        "nextCursor",
      ]);
      assert.equal(responseSchema.properties.items.type, "array");
      assert.equal(responseSchema.required.includes("asOf"), true);
    }

    // Aging summary and drill-down.
    const aging = document.paths[`${base}/receivables/aging`].get;
    assert.equal(aging.parameters.length, 1);
    assert.deepEqual(
      aging.responses["200"].content["application/json"].schema,
      {
        type: "object",
        required: ["asOf", "buckets"],
        additionalProperties: false,
        properties: {
          asOf: instant,
          buckets: {
            type: "array",
            items: {
              type: "object",
              required: ["bucket", "currency", "count", "outstandingMinor"],
              additionalProperties: false,
              properties: {
                bucket: { type: "string", enum: bucketEnum },
                currency,
                count: { type: "integer", minimum: 0 },
                outstandingMinor: amountMinor,
              },
            },
          },
        },
      },
    );
    const agingItems = document.paths[`${base}/receivables/aging/items`].get;
    assert.equal(
      agingItems.parameters.find(({ name }) => name === "bucket").required,
      true,
    );
    assert.deepEqual(
      agingItems.parameters.find(({ name }) => name === "bucket").schema.enum,
      bucketEnum,
    );
    assert.deepEqual(
      agingItems.responses["200"].content["application/json"].schema,
      paged({
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
          bucket: { type: "string", enum: bucketEnum },
        },
      }),
    );

    // Commissions: summary with expected/due/paid and full-status drill-down.
    const commissions = document.paths[`${base}/commissions`].get;
    assert.deepEqual(
      commissions.responses["200"].content["application/json"].schema,
      {
        type: "object",
        required: ["asOf", "expected", "due", "paid"],
        additionalProperties: false,
        properties: {
          asOf: instant,
          expected: { type: "array", items: moneyTotal },
          due: { type: "array", items: moneyTotal },
          paid: { type: "array", items: moneyTotal },
        },
      },
    );
    const commissionItems = document.paths[`${base}/commissions/items`].get;
    assert.deepEqual(
      commissionItems.parameters.find(({ name }) => name === "status").schema
        .enum,
      ["EXPECTED", "CONFIRMED", "DUE", "PAID", "CANCELLED"],
    );
    assert.deepEqual(
      commissionItems.responses["200"].content["application/json"].schema,
      paged({
        type: "object",
        required: [
          "accrualId",
          "dealId",
          "status",
          "currency",
          "amountMinor",
          "createdAt",
          "splits",
        ],
        additionalProperties: false,
        properties: {
          accrualId: uuid,
          dealId: uuid,
          status: {
            type: "string",
            enum: ["EXPECTED", "CONFIRMED", "DUE", "PAID", "CANCELLED"],
          },
          currency,
          amountMinor: amountMinor,
          createdAt: instant,
          splits: {
            type: "array",
            items: {
              type: "object",
              required: ["order", "kind", "amountMinor"],
              additionalProperties: false,
              properties: {
                order: { type: "integer", minimum: 1 },
                kind: { type: "string", enum: ["BROKER", "OFFICE"] },
                amountMinor,
              },
            },
          },
        },
      }),
    );

    // Performance: by-deal and by-property rows with signed margins.
    const performance = document.paths[`${base}/performance`].get;
    assert.deepEqual(
      performance.responses["200"].content["application/json"].schema,
      {
        type: "object",
        required: ["asOf", "deals", "properties"],
        additionalProperties: false,
        properties: {
          asOf: instant,
          deals: {
            type: "array",
            items: {
              type: "object",
              required: [
                "keyId",
                "currency",
                "revenueMinor",
                "costsMinor",
                "marginMinor",
                "paymentCount",
                "expenseCount",
              ],
              additionalProperties: false,
              properties: {
                keyId: uuid,
                currency,
                revenueMinor: signedAmountMinor,
                costsMinor: signedAmountMinor,
                marginMinor: signedAmountMinor,
                paymentCount: { type: "integer", minimum: 0 },
                expenseCount: { type: "integer", minimum: 0 },
              },
            },
          },
          properties: {
            type: "array",
            items: {
              type: "object",
              required: [
                "keyId",
                "currency",
                "revenueMinor",
                "costsMinor",
                "marginMinor",
                "paymentCount",
                "expenseCount",
              ],
              additionalProperties: false,
              properties: {
                keyId: uuid,
                currency,
                revenueMinor: signedAmountMinor,
                costsMinor: signedAmountMinor,
                marginMinor: signedAmountMinor,
                paymentCount: { type: "integer", minimum: 0 },
                expenseCount: { type: "integer", minimum: 0 },
              },
            },
          },
        },
      },
    );
  } finally {
    await app.close();
  }
});
