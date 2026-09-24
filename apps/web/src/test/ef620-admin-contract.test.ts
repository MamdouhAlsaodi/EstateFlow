import assert from "node:assert/strict";
import test from "node:test";
import {
  ADMIN_AUDIT_ACTIONS,
  normalizeAuditPage,
  normalizeBrokerDecision,
  normalizeFailedJobs,
  normalizeModerationDecision,
  normalizeModerationQueue,
  normalizePendingBrokers,
  serializeAdminQuery,
} from "../features/admin/admin-contract";
import {
  AUDIT_ACTION_LABELS,
  FAILURE_KIND_LABELS,
  MEMBERSHIP_STATUS_LABELS,
  MODERATION_STATUS_LABELS,
} from "../features/admin/admin-labels";
import { arMessages, createTranslator, labelFromKey } from "../i18n/catalog";
import { isStepUpRequiredError } from "../features/admin/admin-api";
import { ApiError } from "../lib/api-client";

const orgA = "11111111-1111-4111-8111-111111111111";
const membershipId = "33333333-3333-4333-8333-333333333333";
const listingId = "44444444-4444-4444-8444-444444444444";
const userId = "55555555-5555-4555-8555-555555555555";
const jobId = "66666666-6666-4666-8666-666666666666";
const ruleId = "77777777-7777-4777-8777-777777777777";
const actorId = "88888888-8888-4888-8888-888888888888";
const now = "2026-10-04T09:00:00.000Z";

test("EF-620 pending brokers normalize strictly and reject malformed payloads", () => {
  const page = normalizePendingBrokers({
    items: [
      {
        membershipId,
        organizationId: orgA,
        organizationName: "مكتب الرياض",
        userId,
        role: "BROKER",
        status: "PENDING",
        createdAt: now,
        approvedAt: null,
      },
    ],
    nextCursor: null,
  });
  assert.equal(page.items.length, 1);
  assert.equal(page.items[0].organizationName, "مكتب الرياض");
  assert.equal(page.nextCursor, null);

  for (const bad of [
    null,
    {},
    { items: "nope", nextCursor: null },
    {
      items: [
        {
          membershipId: "not-a-uuid",
          organizationId: orgA,
          organizationName: "x",
          userId,
          role: "BROKER",
          status: "PENDING",
          createdAt: now,
          approvedAt: null,
        },
      ],
      nextCursor: null,
    },
    {
      items: [
        {
          membershipId,
          organizationId: orgA,
          organizationName: "x",
          userId,
          role: "BROKER",
          status: "MAYBE",
          createdAt: now,
          approvedAt: null,
        },
      ],
      nextCursor: null,
    },
  ]) {
    assert.throws(() => normalizePendingBrokers(bad), TypeError);
  }
});

test("EF-620 moderation queue normalization keeps bounded projections only", () => {
  const page = normalizeModerationQueue({
    items: [
      {
        listingId,
        organizationId: orgA,
        propertyId: "99999999-9999-4999-8999-999999999999",
        propertyTitle: "فيلا النخيل",
        propertyType: "VILLA",
        listingStatus: "PUBLISHED",
        moderationStatus: "PENDING",
        moderationReason: null,
        moderatedAt: null,
        createdAt: now,
        updatedAt: now,
      },
    ],
    nextCursor: "cursor-token",
  });
  assert.equal(page.items[0].propertyTitle, "فيلا النخيل");
  assert.equal(page.nextCursor, "cursor-token");
  assert.doesNotThrow(() =>
    normalizeModerationQueue({ items: [], nextCursor: null }),
  );
  assert.throws(
    () =>
      normalizeModerationQueue({
        items: [
          {
            listingId,
            organizationId: orgA,
            propertyId: listingId,
            propertyTitle: "x",
            propertyType: "x",
            listingStatus: "PAUSED",
            moderationStatus: "PENDING",
            moderationReason: null,
            moderatedAt: null,
            createdAt: now,
            updatedAt: now,
          },
        ],
        nextCursor: null,
      }),
    TypeError,
  );
});

test("EF-620 audit page normalization validates actions and optional reasons", () => {
  for (const action of ADMIN_AUDIT_ACTIONS) {
    const page = normalizeAuditPage({
      items: [
        {
          id: actorId,
          action,
          organizationId: orgA,
          targetType: action.startsWith("LISTING") ? "LISTING" : "MEMBERSHIP",
          targetId: listingId,
          actorId,
          reason: action === "BROKER_APPROVED" ? null : "سبب مسجل",
          createdAt: now,
        },
      ],
      nextCursor: null,
    });
    assert.equal(page.items[0].action, action);
  }
  assert.throws(
    () =>
      normalizeAuditPage({
        items: [
          {
            id: actorId,
            action: "NOT_AN_ACTION",
            organizationId: orgA,
            targetType: "LISTING",
            targetId: listingId,
            actorId,
            reason: null,
            createdAt: now,
          },
        ],
        nextCursor: null,
      }),
    TypeError,
  );
});

