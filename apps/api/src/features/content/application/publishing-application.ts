/**
 * EF-404 — publishing application.
 *
 * Scheduling: when the EF-402 workflow moves an item APPROVED → SCHEDULED,
 * exactly one durable publish occurrence is derived from the locked approval
 * (version + hash) and persisted atomically with the transition.
 *
 * Delivery: `runDueDeliveries` is the content half of the ONE worker tick —
 * the same apps/worker loop that drives AutomationScheduler.runTick claims
 * due occurrences, re-verifies the approval lock, delivers through the
 * PublishingChannelPort, and settles the outcome atomically (delivered
 * payload snapshot + audited item transition). Replays and worker restarts
 * can never double-publish: occurrences are content-addressed, claims are
 * SKIP LOCKED, and delivered snapshots are unique per occurrence.
 *
 * Only deterministic fake adapters exist; no real portal/social calls.
 */

import {
  contentDate,
  CONTENT_MANAGEMENT_ROLES,
  ContentValidationError,
  transitionContentItem,
  type ContentFailureKind,
  type ContentItem,
} from "../domain/content.js";
import {
  buildDeliveryPayload,
  buildPublishingShareBundle,
  claimDueContentPublishJob,
  createContentPublishJob,
  failContentPublishJob,
  publishingFailureIsRetryable,
  publishingTransitionOfWorker,
  retryContentPublishJob,
  verifyPublishingOccurrence,
  type ContentPublishJob,
} from "../domain/publishing.js";
import type { ContentMembershipReader } from "./content-repository.js";
import type { ContentRepository } from "./content-repository.js";
import type {
  PublishingChannelPort,
  PublishingDeliveryOutcome,
} from "./publishing-channel.port.js";
import type {
  CancelScheduledResult,
  ContentPublishingRepository,
  InsertPublishJobResult,
  PublishResult,
  UpcomingDelivery,
} from "./publishing-repository.js";

const MAX_TICK_LIMIT = 100;
const MAX_VIEW_LIMIT = 200;

export type ContentActor = Readonly<{ verified: boolean }>;

type CommandBase = Readonly<{
  actor: ContentActor;
  userId: string;
  organizationId: string;
}>;

export type RunDueDeliveriesResult = Readonly<{
  claimed: number;
  delivered: number;
  retried: number;
  failed: number;
  cancelled: number;
}>;

export type ScheduleOccurrenceResult = InsertPublishJobResult;

/** Narrow hook the EF-402 ContentApplication uses to attach occurrences. */
export interface PublishingOccurrenceScheduler {
  /** Pure: derive the durable occurrence for a freshly scheduled item. */
  prepareOccurrence(input: {
    item: ContentItem;
    at: Date;
  }): ContentPublishJob | undefined;
}

export type CancelScheduledPublishingCommand = CommandBase &
  Readonly<{
    contentItemId: string;
    reason: string;
    at: Date;
  }>;

export type CancelScheduledPublishingResult =
  CancelScheduledResult | { kind: "access-denied" };

export type ListPublishingViewResult<T> =
  readonly T[] | { kind: "access-denied" };

export class ContentPublishingApplication implements PublishingOccurrenceScheduler {
  constructor(
    private readonly repository: ContentPublishingRepository,
    private readonly content: ContentRepository,
    private readonly membershipReader: ContentMembershipReader,
    private readonly channelPort: PublishingChannelPort,
  ) {}

  /**
   * Pure derivation of the durable occurrence from the locked approval.
   * Returns undefined for items that are not SCHEDULED with a full approval
   * lock (defensive; the transition contract guarantees the lock).
   */
  prepareOccurrence(input: {
    item: ContentItem;
    at: Date;
  }): ContentPublishJob | undefined {
    if (
      input.item.status !== "SCHEDULED" ||
      input.item.approvedVersion === undefined ||
      input.item.contentHash === undefined ||
      input.item.scheduledFor === undefined
    )
      return undefined;
    return createContentPublishJob({
      id: newOccurrenceId(),
      item: input.item,
      now: input.at,
    });
  }

