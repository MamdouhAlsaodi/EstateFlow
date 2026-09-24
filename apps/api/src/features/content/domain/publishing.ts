/**
 * EF-404 — publishing adapter domain.
 *
 * A scheduled content item gets exactly one durable publish occurrence per
 * (content item version, channel, scheduled time). The occurrence is a
 * content-addressed row: its deterministic execution key plus the database
 * unique index make duplicate scheduling impossible, the worker claims due
 * occurrences atomically (FOR UPDATE SKIP LOCKED), and the delivered payload
 * snapshot is append-only. A replayed schedule, a replayed tick, or a worker
 * restart can therefore never double-publish; duplicates are rejected as
 * typed results, never silently dropped.
 *
 * Retry semantics mirror the EF-306 automation policy: bounded attempts with
 * exponential backoff (30s doubling, capped at one hour); a terminal failure
 * carries the typed EF-402 failure kind plus an explicit reason.
 */

import { createHash } from "node:crypto";
import {
  contentDate,
  contentHashOf,
  type ContentChannel,
  type ContentFailureKind,
  type ContentItem,
  type ContentTransitionRecord,
} from "./content.js";
import {
  AUTOMATION_BACKOFF_BASE_SECONDS,
  AUTOMATION_BACKOFF_MAX_SECONDS,
  AUTOMATION_JOB_MAX_ATTEMPTS_CEILING,
  computeBackoffDelaySeconds,
  DEFAULT_AUTOMATION_JOB_MAX_ATTEMPTS,
} from "../../automation/domain/execution.js";

export {
  AUTOMATION_BACKOFF_BASE_SECONDS,
  AUTOMATION_BACKOFF_MAX_SECONDS,
  computeBackoffDelaySeconds as computePublishingBackoffDelaySeconds,
  DEFAULT_AUTOMATION_JOB_MAX_ATTEMPTS as DEFAULT_PUBLISH_MAX_ATTEMPTS,
  AUTOMATION_JOB_MAX_ATTEMPTS_CEILING as PUBLISH_MAX_ATTEMPTS_CEILING,
};

export class PublishingValidationError extends Error {
  readonly code = "PUBLISHING_VALIDATION_ERROR" as const;
  constructor(message: string) {
    super(message);
    this.name = "PublishingValidationError";
  }
}

export class PublishingStateError extends Error {
  readonly code = "PUBLISHING_STATE_ERROR" as const;
  constructor(message: string) {
    super(message);
    this.name = "PublishingStateError";
  }
}

export type ContentPublishJobStatus =
  "QUEUED" | "RUNNING" | "RETRYING" | "DELIVERED" | "FAILED" | "CANCELLED";

export const CONTENT_PUBLISH_JOB_STATUSES: readonly ContentPublishJobStatus[] =
  ["QUEUED", "RUNNING", "RETRYING", "DELIVERED", "FAILED", "CANCELLED"];

/** Statuses still owned by the delivery worker; cancel applies to these. */
export const CONTENT_PUBLISH_OPEN_STATUSES: readonly ContentPublishJobStatus[] =
  ["QUEUED", "RETRYING"];

/**
 * Fixed system actor recorded on the audited SCHEDULED → PUBLISHED/FAILED
 * transitions the delivery worker performs. Purely an audit marker: it grants
 * nothing and carries no credentials.
 */
export const PUBLISHING_WORKER_ACTOR_ID =
  "00000000-0000-4000-8000-00000000ef04";

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const HASH = /^[0-9a-f]{64}$/;
const PROVIDER_MESSAGE_ID_MAX = 200;

export type ContentPublishJob = Readonly<{
  id: string;
  organizationId: string;
  contentItemId: string;
  approvedVersion: number;
  channel: ContentChannel;
  scheduledFor: Date;
  /** sha256 of the approved content payload locked at approval time. */
  contentHash: string;
  /** Content-addressed occurrence key; unique per organization. */
  executionKey: string;
  status: ContentPublishJobStatus;
  attemptCount: number;
  maxAttempts: number;
  nextAttemptAt: Date;
  lastErrorKind?: ContentFailureKind;
  lastErrorMessage?: string;
  startedAt?: Date;
  completedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}>;

