const crmLeadOperations = [
  {
    method: "post",
    path: "/organizations/{organizationId}/leads/{leadId}/notes",
    operationId: "LeadController_createNote",
    clientMethod: "createLeadNote",
  },
  {
    method: "post",
    path: "/organizations/{organizationId}/leads/{leadId}/tasks",
    operationId: "LeadController_createTask",
    clientMethod: "createLeadTask",
  },
  {
    method: "post",
    path: "/organizations/{organizationId}/leads/{leadId}/tasks/{taskId}/complete",
    operationId: "LeadController_completeTask",
    clientMethod: "completeLeadTask",
  },
  {
    method: "post",
    path: "/organizations/{organizationId}/leads/{leadId}/tasks/{taskId}/reschedule",
    operationId: "LeadController_rescheduleTask",
    clientMethod: "rescheduleLeadTask",
  },
];

const expectedOperations = new Map([
  ["/health/live", "getLiveHealth"],
  ["/health/ready", "getReadyHealth"],
  ["/organizations/{organizationId}/leads", "LeadController_list"],
  ["/organizations/{organizationId}/leads/{leadId}", "LeadController_find"],
]);

const leadReadOperationIds = new Set(expectedOperations.values());
const legacyLeadOperations = new Map([
  ["post /organizations/{organizationId}/leads", "LeadController_create"],
  [
    "post /organizations/{organizationId}/leads/{leadId}/transition",
    "LeadController_transition",
  ],
  [
    "post /organizations/{organizationId}/leads/{leadId}/assign",
    "LeadController_assign",
  ],
  [
    "post /organizations/{organizationId}/leads/{leadId}/next-action",
    "LeadController_nextAction",
  ],
]);

const ledgerOperations = new Map([
  [
    "post /organizations/{organizationId}/finance/accounts",
    {
      operationId: "LedgerController_createAccount",
      clientMethod: "createAccount",
      body: { code: "string", name: "string", type: "string" },
    },
  ],
  [
    "post /organizations/{organizationId}/finance/accounting-periods",
    {
      operationId: "LedgerController_createAccountingPeriod",
      clientMethod: "createAccountingPeriod",
      body: { startsAt: "string", endsAt: "string" },
    },
  ],
  [
    "post /organizations/{organizationId}/finance/journal-drafts",
    {
      operationId: "LedgerController_createDraft",
      clientMethod: "createDraft",
      body: { reference: "string", reason: "string", lines: "DraftLine[]" },
    },
  ],
  [
    "post /organizations/{organizationId}/finance/journal-entries/{entryId}/post",
    {
      operationId: "LedgerController_post",
      clientMethod: "post",
      body: { periodId: "string", postedAt: "string" },
    },
  ],
  [
    "post /organizations/{organizationId}/finance/journal-entries/{entryId}/reverse",
    {
      operationId: "LedgerController_reverse",
      clientMethod: "reverse",
      body: null,
    },
  ],
]);

const commissionOperations = new Map([
  [
    "post /organizations/{organizationId}/finance/commission-plan-versions",
    {
      operationId: "CommissionController_createPlanVersion",
      clientMethod: "createCommissionPlanVersion",
      body: {
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
            properties: {
              version: { type: "integer", minimum: 1 },
            },
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
      },
      successStatuses: ["201"],
    },
  ],
  [
    "post /organizations/{organizationId}/finance/deals/{dealId}/commissionable-values",
    {
      operationId: "CommissionController_captureCommissionableValue",
      clientMethod: "captureCommissionableValue",
      body: {
        type: "object",
        required: ["valueId", "amountMinor", "currency", "capturedAt"],
        additionalProperties: false,
        properties: {
          valueId: { type: "string", format: "uuid" },
          amountMinor: { type: "string", pattern: "^[1-9]\\d*$" },
          currency: { type: "string", pattern: "^[A-Z]{3}$" },
          capturedAt: { type: "string", format: "date-time" },
        },
      },
      successStatuses: ["201"],
    },
  ],
  [
    "post /organizations/{organizationId}/finance/deals/{dealId}/expected-commissions",
    {
      operationId: "CommissionController_createExpectedAccrual",
      clientMethod: "createExpectedAccrual",
      body: {
        type: "object",
        required: [
          "accrualId",
          "commissionableValueId",
          "commissionPlanVersionId",
          "dealClosedWonEventId",
        ],
        additionalProperties: false,
        properties: {
          accrualId: { type: "string", format: "uuid" },
          commissionableValueId: { type: "string", format: "uuid" },
          commissionPlanVersionId: { type: "string", format: "uuid" },
          dealClosedWonEventId: { type: "string", format: "uuid" },
        },
      },
      successStatuses: ["201", "200"],
    },
  ],
]);

