import test from "node:test";
import assert from "node:assert/strict";
import {
  contentHashOf,
  contentTransitionIsAllowed,
  createContentItem,
  createContentRevision,
  editContentItem,
  transitionContentItem,
  ContentStateError,
  ContentValidationError,
} from "../dist/features/content/domain/content.js";

const org = "11111111-1111-4111-8111-111111111111";
const actor = "33333333-3333-4333-8333-333333333333";
const campaign = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const now = new Date("2026-10-01T10:00:00.000Z");

function item(overrides = {}) {
  return createContentItem({
    id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
    organizationId: org,
    title: "شقة الرياض للإيجار",
    body: "شقة غرفتين حي الملقا، 2500 ريال شهريًا.",
    channel: "INSTAGRAM",
    createdBy: actor,
    createdAt: now,
    ...overrides,
  });
}

function draftFrom(source, overrides = {}) {
  return transitionContentItem(source, {
    toStatus: "DRAFT",
    actorId: actor,
    at: new Date(now.getTime() + 60_000),
    ...overrides,
  }).item;
}

test("EF-402 content creation validates identity, text bounds, and channel", () => {
  const created = item();
  assert.equal(created.status, "IDEA");
  assert.equal(created.variantNumber, 1);
  assert.equal(created.approvedVersion, undefined);
  assert.equal(created.contentHash, undefined);
  assert.throws(() => item({ id: "not-a-uuid" }), ContentValidationError);
  assert.throws(() => item({ title: "  " }), ContentValidationError);
  assert.throws(() => item({ title: "x".repeat(201) }), ContentValidationError);
  assert.throws(() => item({ body: "" }), ContentValidationError);
  assert.throws(() => item({ body: "x".repeat(5001) }), ContentValidationError);
  assert.throws(() => item({ channel: "SKY" }), ContentValidationError);
  assert.throws(() => item({ organizationId: "nope" }), ContentValidationError);
});

test("EF-402 approval locks version 1 and a deterministic content hash", () => {
  const draft = draftFrom(item());
  const review = transitionContentItem(draft, {
    toStatus: "REVIEW",
    actorId: actor,
    at: new Date(now.getTime() + 60_000),
  }).item;
  const approved = transitionContentItem(review, {
    toStatus: "APPROVED",
    actorId: actor,
    at: new Date(now.getTime() + 120_000),
  });
  assert.equal(approved.item.status, "APPROVED");
  assert.equal(approved.item.approvedVersion, 1);
  assert.equal(approved.item.contentHash, contentHashOf(draft));
  assert.equal(approved.transition.version, 1);
  assert.equal(approved.transition.contentHash, approved.item.contentHash);
  // Hash is deterministic over the exact payload.
  assert.equal(approved.item.contentHash, contentHashOf(draft));
});

test("EF-402 approval hash changes when content changes", () => {
  const draftA = draftFrom(item());
  const hashA = contentHashOf(draftA);
  const draftB = editContentItem(draftA, {
    title: draftA.title,
    body: draftA.body + " تم التحديث.",
    channel: draftA.channel,
    actorId: actor,
    at: new Date(now.getTime() + 90_000),
  });
  const hashB = contentHashOf(draftB);
  assert.notEqual(hashA, hashB);
});