export type PublishExecutionKeyInput = Readonly<{
  organizationId: string;
  contentItemId: string;
  approvedVersion: number;
  channel: ContentChannel;
  scheduledFor: Date;
}>;

/**
 * Deterministic at-most-once key over (organization, item version, channel,
 * scheduled occurrence): sha256 over the canonical field set, exactly one
 * occurrence per approved content version, channel, and scheduled time.
 */
export function publishExecutionKeyOf(input: PublishExecutionKeyInput): string {
  const canonical = JSON.stringify({
    approvedVersion: versionValue(input.approvedVersion),
    channel: channelValue(input.channel),
    contentItemId: identifier(input.contentItemId, "content item"),
    organizationId: identifier(input.organizationId, "organization"),
    scheduledFor: contentDate(input.scheduledFor, "scheduled time").getTime(),
  });
  return createHash("sha256").update(canonical, "utf8").digest("hex");
}

function identifier(value: string, field: string): string {
  if (typeof value !== "string" || !UUID.test(value))
    throw new PublishingValidationError(`Invalid publishing ${field}`);
  return value.toLowerCase();
}

function channelValue(value: ContentChannel): ContentChannel {
  if (typeof value !== "string")
    throw new PublishingValidationError("Invalid publishing channel");
  return value;
}

function statusValue(value: ContentPublishJobStatus): ContentPublishJobStatus {
  if (
    typeof value !== "string" ||
    !CONTENT_PUBLISH_JOB_STATUSES.includes(value)
  )
    throw new PublishingValidationError("Invalid publish job status");
  return value;
}

function hashValue(value: string): string {
  if (typeof value !== "string" || !HASH.test(value))
    throw new PublishingValidationError("Invalid publish content hash");
  return value;
}

function boundedText(value: string, field: string, limit: number): string {
  if (typeof value !== "string")
    throw new PublishingValidationError(`Invalid publish ${field}`);
  const canonical = value.trim();
  if (canonical.length === 0 || canonical.length > limit)
    throw new PublishingValidationError(`Invalid publish ${field}`);
  return canonical;
}

function versionValue(value: number): number {
  if (!Number.isSafeInteger(value) || value < 1)
    throw new PublishingValidationError("Invalid publishing approved version");
  return value;
}

function requireTransition(
  job: ContentPublishJob,
  expected: readonly ContentPublishJobStatus[],
  action: string,
): void {
  if (!expected.includes(job.status))
    throw new PublishingStateError(
      `cannot ${action} publish job in status ${job.status}`,
    );
}

type CreatePublishJobInput = Readonly<{
  id: string;
  item: ContentItem;
  maxAttempts?: number;
  now: Date;
}>;

/**
 * Builds the durable occurrence for a freshly SCHEDULED content item. The
 * item must already carry the approval lock (version + hash) and a future
 * scheduled time, exactly as the EF-402 transition produced it.
 */
export function createContentPublishJob(
  input: CreatePublishJobInput,
): ContentPublishJob {
  const item = input.item;
  if (item.status !== "SCHEDULED")
    throw new PublishingValidationError(
      "publish occurrences are created only for SCHEDULED content",
    );
  const approvedVersion = versionValue(item.approvedVersion as number);
  const contentHash = hashValue(item.contentHash as string);
  const scheduledFor = contentDate(
    item.scheduledFor as Date,
    "scheduled publishing time",
  );
  const now = contentDate(input.now, "publish job time");
  if (scheduledFor.getTime() <= now.getTime())
    throw new PublishingValidationError(
      "publish occurrences require a future scheduled time",
    );
  const maxAttempts = input.maxAttempts ?? DEFAULT_AUTOMATION_JOB_MAX_ATTEMPTS;
  if (
    !Number.isInteger(maxAttempts) ||
    maxAttempts < 1 ||
    maxAttempts > AUTOMATION_JOB_MAX_ATTEMPTS_CEILING
  )
    throw new PublishingValidationError(
      `maxAttempts must be an integer between 1 and ${AUTOMATION_JOB_MAX_ATTEMPTS_CEILING}`,
    );
  return Object.freeze({
    id: identifier(input.id, "publish job id"),
    organizationId: identifier(item.organizationId, "organization"),
    contentItemId: identifier(item.id, "content item"),
    approvedVersion,
    channel: item.channel,
    scheduledFor,
    contentHash,
    executionKey: publishExecutionKeyOf({
      organizationId: item.organizationId,
      contentItemId: item.id,
      approvedVersion,
      channel: item.channel,
      scheduledFor,
    }),
    status: "QUEUED",
    attemptCount: 0,
    maxAttempts,
    nextAttemptAt: scheduledFor,
    startedAt: undefined,
    completedAt: undefined,
    createdAt: now,
    updatedAt: now,
  });
}