test("EF-620 failed jobs normalization carries typed errors and bounded attempts", () => {
  const page = normalizeFailedJobs({
    items: [
      {
        id: jobId,
        organizationId: orgA,
        ruleId,
        ruleVersion: 2,
        actionType: "CREATE_LEAD_TASK",
        targetType: "LEAD",
        targetId: "lead-1",
        status: "FAILED",
        attemptCount: 3,
        maxAttempts: 5,
        lastError: {
          kind: "action-permanent-failure",
          message: "executor rejected",
        },
        scheduledFor: now,
        startedAt: now,
        completedAt: now,
        createdAt: now,
        updatedAt: now,
      },
    ],
    nextCursor: null,
  });
  assert.equal(page.items[0].lastError?.kind, "action-permanent-failure");
  // attemptCount > maxAttempts is rejected outright.
  assert.throws(
    () =>
      normalizeFailedJobs({
        items: [
          {
            id: jobId,
            organizationId: orgA,
            ruleId,
            ruleVersion: 1,
            actionType: "X",
            targetType: "LEAD",
            targetId: "lead-1",
            status: "FAILED",
            attemptCount: 9,
            maxAttempts: 5,
            lastError: null,
            scheduledFor: now,
            startedAt: null,
            completedAt: now,
            createdAt: now,
            updatedAt: now,
          },
        ],
        nextCursor: null,
      }),
    TypeError,
  );
});

test("EF-620 decision payloads normalize for command feedback", () => {
  const broker = normalizeBrokerDecision({
    membershipId,
    organizationId: orgA,
    userId,
    status: "SUSPENDED",
  });
  assert.equal(broker.status, "SUSPENDED");
  const moderation = normalizeModerationDecision({
    listingId,
    moderationStatus: "TAKEN_DOWN",
    listingStatus: "ARCHIVED",
  });
  assert.equal(moderation.moderationStatus, "TAKEN_DOWN");
  assert.throws(
    () =>
      normalizeModerationDecision({
        listingId,
        moderationStatus: "PENDING",
        listingStatus: "PUBLISHED",
      }),
    TypeError,
  );
});

test("EF-620 Arabic labels cover every audited action and typed failure kind", () => {
  const t = createTranslator("ar");
  for (const action of ADMIN_AUDIT_ACTIONS) {
    assert.equal(typeof AUDIT_ACTION_LABELS[action], "string");
    assert.ok(AUDIT_ACTION_LABELS[action].length > 0);
    // EF-630: every action key must resolve to written Arabic in the catalog.
    assert.match(arMessages[AUDIT_ACTION_LABELS[action]], /[\u0600-\u06FF]/);
  }
  assert.equal(
    labelFromKey(
      FAILURE_KIND_LABELS,
      t,
      "action-permanent-failure",
      "unknown-kind",
    ),
    "فشل دائم في التنفيذ",
  );
  assert.equal(
    labelFromKey(FAILURE_KIND_LABELS, t, "unknown-kind", "unknown-kind"),
    "unknown-kind",
  );
  assert.equal(
    labelFromKey(MEMBERSHIP_STATUS_LABELS, t, "PENDING", "PENDING"),
    "بانتظار الموافقة",
  );
  assert.equal(
    labelFromKey(MODERATION_STATUS_LABELS, t, "TAKEN_DOWN", "TAKEN_DOWN"),
    "خُفّض عن النشر",
  );
});

test("EF-620 keyset query serialization is explicit and bounded", () => {
  assert.equal(serializeAdminQuery({}), "");
  assert.equal(serializeAdminQuery({ limit: 25 }), "?limit=25");
  assert.equal(
    serializeAdminQuery({ cursor: "abc", limit: 25, organizationId: orgA }),
    `?cursor=abc&limit=25&organizationId=${orgA}`,
  );
  assert.equal(
    serializeAdminQuery({ action: "BROKER_SUSPENDED" }),
    "?action=BROKER_SUSPENDED",
  );
});

test("EF-620 step-up requirement detection keys on the typed 403", () => {
  assert.equal(
    isStepUpRequiredError({ name: "ApiError", status: 403 }),
    false,
    "plain objects are never treated as step-up prompts",
  );
  const stepUp = new ApiError({
    status: 403,
    code: "HTTP_ERROR",
    message: "STEP_UP_REQUIRED",
  });
  const forbidden = new ApiError({
    status: 403,
    code: "HTTP_ERROR",
    message: "x",
  });
  const badRequest = new ApiError({
    status: 400,
    code: "HTTP_ERROR",
    message: "x",
  });
  assert.equal(isStepUpRequiredError(stepUp), true);
  assert.equal(
    isStepUpRequiredError(forbidden),
    true,
    "403 always re-prompts for re-auth in the console",
  );
  assert.equal(isStepUpRequiredError(badRequest), false);
});
