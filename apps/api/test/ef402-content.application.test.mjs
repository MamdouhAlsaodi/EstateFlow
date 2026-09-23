import test from "node:test";
import assert from "node:assert/strict";
import { ContentApplication } from "../dist/features/content/application/content-application.js";
import { ContentValidationError } from "../dist/features/content/domain/content.js";

const org = "11111111-1111-4111-8111-111111111111";
const otherOrg = "22222222-2222-4222-8222-222222222222";
const owner = "33333333-3333-4333-8333-333333333333";
const manager = "44444444-4444-4444-8444-444444444444";
const broker = "55555555-5555-4555-8555-555555555555";
const client = "66666666-6666-4666-8666-666666666666";
const campaign = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const now = new Date("2026-10-01T10:00:00.000Z");

/** In-memory ContentRepository double with guarded transitions. */
function memoryRepository() {
  const items = new Map();
  const transitions = [];
  const memberships = new Map();
  const store = {
    items,
    memberships,
    transitions,
    addMembership(organizationId, userId, role, status = "ACTIVE") {
      memberships.set(`${organizationId}:${userId}`, {
        organizationId,
        role,
        status,
      });
    },
    async createContentItem(item) {
      items.set(`${item.organizationId}:${item.id}`, item);
    },
    async findContentItem(organizationId, contentItemId) {
      return items.get(`${organizationId}:${contentItemId}`) ?? null;
    },
    async listContentItems(query) {
      return [...items.values()]
        .filter(
          (item) =>
            item.organizationId === query.organizationId &&
            (query.status === undefined || item.status === query.status),
        )
        .slice(0, query.limit);
    },
    async listReviewQueue(organizationId) {
      return [...items.values()]
        .filter(
          (item) =>
            item.organizationId === organizationId && item.status === "REVIEW",
        )
        .map((item) => ({
          id: item.id,
          title: item.title,
          channel: item.channel,
          variantNumber: item.variantNumber,
          submittedAt: item.updatedAt,
        }));
    },
    async listCalendar() {
      return [];
    },
    async listTransitions(organizationId, contentItemId) {
      return transitions.filter(
        (t) =>
          t.organizationId === organizationId &&
          t.contentItemId === contentItemId,
      );
    },
    async listLineage(organizationId, item) {
      const root = item.rootContentId ?? item.id;
      return [...items.values()]
        .filter(
          (candidate) =>
            candidate.organizationId === organizationId &&
            (candidate.rootContentId ?? candidate.id) === root,
        )
        .sort((a, b) => a.variantNumber - b.variantNumber);
    },
    async campaignExistsInOrganization(organizationId, campaignId) {
      return organizationId === org && campaignId === campaign;
    },
    async lineageMaxVariantNumber(organizationId, rootId) {
      const lineage = await store.listLineage(organizationId, {
        rootContentId: rootId,
      });
      return lineage.reduce(
        (max, item) => Math.max(max, item.variantNumber),
        0,
      );
    },
    async recordContentEdit(input) {
      const current = await store.findContentItem(
        input.item.organizationId,
        input.item.id,
      );
      if (!current || (current.status !== "IDEA" && current.status !== "DRAFT"))
        return null;
      const updated = {
        ...current,
        title: input.title,
        body: input.body,
        channel: input.channel,
        campaignId: input.campaignId ?? undefined,
        updatedAt: input.editedAt,
      };
      items.set(`${current.organizationId}:${current.id}`, updated);
      return updated;
    },
    async recordContentTransition(input) {
      const key = `${input.item.organizationId}:${input.item.id}`;
      const current = items.get(key);
      if (!current || current.status !== input.transition.fromStatus)
        return null;
      const updated = {
        ...current,
        status: input.transition.toStatus,
        ...(input.transition.toStatus === "APPROVED"
          ? {
              approvedVersion: input.transition.version,
              contentHash: input.transition.contentHash,
            }
          : {}),
        ...(input.scheduledFor !== undefined
          ? { scheduledFor: input.scheduledFor }
          : {}),
        updatedAt: input.transition.createdAt,
      };
      items.set(key, updated);
      transitions.push(input.transition);
      return input.transition;
    },
    async recordContentRevision(input) {
      const current = await store.findContentItem(
        input.source.organizationId,
        input.source.id,
      );
      if (!current) return null;
      const rootId = input.source.rootContentId ?? input.source.id;
      const lineage = await store.listLineage(input.source.organizationId, {
        rootContentId: rootId,
      });
      const max = lineage.reduce(
        (acc, item) => Math.max(acc, item.variantNumber),
        0,
      );
      const revision = {
        ...input.revision,
        rootContentId: rootId,
        variantOfId: input.source.id,
        variantNumber: max + 1,
        status: "DRAFT",
      };
      items.set(`${revision.organizationId}:${revision.id}`, revision);
      return revision;
    },
  };
  return store;
}

