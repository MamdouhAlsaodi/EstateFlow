import { createHash, randomUUID } from "node:crypto";

export class ContentValidationError extends Error {
  readonly code = "CONTENT_VALIDATION_ERROR" as const;
  constructor(message: string) {
    super(message);
    this.name = "ContentValidationError";
  }
}

export class ContentStateError extends Error {
  readonly code = "CONTENT_STATE_ERROR" as const;
  constructor(message: string) {
    super(message);
    this.name = "ContentStateError";
  }
}

/**
 * EF-402 lifecycle: idea → draft → review → approved → scheduled →
 * published/failed. A failed item re-enters review for a fresh approval that
 * locks a NEW content version and hash; the published state is terminal and
 * immutable. Every other transition is rejected.
 */
export type ContentStatus =
  | "IDEA"
  | "DRAFT"
  | "REVIEW"
  | "APPROVED"
  | "SCHEDULED"
  | "PUBLISHED"
  | "FAILED";

export type ContentChannel =
  | "INSTAGRAM"
  | "X"
  | "SNAPCHAT"
  | "TIKTOK"
  | "LINKEDIN"
  | "FACEBOOK"
  | "WHATSAPP"
  | "EMAIL"
  | "WEBSITE"
  | "OTHER";

export type ContentFailureKind =
  | "CHANNEL_REJECTED"
  | "CHANNEL_TIMEOUT"
  | "CONTENT_POLICY_VIOLATION"
  | "SCHEDULE_MISSED"
  | "OTHER";

export const CONTENT_STATUSES: readonly ContentStatus[] = [
  "IDEA",
  "DRAFT",
  "REVIEW",
  "APPROVED",
  "SCHEDULED",
  "PUBLISHED",
  "FAILED",
];
export const CONTENT_CHANNELS: readonly ContentChannel[] = [
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
];
export const CONTENT_FAILURE_KINDS: readonly ContentFailureKind[] = [
  "CHANNEL_REJECTED",
  "CHANNEL_TIMEOUT",
  "CONTENT_POLICY_VIOLATION",
  "SCHEDULE_MISSED",
  "OTHER",
];

/**
 * Authority matrix (EF-402): Owner/Manager drive approve/schedule/publish/fail
 * transitions; Broker drafts, edits, submits for review, and spawns revisions
 * inside the same organization. Clients never touch content.
 */
export const CONTENT_AUTHORING_ROLES: readonly string[] = [
  "OWNER",
  "MANAGER",
  "BROKER",
];
export const CONTENT_MANAGEMENT_ROLES: readonly string[] = ["OWNER", "MANAGER"];

type TargetStatus = Exclude<ContentStatus, "IDEA">;

/**
 * Allowed status pairs, enforced by the domain AND by a database trigger:
 * IDEA→DRAFT, DRAFT→REVIEW, REVIEW→DRAFT, REVIEW→APPROVED,
 * APPROVED→SCHEDULED, SCHEDULED→PUBLISHED, SCHEDULED→FAILED, FAILED→REVIEW.
 */
const ALLOWED_TRANSITIONS: Readonly<
  Record<ContentStatus, readonly TargetStatus[]>
> = Object.freeze({
  IDEA: ["DRAFT"],
  DRAFT: ["REVIEW"],
  REVIEW: ["DRAFT", "APPROVED"],
  APPROVED: ["SCHEDULED"],
  SCHEDULED: ["PUBLISHED", "FAILED"],
  FAILED: ["REVIEW"],
  PUBLISHED: [],
});

/** Statuses whose content is version-locked; only revisions may change it. */
export const CONTENT_LOCKED_STATUSES: readonly ContentStatus[] = [
  "APPROVED",
  "SCHEDULED",
  "PUBLISHED",
  "FAILED",
];

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const CONTENT_TITLE_MAX = 200;
export const CONTENT_BODY_MAX = 5000;

