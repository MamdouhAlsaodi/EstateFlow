export const uuidParameter = { type: "string", format: "uuid" };
export const amountMinorProperty = {
  type: "string",
  pattern: "^[1-9]\\d*$",
};
export const signedAmountMinorProperty = {
  type: "string",
  pattern: "^-?(0|[1-9]\\d*)$",
};
export const currencyProperty = { type: "string", pattern: "^[A-Z]{3}$" };
export const utcInstantProperty = {
  type: "string",
  format: "date-time",
  pattern: "^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}\\.\\d{3}Z$",
};
const cursorProperty = {
  type: "string",
  minLength: 1,
  maxLength: 512,
  pattern: "^[A-Za-z0-9_-]+$",
};
const limitParameter = {
  name: "limit",
  required: false,
  schema: { type: "integer", minimum: 1, maximum: 100, default: 50 },
};
const cursorParameter = {
  name: "cursor",
  required: false,
  schema: cursorProperty,
};
const instantParameter = (name: string) => ({
  name,
  required: false,
  schema: utcInstantProperty,
});

const moneyTotal = {
  type: "object",
  required: ["currency", "count", "amountMinor"],
  additionalProperties: false,
  properties: {
    currency: currencyProperty,
    count: { type: "integer", minimum: 0 },
    amountMinor: amountMinorProperty,
  },
};
const signedMoneyTotal = {
  type: "object",
  required: ["currency", "amountMinor"],
  additionalProperties: false,
  properties: {
    currency: currencyProperty,
    amountMinor: signedAmountMinorProperty,
  },
};

const paymentItem = {
  type: "object",
  required: [
    "paymentId",
    "receivableId",
    "invoiceId",
    "dealId",
    "propertyId",
    "currency",
    "amountMinor",
    "recordedAt",
  ],
  additionalProperties: false,
  properties: {
    paymentId: uuidParameter,
    receivableId: uuidParameter,
    invoiceId: uuidParameter,
    dealId: uuidParameter,
    propertyId: uuidParameter,
    currency: currencyProperty,
    amountMinor: amountMinorProperty,
    recordedAt: utcInstantProperty,
  },
};
const expenseItem = {
  type: "object",
  required: [
    "expenseId",
    "category",
    "vendorReference",
    "currency",
    "amountMinor",
    "decidedAt",
  ],
  additionalProperties: false,
  properties: {
    expenseId: uuidParameter,
    category: {
      type: "string",
      enum: ["OFFICE", "CAMPAIGN", "PROPERTY", "OTHER"],
    },
    vendorReference: { type: "string", minLength: 1, maxLength: 200 },
    currency: currencyProperty,
    amountMinor: amountMinorProperty,
    decidedAt: utcInstantProperty,
    campaignReference: { type: "string", minLength: 1, maxLength: 100 },
    dealId: uuidParameter,
    propertyId: uuidParameter,
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
    receivableId: uuidParameter,
    invoiceId: uuidParameter,
    dealId: uuidParameter,
    currency: currencyProperty,
    originalAmountMinor: amountMinorProperty,
    outstandingMinor: amountMinorProperty,
    status: { type: "string", enum: ["OPEN", "PARTIALLY_PAID"] },
    issuedAt: utcInstantProperty,
    dueAt: utcInstantProperty,
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
const commissionSplit = {
  type: "object",
  required: ["order", "kind", "amountMinor"],
  additionalProperties: false,
  properties: {
    order: { type: "integer", minimum: 1 },
    kind: { type: "string", enum: ["BROKER", "OFFICE"] },
    amountMinor: amountMinorProperty,
  },
};
const commissionItem = {
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
    accrualId: uuidParameter,
    dealId: uuidParameter,
    status: {
      type: "string",
      enum: ["EXPECTED", "CONFIRMED", "DUE", "PAID", "CANCELLED"],
    },
    currency: currencyProperty,
    amountMinor: amountMinorProperty,
    createdAt: utcInstantProperty,
    splits: { type: "array", items: commissionSplit },
  },
};
const performanceRow = {
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
    keyId: uuidParameter,
    currency: currencyProperty,
    revenueMinor: signedAmountMinorProperty,
    costsMinor: signedAmountMinorProperty,
    marginMinor: signedAmountMinorProperty,
    paymentCount: { type: "integer", minimum: 0 },
    expenseCount: { type: "integer", minimum: 0 },
  },
};

export const cashFlowResponse = {
  type: "object",
  required: ["asOf", "cashIn", "cashOut", "netCash"],
  additionalProperties: false,
  properties: {
    asOf: utcInstantProperty,
    cashIn: { type: "array", items: moneyTotal },
    cashOut: { type: "array", items: moneyTotal },
    netCash: { type: "array", items: signedMoneyTotal },
  },
};

export const paymentsResponse = {
  type: "object",
  required: ["asOf", "items"],
  additionalProperties: false,
  properties: {
    asOf: utcInstantProperty,
    items: { type: "array", items: paymentItem },
    nextCursor: cursorProperty,
  },
};

export const expensesResponse = {
  type: "object",
  required: ["asOf", "items"],
  additionalProperties: false,
  properties: {
    asOf: utcInstantProperty,
    items: { type: "array", items: expenseItem },
    nextCursor: cursorProperty,
  },
};

export const agingSummaryResponse = {
  type: "object",
  required: ["asOf", "buckets"],
  additionalProperties: false,
  properties: {
    asOf: utcInstantProperty,
    buckets: {
      type: "array",
      items: {
        type: "object",
        required: ["bucket", "currency", "count", "outstandingMinor"],
        additionalProperties: false,
        properties: {
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
          currency: currencyProperty,
          count: { type: "integer", minimum: 0 },
          outstandingMinor: amountMinorProperty,
        },
      },
    },
  },
};

export const agingItemsResponse = {
  type: "object",
  required: ["asOf", "items"],
  additionalProperties: false,
  properties: {
    asOf: utcInstantProperty,
    items: { type: "array", items: agingItem },
    nextCursor: cursorProperty,
  },
};

export const commissionSummaryResponse = {
  type: "object",
  required: ["asOf", "expected", "due", "paid"],
  additionalProperties: false,
  properties: {
    asOf: utcInstantProperty,
    expected: { type: "array", items: moneyTotal },
    due: { type: "array", items: moneyTotal },
    paid: { type: "array", items: moneyTotal },
  },
};

export const commissionItemsResponse = {
  type: "object",
  required: ["asOf", "items"],
  additionalProperties: false,
  properties: {
    asOf: utcInstantProperty,
    items: { type: "array", items: commissionItem },
    nextCursor: cursorProperty,
  },
};

export const performanceResponse = {
  type: "object",
  required: ["asOf", "deals", "properties"],
  additionalProperties: false,
  properties: {
    asOf: utcInstantProperty,
    deals: { type: "array", items: performanceRow },
    properties: { type: "array", items: performanceRow },
  },
};

export const reportErrorResponses = () => [
  { status: 400, description: "Invalid report query" },
  { status: 401, description: "Missing or invalid session" },
  { status: 403, description: "Owner role required" },
];

export const reportQueryParameters = {
  window: () => [instantParameter("from"), instantParameter("to")],
  page: () => [cursorParameter, limitParameter],
  dealDimension: () => [
    { name: "dealId", required: false, schema: uuidParameter },
    { name: "propertyId", required: false, schema: uuidParameter },
  ],
};
