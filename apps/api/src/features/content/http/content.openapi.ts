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
    sourcePropertyId: optionalUuid,
    sourcePropertyVersion: { type: "integer", minimum: 1 },
    generatedTemplateId: {
      type: "string",
      minLength: 1,
      maxLength: 100,
      pattern: "\\S",
    },
    generatedTemplateVersion: { type: "integer", minimum: 1 },
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

const generationSlotName = {
  type: "string",
  enum: ["PRICE", "AREA", "BEDROOMS", "BATHROOMS"],
};

const generationTemplateSchema = {
  type: "object",
  required: [
    "templateId",
    "channel",
    "templateVersion",
    "titlePattern",
    "bodyPattern",
    "factSlots",
  ],
  additionalProperties: false,
  properties: {
    templateId: {
      type: "string",
      minLength: 1,
      maxLength: 100,
      pattern: "\\S",
    },
    channel: contentChannelSchema,
    templateVersion: { type: "integer", minimum: 1 },
    titlePattern: { type: "string", minLength: 1, maxLength: 500 },
    bodyPattern: { type: "string", minLength: 1, maxLength: 5000 },
    factSlots: { type: "array", items: generationSlotName },
  },
};

export const generationTemplatesResponse = {
  type: "object",
  required: ["items"],
  additionalProperties: false,
  properties: {
    items: { type: "array", items: generationTemplateSchema },
  },
};

export const contentGeneratedResponse = {
  type: "object",
  required: ["item", "placeholders", "templateId", "templateVersion"],
  additionalProperties: false,
  properties: {
    item: contentItemSchema,
    placeholders: { type: "array", items: generationSlotName },
    templateId: {
      type: "string",
      minLength: 1,
      maxLength: 100,
      pattern: "\\S",
    },
    templateVersion: { type: "integer", minimum: 1 },
  },
};

export const generateContentBody = {
  type: "object",
  required: ["propertyId", "channel"],
  additionalProperties: false,
  description:
    "Deterministic draft generation from the allowlisted property projection; missing facts render as visible placeholders and the result enters the normal workflow as a DRAFT.",
  properties: {
    propertyId: optionalUuid,
    channel: contentChannelSchema,
    templateVersion: { type: "integer", minimum: 1, maximum: 1000 },
  },
};

export const cursorParameter = cursorProperty;
export const limitParameter = { type: "integer", minimum: 1, maximum: 100 };
export const calendarFromParameter = utcInstantProperty;
export const calendarToParameter = utcInstantProperty;
export const statusParameter = contentStatusSchema;

// ---------------------------------------------------------------------------
// EF-404 — publishing adapters: upcoming deliveries, publish results, cancel
// ---------------------------------------------------------------------------

const publishJobOpenStatusSchema = {
  type: "string",
  enum: ["QUEUED", "RETRYING"],
};

const publishOutcomeSchema = {
  type: "string",
  enum: ["DELIVERED", "FAILED", "CANCELLED"],
};

const upcomingDeliverySchema = {
  type: "object",
  required: [
    "contentItemId",
    "publishJobId",
    "title",
    "channel",
    "variantNumber",
    "approvedVersion",
    "scheduledFor",
    "jobStatus",
    "attemptCount",
    "maxAttempts",
    "nextAttemptAt",
  ],
  additionalProperties: false,
  properties: {
    contentItemId: uuidParameter,
    publishJobId: uuidParameter,
    title: { type: "string", minLength: 1, maxLength: 200 },
    channel: contentChannelSchema,
    variantNumber: { type: "integer", minimum: 1 },
    approvedVersion: { type: "integer", minimum: 1 },
    scheduledFor: utcInstantProperty,
    jobStatus: publishJobOpenStatusSchema,
    attemptCount: { type: "integer", minimum: 0 },
    maxAttempts: { type: "integer", minimum: 1, maximum: 10 },
    nextAttemptAt: utcInstantProperty,
    lastErrorKind: contentFailureKindSchema,
    lastErrorMessage: { type: "string", minLength: 1, maxLength: 500 },
  },
};

const publishResultSchema = {
  type: "object",
  required: [
    "contentItemId",
    "title",
    "channel",
    "approvedVersion",
    "outcome",
    "completedAt",
  ],
  additionalProperties: false,
  properties: {
    contentItemId: uuidParameter,
    title: { type: "string", minLength: 1, maxLength: 200 },
    channel: contentChannelSchema,
    approvedVersion: { type: "integer", minimum: 1 },
    outcome: publishOutcomeSchema,
    failureKind: contentFailureKindSchema,
    reason: { type: "string", minLength: 1, maxLength: 500 },
    providerMessageId: {
      type: "string",
      minLength: 1,
      maxLength: 200,
    },
    completedAt: utcInstantProperty,
  },
};

export const scheduledDeliveriesResponse = {
  type: "object",
  required: ["items"],
  additionalProperties: false,
  properties: { items: { type: "array", items: upcomingDeliverySchema } },
};

export const publishResultsResponse = {
  type: "object",
  required: ["items"],
  additionalProperties: false,
  properties: { items: { type: "array", items: publishResultSchema } },
};

export const cancelPublishingBody = {
  type: "object",
  required: ["reason"],
  additionalProperties: false,
  description:
    "Cancels the open publish occurrence and marks the scheduled item failed (SCHEDULE_MISSED) so it can re-enter review. After delivery the published item is immutable and the cancel is typed-rejected.",
  properties: { reason: optionalText(500) },
};

const cancelledPublishJobSchema = {
  type: "object",
  required: [
    "id",
    "organizationId",
    "contentItemId",
    "approvedVersion",
    "channel",
    "scheduledFor",
    "contentHash",
    "executionKey",
    "status",
    "attemptCount",
    "maxAttempts",
    "nextAttemptAt",
    "createdAt",
    "updatedAt",
  ],
  additionalProperties: false,
  properties: {
    id: uuidParameter,
    organizationId: uuidParameter,
    contentItemId: uuidParameter,
    approvedVersion: { type: "integer", minimum: 1 },
    channel: contentChannelSchema,
    scheduledFor: utcInstantProperty,
    contentHash: { type: "string", minLength: 64, maxLength: 64 },
    executionKey: { type: "string", minLength: 64, maxLength: 64 },
    status: {
      type: "string",
      enum: [
        "QUEUED",
        "RUNNING",
        "RETRYING",
        "DELIVERED",
        "FAILED",
        "CANCELLED",
      ],
    },
    attemptCount: { type: "integer", minimum: 0 },
    maxAttempts: { type: "integer", minimum: 1, maximum: 10 },
    nextAttemptAt: utcInstantProperty,
    lastErrorKind: contentFailureKindSchema,
    lastErrorMessage: { type: "string", minLength: 1, maxLength: 500 },
    startedAt: utcInstantProperty,
    completedAt: utcInstantProperty,
    createdAt: utcInstantProperty,
    updatedAt: utcInstantProperty,
  },
};

export const cancelPublishingResponse = {
  type: "object",
  required: ["job", "transition"],
  additionalProperties: false,
  properties: {
    job: cancelledPublishJobSchema,
    transition: contentTransitionSchema,
  },
};