const propertyOperations = [
  {
    method: "post",
    path: "/organizations/{organizationId}/properties",
    operationId: "PropertyController_create",
    body: true,
  },
  {
    method: "get",
    path: "/organizations/{organizationId}/properties",
    operationId: "PropertyController_list",
    query: ["search", "cursor", "limit"],
  },
  {
    method: "patch",
    path: "/organizations/{organizationId}/properties/{propertyId}",
    operationId: "PropertyController_update",
    body: true,
  },
  {
    method: "get",
    path: "/organizations/{organizationId}/properties/{propertyId}",
    operationId: "PropertyController_find",
  },
  {
    method: "post",
    path: "/organizations/{organizationId}/properties/{propertyId}/listings",
    operationId: "PropertyController_createListing",
    body: true,
  },
  {
    method: "get",
    path: "/organizations/{organizationId}/listings/{listingId}",
    operationId: "PropertyController_getListing",
  },
  {
    method: "post",
    path: "/organizations/{organizationId}/listings/{listingId}/publish",
    operationId: "PropertyController_publish",
    body: true,
  },
  {
    method: "post",
    path: "/organizations/{organizationId}/listings/{listingId}/archive",
    operationId: "PropertyController_archive",
    body: true,
  },
  {
    method: "post",
    path: "/organizations/{organizationId}/listings/{listingId}/images",
    operationId: "PropertyController_addImage",
    body: true,
  },
  {
    method: "get",
    path: "/organizations/{organizationId}/listings/{listingId}/images",
    operationId: "PropertyController_listImages",
  },
];

const closeLeadOperations = [
  {
    method: "post",
    path: "/organizations/{organizationId}/leads/{leadId}/close-won",
    operationId: "LeadController_closeWon",
    clientMethod: "closeLeadWon",
    successStatus: "201",
    body: {
      propertyId: { type: "string", format: "uuid" },
      brokerId: { type: "string", format: "uuid" },
      expectedVersion: { type: "integer", minimum: 1 },
    },
  },
  {
    method: "post",
    path: "/organizations/{organizationId}/leads/{leadId}/close-lost",
    operationId: "LeadController_closeLost",
    clientMethod: "closeLeadLost",
    successStatus: "200",
    body: {
      reason: { type: "string", minLength: 1, maxLength: 1000, pattern: "\\S" },
      expectedVersion: { type: "integer", minimum: 1 },
    },
  },
];

const httpMethods = new Set([
  "get",
  "post",
  "patch",
  "put",
  "delete",
  "head",
  "options",
]);

