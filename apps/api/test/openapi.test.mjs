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

test("buildOpenApiDocument includes the composed auth and health paths", async () => {
  const app = await NestFactory.create(AppModule, { logger: false });

  try {
    const document = buildOpenApiDocument(app);

    assert.match(document.openapi, /^3\./);
    assert.equal(document.info.title, "EstateFlow API");
    assert.equal(document.info.version, "0.1.0");
    assert.deepEqual(
      Object.keys(document.paths).sort(),
      [
        "/auth/login",
        "/auth/logout",
        "/auth/password-recovery",
        "/auth/password-reset",
        "/auth/refresh",
        "/auth/register",
        "/auth/session",
        "/health/live",
        "/health/ready",
        "/organizations",
        "/organizations/{organizationId}",
        "/organizations/{organizationId}/automation/rules",
        "/organizations/{organizationId}/automation/rules/{ruleId}",
        "/organizations/{organizationId}/automation/rules/{ruleId}/disable",
        "/organizations/{organizationId}/automation/rules/{ruleId}/enable",
        "/organizations/{organizationId}/automation/rules/{ruleId}/versions",
        "/organizations/{organizationId}/notifications/approvals",
        "/organizations/{organizationId}/notifications/approvals/{approvalId}/approve",
        "/organizations/{organizationId}/notifications/approvals/{approvalId}/reject",
        "/organizations/{organizationId}/notifications/policy",
        "/organizations/{organizationId}/notifications/preferences",
        "/organizations/{organizationId}/notifications/send-requests",
        "/organizations/{organizationId}/notifications/sends",
        "/organizations/{organizationId}/notifications/templates",
        "/organizations/{organizationId}/notifications/templates/{templateId}/approve",
        "/organizations/{organizationId}/notifications/templates/{templateId}/revisions",
        "/organizations/{organizationId}/leads",
        "/organizations/{organizationId}/leads/{leadId}",
        "/organizations/{organizationId}/leads/{leadId}/assign",
        "/organizations/{organizationId}/leads/{leadId}/close-lost",
        "/organizations/{organizationId}/leads/{leadId}/close-won",
        "/organizations/{organizationId}/leads/{leadId}/next-action",
        "/organizations/{organizationId}/leads/{leadId}/notes",
        "/organizations/{organizationId}/leads/{leadId}/tasks",
        "/organizations/{organizationId}/leads/{leadId}/tasks/{taskId}/complete",
        "/organizations/{organizationId}/leads/{leadId}/tasks/{taskId}/reschedule",
        "/organizations/{organizationId}/leads/{leadId}/transition",
        "/organizations/{organizationId}/listings/{listingId}",
        "/organizations/{organizationId}/listings/{listingId}/archive",
        "/organizations/{organizationId}/listings/{listingId}/images",
        "/organizations/{organizationId}/listings/{listingId}/publish",
        "/organizations/{organizationId}/memberships",
        "/organizations/{organizationId}/memberships/me",
        "/organizations/{organizationId}/properties",
        "/organizations/{organizationId}/properties/{propertyId}",
        "/organizations/{organizationId}/properties/{propertyId}/listings",
        "/platform/broker-memberships/{membershipId}/approve",
        "/organizations/{organizationId}/finance/accounts",
        "/organizations/{organizationId}/finance/accounting-periods",
        "/organizations/{organizationId}/finance/journal-drafts",
        "/organizations/{organizationId}/finance/journal-entries/{entryId}/post",
        "/organizations/{organizationId}/finance/journal-entries/{entryId}/reverse",
        "/organizations/{organizationId}/finance/commission-plan-versions",
        "/organizations/{organizationId}/finance/deals/{dealId}/commissionable-values",
        "/organizations/{organizationId}/finance/deals/{dealId}/expected-commissions",
        "/organizations/{organizationId}/finance/deals/{dealId}/invoices",
        "/organizations/{organizationId}/finance/invoices/{invoiceId}/cancel",
        "/organizations/{organizationId}/finance/invoices/{invoiceId}/issue",
        "/organizations/{organizationId}/finance/receivables/aging",
        "/organizations/{organizationId}/finance/receivables/{receivableId}/payments",
        "/organizations/{organizationId}/finance/expenses",
        "/organizations/{organizationId}/finance/expenses/{expenseId}/decision",
        "/organizations/{organizationId}/finance/expenses/{expenseId}/evidence",
        "/organizations/{organizationId}/finance/expenses/{expenseId}/submit",
        "/organizations/{organizationId}/finance/expense-approval-policy",
        "/organizations/{organizationId}/finance/reports/cash-flow",
        "/organizations/{organizationId}/finance/reports/payments",
        "/organizations/{organizationId}/finance/reports/expenses",
        "/organizations/{organizationId}/finance/reports/receivables/aging",
        "/organizations/{organizationId}/finance/reports/receivables/aging/items",
        "/organizations/{organizationId}/finance/reports/commissions",
        "/organizations/{organizationId}/finance/reports/commissions/items",
        "/organizations/{organizationId}/finance/reports/performance",
      ].sort(),
    );

    const ledgerOperations = [
      [
        "createAccount",
        "/organizations/{organizationId}/finance/accounts",
        "201",
        ["organizationId"],
        ["code", "name", "type"],
      ],
      [
        "createAccountingPeriod",
        "/organizations/{organizationId}/finance/accounting-periods",
        "201",
        ["organizationId"],
        ["startsAt", "endsAt"],
      ],
      [
        "createDraft",
        "/organizations/{organizationId}/finance/journal-drafts",
        "201",
        ["organizationId"],
        ["reference", "reason", "lines"],
      ],
      [
        "post",
        "/organizations/{organizationId}/finance/journal-entries/{entryId}/post",
        "200",
        ["organizationId", "entryId"],
        ["periodId", "postedAt"],
      ],
      [
        "reverse",
        "/organizations/{organizationId}/finance/journal-entries/{entryId}/reverse",
        "201",
        ["organizationId", "entryId"],
        [],
      ],
    ];
    for (const [
      operationId,
      path,
      status,
      pathNames,
      requiredFields,
    ] of ledgerOperations) {
      const operation = document.paths[path].post;
      assert.equal(operation.operationId, `LedgerController_${operationId}`);
      assert.equal(typeof operation.responses[status], "object");
      assert.deepEqual(
        operation.parameters.map(
          ({ name, required, in: location, schema }) => ({
            name,
            required,
            in: location,
            schema,
          }),
        ),
        pathNames.map((name) => ({
          name,
          required: true,
          in: "path",
          schema: { type: "string", format: "uuid" },
        })),
      );
      if (operationId === "reverse")
        assert.equal(operation.requestBody, undefined);
      else {
        const schema = operation.requestBody.content["application/json"].schema;
        assert.equal(operation.requestBody.required, true);
        assert.equal(schema.type, "object");
        assert.equal(schema.additionalProperties, false);
        assert.deepEqual(schema.required, requiredFields);
      }
    }
    const commissionOperations = [
      [
        "/organizations/{organizationId}/finance/commission-plan-versions",
        "CommissionController_createPlanVersion",
        "201",
        ["organizationId"],
        ["version"],
      ],
      [
        "/organizations/{organizationId}/finance/deals/{dealId}/commissionable-values",
        "CommissionController_captureCommissionableValue",
        "201",
        ["organizationId", "dealId"],
        ["valueId", "amountMinor", "currency", "capturedAt"],
      ],
      [
        "/organizations/{organizationId}/finance/deals/{dealId}/expected-commissions",
        "CommissionController_createExpectedAccrual",
        "201",
        ["organizationId", "dealId"],
        [
          "accrualId",
          "commissionableValueId",
          "commissionPlanVersionId",
          "dealClosedWonEventId",
        ],
      ],
    ];
    for (const [
      path,
      operationId,
      successStatus,
      pathNames,
      required,
    ] of commissionOperations) {
      const operation = document.paths[path].post;
      assert.equal(operation.operationId, operationId);
      assert.equal(typeof operation.responses[successStatus], "object");
      if (operationId === "CommissionController_createExpectedAccrual")
        assert.equal(typeof operation.responses["200"], "object");
      assert.deepEqual(
        operation.parameters.map(
          ({ name, required, in: location, schema }) => ({
            name,
            required,
            in: location,
            schema,
          }),
        ),
        pathNames.map((name) => ({
          name,
          required: true,
          in: "path",
          schema: { type: "string", format: "uuid" },
        })),
      );
      const schema = operation.requestBody.content["application/json"].schema;
      assert.equal(operation.requestBody.required, true);
      assert.equal(schema.type, "object");
      assert.equal(schema.additionalProperties, false);
      assert.deepEqual(schema.required, required);
      assert.equal(
        JSON.stringify(operation).includes("Idempotency-Key"),
        false,
      );
    }
    const planSchema =
      document.paths[commissionOperations[0][0]].post.requestBody.content[
        "application/json"
      ].schema;
    assert.deepEqual(planSchema.properties.recipients.items.properties, {
      order: { type: "integer", minimum: 1 },
      kind: { type: "string", enum: ["BROKER", "OFFICE"] },
      splitBps: { type: "integer", minimum: 1, maximum: 10000 },
    });
    assert.deepEqual(planSchema, {
      type: "object",
      required: ["version"],
      additionalProperties: false,
      properties: {
        version: { type: "integer", minimum: 1 },
        rateBps: { type: "integer", minimum: 1, maximum: 10000 },
        recipients: {
          type: "array",
          minItems: 1,
          items: {
            type: "object",
            required: ["order", "kind", "splitBps"],
            additionalProperties: false,
            properties: {
              order: { type: "integer", minimum: 1 },
              kind: { type: "string", enum: ["BROKER", "OFFICE"] },
              splitBps: { type: "integer", minimum: 1, maximum: 10000 },
            },
          },
        },
      },
      oneOf: [
        {
          type: "object",
          required: ["version"],
          additionalProperties: false,
          properties: { version: { type: "integer", minimum: 1 } },
        },
        {
          type: "object",
          required: ["version", "rateBps", "recipients"],
          additionalProperties: false,
          properties: {
            version: { type: "integer", minimum: 1 },
            rateBps: { type: "integer", minimum: 1, maximum: 10000 },
            recipients: {
              type: "array",
              minItems: 1,
              items: {
                type: "object",
                required: ["order", "kind", "splitBps"],
                additionalProperties: false,
                properties: {
                  order: { type: "integer", minimum: 1 },
                  kind: { type: "string", enum: ["BROKER", "OFFICE"] },
                  splitBps: { type: "integer", minimum: 1, maximum: 10000 },
                },
              },
            },
          },
        },
      ],
    });
    assert.deepEqual(
      document.paths[commissionOperations[1][0]].post.requestBody.content[
        "application/json"
      ].schema.properties,
      {
        valueId: { type: "string", format: "uuid" },
        amountMinor: { type: "string", pattern: "^[1-9]\\d*$" },
        currency: { type: "string", pattern: "^[A-Z]{3}$" },
        capturedAt: { type: "string", format: "date-time" },
      },
    );
    assert.deepEqual(
      document.paths[commissionOperations[2][0]].post.requestBody.content[
        "application/json"
      ].schema.properties,
      {
        accrualId: { type: "string", format: "uuid" },
        commissionableValueId: { type: "string", format: "uuid" },
        commissionPlanVersionId: { type: "string", format: "uuid" },
        dealClosedWonEventId: { type: "string", format: "uuid" },
      },
    );

    const accountSchema =
      document.paths[ledgerOperations[0][1]].post.requestBody.content[
        "application/json"
      ].schema;
    assert.deepEqual(accountSchema.properties, {
      code: { type: "string", minLength: 1, maxLength: 64 },
      name: { type: "string", minLength: 1, maxLength: 200 },
      type: {
        type: "string",
        enum: ["ASSET", "LIABILITY", "EQUITY", "REVENUE", "EXPENSE"],
      },
    });
    const draftSchema =
      document.paths[ledgerOperations[2][1]].post.requestBody.content[
        "application/json"
      ].schema;
    assert.deepEqual(draftSchema.properties.lines, {
      type: "array",
      minItems: 2,
      maxItems: 50,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["accountId", "side", "currency", "amountMinor"],
        properties: {
          accountId: { type: "string", format: "uuid" },
          side: { type: "string", enum: ["DEBIT", "CREDIT"] },
          currency: { type: "string", minLength: 3, maxLength: 3 },
          amountMinor: { type: "string", pattern: "^[1-9]\\d*$" },
        },
      },
    });
    assert.equal(
      JSON.stringify(
        Object.fromEntries(
          ledgerOperations.map(([, path]) => [path, document.paths[path]]),
        ),
      ).includes("Idempotency-Key"),
      false,
    );
    assert.equal(
      JSON.stringify(document.components?.schemas ?? {}).includes("example"),
      false,
    );
    assert.equal(
      document.paths["/health/live"].get.operationId,
      "getLiveHealth",
    );
    assert.equal(
      document.paths["/health/ready"].get.operationId,
      "getReadyHealth",
    );
    assert.equal(
      document.paths["/health/live"].get.responses["200"].description,
      "Service is live",
    );
    assert.equal(
      document.paths["/health/ready"].get.responses["200"].description,
      "Service is ready",
    );
    assert.equal(
      document.paths["/health/ready"].get.responses["503"].description,
      "Dependencies are not ready",
    );

    const propertyParameters =
      document.paths["/organizations/{organizationId}/properties"].get
        .parameters;
    assert.deepEqual(
      propertyParameters.filter(({ in: location }) => location === "query"),
      [
        {
          name: "limit",
          required: false,
          in: "query",
          schema: { type: "integer", minimum: 1, maximum: 50 },
        },
        {
          name: "cursor",
          required: false,
          in: "query",
          schema: { type: "string", maxLength: 255 },
        },
        {
          name: "search",
          required: false,
          in: "query",
          schema: { type: "string", maxLength: 200 },
        },
      ],
    );
    const leadBoardParameters =
      document.paths["/organizations/{organizationId}/leads"].get.parameters;
    assert.deepEqual(
      leadBoardParameters.filter(({ in: location }) => location === "query"),
      [
        {
          name: "limit",
          required: false,
          in: "query",
          schema: { type: "integer", minimum: 1, maximum: 100 },
        },
        {
          name: "cursor",
          required: false,
          in: "query",
          schema: { type: "string", maxLength: 255 },
        },
        {
          name: "stage",
          required: false,
          in: "query",
          schema: {
            type: "string",
            enum: ["NEW", "CONTACTED", "QUALIFIED", "NURTURING"],
          },
        },
      ],
    );
    assert.deepEqual(
      leadBoardParameters
        .filter(({ in: location }) => location === "path")
        .map(({ name, required }) => ({ name, required })),
      [{ name: "organizationId", required: true }],
    );
    const leadDetailResponse =
      document.paths["/organizations/{organizationId}/leads/{leadId}"].get
        .responses["200"].content["application/json"].schema;
    assert.deepEqual(Object.keys(leadDetailResponse.properties).sort(), [
      "lead",
      "notes",
      "tasks",
      "timeline",
    ]);
    assert.deepEqual(
      Object.keys(leadDetailResponse.properties.notes.items.properties).sort(),
      ["body", "createdAt", "id"],
    );
    assert.deepEqual(
      Object.keys(leadDetailResponse.properties.tasks.items.properties).sort(),
      ["completedAt", "createdAt", "dueAt", "id", "status", "title", "version"],
    );

    const propertyOperations = [
      [
        "post",
        "/organizations/{organizationId}/properties",
        "PropertyController_create",
        true,
      ],
      [
        "get",
        "/organizations/{organizationId}/properties",
        "PropertyController_list",
        false,
      ],
      [
        "patch",
        "/organizations/{organizationId}/properties/{propertyId}",
        "PropertyController_update",
        true,
      ],
      [
        "get",
        "/organizations/{organizationId}/properties/{propertyId}",
        "PropertyController_find",
        false,
      ],
      [
        "post",
        "/organizations/{organizationId}/properties/{propertyId}/listings",
        "PropertyController_createListing",
        true,
      ],
      [
        "get",
        "/organizations/{organizationId}/listings/{listingId}",
        "PropertyController_getListing",
        false,
      ],
      [
        "post",
        "/organizations/{organizationId}/listings/{listingId}/publish",
        "PropertyController_publish",
        true,
      ],
      [
        "post",
        "/organizations/{organizationId}/listings/{listingId}/archive",
        "PropertyController_archive",
        true,
      ],
      [
        "post",
        "/organizations/{organizationId}/listings/{listingId}/images",
        "PropertyController_addImage",
        true,
      ],
      [
        "get",
        "/organizations/{organizationId}/listings/{listingId}/images",
        "PropertyController_listImages",
        false,
      ],
    ];
    for (const [method, path, operationId, hasJsonBody] of propertyOperations) {
      const operation = document.paths[path][method];
      assert.equal(operation.operationId, operationId);
      assert.equal(
        Boolean(operation.requestBody?.content?.["application/json"]),
        hasJsonBody,
      );
      assert.deepEqual(
        operation.parameters
          .filter(({ in: location }) => location === "path")
          .map(({ name, required }) => ({ name, required })),
        (path.match(/{[^}]+}/g) ?? []).map((name) => ({
          name: name.slice(1, -1),
          required: true,
        })),
      );
    }
    assert.deepEqual(
      document.paths[
        "/organizations/{organizationId}/properties"
      ].get.parameters
        .filter(({ in: location }) => location === "query")
        .map(({ name, schema }) => ({ name, type: schema.type })),
      [
        { name: "limit", type: "integer" },
        { name: "cursor", type: "string" },
        { name: "search", type: "string" },
      ],
    );

    const closeOperations = [
      [
        "/organizations/{organizationId}/leads/{leadId}/close-won",
        "LeadController_closeWon",
        "201",
        ["organizationId", "leadId"],
        ["propertyId", "brokerId", "expectedVersion"],
        {
          propertyId: { type: "string", format: "uuid" },
          brokerId: { type: "string", format: "uuid" },
          expectedVersion: { type: "integer", minimum: 1 },
        },
      ],
      [
        "/organizations/{organizationId}/leads/{leadId}/close-lost",
        "LeadController_closeLost",
        "200",
        ["organizationId", "leadId"],
        ["reason", "expectedVersion"],
        {
          reason: {
            type: "string",
            pattern: "\\S",
            minLength: 1,
            maxLength: 1000,
          },
          expectedVersion: { type: "integer", minimum: 1 },
        },
      ],
    ];
    for (const [
      path,
      operationId,
      status,
      pathNames,
      requiredBodyFields,
      expectedProperties,
    ] of closeOperations) {
      const operation = document.paths[path].post;
      assert.equal(operation.operationId, operationId);
      assert.equal(typeof operation.responses[status], "object");
      assert.deepEqual(
        operation.parameters
          .filter(({ in: location }) => location === "path")
          .map(({ name, required }) => ({ name, required })),
        pathNames.map((name) => ({ name, required: true })),
      );
      assert.deepEqual(
        operation.parameters
          .filter(({ in: location }) => location === "header")
          .map(({ name, required }) => ({ name, required })),
        [{ name: "Idempotency-Key", required: true }],
      );
      const schema = operation.requestBody.content["application/json"].schema;
      assert.equal(schema.additionalProperties, false);
      assert.deepEqual(schema.required, requiredBodyFields);
      assert.deepEqual(schema.properties, expectedProperties);
      if (operationId === "LeadController_closeLost")
        assert.equal(schema.properties.reason.pattern, "\\S");
      assert.equal(JSON.stringify(schema).includes("dealId"), false);
      assert.equal(JSON.stringify(schema).includes("actor"), false);
      assert.equal(JSON.stringify(schema).includes("finance"), false);
      assert.equal(JSON.stringify(schema).includes("campaign"), false);
      assert.equal(JSON.stringify(schema).includes("status"), false);
      assert.equal(JSON.stringify(schema).includes("stage"), false);
    }

    const crm04Operations = [
      [
        "post",
        "/organizations/{organizationId}/leads/{leadId}/notes",
        "LeadController_createNote",
        "201",
        ["organizationId", "leadId"],
        ["body"],
      ],
      [
        "post",
        "/organizations/{organizationId}/leads/{leadId}/tasks",
        "LeadController_createTask",
        "201",
        ["organizationId", "leadId"],
        ["title", "dueAt"],
      ],
      [
        "post",
        "/organizations/{organizationId}/leads/{leadId}/tasks/{taskId}/complete",
        "LeadController_completeTask",
        "200",
        ["organizationId", "leadId", "taskId"],
        ["expectedVersion"],
      ],
      [
        "post",
        "/organizations/{organizationId}/leads/{leadId}/tasks/{taskId}/reschedule",
        "LeadController_rescheduleTask",
        "200",
        ["organizationId", "leadId", "taskId"],
        ["expectedVersion", "dueAt"],
      ],
    ];
    for (const [
      method,
      path,
      operationId,
      status,
      pathNames,
      requiredBodyFields,
    ] of crm04Operations) {
      const operation = document.paths[path][method];
      assert.equal(operation.operationId, operationId);
      assert.equal(typeof operation.responses[status], "object");
      assert.deepEqual(
        operation.parameters
          .filter(({ in: location }) => location === "path")
          .map(({ name, required }) => ({ name, required })),
        pathNames.map((name) => ({ name, required: true })),
      );
      assert.deepEqual(
        operation.parameters
          .filter(({ in: location }) => location === "header")
          .map(({ name, required }) => ({ name, required })),
        [{ name: "Idempotency-Key", required: true }],
      );
      assert.deepEqual(
        (operation.requestBody.content["application/json"].schema.$ref
          ? document.components.schemas[
              operation.requestBody.content["application/json"].schema.$ref
                .split("/")
                .pop()
            ]
          : operation.requestBody.content["application/json"].schema
        ).required,
        requiredBodyFields,
      );
    }
  } finally {
    await app.close();
  }
});
