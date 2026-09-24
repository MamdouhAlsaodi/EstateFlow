import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import {
  contentHashOf,
  createContentItem,
  transitionContentItem,
} from "../dist/features/content/domain/content.js";
import {
  AUTOMATION_BACKOFF_BASE_SECONDS,
  AUTOMATION_BACKOFF_MAX_SECONDS,
  DEFAULT_PUBLISH_MAX_ATTEMPTS,
  PUBLISH_MAX_ATTEMPTS_CEILING,
  buildDeliveryPayload,
  buildPublishingShareBundle,
  cancelContentPublishJob,
  claimDueContentPublishJob,
  createContentPublishJob,
  deliverContentPublishJob,
  failContentPublishJob,
  publishExecutionKeyOf,
  publishingFailureIsRetryable,
  publishingTransitionOfWorker,
  retryContentPublishJob,
  verifyPublishingOccurrence,
  PUBLISHING_WORKER_ACTOR_ID,
  PublishingStateError,
  PublishingValidationError,
  computePublishingBackoffDelaySeconds,
} from "../dist/features/content/domain/publishing.js";

const org = "11111111-1111-4111-8111-111111111111";
const owner = "33333333-3333-4333-8333-333333333333";
const itemId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const propertyId = "3f9d5f6e-6b1d-4c4e-9a9a-0f3e2d1c0b9a";
const now = new Date("2026-10-01T10:00:00.000Z");
const scheduledFor = new Date("2026-10-01T12:00:00.000Z");

function scheduledItem(overrides = {}) {
  const item = createContentItem({
    id: itemId,
    organizationId: org,
    title: "شقة فاخرة للإيجار",
    body: "جديدة تمامًا قرب الملك",
    channel: "INSTAGRAM",
    sourcePropertyId: propertyId,
    sourcePropertyVersion: 3,
    generatedTemplateId: "ef403-instagram-v1",
    generatedTemplateVersion: 1,
    createdBy: owner,
    createdAt: now,
  });
  const draft = transitionContentItem(item, {
    toStatus: "DRAFT",
    actorId: owner,
    at: now,
  }).item;
  const review = transitionContentItem(draft, {
    toStatus: "REVIEW",
    actorId: owner,
    at: now,
  }).item;
  const approved = transitionContentItem(review, {
    toStatus: "APPROVED",
    actorId: owner,
    at: now,
  }).item;
  const { item: scheduled } = transitionContentItem(approved, {
    toStatus: "SCHEDULED",
    actorId: owner,
    at: now,
    scheduledFor,
  });
  return Object.freeze({ ...scheduled, ...overrides });
}

function jobFor(item, overrides = {}) {
  return Object.freeze({
    ...createContentPublishJob({ id: randomUUID(), item, now }),
    ...overrides,
  });
}

test("EF-404 execution key: deterministic per (org, item version, channel, occurrence) and collision-free otherwise", () => {
  const item = scheduledItem();
  const key = publishExecutionKeyOf({
    organizationId: org,
    contentItemId: item.id,
    approvedVersion: 1,
    channel: "INSTAGRAM",
    scheduledFor,
  });
  assert.match(key, /^[0-9a-f]{64}$/);
  assert.equal(
    key,
    publishExecutionKeyOf({
      organizationId: org,
      contentItemId: item.id,
      approvedVersion: 1,
      channel: "INSTAGRAM",
      scheduledFor: new Date(scheduledFor.getTime()),
    }),
  );
  // Any dimension drift produces a different occurrence.
  const variants = [
    {
      organizationId: org,
      contentItemId: item.id,
      approvedVersion: 2,
      channel: "INSTAGRAM",
      scheduledFor,
    },
    {
      organizationId: org,
      contentItemId: item.id,
      approvedVersion: 1,
      channel: "X",
      scheduledFor,
    },
    {
      organizationId: org,
      contentItemId: item.id,
      approvedVersion: 1,
      channel: "INSTAGRAM",
      scheduledFor: new Date(scheduledFor.getTime() + 1),
    },
    {
      organizationId: randomUUID(),
      contentItemId: item.id,
      approvedVersion: 1,
      channel: "INSTAGRAM",
      scheduledFor,
    },
  ];
  for (const variant of variants)
    assert.notEqual(publishExecutionKeyOf(variant), key);
});

