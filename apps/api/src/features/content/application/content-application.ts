import {
  ContentStateError,
  ContentValidationError,
  createContentItem,
  createContentRevision,
  editContentItem,
  CONTENT_AUTHORING_ROLES,
  CONTENT_MANAGEMENT_ROLES,
  CONTENT_STATUSES,
  transitionContentItem,
  type ContentChannel,
  type ContentFailureKind,
  type ContentItem,
  type ContentStatus,
} from "../domain/content.js";
import type {
  CalendarEntry,
  ContentDetail,
  ContentListQuery,
  ContentMembership,
  ContentMembershipReader,
  ContentPage,
  ContentRepository,
  ContentTransitionCommandResult,
  ReviewQueueEntry,
} from "./content-repository.js";
import type { PublishingOccurrenceScheduler } from "./publishing-application.js";

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CURSOR_DATE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const MAX_PAGE_LIMIT = 100;
const DEFAULT_PAGE_LIMIT = 50;
const DETAIL_HISTORY_LIMIT = 100;
const REVIEW_QUEUE_LIMIT = 100;
/** Bounded calendar window: at most 62 days per query. */
const CALENDAR_MAX_SPAN_DAYS = 62;

export type ContentActor = Readonly<{ verified: boolean }>;

type CommandBase = Readonly<{
  actor: ContentActor;
  userId: string;
  organizationId: string;
}>;

export type CreateContentCommand = CommandBase &
  Readonly<{
    contentItemId: string;
    title: string;
    body: string;
    channel: ContentChannel;
    campaignId?: string;
    createdAt: Date;
  }>;

export type EditContentCommand = CommandBase &
  Readonly<{
    contentItemId: string;
    title: string;
    body: string;
    channel: ContentChannel;
    campaignId?: string;
    at: Date;
  }>;

export type TransitionContentCommand = CommandBase &
  Readonly<{
    contentItemId: string;
    toStatus: Exclude<ContentStatus, "IDEA">;
    reason?: string;
    failureKind?: ContentFailureKind;
    scheduledFor?: Date;
    at: Date;
  }>;

export type CreateRevisionCommand = CommandBase &
  Readonly<{
    contentItemId: string;
    revisionId: string;
    createdAt: Date;
  }>;

export type ListContentCommand = CommandBase &
  Readonly<{ status?: ContentStatus; cursor?: string; limit?: number }>;

export type CalendarQuery = CommandBase & Readonly<{ from: Date; to: Date }>;

export class ContentApplication {
  constructor(
    private readonly repository: ContentRepository,
    private readonly membershipReader: ContentMembershipReader,
    /** EF-404 occurrence source; attached when the publishing module is wired. */
    private readonly publishing?: PublishingOccurrenceScheduler,
  ) {}

  async createContentItem(
    input: CreateContentCommand,
  ): Promise<ContentTransitionCommandResult> {
    const access = await this.authorize(input, CONTENT_AUTHORING_ROLES);
    if (access.kind !== "authorized") return access.result;
    if (
      input.campaignId !== undefined &&
      !(await this.repository.campaignExistsInOrganization(
        input.organizationId,
        input.campaignId,
      ))
    )
      return { kind: "not-found", resource: "campaign" };
    const item = createContentItem({
      id: input.contentItemId,
      organizationId: input.organizationId,
      ...(input.campaignId === undefined
        ? {}
        : { campaignId: input.campaignId }),
      title: input.title,
      body: input.body,
      channel: input.channel,
      createdBy: input.userId,
      createdAt: input.createdAt,
    });
    await this.repository.createContentItem(item);
    return { kind: "created", item };
  }

  async editContentItem(
    input: EditContentCommand,
  ): Promise<ContentTransitionCommandResult> {
    const access = await this.authorize(input, CONTENT_AUTHORING_ROLES);
    if (access.kind !== "authorized") return access.result;
    const item = await this.requireItem(
      input.organizationId,
      input.contentItemId,
    );
    if (!item) return { kind: "not-found", resource: "content-item" };
    if (
      input.campaignId !== undefined &&
      !(await this.repository.campaignExistsInOrganization(
        input.organizationId,
        input.campaignId,
      ))
    )
      return { kind: "not-found", resource: "campaign" };
    let edited;
    try {
      edited = editContentItem(item, {
        title: input.title,
        body: input.body,
        channel: input.channel,
        ...(input.campaignId === undefined
          ? {}
          : { campaignId: input.campaignId }),
        actorId: input.userId,
        at: input.at,
      });
    } catch (error) {
      if (error instanceof ContentStateError)
        return { kind: "conflict", reason: "content-locked" };
      throw error;
    }
    const recorded = await this.repository.recordContentEdit({
      item,
      title: edited.title,
      body: edited.body,
      channel: edited.channel,
      ...(edited.campaignId === undefined
        ? {}
        : { campaignId: edited.campaignId }),
      editedAt: input.at,
    });
    if (!recorded) return { kind: "conflict", reason: "content-locked" };
    return { kind: "edited", item: recorded };
  }