function readSupportedOperations(document) {
  const operations = [];

  for (const [path, operationId] of expectedOperations) {
    const pathItem = document.paths?.[path];
    const methods = Object.entries(pathItem ?? {}).filter(([method]) =>
      httpMethods.has(method),
    );
    const unsupportedMethod = methods.find(
      ([method, operation]) =>
        method !== "get" &&
        !(
          (path === "/organizations/{organizationId}/leads" &&
            operation?.operationId === "LeadController_create") ||
          crmLeadOperations.some(
            (candidate) =>
              candidate.method === method &&
              candidate.path === path &&
              candidate.operationId === operation?.operationId,
          )
        ),
    );
    if (unsupportedMethod) {
      throw new Error(
        `Unsupported OpenAPI non-GET operation ${unsupportedMethod[0].toUpperCase()} ${path}; only documented read operations are supported`,
      );
    }

    const operation = pathItem?.get;
    if (!operation || operation.operationId !== operationId) {
      throw new Error(
        `Unsupported OpenAPI operation ${operationId} at ${path}`,
      );
    }
    operations.push({ path, operation });
  }

  const crmOperationsByKey = new Map(
    [...crmLeadOperations, ...closeLeadOperations].map((operation) => [
      `${operation.method} ${operation.path}`,
      operation,
    ]),
  );
  for (const [path, pathItem] of Object.entries(document.paths ?? {})) {
    for (const [method, operation] of Object.entries(pathItem).filter(
      ([name]) => httpMethods.has(name),
    )) {
      if (!operation?.operationId?.startsWith("LeadController_")) continue;
      const key = `${method} ${path}`;
      const isLegacyLeadOperation =
        legacyLeadOperations.get(key) === operation.operationId;
      if (
        !leadReadOperationIds.has(operation.operationId) &&
        !isLegacyLeadOperation &&
        !crmOperationsByKey.has(key)
      ) {
        throw new Error(
          `Unsupported OpenAPI LeadController operation ${method.toUpperCase()} ${path}`,
        );
      }
      const crmOperation = crmOperationsByKey.get(key);
      if (crmOperation && operation.operationId !== crmOperation.operationId) {
        throw new Error(
          `Unsupported OpenAPI LeadController operation ${method.toUpperCase()} ${path}`,
        );
      }
      if (crmOperation) operations.push({ path, operation, crmOperation });
    }
  }

  const expectedPropertyOperations = new Map(
    propertyOperations.map((operation) => [
      `${operation.method} ${operation.path}`,
      operation,
    ]),
  );
  const hasPropertyContract = Object.values(document.paths ?? {}).some(
    (pathItem) =>
      Object.values(pathItem).some((operation) =>
        operation?.operationId?.startsWith("PropertyController_"),
      ),
  );
  if (hasPropertyContract) {
    for (const propertyOperation of propertyOperations) {
      const { path } = propertyOperation;
      const pathItem = document.paths?.[path];
      const operation = pathItem?.[propertyOperation.method];
      if (
        !operation ||
        operation.operationId !== propertyOperation.operationId
      ) {
        throw new Error(
          `Unsupported OpenAPI operation ${propertyOperation.operationId} at ${path}`,
        );
      }
      for (const [method, candidate] of Object.entries(pathItem ?? {}).filter(
        ([name]) => httpMethods.has(name),
      )) {
        const expected = expectedPropertyOperations.get(`${method} ${path}`);
        if (!expected || candidate.operationId !== expected.operationId) {
          throw new Error(
            `Unsupported OpenAPI PropertyController operation ${method.toUpperCase()} ${path}`,
          );
        }
      }
      if (propertyOperation.body && !propertyOperationBodyIsJson(operation)) {
        throw new Error(
          `OpenAPI Property operation ${propertyOperation.operationId} at ${path} must define an application/json request body`,
        );
      }
      operations.push({ path, operation, propertyOperation });
    }

    for (const [path, pathItem] of Object.entries(document.paths ?? {})) {
      for (const [method, operation] of Object.entries(pathItem).filter(
        ([name]) => httpMethods.has(name),
      )) {
        if (
          operation?.operationId?.startsWith("PropertyController_") &&
          !expectedPropertyOperations.has(`${method} ${path}`)
        ) {
          throw new Error(
            `Unsupported OpenAPI PropertyController operation ${method.toUpperCase()} ${path}`,
          );
        }
      }
    }
  }

  for (const [path, pathItem] of Object.entries(document.paths ?? {})) {
    for (const [method, operation] of Object.entries(pathItem).filter(
      ([name]) => httpMethods.has(name),
    )) {
      if (!operation?.operationId?.startsWith("CommissionController_"))
        continue;
      const key = `${method} ${path}`;
      const commissionOperation = commissionOperations.get(key);
      if (
        !commissionOperation ||
        operation.operationId !== commissionOperation.operationId
      ) {
        throw new Error(
          `Unsupported OpenAPI CommissionController operation ${method.toUpperCase()} ${path}`,
        );
      }
      validateCommissionOperation({
        path,
        operation,
        contract: commissionOperation,
      });
      operations.push({ path, operation, commissionOperation });
    }
  }

  for (const [path, pathItem] of Object.entries(document.paths ?? {})) {
    for (const [method, operation] of Object.entries(pathItem).filter(
      ([name]) => httpMethods.has(name),
    )) {
      if (!operation?.operationId?.startsWith("LedgerController_")) continue;
      const key = `${method} ${path}`;
      const ledgerOperation = ledgerOperations.get(key);
      if (
        !ledgerOperation ||
        operation.operationId !== ledgerOperation.operationId
      ) {
        throw new Error(
          `Unsupported OpenAPI LedgerController operation ${method.toUpperCase()} ${path}`,
        );
      }
      const expectedParameters = (path.match(/{[^}]+}/g) ?? []).map((name) => ({
        name: name.slice(1, -1),
        in: "path",
        required: true,
      }));
      const actualParameters = (operation.parameters ?? [])
        .filter(({ in: location }) => location === "path")
        .map(({ name, in: location, required }) => ({
          name,
          in: location,
          required,
        }));
      if (
        JSON.stringify(actualParameters) !== JSON.stringify(expectedParameters)
      )
        throw new Error(
          `OpenAPI Ledger operation ${operation.operationId} at ${path} must define its required path parameters`,
        );
      if (ledgerOperation.body === null) {
        if (operation.requestBody)
          throw new Error(
            `OpenAPI Ledger operation ${operation.operationId} at ${path} must not define a request body`,
          );
      } else if (!propertyOperationBodyIsJson(operation)) {
        throw new Error(
          `OpenAPI Ledger operation ${operation.operationId} at ${path} must define an application/json request body`,
        );
      }
      operations.push({ path, operation, ledgerOperation });
    }
  }

  return operations;
}