  /**
   * Standalone occurrence insertion (same code path the transition uses).
   * Replaying an occurrence resolves to the typed duplicate result.
   */
  async scheduleOccurrence(input: {
    item: ContentItem;
    at: Date;
  }): Promise<ScheduleOccurrenceResult> {
    const job = this.prepareOccurrence(input);
    if (job === undefined)
      throw new ContentValidationError(
        "Publishing occurrences are scheduled only for SCHEDULED content with an approval lock",
      );
    return this.repository.insertPublishJob(job);
  }

  /**
   * Owner/Manager cancel/unschedule before delivery. After delivery the item
   * is PUBLISHED and immutable; cancelling then is typed-rejected.
   */
  async cancelScheduledPublishing(
    input: CancelScheduledPublishingCommand,
  ): Promise<CancelScheduledPublishingResult> {
    const access = await this.authorize(input, CONTENT_MANAGEMENT_ROLES);
    if (access.kind !== "authorized") return access.result;
    const reason = canonicalReason(input.reason);
    const item = await this.content.findContentItem(
      input.organizationId,
      input.contentItemId,
    );
    if (!item) return { kind: "not-found", resource: "content-item" };
    if (item.status === "PUBLISHED") return { kind: "already-delivered" };
    if (item.status !== "SCHEDULED") return { kind: "not-open" };
    const transition = transitionContentItem(item, {
      toStatus: "FAILED",
      failureKind: "SCHEDULE_MISSED",
      reason,
      actorId: input.userId,
      at: input.at,
    }).transition;
    return this.repository.cancelScheduledPublishing({
      organizationId: input.organizationId,
      contentItemId: input.contentItemId,
      reason,
      transition,
      now: input.at,
    });
  }

  /** Upcoming deliveries tab: open occurrences, soonest first. */
  async listUpcomingDeliveries(
    input: CommandBase,
  ): Promise<
    ListPublishingViewResult<UpcomingDelivery> | { kind: "access-denied" }
  > {
    const access = await this.authorize(input, CONTENT_AUTHORING_ROLES_VALUE());
    if (access.kind !== "authorized") return access.result;
    return this.repository.listUpcomingDeliveries(
      input.organizationId,
      new Date(),
      MAX_VIEW_LIMIT,
    );
  }

  /** Publish results: delivered/failed/cancelled, newest first. */
  async listPublishResults(
    input: CommandBase,
  ): Promise<
    ListPublishingViewResult<PublishResult> | { kind: "access-denied" }
  > {
    const access = await this.authorize(input, CONTENT_AUTHORING_ROLES_VALUE());
    if (access.kind !== "authorized") return access.result;
    return this.repository.listPublishResults(
      input.organizationId,
      MAX_VIEW_LIMIT,
    );
  }

  /**
   * The delivery half of the worker tick: claim at most `limit` due
   * occurrences and settle each exactly once.
   */
  async runDueDeliveries(input: {
    now: Date;
    limit: number;
  }): Promise<RunDueDeliveriesResult> {
    if (
      !Number.isInteger(input.limit) ||
      input.limit < 1 ||
      input.limit > MAX_TICK_LIMIT
    )
      throw new RangeError(
        `limit must be an integer between 1 and ${MAX_TICK_LIMIT}`,
      );
    const now = contentDate(input.now, "tick time");
    const result = {
      claimed: 0,
      delivered: 0,
      retried: 0,
      failed: 0,
      cancelled: 0,
    };
    for (let index = 0; index < input.limit; index++) {
      const claimed = await this.repository.claimDuePublishJob(now);
      if (!claimed) break;
      result.claimed++;
      // The SQL repository atomically transitions the row to RUNNING and
      // bumps attemptCount before returning it; narrow in-memory repositories
      // may return the due row unchanged, so preserve the domain transition
      // for that contract too (same contract as the EF-302 scheduler).
      const job =
        claimed.status === "RUNNING"
          ? claimed
          : claimDueContentPublishJob(claimed, now);
      const outcome = await this.deliverClaimed(job, now);
      result[outcome]++;
    }
    return result;
  }