test("EF-404 occurrence creation: requires the approval lock, a future schedule, and freezes QUEUED state", () => {
  const item = scheduledItem();
  const job = createContentPublishJob({ id: randomUUID(), item, now });
  assert.equal(job.status, "QUEUED");
  assert.equal(job.approvedVersion, 1);
  assert.equal(job.contentHash, item.contentHash);
  assert.equal(job.attemptCount, 0);
  assert.equal(job.maxAttempts, DEFAULT_PUBLISH_MAX_ATTEMPTS);
  assert.equal(job.scheduledFor.getTime(), scheduledFor.getTime());
  assert.equal(job.nextAttemptAt.getTime(), scheduledFor.getTime());
  // Not SCHEDULED → rejected.
  assert.throws(
    () =>
      createContentPublishJob({
        id: randomUUID(),
        item: { ...item, status: "APPROVED" },
        now,
      }),
    PublishingValidationError,
  );
  // Schedule not in the future → rejected.
  assert.throws(
    () =>
      createContentPublishJob({
        id: randomUUID(),
        item,
        now: new Date(scheduledFor.getTime() + 1),
      }),
    PublishingValidationError,
  );
});

test("EF-404 claim: only due queued/retrying occurrences, one attempt per claim", () => {
  const job = jobFor(scheduledItem());
  // Not yet due.
  assert.throws(
    () => claimDueContentPublishJob(job, new Date(scheduledFor.getTime() - 1)),
    PublishingStateError,
  );
  const claimed = claimDueContentPublishJob(job, scheduledFor);
  assert.equal(claimed.status, "RUNNING");
  assert.equal(claimed.attemptCount, 1);
  assert.equal(claimed.startedAt?.getTime(), scheduledFor.getTime());
  // A RUNNING row cannot be claimed again.
  assert.throws(
    () => claimDueContentPublishJob(claimed, scheduledFor),
    PublishingStateError,
  );
  // Retrying rows can be re-claimed.
  const retrying = retryContentPublishJob(claimed, scheduledFor, {
    kind: "CHANNEL_TIMEOUT",
    message: "timeout",
  });
  assert.equal(retrying.status, "RETRYING");
  const reclaimed = claimDueContentPublishJob(
    retrying,
    new Date(scheduledFor.getTime() + 60_000),
  );
  assert.equal(reclaimed.status, "RUNNING");
  assert.equal(reclaimed.attemptCount, 2);
});

test("EF-404 retry backoff follows the EF-306 ladder and stops at maxAttempts", () => {
  let job = jobFor(scheduledItem(), { maxAttempts: 2 });
  job = claimDueContentPublishJob(job, scheduledFor);
  const first = retryContentPublishJob(job, scheduledFor, {
    kind: "CHANNEL_TIMEOUT",
    message: "first timeout",
  });
  assert.equal(first.status, "RETRYING");
  assert.equal(
    first.nextAttemptAt.getTime(),
    scheduledFor.getTime() + computePublishingBackoffDelaySeconds(1) * 1000,
  );
  assert.equal(first.lastErrorKind, "CHANNEL_TIMEOUT");
  assert.equal(first.lastErrorMessage, "first timeout");
  // Exhaustion: attempt count >= maxAttempts → terminal FAILED.
  const exhausted = retryContentPublishJob(
    claimDueContentPublishJob(first, new Date(scheduledFor.getTime() + 60_000)),
    new Date(scheduledFor.getTime() + 60_000),
    { kind: "CHANNEL_TIMEOUT", message: "second timeout" },
  );
  assert.equal(exhausted.status, "FAILED");
  assert.equal(
    exhausted.completedAt?.getTime(),
    scheduledFor.getTime() + 60_000,
  );
  // Backoff ladder is capped at one hour.
  assert.equal(
    computePublishingBackoffDelaySeconds(20),
    AUTOMATION_BACKOFF_MAX_SECONDS,
  );
  assert.equal(
    computePublishingBackoffDelaySeconds(1),
    AUTOMATION_BACKOFF_BASE_SECONDS,
  );
});

