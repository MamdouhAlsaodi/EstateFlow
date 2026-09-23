export const uuidParameter = { type: "string", format: "uuid" };
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

const contentStatusSchema = {
  type: "string",
  enum: [
    "IDEA",
    "DRAFT",
    "REVIEW",
    "APPROVED",
    "SCHEDULED",
    "PUBLISHED",
    "FAILED",
  ],
};
const contentTargetStatusSchema = {
  type: "string",
  enum: ["DRAFT", "REVIEW", "APPROVED", "SCHEDULED", "PUBLISHED", "FAILED"],
};
const contentChannelSchema = {
  type: "string",
  enum: [
    "INSTAGRAM",
    "X",
    "SNAPCHAT",
    "TIKTOK",
    "LINKEDIN",
    "FACEBOOK",
    "WHATSAPP",
    "EMAIL",
    "WEBSITE",
    "OTHER",
  ],
};
const contentFailureKindSchema = {
  type: "string",
  enum: [
    "CHANNEL_REJECTED",
    "CHANNEL_TIMEOUT",
    "CONTENT_POLICY_VIOLATION",
    "SCHEDULE_MISSED",
    "OTHER",
  ],
};

const contentItemSchema = {
  type: "object",
  required: [
    "id",
    "organizationId",
    "variantNumber",
    "title",
    "body",
    "channel",
    "status",
    "createdBy",
    "createdAt",
    "updatedAt",
  ],
  additionalProperties: false,
  properties: {
    id: uuidParameter,
    organizationId: uuidParameter,
    campaignId: optionalUuid,
    rootContentId: optionalUuid,
    variantOfId: optionalUuid,
    variantNumber: { type: "integer", minimum: 1 },
    title: { type: "string", minLength: 1, maxLength: 200 },
    body: { type: "string", minLength: 1, maxLength: 5000 },
    channel: contentChannelSchema,
    status: contentStatusSchema,
    scheduledFor: utcInstantProperty,
    approvedVersion: { type: "integer", minimum: 1 },
    contentHash: { type: "string", minLength: 64, maxLength: 64 },
    createdBy: uuidParameter,
    createdAt: utcInstantProperty,
    updatedAt: utcInstantProperty,
  },
};

const contentTransitionSchema = {
  type: "object",
  required: [
    "id",
    "organizationId",
    "contentItemId",
    "fromStatus",
    "toStatus",
    "actorId",
    "createdAt",
  ],
  additionalProperties: false,
  properties: {
    id: uuidParameter,
    organizationId: uuidParameter,
    contentItemId: uuidParameter,
    fromStatus: contentStatusSchema,
    toStatus: contentStatusSchema,
    reason: { type: "string", minLength: 1, maxLength: 500 },
    failureKind: contentFailureKindSchema,
    version: { type: "integer", minimum: 1 },
    contentHash: { type: "string", minLength: 64, maxLength: 64 },
    actorId: uuidParameter,
    createdAt: utcInstantProperty,
  },
};

const contentListItemSchema = {
  type: "object",
  required: ["id", "variantNumber", "title", "channel", "status", "createdAt"],
  additionalProperties: false,
  properties: {
    id: uuidParameter,
    campaignId: optionalUuid,
    rootContentId: optionalUuid,
    variantOfId: optionalUuid,
    variantNumber: { type: "integer", minimum: 1 },
    title: { type: "string", minLength: 1, maxLength: 200 },
    channel: contentChannelSchema,
    status: contentStatusSchema,
    scheduledFor: utcInstantProperty,
    approvedVersion: { type: "integer", minimum: 1 },
    createdAt: utcInstantProperty,
  },
};

const reviewQueueEntrySchema = {
  type: "object",
  required: ["id", "title", "channel", "variantNumber", "submittedAt"],
  additionalProperties: false,
  properties: {
    id: uuidParameter,
    title: { type: "string", minLength: 1, maxLength: 200 },
    channel: contentChannelSchema,
    campaignId: optionalUuid,
    variantNumber: { type: "integer", minimum: 1 },
    submittedAt: utcInstantProperty,
  },
};

const calendarEntrySchema = {
  type: "object",
  required: [
    "id",
    "title",
    "channel",
    "status",
    "variantNumber",
    "scheduledFor",
  ],
  additionalProperties: false,
  properties: {
    id: uuidParameter,
    title: { type: "string", minLength: 1, maxLength: 200 },
    channel: contentChannelSchema,
    status: contentStatusSchema,
    variantNumber: { type: "integer", minimum: 1 },
    scheduledFor: utcInstantProperty,
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

export const contentCreatedResponse = {
  type: "object",
  required: ["item"],
  additionalProperties: false,
  properties: { item: contentItemSchema },
};

export const contentDetailResponse = {
  type: "object",
  required: ["item", "transitions", "variants"],
  additionalProperties: false,
  properties: {
    item: contentItemSchema,
    transitions: { type: "array", items: contentTransitionSchema },
    variants: { type: "array", items: contentItemSchema },
  },
};

export const contentListResponse = paged(contentListItemSchema);

export const contentEditedResponse = {
  type: "object",
  required: ["item"],
  additionalProperties: false,
  properties: { item: contentItemSchema },
};

export const contentTransitionedResponse = {
  type: "object",
  required: ["item", "transition"],
  additionalProperties: false,
  properties: {
    item: contentItemSchema,
    transition: contentTransitionSchema,
  },
};

export const contentRevisionResponse = {
  type: "object",
  required: ["item"],
  additionalProperties: false,
  properties: { item: contentItemSchema },
};

export const reviewQueueResponse = {
  type: "object",
  required: ["items"],
  additionalProperties: false,
  properties: {
    items: { type: "array", items: reviewQueueEntrySchema },
  },
};

export const calendarResponse = {
  type: "object",
  required: ["items"],
  additionalProperties: false,
  properties: {
    items: { type: "array", items: calendarEntrySchema },
  },
};

export const createContentBody = {
  type: "object",
  required: ["title", "body", "channel"],
  additionalProperties: false,
  properties: {
    title: optionalText(200),
    body: optionalText(5000),
    channel: contentChannelSchema,
    campaignId: optionalUuid,
  },
};

export const editContentBody = {
  type: "object",
  required: ["title", "body", "channel"],
  additionalProperties: false,
  description:
    "Full replacement of the mutable content; omitting campaignId clears the link.",
  properties: {
    title: optionalText(200),
    body: optionalText(5000),
    channel: contentChannelSchema,
    campaignId: optionalUuid,
  },
};

export const contentTransitionBody = {
  type: "object",
  required: ["toStatus"],
  additionalProperties: false,
  description:
    "SCHEDULED requires scheduledFor (future UTC); FAILED requires failureKind and reason.",
  properties: {
    toStatus: contentTargetStatusSchema,
    reason: optionalText(500),
    failureKind: contentFailureKindSchema,
    scheduledFor: utcInstantProperty,
  },
};

export const cursorParameter = cursorProperty;
export const limitParameter = { type: "integer", minimum: 1, maximum: 100 };
export const calendarFromParameter = utcInstantProperty;
export const calendarToParameter = utcInstantProperty;
export const statusParameter = contentStatusSchema;