  async transitionContentItem(
    input: TransitionContentCommand,
  ): Promise<ContentTransitionCommandResult> {
    // Approve/schedule/publish/fail are Owner/Manager transitions; submitting
    // for review and returning a draft are authoring moves (Broker allowed).
    const role =
      input.toStatus === "APPROVED" ||
      input.toStatus === "SCHEDULED" ||
      input.toStatus === "PUBLISHED" ||
      input.toStatus === "FAILED"
        ? CONTENT_MANAGEMENT_ROLES
        : CONTENT_AUTHORING_ROLES;
    const access = await this.authorize(input, role);
    if (access.kind !== "authorized") return access.result;
    const item = await this.requireItem(
      input.organizationId,
      input.contentItemId,
    );
    if (!item) return { kind: "not-found", resource: "content-item" };
    if (input.toStatus === "SCHEDULED" && input.scheduledFor === undefined)
      throw new ContentValidationError(
        "Scheduling requires a scheduled publishing time",
      );
    let transitioned;
    try {
      transitioned = transitionContentItem(item, {
        toStatus: input.toStatus,
        ...(input.reason === undefined ? {} : { reason: input.reason }),
        ...(input.failureKind === undefined
          ? {}
          : { failureKind: input.failureKind }),
        ...(input.scheduledFor === undefined
          ? {}
          : { scheduledFor: input.scheduledFor }),
        actorId: input.userId,
        at: input.at,
      });
    } catch (error) {
      if (error instanceof ContentStateError)
        return { kind: "conflict", reason: "content-state-conflict" };
      throw error;
    }
    const recorded = await this.repository.recordContentTransition({
      item,
      transition: transitioned.transition,
      ...(input.scheduledFor === undefined
        ? {}
        : { scheduledFor: input.scheduledFor }),
      // EF-404: the durable publish occurrence is born in the SAME
      // transaction as the SCHEDULED transition, so a crash between the two
      // can never leave a scheduled item without its occurrence.
      ...(input.toStatus === "SCHEDULED" && this.publishing !== undefined
        ? {
            publishJob: this.publishing.prepareOccurrence({
              item: transitioned.item,
              at: input.at,
            }),
          }
        : {}),
    });
    if (!recorded)
      return { kind: "conflict", reason: "content-state-conflict" };
    return {
      kind: "transitioned",
      item: transitioned.item,
      transition: recorded,
    };
  }

  async createRevision(
    input: CreateRevisionCommand,
  ): Promise<ContentTransitionCommandResult> {
    const access = await this.authorize(input, CONTENT_AUTHORING_ROLES);
    if (access.kind !== "authorized") return access.result;
    const source = await this.requireItem(
      input.organizationId,
      input.contentItemId,
    );
    if (!source) return { kind: "not-found", resource: "content-item" };
    const lineageMaxVariantNumber =
      await this.repository.lineageMaxVariantNumber(
        input.organizationId,
        source.rootContentId ?? source.id,
      );
    let revision;
    try {
      revision = createContentRevision({
        id: input.revisionId,
        source,
        lineageMaxVariantNumber,
        organizationId: input.organizationId,
        createdBy: input.userId,
        createdAt: input.createdAt,
      });
    } catch (error) {
      if (error instanceof ContentStateError)
        return { kind: "conflict", reason: "content-state-conflict" };
      throw error;
    }
    const recorded = await this.repository.recordContentRevision({
      revision,
      source,
    });
    if (!recorded)
      return { kind: "conflict", reason: "content-state-conflict" };
    return { kind: "revised", item: recorded };
  }

  async getContentItem(
    input: CommandBase & Readonly<{ contentItemId: string }>,
  ): Promise<
    | ContentDetail
    | { kind: "access-denied" }
    | { kind: "not-found"; resource: "content-item" }
  > {
    const access = await this.authorize(input, CONTENT_AUTHORING_ROLES);
    if (access.kind !== "authorized") return access.result;
    const item = await this.requireItem(
      input.organizationId,
      input.contentItemId,
    );
    if (!item) return { kind: "not-found", resource: "content-item" };
    const [transitions, variants] = await Promise.all([
      this.repository.listTransitions(input.organizationId, item.id),
      this.repository.listLineage(input.organizationId, item),
    ]);
    return {
      item,
      transitions: transitions.slice(0, DETAIL_HISTORY_LIMIT),
      variants: variants.slice(0, DETAIL_HISTORY_LIMIT),
    };
  }

