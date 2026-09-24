import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import {
  createContentItem,
  transitionContentItem,
} from "../dist/features/content/domain/content.js";
import { ContentPublishingApplication } from "../dist/features/content/application/publishing-application.js";
import { InMemoryRecordingPublishingAdapter } from "../dist/features/content/application/publishing-channel.port.js";
import { contentHashOf } from "../dist/features/content/domain/content.js";

const org = "11111111-1111-4111-8111-111111111111";
const otherOrg = "22222222-2222-4222-8222-222222222222";
const owner = "33333333-3333-4333-8333-333333333333";
const broker = "44444444-4444-4444-8444-444444444444";
const client = "55555555-5555-4555-8555-555555555555";
const now = new Date("2026-10-01T10:00:00.000Z");

/** In-memory content + membership + publishing store mirroring the SQL contract. */
function makeMemoryRepo() {
  const items = new Map();
  const jobs = new Map(); // executionKey → job row (plain object, mutable copy)
  const deliveries = [];
  const transitions = [];
  const memberships = new Map();

  const membershipReader = {
    async findMembership(organizationId, userId) {
      return memberships.get(`${organizationId}:${userId}`) ?? null;
    },
  };

  const contentRepository = {
    async findContentItem(organizationId, contentItemId) {
      return items.get(`${organizationId}:${contentItemId}`) ?? null;
    },
    async recordContentTransition(input) {
      const key = `${input.item.organizationId}:${input.item.id}`;
      const current = items.get(key);
      if (!current || current.status !== input.transition.fromStatus)
        return null;
      items.set(key, {
        ...current,
        status: input.transition.toStatus,
        ...(input.transition.toStatus === "APPROVED"
          ? {
              approvedVersion: input.transition.version,
              contentHash: input.transition.contentHash,
            }
          : {}),
        ...(input.transition.toStatus === "SCHEDULED"
          ? { scheduledFor: input.scheduledFor }
          : {}),
        updatedAt: input.transition.createdAt,
      });
      transitions.push(input.transition);
      if (input.publishJob !== undefined) {
        if (jobs.has(input.publishJob.executionKey)) return null;
        jobs.set(input.publishJob.executionKey, { ...input.publishJob });
      }
      return input.transition;
    },
  };

  function cloneJob(job) {
    return Object.freeze({ ...job });
  }

  const repository = {
    async insertPublishJob(job) {
      if (jobs.has(job.executionKey))
        return { kind: "duplicate-occurrence", executionKey: job.executionKey };
      jobs.set(job.executionKey, { ...job });
      return { kind: "inserted" };
    },
    async findPublishJobByExecutionKey(organizationId, executionKey) {
      const job = jobs.get(executionKey);
      return job && job.organizationId === organizationId
        ? cloneJob(job)
        : null;
    },
    async findPublishJobById(organizationId, publishJobId) {
      for (const job of jobs.values())
        if (job.id === publishJobId && job.organizationId === organizationId)
          return cloneJob(job);
      return null;
    },
    async claimDuePublishJob(nowDate) {
      const due = [...jobs.values()]
        .filter(
          (job) =>
            (job.status === "QUEUED" || job.status === "RETRYING") &&
            job.nextAttemptAt.getTime() <= nowDate.getTime(),
        )
        .sort(
          (a, b) =>
            a.nextAttemptAt.getTime() - b.nextAttemptAt.getTime() ||
            a.id.localeCompare(b.id),
        )[0];
      if (!due) return null;
      const claimed = {
        ...due,
        status: "RUNNING",
        attemptCount: due.attemptCount + 1,
        startedAt: due.startedAt ?? nowDate,
        updatedAt: nowDate,
      };
      jobs.set(due.executionKey, claimed);
      return cloneJob(claimed);
    },
    async settleDeliveredJob(input) {
      const row = jobs.get(input.job.executionKey);
      if (!row || row.status !== "RUNNING") return "lost-race";
      const occursKey = `${input.job.organizationId}:${input.job.contentItemId}:${input.job.approvedVersion}:${input.job.channel}`;
      if (deliveries.some((d) => d.occursKey === occursKey)) return "lost-race";
      Object.assign(row, {
        status: "DELIVERED",
        completedAt: input.now,
        updatedAt: input.now,
      });
      deliveries.push({
        occursKey,
        job: cloneJob(row),
        payload: input.payload,
        providerMessageId: input.providerMessageId,
        deliveredAt: input.now,
      });
      await contentRepository.recordContentTransition({
        item: {
          organizationId: input.job.organizationId,
          id: input.job.contentItemId,
          status: "SCHEDULED",
        },
        transition: input.transition,
      });
      return "settled";
    },
    async settleFailedJob(input) {
      const row = jobs.get(input.job.executionKey);
      if (!row || row.status !== "RUNNING") return "lost-race";
      Object.assign(row, {
        status: input.terminal ? "FAILED" : "RETRYING",
        nextAttemptAt: input.nextAttemptAt ?? row.nextAttemptAt,
        lastErrorKind: input.failureKind,
        lastErrorMessage: input.reason,
        completedAt: input.terminal ? input.now : row.completedAt,
        updatedAt: input.now,
      });
      if (input.terminal && input.transition) {
        await contentRepository.recordContentTransition({
          item: {
            organizationId: input.job.organizationId,
            id: input.job.contentItemId,
            status: "SCHEDULED",
          },
          transition: input.transition,
        });
      }
      return "settled";
    },
    async settleOrphanCancelledJob(input) {
      const row = jobs.get(input.job.executionKey);
      if (!row || row.status !== "RUNNING") return "lost-race";
      Object.assign(row, {
        status: "CANCELLED",
        completedAt: input.now,
        updatedAt: input.now,
      });
      return "settled";
    },
    async cancelScheduledPublishing(input) {
      const open = [...jobs.values()].find(
        (job) =>
          job.organizationId === input.organizationId &&
          job.contentItemId === input.contentItemId &&
          (job.status === "QUEUED" || job.status === "RETRYING"),
      );
      if (!open) {
        const delivered = deliveries.some(
          (d) => d.job.contentItemId === input.contentItemId,
        );
        return delivered ? { kind: "already-delivered" } : { kind: "not-open" };
      }
      const itemKey = `${input.organizationId}:${input.contentItemId}`;
      const item = items.get(itemKey);
      if (!item || item.status !== "SCHEDULED") return { kind: "not-open" };
      Object.assign(open, {
        status: "CANCELLED",
        completedAt: input.now,
        updatedAt: input.now,
      });
      await contentRepository.recordContentTransition({
        item,
        transition: input.transition,
      });
      return {
        kind: "cancelled",
        job: cloneJob(open),
        transition: input.transition,
      };
    },
    async listUpcomingDeliveries(organizationId, nowDate, limit) {
      return [...jobs.values()]
        .filter(
          (job) =>
            job.organizationId === organizationId &&
            (job.status === "QUEUED" || job.status === "RETRYING"),
        )
        .sort((a, b) => a.scheduledFor.getTime() - b.scheduledFor.getTime())
        .slice(0, limit)
        .map((job) => ({
          contentItemId: job.contentItemId,
          publishJobId: job.id,
          title: "عنوان",
          channel: job.channel,
          variantNumber: 1,
          approvedVersion: job.approvedVersion,
          scheduledFor: job.scheduledFor,
          jobStatus: job.status,
          attemptCount: job.attemptCount,
          maxAttempts: job.maxAttempts,
          nextAttemptAt: job.nextAttemptAt,
        }));
    },
    async listPublishResults(organizationId, limit) {
      const rows = [];
      for (const job of jobs.values()) {
        if (job.organizationId !== organizationId) continue;
        if (job.status === "DELIVERED") {
          const delivery = deliveries.find((d) => d.job.id === job.id);
          rows.push({
            contentItemId: job.contentItemId,
            title: "عنوان",
            channel: job.channel,
            approvedVersion: job.approvedVersion,
            outcome: "DELIVERED",
            providerMessageId: delivery?.providerMessageId,
            completedAt: job.completedAt,
          });
        } else if (job.status === "FAILED" || job.status === "CANCELLED") {
          rows.push({
            contentItemId: job.contentItemId,
            title: "عنوان",
            channel: job.channel,
            approvedVersion: job.approvedVersion,
            outcome: job.status,
            failureKind: job.lastErrorKind,
            reason: job.lastErrorMessage,
            completedAt: job.completedAt,
          });
        }
      }
      return rows
        .sort((a, b) => a.completedAt.getTime() - b.completedAt.getTime())
        .slice(0, limit);
    },
  };

  return {
    repository,
    contentRepository,
    membershipReader,
    items,
    jobs,
    deliveries,
    transitions,
    memberships,
  };
}