export type ContentItem = Readonly<{
  id: string;
  organizationId: string;
  campaignId?: string;
  /** Root (original) item of the revision lineage; null for the root itself. */
  rootContentId?: string;
  variantOfId?: string;
  variantNumber: number;
  title: string;
  body: string;
  channel: ContentChannel;
  status: ContentStatus;
  scheduledFor?: Date;
  /** Locked at approval: 1, 2, 3, … per approval of this lineage member. */
  approvedVersion?: number;
  /** Locked at approval; sha256 over the canonical content payload. */
  contentHash?: string;
  /**
   * EF-403 generation provenance: set together or not at all, exactly once at
   * creation, never editable. Names the allowlisted property version and the
   * deterministic template version the copy was rendered from.
   */
  sourcePropertyId?: string;
  sourcePropertyVersion?: number;
  generatedTemplateId?: string;
  generatedTemplateVersion?: number;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}>;

export type ContentTransitionRecord = Readonly<{
  id: string;
  organizationId: string;
  contentItemId: string;
  fromStatus: ContentStatus;
  toStatus: ContentStatus;
  reason?: string;
  failureKind?: ContentFailureKind;
  /** Set only on REVIEW → APPROVED approvals. */
  version?: number;
  contentHash?: string;
  actorId: string;
  createdAt: Date;
}>;

type CreateInput = Readonly<{
  id: string;
  organizationId: string;
  campaignId?: string;
  rootContentId?: string;
  variantOfId?: string;
  variantNumber?: number;
  title: string;
  body: string;
  channel: ContentChannel;
  sourcePropertyId?: string;
  sourcePropertyVersion?: number;
  generatedTemplateId?: string;
  generatedTemplateVersion?: number;
  createdBy: string;
  createdAt: Date;
}>;

type EditInput = Readonly<{
  title: string;
  body: string;
  channel: ContentChannel;
  campaignId?: string;
  actorId: string;
  at: Date;
}>;

type TransitionInput = Readonly<{
  toStatus: TargetStatus;
  reason?: string;
  failureKind?: ContentFailureKind;
  scheduledFor?: Date;
  actorId: string;
  at: Date;
}>;

export function text(value: string, field: string, limit: number): string {
  if (typeof value !== "string")
    throw new ContentValidationError(`Invalid ${field}`);
  const canonical = value.trim();
  if (canonical.length === 0 || canonical.length > limit)
    throw new ContentValidationError(`Invalid ${field}`);
  return canonical;
}
function optionalText(
  value: string | undefined,
  field: string,
  limit: number,
): string | undefined {
  if (value === undefined) return undefined;
  return text(value, field, limit);
}
function identifier(value: string, field: string): string {
  const canonical = text(value, field, 64);
  if (!UUID.test(canonical))
    throw new ContentValidationError(`Invalid ${field}`);
  return canonical.toLowerCase();
}
export function contentDate(value: Date, field: string): Date {
  if (!(value instanceof Date) || !Number.isFinite(value.getTime()))
    throw new ContentValidationError(`Invalid ${field}`);
  return Object.freeze(new Date(value.getTime()));
}
function channelValue(value: ContentChannel): ContentChannel {
  if (
    typeof value !== "string" ||
    !CONTENT_CHANNELS.includes(value as ContentChannel)
  )
    throw new ContentValidationError("Invalid content channel");
  return value;
}
function failureKindValue(
  value: ContentFailureKind | undefined,
): ContentFailureKind | undefined {
  if (value === undefined) return undefined;
  if (
    typeof value !== "string" ||
    !CONTENT_FAILURE_KINDS.includes(value as ContentFailureKind)
  )
    throw new ContentValidationError("Invalid failure kind");
  return value;
}
function variantNumberValue(value: number | undefined): number {
  if (value === undefined) return 1;
  if (!Number.isInteger(value) || value < 1 || value > 1000)
    throw new ContentValidationError("Invalid variant number");
  return value;
}

function provenanceStampValue(input: {
  sourcePropertyId?: string;
  sourcePropertyVersion?: number;
  generatedTemplateId?: string;
  generatedTemplateVersion?: number;
}): {
  sourcePropertyId?: string;
  sourcePropertyVersion?: number;
  generatedTemplateId?: string;
  generatedTemplateVersion?: number;
} {
  const provided = [
    input.sourcePropertyId,
    input.sourcePropertyVersion,
    input.generatedTemplateId,
    input.generatedTemplateVersion,
  ].filter((value) => value !== undefined).length;
  if (provided !== 0 && provided !== 4)
    throw new ContentValidationError(
      "Generation provenance requires all four fields together",
    );
  if (provided === 0) return {};
  const versionValue = (value: number, field: string): number => {
    if (!Number.isSafeInteger(value) || value < 1)
      throw new ContentValidationError(`Invalid generation ${field}`);
    return value;
  };
  return {
    sourcePropertyId: identifier(
      input.sourcePropertyId as string,
      "source property",
    ),
    sourcePropertyVersion: versionValue(
      input.sourcePropertyVersion as number,
      "source property version",
    ),
    generatedTemplateId: text(
      input.generatedTemplateId as string,
      "generation template id",
      100,
    ),
    generatedTemplateVersion: versionValue(
      input.generatedTemplateVersion as number,
      "template version",
    ),
  };
}