  async listContentItems(
    input: ListContentCommand,
  ): Promise<ContentPage | { kind: "access-denied" }> {
    const access = await this.authorize(input, CONTENT_AUTHORING_ROLES);
    if (access.kind !== "authorized") return access.result;
    const page = preparePage(input);
    const items = await this.repository.listContentItems({
      organizationId: input.organizationId,
      ...(input.status === undefined ? {} : { status: input.status }),
      ...(page.after ? { after: page.after } : {}),
      limit: page.limit,
    } satisfies ContentListQuery);
    const returned = items.slice(0, page.limit - 1);
    const hasMore = items.length >= page.limit;
    return {
      items: returned,
      ...(hasMore && returned.length > 0
        ? { nextCursor: encodeCursor(lastCursorOf(returned)) }
        : {}),
    };
  }

  async listReviewQueue(
    input: CommandBase,
  ): Promise<readonly ReviewQueueEntry[] | { kind: "access-denied" }> {
    const access = await this.authorize(input, CONTENT_AUTHORING_ROLES);
    if (access.kind !== "authorized") return access.result;
    return this.repository.listReviewQueue(
      input.organizationId,
      REVIEW_QUEUE_LIMIT,
    );
  }

  async listCalendar(
    input: CalendarQuery,
  ): Promise<readonly CalendarEntry[] | { kind: "access-denied" }> {
    const access = await this.authorize(input, CONTENT_AUTHORING_ROLES);
    if (access.kind !== "authorized") return access.result;
    const from = input.from.getTime();
    const to = input.to.getTime();
    if (!Number.isFinite(from) || !Number.isFinite(to) || to <= from)
      throw new ContentValidationError("Invalid calendar range");
    if (to - from > CALENDAR_MAX_SPAN_DAYS * 24 * 60 * 60 * 1000)
      throw new ContentValidationError("Calendar range is too wide");
    return this.repository.listCalendar({
      organizationId: input.organizationId,
      from: input.from,
      to: input.to,
    });
  }

  private async requireItem(
    organizationId: string,
    contentItemId: string,
  ): Promise<ContentItem | null> {
    if (!UUID.test(contentItemId)) return null;
    return this.repository.findContentItem(organizationId, contentItemId);
  }

  private async authorize(
    input: CommandBase,
    roles: readonly string[],
  ): Promise<
    | { kind: "authorized" }
    | { kind: "denied"; result: { kind: "access-denied" } }
  > {
    if (!input.actor.verified || input.userId.trim().length === 0)
      return { kind: "denied", result: { kind: "access-denied" } };
    const membership: ContentMembership | null =
      await this.membershipReader.findMembership(
        input.organizationId,
        input.userId,
      );
    if (
      !membership ||
      membership.organizationId !== input.organizationId ||
      membership.status !== "ACTIVE" ||
      !roles.includes(membership.role)
    )
      return { kind: "denied", result: { kind: "access-denied" } };
    return { kind: "authorized" };
  }
}

function preparePage(input: { cursor?: string; limit?: number }): {
  after?: { at: Date; id: string };
  limit: number;
} {
  const limit = input.limit ?? DEFAULT_PAGE_LIMIT;
  if (
    !Number.isInteger(limit) ||
    limit < 1 ||
    limit > MAX_PAGE_LIMIT ||
    !Number.isSafeInteger(limit)
  )
    throw new ContentValidationError("Invalid content page limit");
  return {
    limit: limit + 1,
    ...(input.cursor === undefined
      ? {}
      : { after: decodeCursor(input.cursor) }),
  };
}

function lastCursorOf(items: readonly { createdAt: Date; id: string }[]): {
  at: Date;
  id: string;
} {
  const last = items[items.length - 1];
  return { at: last.createdAt, id: last.id };
}

export function encodeCursor(cursor: { at: Date; id: string }): string {
  return Buffer.from(
    JSON.stringify({ v: 1, at: cursor.at.toISOString(), id: cursor.id }),
  ).toString("base64url");
}

export function decodeCursor(value: string): { at: Date; id: string } {
  if (
    value.length === 0 ||
    value.length > 512 ||
    value.length % 4 === 1 ||
    !/^[A-Za-z0-9_-]+$/.test(value)
  )
    throw new ContentValidationError("Invalid content cursor");
  const bytes = Buffer.from(value, "base64url");
  if (bytes.toString("base64url") !== value)
    throw new ContentValidationError("Invalid content cursor");
  let parsed: unknown;
  try {
    parsed = JSON.parse(bytes.toString("utf8"));
  } catch (error) {
    if (error instanceof SyntaxError)
      throw new ContentValidationError("Invalid content cursor");
    throw error;
  }
  const record = parsed as Record<string, unknown> | null;
  const at = record?.at;
  const id = record?.id;
  if (
    !record ||
    Object.keys(record).length !== 3 ||
    record.v !== 1 ||
    typeof at !== "string" ||
    !CURSOR_DATE.test(at) ||
    typeof id !== "string" ||
    !UUID.test(id) ||
    Buffer.from(JSON.stringify(record)).toString("base64url") !== value
  )
    throw new ContentValidationError("Invalid content cursor");
  return { at: new Date(at), id };
}

export const CONTENT_STATUS_VALUES = CONTENT_STATUSES;