test("EF-404 terminal failure requires kind and reason; delivered rows carry a provider receipt", () => {
  const job = claimDueContentPublishJob(jobFor(scheduledItem()), scheduledFor);
  const failed = failContentPublishJob(job, scheduledFor, {
    kind: "CHANNEL_REJECTED",
    message: "قناة غير مدعومة",
  });
  assert.equal(failed.status, "FAILED");
  assert.equal(failed.lastErrorMessage, "قناة غير مدعومة");
  assert.throws(
    () =>
      failContentPublishJob(
        claimDueContentPublishJob(jobFor(scheduledItem()), scheduledFor),
        scheduledFor,
        {
          kind: "CHANNEL_REJECTED",
          message: "",
        },
      ),
    PublishingValidationError,
  );
  const delivered = deliverContentPublishJob(
    jobFor(scheduledItem(), {
      status: "RUNNING",
      attemptCount: 1,
    }),
    {
      providerMessageId: "fake-publish:INSTAGRAM:x:y:v1",
      now: scheduledFor,
    },
  );
  assert.equal(delivered.status, "DELIVERED");
  assert.equal(delivered.completedAt?.getTime(), scheduledFor.getTime());
});

test("EF-404 cancel: open occurrences only; delivered/running jobs are typed-rejected", () => {
  const queued = jobFor(scheduledItem());
  const cancelled = cancelContentPublishJob(queued, scheduledFor);
  assert.equal(cancelled.status, "CANCELLED");
  assert.equal(cancelled.completedAt?.getTime(), scheduledFor.getTime());
  assert.throws(
    () =>
      cancelContentPublishJob(
        claimDueContentPublishJob(jobFor(scheduledItem()), scheduledFor),
        scheduledFor,
      ),
    PublishingStateError,
  );
  assert.throws(
    () =>
      cancelContentPublishJob(
        deliverContentPublishJob(
          claimDueContentPublishJob(jobFor(scheduledItem()), scheduledFor),
          { providerMessageId: "fake-publish:x", now: scheduledFor },
        ),
        scheduledFor,
      ),
    PublishingStateError,
  );
});

test("EF-404 share bundle: deterministic copy + UTM link, property landing when provenance exists", () => {
  const item = scheduledItem();
  const bundle = buildPublishingShareBundle(item);
  assert.equal(bundle.title, item.title);
  assert.equal(bundle.body, item.body);
  assert.equal(bundle.contentHash, item.contentHash);
  assert.equal(bundle.approvedVersion, 1);
  assert.deepEqual(bundle.utm, {
    source: "estateflow",
    medium: "instagram",
    campaign: item.id,
    content: `${item.id}-v1`,
  });
  assert.equal(
    bundle.linkPath,
    `/ar/organizations/${org}/properties/${propertyId}` +
      `?utm_source=estateflow&utm_medium=instagram` +
      `&utm_campaign=${item.id}&utm_content=${item.id}-v1`,
  );
  // Pure: same item, same bundle.
  assert.deepEqual(buildPublishingShareBundle(item), bundle);
  // Without provenance the landing is the content item page; with a campaign
  // the UTM campaign names the campaign.
  const plain = createContentItem({
    id: itemId,
    organizationId: org,
    title: "عنوان",
    body: "نص",
    channel: "X",
    createdBy: owner,
    createdAt: now,
  });
  const draft = transitionContentItem(plain, {
    toStatus: "DRAFT",
    actorId: owner,
    at: now,
  }).item;
  const review = transitionContentItem(draft, {
    toStatus: "REVIEW",
    actorId: owner,
    at: now,
  }).item;
  const approved = transitionContentItem(review, {
    toStatus: "APPROVED",
    actorId: owner,
    at: now,
  }).item;
  const { item: scheduledPlain } = transitionContentItem(approved, {
    toStatus: "SCHEDULED",
    actorId: owner,
    at: now,
    scheduledFor,
  });
  const plainBundle = buildPublishingShareBundle(scheduledPlain);
  assert.equal(
    plainBundle.linkPath.split("?")[0],
    `/ar/organizations/${org}/content/${itemId}`,
  );
  assert.equal(plainBundle.utm.medium, "x");
  // Locked content only.
  assert.throws(
    () => buildPublishingShareBundle({ ...item, status: "APPROVED" }),
    PublishingStateError,
  );
});