function scriptAdapter(script) {
  let call = 0;
  const outcomes = [];
  return {
    outcomes,
    async deliver(request) {
      const outcome = script[Math.min(call, script.length - 1)];
      call++;
      outcomes.push({ call, request, outcome });
      return typeof outcome === "function" ? outcome(request) : outcome;
    },
  };
}

async function harness(options = {}) {
  const memory = makeMemoryRepo();
  const adapter = options.adapter ?? new InMemoryRecordingPublishingAdapter();
  const publishing = new ContentPublishingApplication(
    memory.repository,
    memory.contentRepository,
    memory.membershipReader,
    adapter,
  );
  memory.memberships.set(`${org}:${owner}`, {
    organizationId: org,
    role: "OWNER",
    status: "ACTIVE",
  });
  memory.memberships.set(`${org}:${broker}`, {
    organizationId: org,
    role: "BROKER",
    status: "ACTIVE",
  });
  memory.memberships.set(`${org}:${client}`, {
    organizationId: org,
    role: "CLIENT",
    status: "ACTIVE",
  });
  memory.memberships.set(`${otherOrg}:${owner}`, {
    organizationId: otherOrg,
    role: "OWNER",
    status: "ACTIVE",
  });
  return { memory, adapter, publishing };
}

async function seedScheduledItem(memory, options = {}) {
  const organizationId = options.organizationId ?? org;
  const itemId = randomUUID();
  const scheduledFor =
    options.scheduledFor ?? new Date("2026-10-01T12:00:00.000Z");
  const item = createContentItem({
    id: itemId,
    organizationId,
    title: "عنوان مجدول",
    body: "نص مجدول",
    channel: options.channel ?? "INSTAGRAM",
    createdBy: owner,
    createdAt: now,
  });
  let current = item;
  for (const step of [
    { toStatus: "DRAFT" },
    { toStatus: "REVIEW" },
    { toStatus: "APPROVED" },
  ]) {
    current = transitionContentItem(current, {
      ...step,
      actorId: owner,
      at: now,
    }).item;
  }
  const { item: scheduled } = transitionContentItem(current, {
    toStatus: "SCHEDULED",
    actorId: owner,
    at: now,
    scheduledFor,
  });
  memory.items.set(`${organizationId}:${itemId}`, scheduled);
  return scheduled;
}