/**
 * Canonical content hash locked at approval: sha256 over the exact payload
 * that was reviewed, so EF-404 can re-verify nothing changed since approval.
 */
export function contentHashOf(
  item: Pick<
    ContentItem,
    "id" | "organizationId" | "title" | "body" | "channel"
  >,
): string {
  const canonical = JSON.stringify({
    body: item.body,
    channel: item.channel,
    organizationId: item.organizationId,
    title: item.title,
  });
  return createHash("sha256")
    .update(`${item.id}\n${canonical}`, "utf8")
    .digest("hex");
}

export function contentTransitionIsAllowed(
  from: ContentStatus,
  to: TargetStatus,
): boolean {
  return ALLOWED_TRANSITIONS[from].includes(to);
}

export function createContentItem(input: CreateInput): ContentItem {
  return Object.freeze({
    id: identifier(input.id, "content item id"),
    organizationId: identifier(input.organizationId, "organization"),
    ...(input.campaignId === undefined
      ? {}
      : { campaignId: identifier(input.campaignId, "campaign") }),
    ...(input.rootContentId === undefined
      ? {}
      : { rootContentId: identifier(input.rootContentId, "root content") }),
    ...(input.variantOfId === undefined
      ? {}
      : { variantOfId: identifier(input.variantOfId, "variant parent") }),
    variantNumber: variantNumberValue(input.variantNumber),
    title: text(input.title, "content title", CONTENT_TITLE_MAX),
    body: text(input.body, "content body", CONTENT_BODY_MAX),
    channel: channelValue(input.channel),
    status: "IDEA" as const,
    ...provenanceStampValue(input),
    createdBy: identifier(input.createdBy, "content actor"),
    createdAt: contentDate(input.createdAt, "content creation time"),
    updatedAt: contentDate(input.createdAt, "content creation time"),
  });
}

/**
 * Content (title/body/channel/campaign link) is editable only while IDEA or
 * DRAFT; after review it is locked and a revision is the only way forward.
 */
export function editContentItem(
  item: ContentItem,
  input: EditInput,
): ContentItem {
  identifier(input.actorId, "edit actor");
  const at = contentDate(input.at, "edit time");
  if (at.getTime() < item.createdAt.getTime())
    throw new ContentValidationError("Edit time cannot precede creation");
  if (item.status !== "IDEA" && item.status !== "DRAFT")
    throw new ContentStateError(
      `Content is locked in ${item.status}; create a revision to change it`,
    );
  // Full replacement of the mutable content: the campaign link is set to the
  // provided value, and clearing it means the link is removed.
  const { campaignId: _previousCampaignId, ...rest } = item;
  return Object.freeze({
    ...rest,
    title: text(input.title, "content title", CONTENT_TITLE_MAX),
    body: text(input.body, "content body", CONTENT_BODY_MAX),
    channel: channelValue(input.channel),
    ...(input.campaignId === undefined
      ? {}
      : { campaignId: identifier(input.campaignId, "campaign") }),
    updatedAt: at,
  });
}

/**
 * Validates a lifecycle transition and returns the new item plus the
 * append-only audit record the caller must persist atomically. Approval locks
 * the next content version with the hash of the exact reviewed payload;
 * scheduling requires a future timestamp; failing requires a typed reason.
 */