test("EF-404 delivery payload snapshot: exact outbound copy + provenance + instant, JSON-safe", () => {
  const item = scheduledItem();
  const bundle = buildPublishingShareBundle(item);
  const deliveredAt = new Date("2026-10-01T12:00:01.000Z");
  const payload = buildDeliveryPayload({ item, bundle, deliveredAt });
  assert.equal(payload.title, item.title);
  assert.equal(payload.body, item.body);
  assert.equal(payload.contentHash, item.contentHash);
  assert.equal(payload.deliveredAt, "2026-10-01T12:00:01.000Z");
  assert.deepEqual(payload.provenance, {
    sourcePropertyId: propertyId,
    sourcePropertyVersion: 3,
    generatedTemplateId: "ef403-instagram-v1",
    generatedTemplateVersion: 1,
  });
  assert.deepEqual(JSON.parse(JSON.stringify(payload)), payload);
});

test("EF-404 pre-delivery re-verification: drift is typed, never delivered", () => {
  const item = scheduledItem();
  const job = jobFor(item);
  assert.equal(verifyPublishingOccurrence(job, item).kind, "verified");
  // Item no longer scheduled → typed cancellation.
  const gone = verifyPublishingOccurrence(job, {
    ...item,
    status: "FAILED",
  });
  assert.equal(gone.kind, "schedule-gone");
  assert.equal(verifyPublishingOccurrence(job, null).kind, "schedule-gone");
  // Version drift → permanent policy violation.
  const drifted = verifyPublishingOccurrence(job, {
    ...item,
    approvedVersion: 2,
  });
  assert.equal(drifted.kind, "policy-violation");
  assert.equal(
    drifted.kind === "policy-violation" ? drifted.failureKind : "",
    "CONTENT_POLICY_VIOLATION",
  );
  // Hash tampering → permanent policy violation.
  const tampered = verifyPublishingOccurrence(job, {
    ...item,
    contentHash: "0".repeat(64),
  });
  assert.equal(tampered.kind, "policy-violation");
  // The locked hash always still matches the live payload for a real item.
  assert.equal(contentHashOf(item), job.contentHash);
});

test("EF-404 retryability and worker transition audit marker", () => {
  assert.equal(publishingFailureIsRetryable("CHANNEL_TIMEOUT"), true);
  assert.equal(publishingFailureIsRetryable("OTHER"), true);
  assert.equal(publishingFailureIsRetryable("CHANNEL_REJECTED"), false);
  assert.equal(publishingFailureIsRetryable("CONTENT_POLICY_VIOLATION"), false);
  assert.equal(publishingFailureIsRetryable("SCHEDULE_MISSED"), false);
  const item = scheduledItem();
  const published = publishingTransitionOfWorker({
    item,
    toStatus: "PUBLISHED",
    reason: "delivered",
    at: scheduledFor,
  });
  assert.equal(published.fromStatus, "SCHEDULED");
  assert.equal(published.toStatus, "PUBLISHED");
  assert.equal(published.actorId, PUBLISHING_WORKER_ACTOR_ID);
  const failed = publishingTransitionOfWorker({
    item,
    toStatus: "FAILED",
    failureKind: "CHANNEL_REJECTED",
    reason: "rejected",
    at: scheduledFor,
  });
  assert.equal(failed.failureKind, "CHANNEL_REJECTED");
  assert.equal(failed.reason, "rejected");
});

test("EF-404 attempt ceiling mirrors the EF-306 bound", () => {
  assert.equal(PUBLISH_MAX_ATTEMPTS_CEILING, 10);
  assert.throws(
    () =>
      createContentPublishJob({
        id: randomUUID(),
        item: scheduledItem(),
        maxAttempts: 11,
        now,
      }),
    PublishingValidationError,
  );
});