test("EF-402 illegal lifecycle transitions are rejected", () => {
  const base = item();
  const draft = draftFrom(base);
  const review = transitionContentItem(draft, {
    toStatus: "REVIEW",
    actorId: actor,
    at: new Date(now.getTime() + 120_000),
  }).item;
  const approved = transitionContentItem(review, {
    toStatus: "APPROVED",
    actorId: actor,
    at: new Date(now.getTime() + 180_000),
  }).item;
  const scheduled = transitionContentItem(approved, {
    toStatus: "SCHEDULED",
    scheduledFor: new Date(now.getTime() + 900_000),
    actorId: actor,
    at: new Date(now.getTime() + 240_000),
  }).item;
  const published = transitionContentItem(scheduled, {
    toStatus: "PUBLISHED",
    actorId: actor,
    at: new Date(now.getTime() + 1_000_000),
  }).item;
  const failed = transitionContentItem(scheduled, {
    toStatus: "FAILED",
    failureKind: "CHANNEL_TIMEOUT",
    reason: "انتهت المهلة",
    actorId: actor,
    at: new Date(now.getTime() + 1_000_000),
  }).item;

  // Skipping states is forbidden at every point.
  assert.throws(
    () =>
      transitionContentItem(base, {
        toStatus: "APPROVED",
        actorId: actor,
        at: new Date(now.getTime() + 60_000),
      }),
    ContentStateError,
  );
  assert.throws(
    () =>
      transitionContentItem(draft, {
        toStatus: "PUBLISHED",
        actorId: actor,
        at: new Date(now.getTime() + 60_000),
      }),
    ContentStateError,
  );
  assert.throws(
    () =>
      transitionContentItem(review, {
        toStatus: "SCHEDULED",
        scheduledFor: new Date(now.getTime() + 900_000),
        actorId: actor,
        at: new Date(now.getTime() + 60_000),
      }),
    ContentStateError,
  );
  assert.throws(
    () =>
      transitionContentItem(approved, {
        toStatus: "PUBLISHED",
        actorId: actor,
        at: new Date(now.getTime() + 60_000),
      }),
    ContentStateError,
  );
  // Terminal states never move.
  for (const target of ["DRAFT", "REVIEW", "APPROVED", "SCHEDULED", "FAILED"]) {
    assert.throws(
      () =>
        transitionContentItem(published, {
          toStatus: target,
          actorId: actor,
          at: new Date(now.getTime() + 2_000_000),
        }),
      ContentStateError,
    );
  }
  assert.equal(contentTransitionIsAllowed("PUBLISHED", "PUBLISHED"), false);
  // A failed item re-enters review, not draft/approved directly.
  assert.throws(
    () =>
      transitionContentItem(failed, {
        toStatus: "APPROVED",
        actorId: actor,
        at: new Date(now.getTime() + 2_000_000),
      }),
    ContentStateError,
  );
});

test("EF-402 re-approval after failure locks version 2 with a fresh hash", () => {
  const draft = draftFrom(item());
  const review1 = transitionContentItem(draft, {
    toStatus: "REVIEW",
    actorId: actor,
    at: new Date(now.getTime() + 60_000),
  }).item;
  const approved1 = transitionContentItem(review1, {
    toStatus: "APPROVED",
    actorId: actor,
    at: new Date(now.getTime() + 120_000),
  });
  const scheduled = transitionContentItem(approved1.item, {
    toStatus: "SCHEDULED",
    scheduledFor: new Date(now.getTime() + 900_000),
    actorId: actor,
    at: new Date(now.getTime() + 180_000),
  }).item;
  const failed = transitionContentItem(scheduled, {
    toStatus: "FAILED",
    failureKind: "SCHEDULE_MISSED",
    reason: "فوّت الموعد",
    actorId: actor,
    at: new Date(now.getTime() + 900_001),
  }).item;
  const review = transitionContentItem(failed, {
    toStatus: "REVIEW",
    actorId: actor,
    at: new Date(now.getTime() + 1_000_000),
  }).item;
  const approved2 = transitionContentItem(review, {
    toStatus: "APPROVED",
    actorId: actor,
    at: new Date(now.getTime() + 1_100_000),
  });
  assert.equal(approved2.item.approvedVersion, 2);
  assert.equal(approved2.transition.version, 2);
  assert.equal(approved2.item.contentHash, contentHashOf(review));
  assert.equal(approved2.item.contentHash, approved1.item.contentHash);
});

test("EF-402 failing requires a typed failure kind and an explicit reason", () => {
  const draft = draftFrom(item());
  const review = transitionContentItem(draft, {
    toStatus: "REVIEW",
    actorId: actor,
    at: new Date(now.getTime() + 60_000),
  }).item;
  const approved = transitionContentItem(review, {
    toStatus: "APPROVED",
    actorId: actor,
    at: new Date(now.getTime() + 120_000),
  }).item;
  const scheduled = transitionContentItem(approved, {
    toStatus: "SCHEDULED",
    scheduledFor: new Date(now.getTime() + 900_000),
    actorId: actor,
    at: new Date(now.getTime() + 180_000),
  }).item;
  assert.throws(
    () =>
      transitionContentItem(scheduled, {
        toStatus: "FAILED",
        reason: "بلا نوع",
        actorId: actor,
        at: new Date(now.getTime() + 200_000),
      }),
    ContentValidationError,
  );
  assert.throws(
    () =>
      transitionContentItem(scheduled, {
        toStatus: "FAILED",
        failureKind: "CHANNEL_TIMEOUT",
        actorId: actor,
        at: new Date(now.getTime() + 200_000),
      }),
    ContentValidationError,
  );
  assert.throws(
    () =>
      transitionContentItem(scheduled, {
        toStatus: "FAILED",
        failureKind: "NOT_A_KIND",
        reason: "نوع غير معروف",
        actorId: actor,
        at: new Date(now.getTime() + 200_000),
      }),
    ContentValidationError,
  );
});

