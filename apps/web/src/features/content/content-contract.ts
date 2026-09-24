/**
 * EF-402 — typed content-workflow contract for the Arabic UI. Every API
 * payload is strictly normalized here; unknown fields, non-enum statuses, and
 * malformed values are rejected before they can reach a view.
 */

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const CURSOR = /^[A-Za-z0-9_-]+$/;
const HASH = /^[0-9a-f]{64}$/;

export const CONTENT_STATUSES = [
  "IDEA",
  "DRAFT",
  "REVIEW",
  "APPROVED",
  "SCHEDULED",
  "PUBLISHED",
  "FAILED",
] as const;
export type ContentStatus = (typeof CONTENT_STATUSES)[number];

export const CONTENT_CHANNELS = [
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
] as const;
export type ContentChannel = (typeof CONTENT_CHANNELS)[number];

export const CONTENT_FAILURE_KINDS = [
  "CHANNEL_REJECTED",
  "CHANNEL_TIMEOUT",
  "CONTENT_POLICY_VIOLATION",
  "SCHEDULE_MISSED",
  "OTHER",
] as const;
export type ContentFailureKind = (typeof CONTENT_FAILURE_KINDS)[number];

/**
 * EF-403 — missing-fact slots: facts the allowlisted property projection does
 * not carry. They can never be invented, so they render as visible
 * `[PRICE]`-style placeholders until a human fills them in.
 */
export const GENERATION_SLOTS = [
  "PRICE",
  "AREA",
  "BEDROOMS",
  "BATHROOMS",
] as const;
export type GenerationSlot = (typeof GENERATION_SLOTS)[number];

export type GenerationTemplateDescriptor = Readonly<{
  templateId: string;
  channel: ContentChannel;
  templateVersion: number;
  titlePattern: string;
  bodyPattern: string;
  factSlots: readonly GenerationSlot[];
}>;

export type GenerationTemplatesResponse = Readonly<{
  items: readonly GenerationTemplateDescriptor[];
}>;

export type GeneratedDraft = Readonly<{
  item: ContentRecord;
  placeholders: readonly GenerationSlot[];
  templateId: string;
  templateVersion: number;
}>;

export type ContentSummary = Readonly<{
  id: string;
  campaignId?: string;
  rootContentId?: string;
  variantOfId?: string;
  variantNumber: number;
  title: string;
  channel: ContentChannel;
  status: ContentStatus;
  scheduledFor?: string;
  approvedVersion?: number;
  createdAt: string;
}>;

export type ContentListPage = Readonly<{
  items: readonly ContentSummary[];
  nextCursor?: string;
}>;

export type ContentRecord = Readonly<{
  id: string;
  organizationId: string;
  campaignId?: string;
  rootContentId?: string;
  variantOfId?: string;
  variantNumber: number;
  title: string;
  body: string;
  channel: ContentChannel;
  status: ContentStatus;
  scheduledFor?: string;
  approvedVersion?: number;
  contentHash?: string;
  /** EF-403 generation provenance: present together or absent together. */
  sourcePropertyId?: string;
  sourcePropertyVersion?: number;
  generatedTemplateId?: string;
  generatedTemplateVersion?: number;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}>;

export type ContentTransition = Readonly<{
  id: string;
  contentItemId: string;
  fromStatus: ContentStatus;
  toStatus: ContentStatus;
  reason?: string;
  failureKind?: ContentFailureKind;
  version?: number;
  contentHash?: string;
  actorId: string;
  createdAt: string;
}>;

export type ContentDetailResponse = Readonly<{
  item: ContentRecord;
  transitions: readonly ContentTransition[];
  variants: readonly ContentRecord[];
}>;

export type ReviewQueueItem = Readonly<{
  id: string;
  title: string;
  channel: ContentChannel;
  campaignId?: string;
  variantNumber: number;
  submittedAt: string;
}>;

export type ReviewQueueResponse = Readonly<{
  items: readonly ReviewQueueItem[];
}>;

export type CalendarItem = Readonly<{
  id: string;
  title: string;
  channel: ContentChannel;
  status: ContentStatus;
  variantNumber: number;
  scheduledFor: string;
}>;

export type CalendarResponse = Readonly<{
  items: readonly CalendarItem[];
}>;