function validateCommissionOperation({ path, operation, contract }) {
  const expectedParameters = (path.match(/{[^}]+}/g) ?? []).map((name) => ({
    name: name.slice(1, -1),
    in: "path",
    required: true,
    schema: { type: "string", format: "uuid" },
  }));
  const actualParameters = (operation.parameters ?? []).map(
    ({ name, in: location, required, schema }) => ({
      name,
      in: location,
      required,
      schema,
    }),
  );
  if (stableJson(actualParameters) !== stableJson(expectedParameters))
    throw new Error(
      `OpenAPI Commission operation ${operation.operationId} at ${path} must define exactly its required UUID path parameters`,
    );

  const schema = operation.requestBody?.content?.["application/json"]?.schema;
  if (
    !operation.requestBody?.required ||
    !schema ||
    stableJson(schema) !== stableJson(contract.body)
  )
    throw new Error(
      `OpenAPI Commission operation ${operation.operationId} at ${path} must define the exact JSON body contract`,
    );
  for (const status of contract.successStatuses) {
    if (!operation.responses?.[status])
      throw new Error(
        `OpenAPI Commission operation ${operation.operationId} at ${path} must define success status ${status}`,
      );
  }
}

function propertyOperationBodyIsJson(operation) {
  return Boolean(operation.requestBody?.content?.["application/json"]);
}

function readLeadPathParameters({ path, operation }) {
  const parameterNames = (operation.parameters ?? [])
    .filter((parameter) => parameter.in === "path")
    .map((parameter) => parameter.name);
  const expectedNames = (path.match(/{[^}]+}/g) ?? []).map((name) =>
    name.slice(1, -1),
  );

  if (
    parameterNames.length !== expectedNames.length ||
    expectedNames.some((name) => !parameterNames.includes(name))
  ) {
    throw new Error(
      `OpenAPI Lead operation ${operation.operationId} at ${path} must define its required path parameters`,
    );
  }

  return expectedNames;
}

function readPropertyPathParameters({ path, operation }) {
  const expectedNames = (path.match(/{[^}]+}/g) ?? []).map((name) =>
    name.slice(1, -1),
  );
  const parameters = (operation.parameters ?? []).filter(
    (parameter) => parameter.in === "path",
  );
  if (
    parameters.length !== expectedNames.length ||
    expectedNames.some((name) => {
      const parameter = parameters.find((candidate) => candidate.name === name);
      return !parameter || parameter.required !== true;
    })
  ) {
    throw new Error(
      `OpenAPI Property operation ${operation.operationId} at ${path} must define its required path parameters`,
    );
  }
  return expectedNames;
}

const expectedLeadQueryParameters = new Map([
  ["stage", "string"],
  ["cursor", "string"],
  ["limit", "integer"],
]);

function readLeadQueryParameters({ path, operation }) {
  const queryParameters = (operation.parameters ?? []).filter(
    (parameter) => parameter.in === "query",
  );
  const unexpectedParameter = queryParameters.find(
    (parameter) => !expectedLeadQueryParameters.has(parameter.name),
  );
  if (unexpectedParameter) {
    throw new Error(
      `Unexpected OpenAPI GET query parameter ${unexpectedParameter.name} on ${path}; expected only stage, cursor, limit`,
    );
  }

  for (const [name, type] of expectedLeadQueryParameters) {
    const parameter = queryParameters.find(
      (candidate) => candidate.name === name,
    );
    if (parameter && parameter.schema?.type !== type) {
      throw new Error(
        `OpenAPI Lead GET query parameter ${name} on ${path} must use schema type ${type}`,
      );
    }
    if (parameter?.required === true) {
      throw new Error(
        `OpenAPI Lead GET query parameter ${name} on ${path} must be optional`,
      );
    }
  }

  const documentedNames = new Set(queryParameters.map(({ name }) => name));
  return [...expectedLeadQueryParameters.keys()].filter((name) =>
    documentedNames.has(name),
  );
}