// The EF-306 backoff constants are re-exported above; this module owns no
// duplicate policy numbers.

/** Claim a due queued/retrying occurrence for one bounded delivery attempt. */
export function claimDueContentPublishJob(
  job: ContentPublishJob,
  now: Date,
): ContentPublishJob {
  requireTransition(job, ["QUEUED", "RETRYING"], "claim");
  if (job.nextAttemptAt.getTime() > now.getTime())
    throw new PublishingStateError("publish job is not yet due");
  return Object.freeze({
    ...job,
    status: "RUNNING",
    attemptCount: job.attemptCount + 1,
    startedAt: job.startedAt ?? now,
    updatedAt: now,
  });
}

export function deliverContentPublishJob(
  job: ContentPublishJob,
  input: { providerMessageId: string; now: Date },
): ContentPublishJob {
  requireTransition(job, ["RUNNING"], "deliver");
  boundedText(
    input.providerMessageId,
    "provider message id",
    PROVIDER_MESSAGE_ID_MAX,
  );
  const now = contentDate(input.now, "delivery time");
  return Object.freeze({
    ...job,
    status: "DELIVERED",
    lastErrorKind: undefined,
    lastErrorMessage: undefined,
    completedAt: now,
    updatedAt: now,
  });
}

/**
 * Record a retryable delivery failure: reschedule with the EF-306 backoff, or
 * move to terminal FAILED once attempts are exhausted.
 */
export function retryContentPublishJob(
  job: ContentPublishJob,
  now: Date,
  lastError: { kind: ContentFailureKind; message: string },
): ContentPublishJob {
  requireTransition(job, ["RUNNING"], "retry");
  const message = boundedText(lastError.message, "failure reason", 500);
  if (job.attemptCount >= job.maxAttempts)
    return Object.freeze({
      ...job,
      status: "FAILED",
      nextAttemptAt: job.nextAttemptAt,
      lastErrorKind: lastError.kind,
      lastErrorMessage: message,
      completedAt: now,
      updatedAt: now,
    });
  return Object.freeze({
    ...job,
    status: "RETRYING",
    nextAttemptAt: new Date(
      now.getTime() + computeBackoffDelaySeconds(job.attemptCount) * 1000,
    ),
    lastErrorKind: lastError.kind,
    lastErrorMessage: message,
    updatedAt: now,
  });
}

/** Terminal failure for permanent (non-retryable) delivery errors. */
export function failContentPublishJob(
  job: ContentPublishJob,
  now: Date,
  lastError: { kind: ContentFailureKind; message: string },
): ContentPublishJob {
  requireTransition(job, ["RUNNING"], "fail");
  const message = boundedText(lastError.message, "failure reason", 500);
  return Object.freeze({
    ...job,
    status: "FAILED",
    nextAttemptAt: job.nextAttemptAt,
    lastErrorKind: lastError.kind,
    lastErrorMessage: message,
    completedAt: now,
    updatedAt: now,
  });
}

/**
 * Cancel an open (queued or retrying) occurrence before delivery. A RUNNING
 * occurrence is already being delivered and can no longer be cancelled;
 * delivered or terminal jobs are rejected here at the domain boundary.
 */