export type ScheduledDelivery = Readonly<{
  contentItemId: string;
  publishJobId: string;
  title: string;
  channel: ContentChannel;
  variantNumber: number;
  approvedVersion: number;
  scheduledFor: string;
  jobStatus: "QUEUED" | "RETRYING";
  attemptCount: number;
  maxAttempts: number;
  nextAttemptAt: string;
  lastErrorKind?: ContentFailureKind;
  lastErrorMessage?: string;
}>;

export type ScheduledDeliveriesResponse = Readonly<{
  items: readonly ScheduledDelivery[];
}>;

export type PublishResult = Readonly<{
  contentItemId: string;
  title: string;
  channel: ContentChannel;
  approvedVersion: number;
  outcome: "DELIVERED" | "FAILED" | "CANCELLED";
  failureKind?: ContentFailureKind;
  reason?: string;
  providerMessageId?: string;
  completedAt: string;
}>;

export type PublishResultsResponse = Readonly<{
  items: readonly PublishResult[];
}>;

function record(value: unknown, what: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    throw new TypeError(`Invalid ${what}`);
  return value as Record<string, unknown>;
}

function only(value: Record<string, unknown>, fields: readonly string[]): void {
  if (Object.keys(value).some((key) => !fields.includes(key)))
    throw new TypeError("Response contains an unsupported field");
}

function uuid(value: unknown, what: string): string {
  if (typeof value !== "string" || !UUID.test(value))
    throw new TypeError(`Invalid ${what}`);
  return value;
}

function utc(value: unknown, what: string): string {
  if (typeof value !== "string" || !UTC.test(value))
    throw new TypeError(`Invalid ${what}`);
  return value;
}

function text(value: unknown, what: string): string {
  if (typeof value !== "string" || value.trim().length === 0)
    throw new TypeError(`Invalid ${what}`);
  return value;
}

function positiveCount(value: unknown, what: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1)
    throw new TypeError(`Invalid ${what}`);
  return value;
}

function nonNegativeCount(value: unknown, what: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0)
    throw new TypeError(`Invalid ${what}`);
  return value;
}

function hash(value: unknown, what: string): string {
  if (typeof value !== "string" || !HASH.test(value))
    throw new TypeError(`Invalid ${what}`);
  return value;
}

function inEnum<T extends string>(
  value: unknown,
  values: readonly T[],
  what: string,
): T {
  if (typeof value !== "string" || !values.includes(value as T))
    throw new TypeError(`Invalid ${what}`);
  return value as T;
}

function optionalCursor(value: unknown): { nextCursor?: string } {
  if (value === undefined) return {};
  if (typeof value !== "string" || !CURSOR.test(value))
    throw new TypeError("Invalid content cursor");
  return { nextCursor: value };
}

function optionalUuid(value: unknown, what: string): { [key: string]: string } {
  if (value === undefined) return {};
  return { [what]: uuid(value, what) };
}

function optionalUtc(value: unknown, what: string): { [key: string]: string } {
  if (value === undefined) return {};
  return { [what]: utc(value, what) };
}

const ITEM_LIST_FIELDS = [
  "id",
  "campaignId",
  "rootContentId",
  "variantOfId",
  "variantNumber",
  "title",
  "channel",
  "status",
  "scheduledFor",
  "approvedVersion",
  "createdAt",
] as const;

const ITEM_FIELDS = [
  ...ITEM_LIST_FIELDS,
  "organizationId",
  "body",
  "contentHash",
  "sourcePropertyId",
  "sourcePropertyVersion",
  "generatedTemplateId",
  "generatedTemplateVersion",
  "createdBy",
  "updatedAt",
] as const;

