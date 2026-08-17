export const uuidParameter = { type: "string", format: "uuid" };
export const amountMinorProperty = {
  type: "string",
  pattern: "^[1-9]\\d*$",
};
export const currencyProperty = { type: "string", pattern: "^[A-Z]{3}$" };
export const utcInstantProperty = {
  type: "string",
  format: "date-time",
  pattern: "^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}\\.\\d{3}Z$",
};

export const draftBody = {
  type: "object",
  required: ["amountMinor", "currency"],
  additionalProperties: false,
  properties: { amountMinor: amountMinorProperty, currency: currencyProperty },
};

export const issueBody = {
  type: "object",
  required: ["receivableId", "issuedAt", "dueAt"],
  additionalProperties: false,
  properties: {
    receivableId: uuidParameter,
    issuedAt: utcInstantProperty,
    dueAt: utcInstantProperty,
  },
};

export const cancellationBody = {
  type: "object",
  required: ["reason"],
  additionalProperties: false,
  properties: {
    reason: { type: "string", minLength: 1, maxLength: 500, pattern: "\\S" },
  },
};

export const paymentBody = {
  type: "object",
  required: ["amountMinor", "currency", "recordedAt"],
  additionalProperties: false,
  properties: {
    amountMinor: amountMinorProperty,
    currency: currencyProperty,
    recordedAt: utcInstantProperty,
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

export const agingResponse = {
  type: "object",
  required: ["asOf", "items"],
  additionalProperties: false,
  properties: {
    asOf: utcInstantProperty,
    items: { type: "array", items: agingItem },
    nextCursor: {
      type: "string",
      minLength: 1,
      maxLength: 512,
      pattern: "^[A-Za-z0-9_-]+$",
    },
  },
};
