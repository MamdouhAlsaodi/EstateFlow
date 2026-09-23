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
const optionalText = (maxLength: number) => ({
  type: "string",
  minLength: 1,
  maxLength,
  pattern: "\\S",
});
const optionalUuid = { type: "string", format: "uuid" };

const campaignChannelSchema = {
  type: "string",
  enum: [
    "META",
    "GOOGLE",
    "SNAPCHAT",
    "TIKTOK",
    "X",
    "LINKEDIN",
    "PRINT",
    "OUTDOOR",
    "REFERRAL",
    "OTHER",
  ],
};
const touchChannelSchema = {
  type: "string",
  enum: [
    "WEBSITE",
    "WHATSAPP",
    "PHONE_CALL",
    "WALK_IN",
    "REFERRAL",
    "META",
    "GOOGLE",
    "SNAPCHAT",
    "TIKTOK",
    "X",
    "OTHER",
  ],
};
const campaignStatusSchema = {
  type: "string",
  enum: ["DRAFT", "ACTIVE", "COMPLETED", "CANCELLED"],
};
const utmSchema = {
  type: "object",
  required: [],
  additionalProperties: false,
  properties: {
    utmSource: { type: "string", minLength: 1, maxLength: 100 },
    utmMedium: { type: "string", minLength: 1, maxLength: 100 },
    utmCampaign: { type: "string", minLength: 1, maxLength: 100 },
    utmContent: { type: "string", minLength: 1, maxLength: 100 },
    utmTerm: { type: "string", minLength: 1, maxLength: 100 },
  },
};
const moneyRowSchema = {
  type: "object",
  required: ["currency", "count", "amountMinor"],
  additionalProperties: false,
  properties: {
    currency: currencyProperty,
    count: { type: "integer", minimum: 0 },
    amountMinor: amountMinorProperty,
  },
};

const campaignSchema = {
  type: "object",
  required: [
    "id",
    "organizationId",
    "name",
    "objective",
    "channel",
    "status",
    "startsAt",
    "endsAt",
    "budget",
    "utm",
    "createdBy",
    "createdAt",
    "updatedAt",
  ],
  additionalProperties: false,
  properties: {
    id: uuidParameter,
    organizationId: uuidParameter,
    name: { type: "string", minLength: 1, maxLength: 200 },
    objective: { type: "string", minLength: 1, maxLength: 500 },
    channel: campaignChannelSchema,
    status: campaignStatusSchema,
    startsAt: utcInstantProperty,
    endsAt: utcInstantProperty,
    budget: {
      type: "object",
      required: ["amountMinor", "currency"],
      additionalProperties: false,
      properties: {
        amountMinor: amountMinorProperty,
        currency: currencyProperty,
      },
    },
    utm: utmSchema,
    createdBy: uuidParameter,
    createdAt: utcInstantProperty,
    updatedAt: utcInstantProperty,
  },
};

const transitionSchema = {
  type: "object",
  required: [
    "id",
    "organizationId",
    "campaignId",
    "fromStatus",
    "toStatus",
    "actorId",
    "createdAt",
  ],
  additionalProperties: false,
  properties: {
    id: uuidParameter,
    organizationId: uuidParameter,
    campaignId: uuidParameter,
    fromStatus: campaignStatusSchema,
    toStatus: campaignStatusSchema,
    reason: { type: "string", minLength: 1, maxLength: 500 },
    actorId: uuidParameter,
    createdAt: utcInstantProperty,
  },
};

const budgetCorrectionSchema = {
  type: "object",
  required: [
    "id",
    "organizationId",
    "campaignId",
    "previousMinor",
    "correctedMinor",
    "currency",
    "reason",
    "createdBy",
    "createdAt",
  ],
  additionalProperties: false,
  properties: {
    id: uuidParameter,
    organizationId: uuidParameter,
    campaignId: uuidParameter,
    previousMinor: amountMinorProperty,
    correctedMinor: amountMinorProperty,
    currency: currencyProperty,
    reason: { type: "string", minLength: 1, maxLength: 500 },
    createdBy: uuidParameter,
    createdAt: utcInstantProperty,
  },
};