function normalizeItemRecord(value: unknown): ContentRecord {
  const row = record(value, "content item");
  only(row, ITEM_FIELDS);
  return {
    id: uuid(row.id, "content item id"),
    organizationId: uuid(row.organizationId, "organization id"),
    ...optionalUuid(row.campaignId, "campaignId"),
    ...optionalUuid(row.rootContentId, "rootContentId"),
    ...optionalUuid(row.variantOfId, "variantOfId"),
    variantNumber: positiveCount(row.variantNumber, "variantNumber"),
    title: text(row.title, "content title"),
    body: text(row.body, "content body"),
    channel: inEnum(row.channel, CONTENT_CHANNELS, "content channel"),
    status: inEnum(row.status, CONTENT_STATUSES, "content status"),
    ...optionalUtc(row.scheduledFor, "scheduledFor"),
    ...(row.approvedVersion === undefined
      ? {}
      : {
          approvedVersion: positiveCount(
            row.approvedVersion,
            "approvedVersion",
          ),
        }),
    ...(row.contentHash === undefined
      ? {}
      : { contentHash: hash(row.contentHash, "contentHash") }),
    ...optionalUuid(row.sourcePropertyId, "sourcePropertyId"),
    ...(row.sourcePropertyVersion === undefined
      ? {}
      : {
          sourcePropertyVersion: positiveCount(
            row.sourcePropertyVersion,
            "sourcePropertyVersion",
          ),
        }),
    ...(row.generatedTemplateId === undefined
      ? {}
      : {
          generatedTemplateId: text(
            row.generatedTemplateId,
            "generatedTemplateId",
          ),
        }),
    ...(row.generatedTemplateVersion === undefined
      ? {}
      : {
          generatedTemplateVersion: positiveCount(
            row.generatedTemplateVersion,
            "generatedTemplateVersion",
          ),
        }),
    createdBy: uuid(row.createdBy, "content actor"),
    createdAt: utc(row.createdAt, "content createdAt"),
    updatedAt: utc(row.updatedAt, "content updatedAt"),
  };
}

function normalizeItemSummary(value: unknown): ContentSummary {
  const row = record(value, "content item");
  only(row, ITEM_LIST_FIELDS);
  return {
    id: uuid(row.id, "content item id"),
    ...optionalUuid(row.campaignId, "campaignId"),
    ...optionalUuid(row.rootContentId, "rootContentId"),
    ...optionalUuid(row.variantOfId, "variantOfId"),
    variantNumber: positiveCount(row.variantNumber, "variantNumber"),
    title: text(row.title, "content title"),
    channel: inEnum(row.channel, CONTENT_CHANNELS, "content channel"),
    status: inEnum(row.status, CONTENT_STATUSES, "content status"),
    ...optionalUtc(row.scheduledFor, "scheduledFor"),
    ...(row.approvedVersion === undefined
      ? {}
      : {
          approvedVersion: positiveCount(
            row.approvedVersion,
            "approvedVersion",
          ),
        }),
    createdAt: utc(row.createdAt, "content createdAt"),
  };
}

export function normalizeContentList(value: unknown): ContentListPage {
  const body = record(value, "content list");
  only(body, ["items", "nextCursor"]);
  if (!Array.isArray(body.items)) throw new TypeError("Invalid content list");
  return {
    items: body.items.map(normalizeItemSummary),
    ...optionalCursor(body.nextCursor),
  };
}

export function normalizeContentDetail(value: unknown): ContentDetailResponse {
  const body = record(value, "content detail");
  only(body, ["item", "transitions", "variants"]);
  if (!Array.isArray(body.transitions))
    throw new TypeError("Invalid transitions");
  if (!Array.isArray(body.variants)) throw new TypeError("Invalid variants");
  return {
    item: normalizeItemRecord(body.item),
    transitions: body.transitions.map(normalizeTransition),
    variants: body.variants.map(normalizeItemRecord),
  };
}

function normalizeTransition(value: unknown): ContentTransition {
  const row = record(value, "content transition");
  only(row, [
    "id",
    "organizationId",
    "contentItemId",
    "fromStatus",
    "toStatus",
    "reason",
    "failureKind",
    "version",
    "contentHash",
    "actorId",
    "createdAt",
  ]);
  return {
    id: uuid(row.id, "transition id"),
    contentItemId: uuid(row.contentItemId, "transition item"),
    fromStatus: inEnum(row.fromStatus, CONTENT_STATUSES, "fromStatus"),
    toStatus: inEnum(row.toStatus, CONTENT_STATUSES, "toStatus"),
    ...(row.reason === undefined ? {} : { reason: text(row.reason, "reason") }),
    ...(row.failureKind === undefined
      ? {}
      : {
          failureKind: inEnum(
            row.failureKind,
            CONTENT_FAILURE_KINDS,
            "failureKind",
          ),
        }),
    ...(row.version === undefined
      ? {}
      : {
          version: positiveCount(row.version, "transition version"),
        }),
    ...(row.contentHash === undefined
      ? {}
      : { contentHash: hash(row.contentHash, "transition contentHash") }),
    actorId: uuid(row.actorId, "transition actor"),
    createdAt: utc(row.createdAt, "transition createdAt"),
  };
}