export function cancelContentPublishJob(
  job: ContentPublishJob,
  now: Date,
): ContentPublishJob {
  requireTransition(job, ["QUEUED", "RETRYING"], "cancel");
  return Object.freeze({
    ...job,
    status: "CANCELLED",
    completedAt: now,
    updatedAt: now,
  });
}

// ---------------------------------------------------------------------------
// Deterministic share-ready bundle + UTM link generation
// ---------------------------------------------------------------------------

export type PublishingUtmTags = Readonly<{
  source: string;
  medium: string;
  campaign: string;
  content: string;
}>;

export type PublishingShareBundle = Readonly<{
  organizationId: string;
  contentItemId: string;
  approvedVersion: number;
  channel: ContentChannel;
  title: string;
  body: string;
  contentHash: string;
  /** Deterministic in-app landing path including the UTM query string. */
  linkPath: string;
  utm: PublishingUtmTags;
}>;

function UTM_SAFE(text: string): string {
  return encodeURIComponent(text);
}

/**
 * Share-ready bundle for manual confirmation: the exact approved copy plus a
 * deterministic UTM-tagged landing link (property page when the item was
 * generated from a property, otherwise the content item page). Pure function
 * of the approved item — no clock, no randomness, no network.
 */
export function buildPublishingShareBundle(
  item: ContentItem,
): PublishingShareBundle {
  if (item.status !== "SCHEDULED" && item.status !== "PUBLISHED")
    throw new PublishingStateError(
      `share bundles are built only for scheduled or published content; item is ${item.status}`,
    );
  const approvedVersion = versionValue(item.approvedVersion as number);
  const contentHash = hashValue(item.contentHash as string);
  const utm: PublishingUtmTags = Object.freeze({
    source: "estateflow",
    medium: item.channel.toLowerCase(),
    campaign: item.campaignId ?? item.id,
    content: `${item.id}-v${approvedVersion}`,
  });
  const basePath =
    item.sourcePropertyId === undefined
      ? `/ar/organizations/${item.organizationId}/content/${item.id}`
      : `/ar/organizations/${item.organizationId}/properties/${item.sourcePropertyId}`;
  const query = [
    `utm_source=${UTM_SAFE(utm.source)}`,
    `utm_medium=${UTM_SAFE(utm.medium)}`,
    `utm_campaign=${UTM_SAFE(utm.campaign)}`,
    `utm_content=${UTM_SAFE(utm.content)}`,
  ].join("&");
  return Object.freeze({
    organizationId: item.organizationId,
    contentItemId: item.id,
    approvedVersion,
    channel: item.channel,
    title: item.title,
    body: item.body,
    contentHash,
    linkPath: `${basePath}?${query}`,
    utm,
  });
}

export type PublishingDeliveryPayload = Readonly<{
  organizationId: string;
  contentItemId: string;
  approvedVersion: number;
  channel: ContentChannel;
  title: string;
  body: string;
  contentHash: string;
  linkPath: string;
  utm: PublishingUtmTags;
  deliveredAt: string;
  provenance?: Readonly<{
    sourcePropertyId: string;
    sourcePropertyVersion: number;
    generatedTemplateId: string;
    generatedTemplateVersion: number;
  }>;
}>;

/**
 * The exact payload snapshot stored with every delivery for audit: what went
 * out, from which approved content version/hash, with which generated-copy
 * provenance (property version + template version).
 */