function readPropertyQueryParameters({ path, operation, expected }) {
  const queryParameters = (operation.parameters ?? []).filter(
    (parameter) => parameter.in === "query",
  );
  const allowed = new Map([
    ["search", "string"],
    ["cursor", "string"],
    ["limit", "integer"],
  ]);
  const unexpectedParameter = queryParameters.find(
    (parameter) =>
      !allowed.has(parameter.name) || !expected.includes(parameter.name),
  );
  if (unexpectedParameter)
    throw new Error(
      `Unexpected OpenAPI GET query parameter ${unexpectedParameter.name} on ${path}; expected only search, cursor, limit`,
    );
  for (const parameter of queryParameters) {
    if (
      parameter.schema?.type !== allowed.get(parameter.name) ||
      parameter.required === true
    ) {
      throw new Error(
        `OpenAPI Property GET query parameter ${parameter.name} on ${path} must be an optional ${allowed.get(parameter.name)} parameter`,
      );
    }
  }
  return expected.filter((name) =>
    queryParameters.some((parameter) => parameter.name === name),
  );
}

function readStatusEnum({ path, operation }) {
  const statusEnum =
    operation.responses?.["200"]?.content?.["application/json"]?.schema
      ?.properties?.status?.enum;
  if (
    !Array.isArray(statusEnum) ||
    statusEnum.length === 0 ||
    statusEnum.some((status) => typeof status !== "string")
  ) {
    throw new Error(
      `OpenAPI health operation ${operation.operationId} at ${path} must define a non-empty string status enum`,
    );
  }
  return statusEnum;
}

function encodedPath(path) {
  return (
    "`" +
    path.slice(1).replace(/{(\w+)}/g, "${encodeURIComponent(params.$1)}") +
    "`"
  );
}

function typescriptSchemaType(schema) {
  if (schema.type === "integer") return "number";
  if (schema.type === "array") return `${typescriptSchemaType(schema.items)}[]`;
  if (schema.enum)
    return schema.enum.map((value) => JSON.stringify(value)).join(" | ");
  if (schema.type === "object")
    return `{ ${Object.entries(schema.properties ?? [])
      .map(([name, child]) => `${name}: ${typescriptSchemaType(child)}`)
      .join("; ")} }`;
  return "string";
}

function typescriptObjectType(schema) {
  const required = new Set(schema.required ?? []);
  return `{ ${Object.entries(schema.properties ?? {})
    .map(
      ([name, child]) =>
        `${name}${required.has(name) ? "" : "?"}: ${typescriptSchemaType(child)}`,
    )
    .join("; ")} }`;
}

function parameterType(parameters, queryParameters = []) {
  return `{ ${[
    ...parameters.map((parameter) => `${parameter}: string`),
    ...queryParameters.map(
      (parameter) =>
        `${parameter}?: ${parameter === "limit" ? "number" : "string"}`,
    ),
  ].join(", ")} }`;
}

function queryExpression(queryParameters) {
  if (!queryParameters.length) return '""';
  return `(query.toString() ? \`?\${query}\` : "")`;
}

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object")
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`)
      .join(",")}}`;
  return JSON.stringify(value);
}

