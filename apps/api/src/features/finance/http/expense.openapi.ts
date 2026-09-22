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
const optionalUuid = { type: "string", format: "uuid" };
const optionalText = (maxLength: number) => ({
  type: "string",
  minLength: 1,
  maxLength,
  pattern: "\\S",
});

export const createExpenseBody = {
  type: "object",
  required: ["category", "vendorReference", "amountMinor", "currency"],
  additionalProperties: false,
  properties: {
    category: {
      type: "string",
      enum: ["OFFICE", "CAMPAIGN", "PROPERTY", "OTHER"],
    },
    vendorReference: optionalText(200),
    amountMinor: amountMinorProperty,
    currency: currencyProperty,
    campaignReference: optionalText(100),
    propertyId: optionalUuid,
    dealId: optionalUuid,
  },
};

export const evidenceBody = {
  type: "object",
  required: ["evidenceId", "mediaType", "byteSize", "attachedAt"],
  additionalProperties: false,
  properties: {
    evidenceId: uuidParameter,
    mediaType: { type: "string", enum: ["PDF", "JPEG", "PNG", "WEBP"] },
    byteSize: { type: "integer", minimum: 1, maximum: 100000000 },
    note: optionalText(500),
    attachedAt: utcInstantProperty,
  },
};

export const decisionBody = {
  type: "object",
  required: ["decision"],
  additionalProperties: false,
  properties: {
    decision: { type: "string", enum: ["APPROVED", "REJECTED"] },
    reason: optionalText(500),
  },
};

export const policyBody = {
  type: "object",
  required: ["currency"],
  additionalProperties: false,
  properties: {
    thresholdMinor: amountMinorProperty,
    currency: currencyProperty,
  },
};