const view = { actor: { verified: true }, userId: owner, organizationId: org };

test("EF-404 schedule→deliver exactly once on replay; duplicates are typed-rejected", async () => {
  const { memory, adapter, publishing } = await harness();
  const item = await seedScheduledItem(memory);

  // Standalone occurrence scheduling: insert then typed duplicate on replay.
  const first = await publishing.scheduleOccurrence({ item, at: now });
  assert.equal(first.kind, "inserted");
  const replay = await publishing.scheduleOccurrence({ item, at: now });
  assert.equal(replay.kind, "duplicate-occurrence");
  assert.equal(typeof replay.executionKey, "string");
  assert.equal(memory.jobs.size, 1);
  assert.equal([...memory.jobs.keys()][0], replay.executionKey);

  // First tick at the scheduled time delivers exactly once.
  const result = await publishing.runDueDeliveries({
    now: new Date("2026-10-01T12:00:00.000Z"),
    limit: 10,
  });
  assert.equal(result.claimed, 1);
  assert.equal(result.delivered, 1);
  assert.equal(adapter.recordedDeliveries().length, 1);
  assert.equal(memory.deliveries.length, 1);

  // The item is PUBLISHED with one audited worker transition.
  const stored = memory.items.get(`${org}:${item.id}`);
  assert.equal(stored.status, "PUBLISHED");
  const itemTransitions = memory.transitions.filter(
    (t) => t.contentItemId === item.id,
  );
  assert.equal(itemTransitions.length, 1);
  assert.equal(itemTransitions[0].toStatus, "PUBLISHED");

  // Replayed ticks (restart, crash-recovery, repeated sweep): still one.
  for (let i = 0; i < 3; i++) {
    const replayed = await publishing.runDueDeliveries({
      now: new Date("2026-10-01T13:00:00.000Z"),
      limit: 10,
    });
    assert.equal(replayed.claimed, 0);
  }
  assert.equal(adapter.recordedDeliveries().length, 1);
  assert.equal(memory.deliveries.length, 1);
  assert.equal(memory.transitions.length, 1);
});