export function buildDeliveryPayload(input: {
  item: ContentItem;
  bundle: PublishingShareBundle;
  deliveredAt: Date;
}): PublishingDeliveryPayload {
  return Object.freeze({
    organizationId: input.item.organizationId,
    contentItemId: input.item.id,
    approvedVersion: versionValue(input.item.approvedVersion as number),
    channel: input.item.channel,
    title: input.bundle.title,
    body: input.bundle.body,
    contentHash: input.bundle.contentHash,
    linkPath: input.bundle.linkPath,
    utm: input.bundle.utm,
    deliveredAt: contentDate(input.deliveredAt, "delivery time").toISOString(),
    ...(input.item.sourcePropertyId === undefined
      ? {}
      : {
          provenance: Object.freeze({
            sourcePropertyId: input.item.sourcePropertyId,
            sourcePropertyVersion: input.item.sourcePropertyVersion as number,
            generatedTemplateId: input.item.generatedTemplateId as string,
            generatedTemplateVersion: input.item
              .generatedTemplateVersion as number,
          }),
        }),
  });
}

// ---------------------------------------------------------------------------
// Pre-delivery re-verification
// ---------------------------------------------------------------------------

export type PublishingDeliveryVerification =
  | Readonly<{ kind: "verified" }>
  | Readonly<{ kind: "schedule-gone"; reason: string }>
  | Readonly<{
      kind: "policy-violation";
      failureKind: ContentFailureKind;
      reason: string;
    }>;

/**
 * Before every attempt the occurrence is re-verified against the live item:
 * it must still be SCHEDULED, still carry the same approved version, hash,
 * channel, and scheduled time, and the locked hash must still equal the hash
 * of the exact payload. Any drift means the item never publishes under this
 * occurrence — either the schedule is gone (typed cancel) or the approval
 * changed (typed permanent policy violation, per the EF-404 revalidation
 * requirement).
 */
export function verifyPublishingOccurrence(
  job: ContentPublishJob,
  item: ContentItem | null,
): PublishingDeliveryVerification {
  if (item === null)
    return {
      kind: "schedule-gone",
      reason: "publishing canceled: content item is missing",
    };
  if (item.status !== "SCHEDULED")
    return {
      kind: "schedule-gone",
      reason: `publishing canceled: content is ${item.status}, not scheduled`,
    };
  if (
    item.approvedVersion !== job.approvedVersion ||
    item.contentHash !== job.contentHash ||
    item.channel !== job.channel ||
    item.scheduledFor === undefined ||
    item.scheduledFor.getTime() !== job.scheduledFor.getTime()
  )
    return {
      kind: "policy-violation",
      failureKind: "CONTENT_POLICY_VIOLATION",
      reason:
        "approved content no longer matches the scheduled occurrence (version, hash, channel, or time drifted)",
    };
  if (contentHashOf(item) !== job.contentHash)
    return {
      kind: "policy-violation",
      failureKind: "CONTENT_POLICY_VIOLATION",
      reason: "approved content hash no longer matches the content payload",
    };
  return { kind: "verified" };
}

/**
 * EF-306 retry semantics per typed failure kind: timeouts and unknown errors
 * are transient; explicit rejections and policy violations are permanent.
 */
export function publishingFailureIsRetryable(
  failureKind: ContentFailureKind,
): boolean {
  return failureKind === "CHANNEL_TIMEOUT" || failureKind === "OTHER";
}

/** Typed results carry an explicit reason on every failure path. */
export function publishingTransitionOfWorker(
  input: Readonly<{
    item: ContentItem;
    toStatus: "PUBLISHED" | "FAILED";
    failureKind?: ContentFailureKind;
    reason?: string;
    at: Date;
  }>,
): ContentTransitionRecord {
  const at = contentDate(input.at, "worker transition time");
  return Object.freeze({
    id: randomTransitionId(),
    organizationId: input.item.organizationId,
    contentItemId: input.item.id,
    fromStatus: "SCHEDULED",
    toStatus: input.toStatus,
    ...(input.reason === undefined ? {} : { reason: input.reason }),
    ...(input.failureKind === undefined
      ? {}
      : { failureKind: input.failureKind }),
    actorId: PUBLISHING_WORKER_ACTOR_ID,
    createdAt: at,
  });
}

function randomTransitionId(): string {
  // crypto.randomUUID is available globally in the Node runtime; the indirection
  // keeps this module importable from plain test harnesses.
  return globalThis.crypto.randomUUID();
}

export { statusValue as assertPublishJobStatus };