test("EF-402 scheduling requires a future timestamp", () => {
  const draft = draftFrom(item());
  const review = transitionContentItem(draft, {
    toStatus: "REVIEW",
    actorId: actor,
    at: new Date(now.getTime() + 60_000),
  }).item;
  const approved = transitionContentItem(review, {
    toStatus: "APPROVED",
    actorId: actor,
    at: new Date(now.getTime() + 120_000),
  }).item;
  assert.throws(
    () =>
      transitionContentItem(approved, {
        toStatus: "SCHEDULED",
        scheduledFor: new Date(now.getTime() + 60_000),
        actorId: actor,
        at: new Date(now.getTime() + 120_000),
      }),
    ContentValidationError,
  );
  const scheduled = transitionContentItem(approved, {
    toStatus: "SCHEDULED",
    scheduledFor: new Date(now.getTime() + 130_000),
    actorId: actor,
    at: new Date(now.getTime() + 121_000),
  });
  assert.equal(scheduled.item.scheduledFor.getTime(), now.getTime() + 130_000);
});

test("EF-402 content edits are allowed only while IDEA/DRAFT", () => {
  const base = item();
  const editedIdea = editContentItem(base, {
    title: base.title,
    body: base.body + " تعديل.",
    channel: "X",
    actorId: actor,
    at: new Date(now.getTime() + 30_000),
  });
  assert.equal(editedIdea.channel, "X");
  const draft = draftFrom(editedIdea);
  const review = transitionContentItem(draft, {
    toStatus: "REVIEW",
    actorId: actor,
    at: new Date(now.getTime() + 120_000),
  }).item;
  assert.throws(
    () =>
      editContentItem(review, {
        title: review.title,
        body: "محاولة تعديل بعد القفل",
        channel: review.channel,
        actorId: actor,
        at: new Date(now.getTime() + 150_000),
      }),
    ContentStateError,
  );
});

test("EF-402 revisions are new locked-source-only variants in the same lineage", () => {
  const draft = draftFrom(item({ campaignId: campaign }));
  const review = transitionContentItem(draft, {
    toStatus: "REVIEW",
    actorId: actor,
    at: new Date(now.getTime() + 60_000),
  }).item;
  const approved = transitionContentItem(review, {
    toStatus: "APPROVED",
    actorId: actor,
    at: new Date(now.getTime() + 120_000),
  }).item;
  // Unlocked sources cannot be revised.
  assert.throws(
    () =>
      createContentRevision({
        id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
        source: draft,
        lineageMaxVariantNumber: 1,
        organizationId: org,
        createdBy: actor,
        createdAt: new Date(now.getTime() + 150_000),
      }),
    ContentStateError,
  );
  const revision = createContentRevision({
    id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
    source: approved,
    lineageMaxVariantNumber: 1,
    organizationId: org,
    createdBy: actor,
    createdAt: new Date(now.getTime() + 150_000),
  });
  assert.equal(revision.status, "IDEA");
  assert.equal(revision.variantOfId, approved.id);
  assert.equal(revision.rootContentId, approved.id);
  assert.equal(revision.variantNumber, 2);
  assert.equal(revision.title, approved.title);
  assert.equal(revision.body, approved.body);
  assert.equal(revision.channel, approved.channel);
  assert.equal(revision.campaignId, campaign);
  assert.equal(revision.approvedVersion, undefined);
  // Cross-tenant revision is refused.
  assert.throws(
    () =>
      createContentRevision({
        id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
        source: approved,
        lineageMaxVariantNumber: 1,
        organizationId: "22222222-2222-4222-8222-222222222222",
        createdBy: actor,
        createdAt: new Date(now.getTime() + 150_000),
      }),
    ContentStateError,
  );
});