test("EF-404 cancel before delivery works; cancel after delivery is typed-rejected", async () => {
  const { memory, adapter, publishing } = await harness();
  const item = await seedScheduledItem(memory);
  await publishing.scheduleOccurrence({ item, at: now });

  // Broker cannot cancel; Owner/Manager can.
  const denied = await publishing.cancelScheduledPublishing({
    actor: { verified: true },
    userId: broker,
    organizationId: org,
    contentItemId: item.id,
    reason: "خطة الحملة تغيرت",
    at: now,
  });
  assert.equal(denied.kind, "access-denied");

  const cancelled = await publishing.cancelScheduledPublishing({
    actor: { verified: true },
    userId: owner,
    organizationId: org,
    contentItemId: item.id,
    reason: "خطة الحملة تغيرت",
    at: now,
  });
  assert.equal(cancelled.kind, "cancelled");
  assert.equal(cancelled.job.status, "CANCELLED");
  assert.equal(cancelled.transition.toStatus, "FAILED");
  assert.equal(cancelled.transition.failureKind, "SCHEDULE_MISSED");

  // The tick never delivers a cancelled occurrence.
  const result = await publishing.runDueDeliveries({
    now: new Date("2026-10-01T12:00:00.000Z"),
    limit: 10,
  });
  assert.equal(result.delivered, 0);
  assert.equal(adapter.recordedDeliveries().length, 0);

  // Item left SCHEDULED; cancelling again is typed not-open.
  const again = await publishing.cancelScheduledPublishing({
    actor: { verified: true },
    userId: owner,
    organizationId: org,
    contentItemId: item.id,
    reason: "مرة أخرى",
    at: now,
  });
  assert.equal(again.kind, "not-open");
});

test("EF-404 cancel after delivery is typed-rejected as already-delivered", async () => {
  const { memory, publishing } = await harness();
  const item = await seedScheduledItem(memory);
  await publishing.scheduleOccurrence({ item, at: now });
  await publishing.runDueDeliveries({
    now: new Date("2026-10-01T12:00:00.000Z"),
    limit: 10,
  });
  const late = await publishing.cancelScheduledPublishing({
    actor: { verified: true },
    userId: owner,
    organizationId: org,
    contentItemId: item.id,
    reason: "متأخر",
    at: new Date("2026-10-01T12:30:00.000Z"),
  });
  assert.equal(late.kind, "already-delivered");
});

test("EF-404 failure paths: typed reason, retry with backoff, then terminal failure and typed item failure", async () => {
  const adapter = scriptAdapter([
    () => {
      return {
        kind: "rejected",
        failureKind: "CHANNEL_TIMEOUT",
        reason: "timeout on attempt 1",
      };
    },
    () => ({
      kind: "rejected",
      failureKind: "CHANNEL_TIMEOUT",
      reason: "timeout on attempt 2",
    }),
    () => ({
      kind: "rejected",
      failureKind: "CHANNEL_REJECTED",
      reason: "سياسة القناة ترفض النص",
    }),
  ]);
  const { memory, publishing } = await harness({ adapter });
  const item = await seedScheduledItem(memory);
  await publishing.scheduleOccurrence({ item, at: now });

  // Attempt 1 fails retryably → RETRYING with a typed last error.
  const first = await publishing.runDueDeliveries({
    now: new Date("2026-10-01T12:00:00.000Z"),
    limit: 10,
  });
  assert.equal(first.retried, 1);
  assert.equal(first.delivered, 0);
  const stored = memory.items.get(`${org}:${item.id}`);
  assert.equal(stored.status, "SCHEDULED");
  const jobRow = [...memory.jobs.values()][0];
  assert.equal(jobRow.status, "RETRYING");
  assert.equal(jobRow.lastErrorKind, "CHANNEL_TIMEOUT");
  assert.equal(jobRow.lastErrorMessage, "timeout on attempt 1");
  const backoffMs =
    jobRow.nextAttemptAt.getTime() -
    new Date("2026-10-01T12:00:00.000Z").getTime();
  assert.equal(backoffMs, 30_000);

  // Before the backoff elapses, nothing is claimed.
  const early = await publishing.runDueDeliveries({
    now: new Date("2026-10-01T12:00:10.000Z"),
    limit: 10,
  });
  assert.equal(early.claimed, 0);

  // Attempt 2 fails retryably again → still RETRYING.
  const second = await publishing.runDueDeliveries({
    now: new Date("2026-10-01T12:00:30.000Z"),
    limit: 10,
  });
  assert.equal(second.retried, 1);

  // Attempt 3 hits a permanent rejection → terminal FAILED + typed item failure.
  const third = await publishing.runDueDeliveries({
    now: new Date("2026-10-01T12:01:30.000Z"),
    limit: 10,
  });
  assert.equal(third.failed, 1);
  const afterFailure = memory.items.get(`${org}:${item.id}`);
  assert.equal(afterFailure.status, "FAILED");
  const failTransition = memory.transitions.find(
    (t) => t.contentItemId === item.id && t.toStatus === "FAILED",
  );
  assert.ok(failTransition);
  assert.equal(failTransition.failureKind, "CHANNEL_REJECTED");
  assert.equal(failTransition.reason, "سياسة القناة ترفض النص");
  // Results view shows the failure with its typed reason.
  const results = await publishing.listPublishResults(view);
  assert.equal(results.length, 1);
  assert.equal(results[0].outcome, "FAILED");
  assert.equal(results[0].failureKind, "CHANNEL_REJECTED");
});