export function normalizeReviewQueue(value: unknown): ReviewQueueResponse {
  const body = record(value, "review queue");
  only(body, ["items"]);
  if (!Array.isArray(body.items)) throw new TypeError("Invalid review queue");
  return {
    items: body.items.map((entry) => {
      const row = record(entry, "review queue entry");
      only(row, [
        "id",
        "title",
        "channel",
        "campaignId",
        "variantNumber",
        "submittedAt",
      ]);
      return {
        id: uuid(row.id, "review queue id"),
        title: text(row.title, "review queue title"),
        channel: inEnum(row.channel, CONTENT_CHANNELS, "content channel"),
        ...optionalUuid(row.campaignId, "campaignId"),
        variantNumber: positiveCount(row.variantNumber, "variantNumber"),
        submittedAt: utc(row.submittedAt, "submittedAt"),
      };
    }),
  };
}

export function normalizeCalendar(value: unknown): CalendarResponse {
  const body = record(value, "calendar");
  only(body, ["items"]);
  if (!Array.isArray(body.items)) throw new TypeError("Invalid calendar");
  return {
    items: body.items.map((entry) => {
      const row = record(entry, "calendar entry");
      only(row, [
        "id",
        "title",
        "channel",
        "status",
        "variantNumber",
        "scheduledFor",
      ]);
      return {
        id: uuid(row.id, "calendar id"),
        title: text(row.title, "calendar title"),
        channel: inEnum(row.channel, CONTENT_CHANNELS, "content channel"),
        status: inEnum(row.status, CONTENT_STATUSES, "content status"),
        variantNumber: positiveCount(row.variantNumber, "variantNumber"),
        scheduledFor: utc(row.scheduledFor, "scheduledFor"),
      };
    }),
  };
}

function optionalFailureKind(
  value: unknown,
  what: string,
): { [key: string]: ContentFailureKind } {
  if (value === undefined) return {};
  return { [what]: inEnum(value, CONTENT_FAILURE_KINDS, what) };
}

function optionalText(value: unknown, what: string): { [key: string]: string } {
  if (value === undefined) return {};
  return { [what]: text(value, what) };
}

export function normalizeScheduledDeliveries(
  value: unknown,
): ScheduledDeliveriesResponse {
  const body = record(value, "scheduled deliveries");
  only(body, ["items"]);
  if (!Array.isArray(body.items))
    throw new TypeError("Invalid scheduled deliveries");
  return {
    items: body.items.map((entry) => {
      const row = record(entry, "scheduled delivery");
      only(row, [
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
        "lastErrorKind",
        "lastErrorMessage",
      ]);
      return {
        contentItemId: uuid(row.contentItemId, "content item id"),
        publishJobId: uuid(row.publishJobId, "publish job id"),
        title: text(row.title, "scheduled title"),
        channel: inEnum(row.channel, CONTENT_CHANNELS, "content channel"),
        variantNumber: positiveCount(row.variantNumber, "variantNumber"),
        approvedVersion: positiveCount(row.approvedVersion, "approvedVersion"),
        scheduledFor: utc(row.scheduledFor, "scheduledFor"),
        jobStatus: inEnum(row.jobStatus, ["QUEUED", "RETRYING"], "jobStatus"),
        attemptCount: nonNegativeCount(row.attemptCount, "attemptCount"),
        maxAttempts: positiveCount(row.maxAttempts, "maxAttempts"),
        nextAttemptAt: utc(row.nextAttemptAt, "nextAttemptAt"),
        ...optionalFailureKind(row.lastErrorKind, "lastErrorKind"),
        ...optionalText(row.lastErrorMessage, "lastErrorMessage"),
      };
    }),
  };
}

