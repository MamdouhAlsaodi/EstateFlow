import assert from "node:assert/strict";
import test from "node:test";
import { arMessages } from "../i18n/catalog";
import {
  normalizeCalendar,
  normalizeContentDetail,
  normalizeContentList,
  normalizeReviewQueue,
} from "../features/content/content-contract";
import {
  contentChannelLabels,
  contentFailureKindLabels,
  contentStatusLabels,
} from "../features/content/content-labels";

const orgId = "11111111-1111-4111-8111-111111111111";
const itemId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const campaignId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const actorId = "33333333-3333-4333-8333-333333333333";
const revisionId = "77777777-7777-4777-8777-777777777777";
const hash = "a".repeat(64);

const validListItem = {
  id: itemId,
  campaignId,
  variantNumber: 1,
  title: "شقة الرياض",
  channel: "INSTAGRAM",
  status: "SCHEDULED",
  scheduledFor: "2026-10-08T09:00:00.000Z",
  approvedVersion: 1,
  createdAt: "2026-10-01T10:00:00.000Z",
};

const validRecord = {
  ...validListItem,
  organizationId: orgId,
  rootContentId: undefined,
  variantOfId: undefined,
  body: "شقة غرفتين للإيجار.",
  contentHash: hash,
  createdBy: actorId,
  updatedAt: "2026-10-01T12:00:00.000Z",
};

test("EF-402 content list normalizer accepts the typed page and rejects unknown fields", () => {
  const page = normalizeContentList({
    items: [validListItem],
    nextCursor: "abc",
  });
  assert.equal(page.items.length, 1);
  assert.equal(page.items[0].status, "SCHEDULED");
  assert.equal(page.items[0].scheduledFor, "2026-10-08T09:00:00.000Z");
  assert.equal(page.nextCursor, "abc");
  assert.throws(() =>
    normalizeContentList({ items: [validListItem], extra: 1 }),
  );
  assert.throws(() =>
    normalizeContentList({ items: [{ ...validListItem, status: "LOST" }] }),
  );
  assert.throws(() =>
    normalizeContentList({ items: [{ ...validListItem, variantNumber: 0 }] }),
  );
  assert.throws(() =>
    normalizeContentList({
      items: [{ ...validListItem, scheduledFor: "nope" }],
    }),
  );
});

test("EF-402 detail normalizer keeps version/hash timeline and revision variants", () => {
  const detail = normalizeContentDetail({
    item: validRecord,
    transitions: [
      {
        id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
        organizationId: orgId,
        contentItemId: itemId,
        fromStatus: "REVIEW",
        toStatus: "APPROVED",
        version: 1,
        contentHash: hash,
        actorId,
        createdAt: "2026-10-01T11:00:00.000Z",
      },
      {
        id: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
        organizationId: orgId,
        contentItemId: itemId,
        fromStatus: "SCHEDULED",
        toStatus: "FAILED",
        failureKind: "CHANNEL_TIMEOUT",
        reason: "انتهت المهلة",
        actorId,
        createdAt: "2026-10-08T09:05:00.000Z",
      },
    ],
    variants: [
      validRecord,
      {
        ...validRecord,
        id: revisionId,
        rootContentId: itemId,
        variantOfId: itemId,
        variantNumber: 2,
        approvedVersion: undefined,
        contentHash: undefined,
        status: "DRAFT",
      },
    ],
  });
  assert.equal(detail.item.approvedVersion, 1);
  assert.equal(detail.item.contentHash, hash);
  assert.equal(detail.transitions.length, 2);
  assert.equal(detail.transitions[0].version, 1);
  assert.equal(detail.transitions[1].failureKind, "CHANNEL_TIMEOUT");
  assert.equal(detail.variants.length, 2);
  assert.equal(detail.variants[1].variantNumber, 2);
  // Strict rejection: tampered hash, unknown failure kind, extra field.
  assert.throws(() =>
    normalizeContentDetail({
      item: { ...validRecord, contentHash: "zz" },
      transitions: [],
      variants: [],
    }),
  );
  assert.throws(() =>
    normalizeContentDetail({
      item: validRecord,
      transitions: [
        {
          id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
          organizationId: orgId,
          contentItemId: itemId,
          fromStatus: "SCHEDULED",
          toStatus: "FAILED",
          failureKind: "NOT_A_KIND",
          actorId,
          createdAt: "2026-10-08T09:05:00.000Z",
        },
      ],
      variants: [],
    }),
  );
  assert.throws(() =>
    normalizeContentDetail({
      item: validRecord,
      transitions: [],
      variants: [],
      x: 1,
    }),
  );
});

test("EF-402 review queue and calendar normalizers accept typed payloads", () => {
  const queue = normalizeReviewQueue({
    items: [
      {
        id: itemId,
        title: "شقة الرياض",
        channel: "X",
        campaignId,
        variantNumber: 1,
        submittedAt: "2026-10-01T10:00:00.000Z",
      },
    ],
  });
  assert.equal(queue.items.length, 1);
  assert.equal(queue.items[0].channel, "X");
  assert.throws(() =>
    normalizeReviewQueue({ items: [{ ...queue.items[0], nope: 1 }] }),
  );

  const calendar = normalizeCalendar({
    items: [
      {
        id: itemId,
        title: "شقة الرياض",
        channel: "INSTAGRAM",
        status: "PUBLISHED",
        variantNumber: 2,
        scheduledFor: "2026-10-08T09:00:00.000Z",
      },
    ],
  });
  assert.equal(calendar.items[0].status, "PUBLISHED");
  assert.equal(calendar.items[0].variantNumber, 2);
  assert.throws(() => normalizeCalendar({ items: "nope" }));
});

test("EF-402 catalog labels cover every lifecycle state, channel, and failure kind", () => {
  for (const status of [
    "IDEA",
    "DRAFT",
    "REVIEW",
    "APPROVED",
    "SCHEDULED",
    "PUBLISHED",
    "FAILED",
  ] as const) {
    assert.match(arMessages[contentStatusLabels[status]], /[\u0600-\u06FF]/);
  }
  for (const label of Object.values(contentChannelLabels)) {
    assert.match(arMessages[label], /[\u0600-\u06FF]/);
  }
  for (const label of Object.values(contentFailureKindLabels)) {
    assert.match(arMessages[label], /[\u0600-\u06FF]/);
  }
});