test("EF-404 views: upcoming deliveries + results are tenant-scoped and authority-gated", async () => {
  const { memory, publishing } = await harness();
  const mine = await seedScheduledItem(memory, { channel: "X" });
  const theirs = await seedScheduledItem(memory, {
    organizationId: otherOrg,
    channel: "INSTAGRAM",
  });
  await publishing.scheduleOccurrence({ item: mine, at: now });
  await publishing.scheduleOccurrence({ item: theirs, at: now });

  const upcoming = await publishing.listUpcomingDeliveries(view);
  assert.equal(upcoming.length, 1);
  assert.equal(upcoming[0].contentItemId, mine.id);
  assert.equal(upcoming[0].channel, "X");

  // CLIENT is denied both views.
  const denied = await publishing.listUpcomingDeliveries({
    actor: { verified: true },
    userId: client,
    organizationId: org,
  });
  assert.equal(denied.kind, "access-denied");

  await publishing.runDueDeliveries({
    now: new Date("2026-10-01T12:00:00.000Z"),
    limit: 10,
  });
  const results = await publishing.listPublishResults(view);
  assert.equal(results.length, 1);
  assert.equal(results[0].contentItemId, mine.id);
  assert.equal(results[0].outcome, "DELIVERED");
  assert.ok(results[0].providerMessageId.startsWith("fake-publish:"));
});

test("EF-404 pre-delivery verification cancels stale occurrences instead of delivering", async () => {
  const { memory, adapter, publishing } = await harness();
  const item = await seedScheduledItem(memory);
  await publishing.scheduleOccurrence({ item, at: now });
  // The schedule is gone before the tick: someone failed the item meanwhile.
  const stored = memory.items.get(`${org}:${item.id}`);
  memory.items.set(`${org}:${item.id}`, { ...stored, status: "FAILED" });
  const result = await publishing.runDueDeliveries({
    now: new Date("2026-10-01T12:00:00.000Z"),
    limit: 10,
  });
  assert.equal(result.cancelled, 1);
  assert.equal(result.delivered, 0);
  assert.equal(adapter.recordedDeliveries().length, 0);
  const jobRow = [...memory.jobs.values()][0];
  assert.equal(jobRow.status, "CANCELLED");
});

test("EF-404 delivered payload snapshot stores the exact bundle with provenance", async () => {
  const { memory, publishing } = await harness();
  const item = await seedScheduledItem(memory);
  await publishing.scheduleOccurrence({ item, at: now });
  await publishing.runDueDeliveries({
    now: new Date("2026-10-01T12:00:00.000Z"),
    limit: 10,
  });
  const delivery = memory.deliveries[0];
  assert.equal(delivery.payload.title, item.title);
  assert.equal(delivery.payload.body, item.body);
  assert.equal(delivery.payload.contentHash, contentHashOf(item));
  assert.equal(delivery.payload.approvedVersion, 1);
  assert.ok(delivery.payload.linkPath.includes("utm_source=estateflow"));
  assert.equal(delivery.payload.utm.medium, "instagram");
});
