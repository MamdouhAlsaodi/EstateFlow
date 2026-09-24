/**
 * EF-404 — persistence port for durable publish occurrences and delivered
 * payload snapshots. Implementations must be organization-scoped everywhere
 * except the cross-tenant worker claim, and must keep every settle step
 * (job outcome + audit transition + delivery snapshot) atomic.
 */

import type {
  ContentChannel,
  ContentFailureKind,
  ContentTransitionRecord,
} from "../domain/content.js";
import type {
  ContentPublishJob,
  PublishingDeliveryPayload,
} from "../domain/publishing.js";

export type SettleOutcome = "settled" | "lost-race";

export type UpcomingDelivery = Readonly<{
  contentItemId: string;
  publishJobId: string;
  title: string;
  channel: ContentChannel;
  variantNumber: number;
  approvedVersion: number;
  scheduledFor: Date;
  jobStatus: "QUEUED" | "RETRYING";
  attemptCount: number;
  maxAttempts: number;
  nextAttemptAt: Date;
  lastErrorKind?: ContentFailureKind;
  lastErrorMessage?: string;
}>;

export type PublishOutcome = "DELIVERED" | "FAILED" | "CANCELLED";

export type PublishResult = Readonly<{
  contentItemId: string;
  title: string;
  channel: ContentChannel;
  approvedVersion: number;
  outcome: PublishOutcome;
  failureKind?: ContentFailureKind;
  reason?: string;
  providerMessageId?: string;
  completedAt: Date;
}>;

export type CancelScheduledResult =
  | Readonly<{
      kind: "cancelled";
      job: ContentPublishJob;
      transition: ContentTransitionRecord;
    }>
  | Readonly<{ kind: "already-delivered" }>
  | Readonly<{ kind: "not-open" }>
  | Readonly<{ kind: "not-found"; resource: "content-item" | "publish-job" }>;

export type InsertPublishJobResult =
  | Readonly<{ kind: "inserted"; executionKey: string }>
  | Readonly<{ kind: "duplicate-occurrence"; executionKey: string }>;

export interface ContentPublishingRepository {
  /** Insert one occurrence; replays resolve to the typed duplicate result. */
  insertPublishJob(job: ContentPublishJob): Promise<InsertPublishJobResult>;
  findPublishJobByExecutionKey(
    organizationId: string,
    executionKey: string,
  ): Promise<ContentPublishJob | null>;
  findPublishJobById(
    organizationId: string,
    publishJobId: string,
  ): Promise<ContentPublishJob | null>;
  /** Atomic cross-tenant claim: QUEUED/RETRYING and due, SKIP LOCKED. */
  claimDuePublishJob(now: Date): Promise<ContentPublishJob | null>;
  /**
   * One atomic delivery: append the payload snapshot, mark the job DELIVERED,
   * and move the item SCHEDULED → PUBLISHED with its audited transition.
   */
  settleDeliveredJob(input: {
    job: ContentPublishJob;
    payload: PublishingDeliveryPayload;
    providerMessageId: string;
    transition: ContentTransitionRecord;
    now: Date;
  }): Promise<SettleOutcome>;
  /**
   * Record a retryable or terminal failure; when terminal, also move the item
   * SCHEDULED → FAILED with its typed audited transition in the same
   * transaction.
   */
  settleFailedJob(input: {
    job: ContentPublishJob;
    terminal: boolean;
    failureKind: ContentFailureKind;
    reason: string;
    nextAttemptAt: Date | null;
    transition: ContentTransitionRecord | null;
    now: Date;
  }): Promise<SettleOutcome>;
  /** Cancel a claimed (RUNNING) occurrence whose schedule vanished. */
  settleOrphanCancelledJob(input: {
    job: ContentPublishJob;
    now: Date;
  }): Promise<SettleOutcome>;
  /**
   * User-facing cancel/unschedule before delivery: cancel the open
   * occurrence and move the item SCHEDULED → FAILED (SCHEDULE_MISSED) with
   * the caller as the audited actor, atomically.
   */
  cancelScheduledPublishing(input: {
    organizationId: string;
    contentItemId: string;
    reason: string;
    transition: ContentTransitionRecord;
    now: Date;
  }): Promise<CancelScheduledResult>;
  listUpcomingDeliveries(
    organizationId: string,
    now: Date,
    limit: number,
  ): Promise<readonly UpcomingDelivery[]>;
  listPublishResults(
    organizationId: string,
    limit: number,
  ): Promise<readonly PublishResult[]>;
}