function application(repository) {
  return new ContentApplication(repository, {
    async findMembership(organizationId, userId) {
      return repository.memberships.get(`${organizationId}:${userId}`) ?? null;
    },
  });
}

const verified = { verified: true };
const base = {
  actor: verified,
  organizationId: org,
  title: "فيلا جدة للبيع",
  body: "فيلا خمس غرف حي الشاطئ.",
  channel: "X",
};

async function approvedItem(app, repository, userId = owner) {
  const created = await app.createContentItem({
    ...base,
    userId,
    contentItemId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
    createdAt: now,
  });
  assert.equal(created.kind, "created");
  const draft = await app.transitionContentItem({
    ...base,
    userId,
    contentItemId: created.item.id,
    toStatus: "DRAFT",
    at: new Date(now.getTime() + 60_000),
  });
  assert.equal(draft.kind, "transitioned");
  const review = await app.transitionContentItem({
    ...base,
    userId,
    contentItemId: created.item.id,
    toStatus: "REVIEW",
    at: new Date(now.getTime() + 120_000),
  });
  assert.equal(review.kind, "transitioned");
  const approved = await app.transitionContentItem({
    ...base,
    userId,
    contentItemId: created.item.id,
    toStatus: "APPROVED",
    at: new Date(now.getTime() + 180_000),
  });
  assert.equal(approved.kind, "transitioned");
  return created.item;
}

test("EF-402 authority matrix: broker drafts, Owner/Manager approve and publish", async () => {
  const repository = memoryRepository();
  repository.addMembership(org, owner, "OWNER");
  repository.addMembership(org, manager, "MANAGER");
  repository.addMembership(org, broker, "BROKER");
  repository.addMembership(org, client, "CLIENT");
  const app = application(repository);

  // Broker may create, edit, submit for review.
  const created = await app.createContentItem({
    ...base,
    userId: broker,
    contentItemId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
    createdAt: now,
  });
  assert.equal(created.kind, "created");
  const drafted = await app.transitionContentItem({
    ...base,
    userId: broker,
    contentItemId: created.item.id,
    toStatus: "DRAFT",
    at: new Date(now.getTime() + 20_000),
  });
  assert.equal(drafted.kind, "transitioned");
  const edited = await app.editContentItem({
    ...base,
    userId: broker,
    contentItemId: created.item.id,
    body: base.body + " تعديل الوسيط.",
    at: new Date(now.getTime() + 30_000),
  });
  assert.equal(edited.kind, "edited");
  const submitted = await app.transitionContentItem({
    ...base,
    userId: broker,
    contentItemId: created.item.id,
    toStatus: "REVIEW",
    at: new Date(now.getTime() + 60_000),
  });
  assert.equal(submitted.kind, "transitioned");

  // Broker may NOT approve, schedule, publish, or fail.
  for (const [toStatus, extra] of [
    ["APPROVED", {}],
    ["SCHEDULED", { scheduledFor: new Date(now.getTime() + 900_000) }],
    ["PUBLISHED", {}],
    ["FAILED", { failureKind: "OTHER", reason: "لا" }],
  ]) {
    const denied = await app.transitionContentItem({
      ...base,
      userId: broker,
      contentItemId: created.item.id,
      toStatus,
      ...extra,
      at: new Date(now.getTime() + 120_000),
    });
    assert.equal(denied.kind, "access-denied", toStatus);
  }

  // Manager approves; manager publishes.
  const approved = await app.transitionContentItem({
    ...base,
    userId: manager,
    contentItemId: created.item.id,
    toStatus: "APPROVED",
    at: new Date(now.getTime() + 180_000),
  });
  assert.equal(approved.kind, "transitioned");
  assert.equal(approved.item.approvedVersion, 1);
  const scheduled = await app.transitionContentItem({
    ...base,
    userId: manager,
    contentItemId: created.item.id,
    toStatus: "SCHEDULED",
    scheduledFor: new Date(now.getTime() + 900_000),
    at: new Date(now.getTime() + 240_000),
  });
  assert.equal(scheduled.kind, "transitioned");
  const published = await app.transitionContentItem({
    ...base,
    userId: owner,
    contentItemId: created.item.id,
    toStatus: "PUBLISHED",
    at: new Date(now.getTime() + 1_000_000),
  });
  assert.equal(published.kind, "transitioned");

  // Reads: broker/manager/owner allowed, client denied.
  const detail = await app.getContentItem({
    actor: verified,
    userId: broker,
    organizationId: org,
    contentItemId: created.item.id,
  });
  assert.equal(detail.item.status, "PUBLISHED");
  const deniedRead = await app.getContentItem({
    actor: verified,
    userId: client,
    organizationId: org,
    contentItemId: created.item.id,
  });
  assert.equal(deniedRead.kind, "access-denied");
  const queue = await app.listReviewQueue({
    actor: verified,
    userId: client,
    organizationId: org,
  });
  assert.equal(queue.kind, "access-denied");
});

