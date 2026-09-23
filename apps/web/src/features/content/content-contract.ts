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