function validateCloseLeadOperation({ path, operation, contract }) {
  const expectedPathParameters = (path.match(/{[^}]+}/g) ?? []).map((name) => ({
    name: name.slice(1, -1),
    in: "path",
    required: true,
  }));
  const expectedParameters = [
    ...expectedPathParameters,
    { name: "Idempotency-Key", in: "header", required: true },
  ];
  const parameters = (operation.parameters ?? []).map(
    ({ name, in: location, required }) => ({ name, in: location, required }),
  );
  if (JSON.stringify(parameters) !== JSON.stringify(expectedParameters)) {
    throw new Error(
      `OpenAPI Lead close operation ${operation.operationId} at ${path} must define exactly the required path and Idempotency-Key parameters`,
    );
  }

  const requestBody = operation.requestBody;
  const content = requestBody?.content;
  if (
    !requestBody?.required ||
    !content ||
    Object.keys(content).length !== 1 ||
    !content["application/json"]?.schema
  ) {
    throw new Error(
      `OpenAPI Lead close operation ${operation.operationId} at ${path} must define only a required application/json request body`,
    );
  }

  const schema = content["application/json"].schema;
  const expectedFields = Object.keys(contract.body);
  if (
    schema.type !== "object" ||
    schema.additionalProperties !== false ||
    JSON.stringify(schema.required) !== JSON.stringify(expectedFields) ||
    Object.keys(schema.properties ?? {})
      .sort()
      .join(",") !== expectedFields.slice().sort().join(",")
  ) {
    throw new Error(
      `OpenAPI Lead close operation ${operation.operationId} at ${path} must define the exact required JSON body contract`,
    );
  }
  for (const field of expectedFields) {
    if (
      stableJson(schema.properties[field]) !== stableJson(contract.body[field])
    ) {
      throw new Error(
        `OpenAPI Lead close operation ${operation.operationId} at ${path} has invalid ${field} body constraints`,
      );
    }
  }
  if (!operation.responses?.[contract.successStatus]) {
    throw new Error(
      `OpenAPI Lead close operation ${operation.operationId} at ${path} must define success status ${contract.successStatus}`,
    );
  }
}