const performanceEntrySchema = {
  type: "object",
  required: [
    "id",
    "organizationId",
    "campaignId",
    "occurredAt",
    "impressions",
    "clicks",
    "leadsCount",
    "createdBy",
    "createdAt",
  ],
  additionalProperties: false,
  properties: {
    id: uuidParameter,
    organizationId: uuidParameter,
    campaignId: uuidParameter,
    occurredAt: utcInstantProperty,
    impressions: { type: "integer", minimum: 0 },
    clicks: { type: "integer", minimum: 0 },
    leadsCount: { type: "integer", minimum: 0 },
    note: { type: "string", minLength: 1, maxLength: 500 },
    createdBy: uuidParameter,
    createdAt: utcInstantProperty,
  },
};

const touchSchema = {
  type: "object",
  required: [
    "id",
    "organizationId",
    "leadId",
    "channel",
    "utm",
    "occurredAt",
    "createdBy",
    "createdAt",
  ],
  additionalProperties: false,
  properties: {
    id: uuidParameter,
    organizationId: uuidParameter,
    leadId: uuidParameter,
    campaignId: optionalUuid,
    channel: touchChannelSchema,
    source: { type: "string", minLength: 1, maxLength: 200 },
    utm: utmSchema,
    occurredAt: utcInstantProperty,
    createdBy: uuidParameter,
    createdAt: utcInstantProperty,
  },
};

const attributionCorrectionSchema = {
  type: "object",
  required: [
    "id",
    "organizationId",
    "leadId",
    "reason",
    "createdBy",
    "createdAt",
  ],
  additionalProperties: false,
  properties: {
    id: uuidParameter,
    organizationId: uuidParameter,
    leadId: uuidParameter,
    previousCampaignId: optionalUuid,
    correctedCampaignId: optionalUuid,
    reason: { type: "string", minLength: 1, maxLength: 500 },
    createdBy: uuidParameter,
    createdAt: utcInstantProperty,
  },
};

const paged = (itemsSchema: object) => ({
  type: "object",
  required: ["items"],
  additionalProperties: false,
  properties: {
    items: { type: "array", items: itemsSchema },
    nextCursor: cursorProperty,
  },
});

const campaignListItemSchema = {
  type: "object",
  required: [
    "id",
    "name",
    "objective",
    "channel",
    "status",
    "startsAt",
    "endsAt",
    "budgetPlannedMinor",
    "currency",
    "touchCount",
    "createdAt",
  ],
  additionalProperties: false,
  properties: {
    id: uuidParameter,
    name: { type: "string", minLength: 1, maxLength: 200 },
    objective: { type: "string", minLength: 1, maxLength: 500 },
    channel: campaignChannelSchema,
    status: campaignStatusSchema,
    startsAt: utcInstantProperty,
    endsAt: utcInstantProperty,
    budgetPlannedMinor: amountMinorProperty,
    currency: currencyProperty,
    budgetActualMinor: amountMinorProperty,
    touchCount: { type: "integer", minimum: 0 },
    createdAt: utcInstantProperty,
  },
};

export const campaignCreatedResponse = {
  type: "object",
  required: ["campaign"],
  additionalProperties: false,
  properties: { campaign: campaignSchema },
};

export const campaignDetailResponse = {
  type: "object",
  required: [
    "campaign",
    "actualByCurrency",
    "transitions",
    "budgetCorrections",
  ],
  additionalProperties: false,
  properties: {
    campaign: campaignSchema,
    actualByCurrency: { type: "array", items: moneyRowSchema },
    transitions: { type: "array", items: transitionSchema },
    budgetCorrections: { type: "array", items: budgetCorrectionSchema },
  },
};

export const campaignListResponse = paged(campaignListItemSchema);

export const campaignTransitionResponse = {
  type: "object",
  required: ["transition"],
  additionalProperties: false,
  properties: { transition: transitionSchema },
};

