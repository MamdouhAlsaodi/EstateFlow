import type {
  ContentChannel,
  ContentFailureKind,
  ContentItem,
  ContentStatus,
  ContentTransitionRecord,
} from "../domain/content.js";

export type ContentMembership = Readonly<{
  organizationId: string;
  role: "OWNER" | "MANAGER" | "BROKER" | "CLIENT";
  status: "ACTIVE" | "PENDING" | "SUSPENDED" | "REVOKED";
}>;

export interface ContentMembershipReader {
  findMembership(
    organizationId: string,
    userId: string,
  ): Promise<ContentMembership | null>;
}

export type ContentCursor = Readonly<{ at: Date; id: string }>;

export type ContentListItem = Readonly<{
  id: string;
  campaignId?: string;
  rootContentId?: string;
  variantOfId?: string;
  variantNumber: number;
  title: string;
  channel: ContentChannel;
  status: ContentStatus;
  scheduledFor?: Date;
  approvedVersion?: number;
  createdAt: Date;
}>;

export type ContentDetail = Readonly<{
  item: ContentItem;
  transitions: readonly ContentTransitionRecord[];
  /** Whole revision lineage (root first), oldest variant number first. */
  variants: readonly ContentItem[];
}>;

export type ContentListQuery = Readonly<{
  organizationId: string;
  status?: ContentStatus;
  after?: ContentCursor;
  limit: number;
}>;

export type ContentPage = Readonly<{
  items: readonly ContentListItem[];
  nextCursor?: string;
}>;

export type ReviewQueueEntry = Readonly<{
  id: string;
  title: string;
  channel: ContentChannel;
  campaignId?: string;
  variantNumber: number;
  submittedAt: Date;
}>;

export type CalendarEntry = Readonly<{
  id: string;
  title: string;
  channel: ContentChannel;
  status: ContentStatus;
  variantNumber: number;
  scheduledFor: Date;
}>;

export type ContentTransitionCommandResult =
  | { kind: "created"; item: ContentItem }
  | { kind: "edited"; item: ContentItem }
  | {
      kind: "transitioned";
      item: ContentItem;
      transition: ContentTransitionRecord;
    }
  | { kind: "revised"; item: ContentItem }
  | { kind: "access-denied" }
  | { kind: "conflict"; reason: string }
  | { kind: "not-found"; resource: "content-item" | "campaign" };

export interface ContentRepository {
  createContentItem(item: ContentItem): Promise<void>;
  findContentItem(
    organizationId: string,
    contentItemId: string,
  ): Promise<ContentItem | null>;
  listContentItems(
    query: ContentListQuery,
  ): Promise<readonly ContentListItem[]>;
  listReviewQueue(
    organizationId: string,
    limit: number,
  ): Promise<readonly ReviewQueueEntry[]>;
  listCalendar(input: {
    organizationId: string;
    from: Date;
    to: Date;
  }): Promise<readonly CalendarEntry[]>;
  listTransitions(
    organizationId: string,
    contentItemId: string,
  ): Promise<readonly ContentTransitionRecord[]>;
  listLineage(
    organizationId: string,
    item: ContentItem,
  ): Promise<readonly ContentItem[]>;
  campaignExistsInOrganization(
    organizationId: string,
    campaignId: string,
  ): Promise<boolean>;
  /** Highest variant number in the lineage rooted at the given item. */
  lineageMaxVariantNumber(
    organizationId: string,
    lineageRootId: string,
  ): Promise<number>;
  /**
   * Guarded content edit: atomic UPDATE … WHERE status IN ('IDEA','DRAFT');
   * null when the item locked or moved first.
   */
  recordContentEdit(input: {
    item: ContentItem;
    title: string;
    body: string;
    channel: ContentChannel;
    campaignId?: string;
    editedAt: Date;
  }): Promise<ContentItem | null>;
  /**
   * Guarded atomic transition: status must still equal fromStatus (and the
   * approval counter its predecessor) or the caller gets a conflict.
   */
  recordContentTransition(input: {
    item: ContentItem;
    transition: ContentTransitionRecord;
    scheduledFor?: Date;
  }): Promise<ContentTransitionRecord | null>;
  /**
   * Revision creation inside one transaction: inserts the new DRAFT variant
   * (unique lineage index catches concurrent variant-number races); null when
   * the insert lost a race or the source disappeared.
   */
  recordContentRevision(input: {
    revision: ContentItem;
    source: ContentItem;
  }): Promise<ContentItem | null>;
  /**
   * EF-403 generation: inserts the generated DRAFT (with its provenance
   * stamp) together with the audited IDEA → DRAFT transition in one
   * transaction; null when the tenant/property link vanished mid-flight.
   */
  createGeneratedDraft(input: {
    item: ContentItem;
    transition: ContentTransitionRecord;
  }): Promise<ContentItem | null>;
}

export type ContentFailureKindRef = ContentFailureKind;