export function generateOpenApiClient(document) {
  const operations = readSupportedOperations(document);
  const healthOperations = operations.filter(({ operation }) =>
    operation.operationId.startsWith("get"),
  );
  const leadOperations = operations.filter(
    ({ operation, crmOperation }) =>
      operation.operationId.startsWith("LeadController_") && !crmOperation,
  );
  const crmOperationEntries = operations.filter(
    ({ crmOperation }) => crmOperation,
  );
  const propertyOperationEntries = operations.filter(
    ({ propertyOperation }) => propertyOperation,
  );
  const ledgerOperationEntries = operations.filter(
    ({ ledgerOperation }) => ledgerOperation,
  );
  const commissionOperationEntries = operations.filter(
    ({ commissionOperation }) => commissionOperation,
  );
  const statusLiterals = [
    ...new Set(healthOperations.flatMap(readStatusEnum)),
  ].map((status) => JSON.stringify(status));

  const getMethods = (entries, isProperty = false) =>
    entries.map(({ path, operation, propertyOperation }) => {
      const parameters = isProperty
        ? readPropertyPathParameters({ path, operation })
        : readLeadPathParameters({ path, operation });
      const queryParameters = isProperty
        ? readPropertyQueryParameters({
            path,
            operation,
            expected: propertyOperation.query ?? [],
          })
        : readLeadQueryParameters({ path, operation });
      const queryBuilder = queryParameters.length
        ? `const query = new URLSearchParams(); ${queryParameters.map((parameter) => `if (params.${parameter} !== undefined) query.set(${JSON.stringify(parameter)}, String(params.${parameter}));`).join(" ")} `
        : "";
      const responseType =
        operation.operationId === "LeadController_find"
          ? "LeadDetailResponse"
          : "unknown";
      return `    ${operation.operationId}: (${parameters.length || queryParameters.length ? `params: ${parameterType(parameters, queryParameters)}` : ""}) => { ${queryBuilder} return requestJson<${responseType}>(${encodedPath(path)} + ${queryExpression(queryParameters)}); },`;
    });
  const healthMethods = healthOperations
    .map(
      ({ path, operation }) =>
        `    ${operation.operationId}: () => requestJson(${JSON.stringify(path.slice(1))}),`,
    )
    .join("\n");
  const leadMethods = getMethods(leadOperations).join("\n");
  const crmMethods = crmOperationEntries
    .map(({ path, operation, crmOperation }) => {
      const parameters = readLeadPathParameters({ path, operation });
      const bodySchema =
        operation.requestBody?.content?.["application/json"]?.schema;
      if (!bodySchema || !Array.isArray(bodySchema.required)) {
        throw new Error(
          `OpenAPI Lead operation ${operation.operationId} at ${path} must define a JSON request body schema`,
        );
      }
      if (closeLeadOperations.includes(crmOperation))
        validateCloseLeadOperation({ path, operation, contract: crmOperation });
      const bodyProperties = bodySchema.required
        .map(
          (name) =>
            `${name}: ${bodySchema.properties?.[name]?.type === "integer" ? "number" : "string"}`,
        )
        .join(", ");
      return `    ${crmOperation.clientMethod}: (params: ${parameterType([...parameters, "idempotencyKey"])} , body: { ${bodyProperties} }) => requestJson(${encodedPath(path)}, { method: "POST", headers: { "Idempotency-Key": params.idempotencyKey, "content-type": "application/json" }, body: JSON.stringify(body) }),`;
    })
    .join("\n");
  const commissionMethods = commissionOperationEntries
    .map(({ path, commissionOperation }) => {
      const parameters = (path.match(/{[^}]+}/g) ?? []).map((name) =>
        name.slice(1, -1),
      );
      const bodySchema = commissionOperation.body;
      const bodyType = Array.isArray(bodySchema.oneOf)
        ? bodySchema.oneOf.map(typescriptObjectType).join(" | ")
        : typescriptObjectType(bodySchema);
      const renderedBodyType = bodyType.includes(" | ")
        ? `(${bodyType})`
        : bodyType;
      return `    ${commissionOperation.clientMethod}: (params: ${parameterType(parameters)}, body: ${renderedBodyType}) => requestJson(${encodedPath(path)}, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }),`;
    })
    .join("\n");
  const ledgerMethods = ledgerOperationEntries
    .map(({ path, operation, ledgerOperation }) => {
      const parameters = readPropertyPathParameters({ path, operation });
      const bodyType =
        ledgerOperation.body === null
          ? ""
          : `, body: { ${Object.entries(ledgerOperation.body)
              .map(([name, type]) => `${name}: ${type}`)
              .join("; ")} }`;
      const bodyInit =
        ledgerOperation.body === null
          ? ""
          : ', { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }';
      const paramsType = parameterType(parameters);
      return ledgerOperation.body === null
        ? `    ${ledgerOperation.clientMethod}: (params: ${paramsType}) => requestJson(${encodedPath(path)}, { method: "POST" }),`
        : `    ${ledgerOperation.clientMethod}: (params: ${paramsType}${bodyType}) => requestJson(${encodedPath(path)}${bodyInit}),`;
    })
    .join("\n");
  const propertyMethods = propertyOperationEntries
    .map(({ path, operation, propertyOperation }) => {
      const parameters = readPropertyPathParameters({ path, operation });
      if (propertyOperation.method === "get")
        return getMethods([{ path, operation, propertyOperation }], true)[0];
      return `    ${operation.operationId}: (params: ${parameterType(parameters)}, body: unknown) => requestJson(${encodedPath(path)}, { method: ${JSON.stringify(propertyOperation.method.toUpperCase())}, headers: { "content-type": "application/json" }, body: JSON.stringify(body) }),`;
    })
    .join("\n");

  return `export type HealthStatus = {
  status: ${statusLiterals.join(" | ")};
};

export type DraftLine = {
  accountId: string;
  side: "DEBIT" | "CREDIT";
  currency: string;
  amountMinor: string;
};

export type LeadDetailResponse = {
  lead: Record<string, unknown>;
  timeline: { items: Array<{ id: string; type: string; occurredAt: string; data: Record<string, string | null> }>; nextCursor: string | null };
  notes: Array<{ id: string; body: string; createdAt: string }>;
  tasks: Array<{ id: string; title: string; dueAt: string; status: "OPEN" | "COMPLETED"; createdAt: string; completedAt: string | null; version: number }>;
};

export type FetchLike = (
  input: string,
  init?: { method: string; headers?: Record<string, string>; body?: string },
) => Promise<{ ok: boolean; json(): Promise<unknown> }>;

export type EstateFlowClientOptions = {
  baseUrl: string;
  fetch?: FetchLike;
};

export function createEstateFlowClient({
  baseUrl,
  fetch,
}: EstateFlowClientOptions) {
  const request = fetch ?? (globalThis.fetch as FetchLike | undefined);

  if (!request) throw new Error("A fetch implementation is required");

  const requestJson = async <T>(path: string, init: { method: string; headers?: Record<string, string>; body?: string } = { method: "GET" }): Promise<T> => {
    const response = await request(new URL(path, baseUrl).toString(), init);

    if (!response.ok) throw new Error("EstateFlow API request failed");

    return response.json() as Promise<T>;
  };

  return {
${healthMethods}
${leadMethods}
${crmMethods}
${commissionMethods}
${ledgerMethods}
${propertyMethods}
  };
}
`;
}