export const campaignBudgetCorrectionResponse = {
  type: "object",
  required: ["correction"],
  additionalProperties: false,
  properties: { correction: budgetCorrectionSchema },
};

export const campaignPerformanceEntryResponse = {
  type: "object",
  required: ["entry"],
  additionalProperties: false,
  properties: { entry: performanceEntrySchema },
};

export const campaignPerformanceEntriesResponse = paged(performanceEntrySchema);

export const leadTouchResponse = {
  type: "object",
  required: ["touch"],
  additionalProperties: false,
  properties: { touch: touchSchema },
};

export const leadTouchesResponse = paged(touchSchema);

export const touchAttributionSchema = {
  type: "object",
  required: [],
  additionalProperties: false,
  properties: {
    firstTouch: touchSchema,
    lastTouch: touchSchema,
    firstCampaignId: optionalUuid,
    lastCampaignId: optionalUuid,
    override: attributionCorrectionSchema,
  },
};

export const leadAttributionResponse = {
  type: "object",
  required: ["attribution"],
  additionalProperties: false,
  properties: { attribution: touchAttributionSchema },
};

export const attributionCorrectionResponse = {
  type: "object",
  required: ["correction"],
  additionalProperties: false,
  properties: { correction: attributionCorrectionSchema },
};

export const createCampaignBody = {
  type: "object",
  required: [
    "name",
    "objective",
    "channel",
    "startsAt",
    "endsAt",
    "budgetPlannedMinor",
    "currency",
  ],
  additionalProperties: false,
  properties: {
    name: optionalText(200),
    objective: optionalText(500),
    channel: campaignChannelSchema,
    startsAt: utcInstantProperty,
    endsAt: utcInstantProperty,
    budgetPlannedMinor: amountMinorProperty,
    currency: currencyProperty,
    utmSource: optionalText(100),
    utmMedium: optionalText(100),
    utmCampaign: optionalText(100),
    utmContent: optionalText(100),
    utmTerm: optionalText(100),
  },
};

export const transitionBody = {
  type: "object",
  required: ["toStatus"],
  additionalProperties: false,
  properties: {
    toStatus: {
      type: "string",
      enum: ["ACTIVE", "COMPLETED", "CANCELLED"],
    },
    reason: optionalText(500),
  },
};

export const budgetCorrectionBody = {
  type: "object",
  required: ["correctedMinor", "reason"],
  additionalProperties: false,
  properties: {
    correctedMinor: amountMinorProperty,
    reason: optionalText(500),
  },
};

export const performanceEntryBody = {
  type: "object",
  required: ["occurredAt", "impressions", "clicks", "leadsCount"],
  additionalProperties: false,
  properties: {
    occurredAt: utcInstantProperty,
    impressions: { type: "integer", minimum: 0, maximum: 1000000000 },
    clicks: { type: "integer", minimum: 0, maximum: 1000000000 },
    leadsCount: { type: "integer", minimum: 0, maximum: 1000000000 },
    note: optionalText(500),
  },
};

export const leadTouchBody = {
  type: "object",
  required: ["channel"],
  additionalProperties: false,
  properties: {
    channel: touchChannelSchema,
    source: optionalText(200),
    campaignId: optionalUuid,
    utmSource: optionalText(100),
    utmMedium: optionalText(100),
    utmCampaign: optionalText(100),
    utmContent: optionalText(100),
    utmTerm: optionalText(100),
    occurredAt: utcInstantProperty,
  },
};

export const attributionCorrectionBody = {
  type: "object",
  required: ["reason"],
  additionalProperties: false,
  properties: {
    correctedCampaignId: optionalUuid,
    reason: optionalText(500),
  },
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
const statusParameter = {
  name: "status",
  required: false,
  schema: campaignStatusSchema,
};
export const campaignListParameters = () => [
  statusParameter,
  cursorParameter,
  limitParameter,
];

export const pageParameters = () => [cursorParameter, limitParameter];
export { cursorParameter, limitParameter, statusParameter };
