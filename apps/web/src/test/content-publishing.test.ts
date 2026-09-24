import assert from "node:assert/strict";
import test from "node:test";
import {
  normalizePublishResults,
  normalizeScheduledDeliveries,
} from "../features/content/content-contract";

const itemId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const jobId = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const at = "2026-10-08T09:00:00.000Z";

const scheduled = {
  contentItemId: itemId,
  publishJobId: jobId,
  title: "شقة الرياض",
  channel: "INSTAGRAM",
  variantNumber: 1,
  approvedVersion: 1,
  scheduledFor: at,
  jobStatus: "QUEUED",
  attemptCount: 0,
  maxAttempts: 5,
  nextAttemptAt: at,
};

test("EF-404 publishing normalizers preserve upcoming delivery fields", () => {
  const response = normalizeScheduledDeliveries({ items: [scheduled] });
  assert.equal(response.items[0].jobStatus, "QUEUED");
  assert.equal(response.items[0].attemptCount, 0);
  assert.throws(() =>
    normalizeScheduledDeliveries({
      items: [{ ...scheduled, lastErrorKind: "NOT_A_FAILURE" }],
    }),
  );
  assert.throws(() =>
    normalizeScheduledDeliveries({ items: [{ ...scheduled, extra: true }] }),
  );
});

test("EF-404 publish results keep typed failure reasons and reject drift", () => {
  const response = normalizePublishResults({
    items: [
      {
        contentItemId: itemId,
        title: "محتوى فاشل",
        channel: "X",
        approvedVersion: 2,
        outcome: "FAILED",
        failureKind: "CHANNEL_REJECTED",
        reason: "رفضت القناة المحتوى",
        completedAt: at,
      },
    ],
  });
  assert.equal(response.items[0].failureKind, "CHANNEL_REJECTED");
  assert.equal(response.items[0].reason, "رفضت القناة المحتوى");
  assert.throws(() =>
    normalizePublishResults({
      items: [{ ...response.items[0], outcome: "UNKNOWN" }],
    }),
  );
  assert.throws(() =>
    normalizePublishResults({
      items: [{ ...response.items[0], reason: 17 }],
    }),
  );
});