  private async deliverClaimed(
    job: ContentPublishJob,
    now: Date,
  ): Promise<"delivered" | "retried" | "failed" | "cancelled"> {
    const item = await this.content.findContentItem(
      job.organizationId,
      job.contentItemId,
    );
    const verification = verifyPublishingOccurrence(job, item);
    if (verification.kind === "schedule-gone") {
      // The schedule no longer exists (cancelled/failed elsewhere): drop the
      // occurrence with a typed cancellation, never deliver stale content.
      await this.repository.settleOrphanCancelledJob({ job, now });
      return "cancelled";
    }
    if (verification.kind === "policy-violation") {
      return this.settleFailure(job, now, {
        failureKind: verification.failureKind,
        reason: verification.reason,
        retryable: false,
        failItem: item !== null && item.status === "SCHEDULED",
      });
    }
    const bundle = buildPublishingShareBundle(item as ContentItem);
    let outcome: PublishingDeliveryOutcome;
    try {
      outcome = await this.channelPort.deliver({
        organizationId: job.organizationId,
        contentItemId: job.contentItemId,
        approvedVersion: job.approvedVersion,
        channel: job.channel,
        bundle,
      });
    } catch {
      // Adapter crashes are treated as transient delivery timeouts; no raw
      // error text is persisted.
      outcome = {
        kind: "rejected",
        failureKind: "CHANNEL_TIMEOUT",
        reason: "channel adapter threw an unexpected error",
      };
    }
    if (outcome.kind === "delivered") {
      const payload = buildDeliveryPayload({
        item: item as ContentItem,
        bundle,
        deliveredAt: now,
      });
      const transition = publishingTransitionOfWorker({
        item: item as ContentItem,
        toStatus: "PUBLISHED",
        reason: `delivered to ${job.channel} via the deterministic fake adapter`,
        at: now,
      });
      await this.repository.settleDeliveredJob({
        job,
        payload,
        providerMessageId: outcome.providerMessageId,
        transition,
        now,
      });
      // A lost race means another claim already delivered this occurrence —
      // at-most-once holds either way.
      return "delivered";
    }
    return this.settleFailure(job, now, {
      failureKind: outcome.failureKind,
      reason: outcome.reason,
      retryable: publishingFailureIsRetryable(outcome.failureKind),
      failItem: true,
    });
  }

  private async settleFailure(
    job: ContentPublishJob,
    now: Date,
    input: {
      failureKind: ContentFailureKind;
      reason: string;
      retryable: boolean;
      failItem: boolean;
    },
  ): Promise<"retried" | "failed"> {
    const terminal = !input.retryable || job.attemptCount >= job.maxAttempts;
    const settledJob = terminal
      ? failContentPublishJob(job, now, {
          kind: input.failureKind,
          message: input.reason,
        })
      : retryContentPublishJob(job, now, {
          kind: input.failureKind,
          message: input.reason,
        });
    const transition =
      terminal && input.failItem
        ? publishingTransitionOfWorker({
            item: {
              id: job.contentItemId,
              organizationId: job.organizationId,
            } as ContentItem,
            toStatus: "FAILED",
            failureKind: input.failureKind,
            reason: input.reason,
            at: now,
          })
        : null;
    await this.repository.settleFailedJob({
      job: settledJob,
      terminal,
      failureKind: input.failureKind,
      reason: input.reason,
      nextAttemptAt: terminal ? null : settledJob.nextAttemptAt,
      transition,
      now,
    });
    return terminal ? "failed" : "retried";
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
    const membership = await this.membershipReader.findMembership(
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

/** Authoring roles for read views: Owner/Manager/Broker; CLIENT denied. */
function CONTENT_AUTHORING_ROLES_VALUE(): readonly string[] {
  return ["OWNER", "MANAGER", "BROKER"];
}

function canonicalReason(reason: string): string {
  const canonical = reason.trim();
  if (canonical.length === 0)
    throw new ContentValidationError(
      "Cancelling a scheduled publish requires an explicit reason",
    );
  return canonical;
}

function newOccurrenceId(): string {
  return globalThis.crypto.randomUUID();
}

export type {
  CancelScheduledResult,
  PublishResult,
  UpcomingDelivery,
} from "./publishing-repository.js";