test("EF-402 unverified actors and foreign tenants are denied or 404", async () => {
  const repository = memoryRepository();
  repository.addMembership(org, owner, "OWNER");
  repository.addMembership(otherOrg, owner, "OWNER");
  const app = application(repository);
  const item = await approvedItem(app, repository);

  assert.equal(
    (
      await app.createContentItem({
        ...base,
        actor: { verified: false },
        userId: owner,
        contentItemId: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
        createdAt: now,
      })
    ).kind,
    "access-denied",
  );
  // Foreign item id → tenant-safe not-found (never access-denied leak).
  const foreign = await app.transitionContentItem({
    ...base,
    userId: owner,
    organizationId: otherOrg,
    contentItemId: item.id,
    toStatus: "DRAFT",
    at: new Date(now.getTime() + 240_000),
  });
  assert.equal(foreign.kind, "not-found");
  assert.equal(foreign.resource, "content-item");
  // Unknown campaign link → tenant-safe not-found.
  assert.equal(
    (
      await app.createContentItem({
        ...base,
        userId: owner,
        organizationId: otherOrg,
        contentItemId: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
        campaignId: campaign,
        createdAt: now,
      })
    ).kind,
    "not-found",
  );
});

test("EF-402 revision creates a new DRAFT variant through the application", async () => {
  const repository = memoryRepository();
  repository.addMembership(org, owner, "OWNER");
  repository.addMembership(org, broker, "BROKER");
  const app = application(repository);
  const item = await approvedItem(app, repository);
  const revision = await app.createRevision({
    actor: verified,
    userId: broker,
    organizationId: org,
    contentItemId: item.id,
    revisionId: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
    createdAt: new Date(now.getTime() + 300_000),
  });
  assert.equal(revision.kind, "revised");
  assert.equal(revision.item.status, "DRAFT");
  assert.equal(revision.item.variantNumber, 2);
  assert.equal(revision.item.rootContentId, item.id);
  assert.equal(revision.item.approvedVersion, undefined);
  const detail = await app.getContentItem({
    actor: verified,
    userId: owner,
    organizationId: org,
    contentItemId: item.id,
  });
  assert.equal(detail.variants.length, 2);
  assert.equal(detail.variants[0].variantNumber, 1);
  assert.equal(detail.variants[1].variantNumber, 2);
});

test("EF-402 lost guarded transitions and invalid commands are conflicts/errors", async () => {
  const repository = memoryRepository();
  repository.addMembership(org, owner, "OWNER");
  const app = application(repository);
  const item = await approvedItem(app, repository);

  // SCHEDULED requires scheduledFor.
  await assert.rejects(
    () =>
      app.transitionContentItem({
        ...base,
        userId: owner,
        contentItemId: item.id,
        toStatus: "SCHEDULED",
        at: new Date(now.getTime() + 240_000),
      }),
    ContentValidationError,
  );

  // Concurrent status move: first transition wins, replay conflicts.
  const repository2 = memoryRepository();
  repository2.addMembership(org, owner, "OWNER");
  const app2 = application(repository2);
  const item2 = await approvedItem(app2, repository2);
  repository2.items.get(`${org}:${item2.id}`).status = "SCHEDULED";
  const stale = await app2.transitionContentItem({
    ...base,
    userId: owner,
    contentItemId: item2.id,
    toStatus: "SCHEDULED",
    scheduledFor: new Date(now.getTime() + 900_000),
    at: new Date(now.getTime() + 240_000),
  });
  assert.equal(stale.kind, "conflict");

  // Editing a locked item conflicts.
  const lockedEdit = await app.editContentItem({
    ...base,
    userId: owner,
    contentItemId: item.id,
    title: "جديد",
    at: new Date(now.getTime() + 300_000),
  });
  assert.equal(lockedEdit.kind, "conflict");

  // Calendar rejects an inverted or oversized range.
  await assert.rejects(
    () =>
      app.listCalendar({
        actor: verified,
        userId: owner,
        organizationId: org,
        from: new Date(now.getTime() + 900_000),
        to: new Date(now.getTime() + 60_000),
      }),
    ContentValidationError,
  );
});