export function transitionContentItem(
  item: ContentItem,
  input: TransitionInput,
): { item: ContentItem; transition: ContentTransitionRecord } {
  const actorId = identifier(input.actorId, "transition actor");
  const at = contentDate(input.at, "transition time");
  if (at.getTime() < item.createdAt.getTime())
    throw new ContentValidationError(
      "Transition time cannot precede content creation",
    );
  if (
    typeof input.toStatus !== "string" ||
    !(CONTENT_STATUSES as readonly string[]).includes(input.toStatus) ||
    (input.toStatus as string) === "IDEA"
  )
    throw new ContentValidationError("Invalid content target status");
  const toStatus = input.toStatus as TargetStatus;
  if (!contentTransitionIsAllowed(item.status, toStatus))
    throw new ContentStateError(
      `Content lifecycle forbids ${item.status} → ${toStatus}`,
    );
  const reason = optionalText(input.reason, "transition reason", 500);
  const failureKind = failureKindValue(input.failureKind);
  if (toStatus === "FAILED") {
    if (failureKind === undefined)
      throw new ContentValidationError(
        "Failing content requires a typed failure kind",
      );
    if (reason === undefined || reason.length === 0)
      throw new ContentValidationError(
        "Failing content requires an explicit reason",
      );
  }
  let scheduledFor = item.scheduledFor;
  if (toStatus === "SCHEDULED") {
    const when = contentDate(
      input.scheduledFor as Date,
      "scheduled publishing time",
    );
    if (when.getTime() <= at.getTime())
      throw new ContentValidationError(
        "Scheduled publishing time must be in the future",
      );
    scheduledFor = when;
  }
  if (toStatus === "APPROVED") {
    const approvedVersion = (item.approvedVersion ?? 0) + 1;
    const contentHash = contentHashOf(item);
    const transition: ContentTransitionRecord = Object.freeze({
      id: randomUUID(),
      organizationId: item.organizationId,
      contentItemId: item.id,
      fromStatus: item.status,
      toStatus,
      ...(reason === undefined ? {} : { reason }),
      ...(failureKind === undefined ? {} : { failureKind }),
      version: approvedVersion,
      contentHash,
      actorId,
      createdAt: at,
    });
    return {
      item: Object.freeze({
        ...item,
        status: toStatus,
        approvedVersion,
        contentHash,
        updatedAt: at,
      }),
      transition,
    };
  }
  const transition: ContentTransitionRecord = Object.freeze({
    id: randomUUID(),
    organizationId: item.organizationId,
    contentItemId: item.id,
    fromStatus: item.status,
    toStatus,
    ...(reason === undefined ? {} : { reason }),
    ...(failureKind === undefined ? {} : { failureKind }),
    actorId,
    createdAt: at,
  });
  return {
    item: Object.freeze({
      ...item,
      status: toStatus,
      ...(scheduledFor === undefined ? {} : { scheduledFor }),
      updatedAt: at,
    }),
    transition,
  };
}

/**
 * A revision of a locked item (approved/scheduled/published/failed) creates a
 * NEW variant that re-enters the full lifecycle; the source item never
 * changes. The variant joins the source lineage under its root.
 */
export function createContentRevision(input: {
  id: string;
  source: ContentItem;
  lineageMaxVariantNumber: number;
  organizationId: string;
  createdBy: string;
  createdAt: Date;
}): ContentItem {
  const source = input.source;
  if (!CONTENT_LOCKED_STATUSES.includes(source.status))
    throw new ContentStateError(
      `Only locked content (approved/scheduled/published/failed) can be revised; item is ${source.status}`,
    );
  if (source.organizationId !== input.organizationId)
    throw new ContentStateError("Revision source belongs to another tenant");
  const nextVariantNumber = variantNumberValue(
    input.lineageMaxVariantNumber + 1,
  );
  const rootContentId = source.rootContentId ?? source.id;
  return createContentItem({
    id: input.id,
    organizationId: input.organizationId,
    rootContentId,
    variantOfId: source.id,
    variantNumber: nextVariantNumber,
    title: source.title,
    body: source.body,
    channel: source.channel,
    ...(source.campaignId === undefined
      ? {}
      : { campaignId: source.campaignId }),
    // The revision inherits the lineage generation stamp unchanged: it marks
    // where the copy originally came from, never what the revision is.
    ...(source.sourcePropertyId === undefined
      ? {}
      : {
          sourcePropertyId: source.sourcePropertyId,
          sourcePropertyVersion: source.sourcePropertyVersion,
          generatedTemplateId: source.generatedTemplateId,
          generatedTemplateVersion: source.generatedTemplateVersion,
        }),
    createdBy: input.createdBy,
    createdAt: input.createdAt,
  });
}