export function normalizePublishResults(
  value: unknown,
): PublishResultsResponse {
  const body = record(value, "publish results");
  only(body, ["items"]);
  if (!Array.isArray(body.items))
    throw new TypeError("Invalid publish results");
  return {
    items: body.items.map((entry) => {
      const row = record(entry, "publish result");
      only(row, [
        "contentItemId",
        "title",
        "channel",
        "approvedVersion",
        "outcome",
        "failureKind",
        "reason",
        "providerMessageId",
        "completedAt",
      ]);
      return {
        contentItemId: uuid(row.contentItemId, "content item id"),
        title: text(row.title, "publish result title"),
        channel: inEnum(row.channel, CONTENT_CHANNELS, "content channel"),
        approvedVersion: positiveCount(row.approvedVersion, "approvedVersion"),
        outcome: inEnum(
          row.outcome,
          ["DELIVERED", "FAILED", "CANCELLED"],
          "publish outcome",
        ),
        ...optionalFailureKind(row.failureKind, "failureKind"),
        ...optionalText(row.reason, "reason"),
        ...optionalText(row.providerMessageId, "providerMessageId"),
        completedAt: utc(row.completedAt, "completedAt"),
      };
    }),
  };
}

/**
 * EF-403 — strict normalizers for the generation endpoints. Same closed-world
 * philosophy as the rest of the contract: unknown fields and malformed values
 * are rejected before they can reach a view.
 */

const TEMPLATE_PATTERN_MAX = 5000;

export function normalizeGenerationTemplates(
  value: unknown,
): GenerationTemplatesResponse {
  const body = record(value, "generation templates");
  only(body, ["items"]);
  if (!Array.isArray(body.items))
    throw new TypeError("Invalid generation templates");
  return {
    items: body.items.map((entry) => {
      const row = record(entry, "generation template");
      only(row, [
        "templateId",
        "channel",
        "templateVersion",
        "titlePattern",
        "bodyPattern",
        "factSlots",
      ]);
      return {
        templateId: text(row.templateId, "template id"),
        channel: inEnum(row.channel, CONTENT_CHANNELS, "content channel"),
        templateVersion: positiveCount(row.templateVersion, "templateVersion"),
        titlePattern: boundedText(
          row.titlePattern,
          "titlePattern",
          TEMPLATE_PATTERN_MAX,
        ),
        bodyPattern: boundedText(
          row.bodyPattern,
          "bodyPattern",
          TEMPLATE_PATTERN_MAX,
        ),
        factSlots: normalizeSlots(row.factSlots),
      };
    }),
  };
}

function boundedText(value: unknown, what: string, max: number): string {
  const canonical = text(value, what);
  if (canonical.length > max) throw new TypeError(`Invalid ${what}`);
  return canonical;
}

function normalizeSlots(value: unknown): readonly GenerationSlot[] {
  if (!Array.isArray(value)) throw new TypeError("Invalid factSlots");
  return value.map((slot) => inEnum(slot, GENERATION_SLOTS, "fact slot"));
}

export function normalizeGeneratedDraft(value: unknown): GeneratedDraft {
  const body = record(value, "generated draft");
  only(body, ["item", "placeholders", "templateId", "templateVersion"]);
  const placeholders = normalizeSlots(body.placeholders);
  return {
    item: normalizeItemRecord(body.item),
    placeholders,
    templateId: text(body.templateId, "template id"),
    templateVersion: positiveCount(body.templateVersion, "templateVersion"),
  };
}

export type PlaceholderSegment = Readonly<{
  text: string;
  placeholder: boolean;
}>;

const PLACEHOLDER_TOKEN = /\[[A-Z][A-Z_]*\]/g;

/**
 * Splits copy into plain and placeholder segments so the UI can highlight
 * every visible `[PRICE]`-style marker. Pure and deterministic.
 */
export function splitPlaceholderSegments(
  value: string,
): readonly PlaceholderSegment[] {
  if (typeof value !== "string") throw new TypeError("Invalid text");
  const segments: PlaceholderSegment[] = [];
  let cursor = 0;
  for (const match of value.matchAll(PLACEHOLDER_TOKEN)) {
    const start = match.index ?? 0;
    if (start > cursor)
      segments.push({ text: value.slice(cursor, start), placeholder: false });
    segments.push({ text: match[0], placeholder: true });
    cursor = start + match[0].length;
  }
  if (cursor < value.length)
    segments.push({ text: value.slice(cursor), placeholder: false });
  return segments;
}
