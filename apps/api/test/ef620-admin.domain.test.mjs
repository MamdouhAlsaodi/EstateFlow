import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import test from "node:test";
import {
  AdminAction,
  STEP_UP_DENY_LIMIT,
  STEP_UP_WINDOW_MS,
  decodeKeysetCursor,
  encodeKeysetCursor,
  isPlatformAdminActor,
  isStepUpProofActive,
  normalizeOptionalReason,
  normalizePageLimit,
  requiresStepUp,
  requireReason,
  stepUpExpiresAt,
} from "../dist/features/admin/domain/admin-policy.js";
import {
  AdminForbiddenError,
  AdminStepUpRequiredError,
  AdminValidationError,
} from "../dist/features/admin/domain/admin-errors.js";
import { PlatformRole } from "../dist/features/organizations/domain/organization-access.js";

const uuid = (n) => {
  const h = (n % 16).toString(16);
  return `${h.repeat(8)}-${h.repeat(4)}-4${h.repeat(3)}-8${h.repeat(3)}-${h.repeat(12)}`;
};

test("EF-620 only the existing PLATFORM_ADMIN role carries admin authority", () => {
  assert.equal(
    isPlatformAdminActor({
      userId: uuid(1),
      verified: true,
      platformRole: PlatformRole.PLATFORM_ADMIN,
    }),
    true,
  );
  for (const actor of [
    { userId: uuid(1), verified: true, platformRole: PlatformRole.NONE },
    {
      userId: uuid(1),
      verified: false,
      platformRole: PlatformRole.PLATFORM_ADMIN,
    },
    null,
  ]) {
    assert.equal(isPlatformAdminActor(actor), false);
  }
});

test("EF-620 only suspend broker and listing takedown demand step-up re-auth", () => {
  assert.equal(requiresStepUp(AdminAction.BROKER_SUSPENDED), true);
  assert.equal(requiresStepUp(AdminAction.LISTING_MODERATION_TAKEN_DOWN), true);
  for (const action of [
    AdminAction.BROKER_APPROVED,
    AdminAction.BROKER_REINSTATED,
    AdminAction.LISTING_MODERATION_APPROVED,
    AdminAction.LISTING_MODERATION_REJECTED,
  ]) {
    assert.equal(requiresStepUp(action), false, action);
  }
});

test("EF-620 mandatory reason rejects whitespace-only and oversized values", () => {
  assert.equal(requireReason("  سبب مشروع  "), "سبب مشروع");
  assert.throws(() => requireReason("   "), AdminValidationError);
  assert.throws(() => requireReason(undefined), AdminValidationError);
  assert.throws(() => requireReason("a".repeat(501)), AdminValidationError);
  assert.throws(() => requireReason(42), AdminValidationError);
});

test("EF-620 optional reason collapses to null and stays bounded", () => {
  assert.equal(normalizeOptionalReason(undefined), null);
  assert.equal(normalizeOptionalReason("   "), null);
  assert.equal(normalizeOptionalReason("مخالفة الشروط"), "مخالفة الشروط");
  assert.throws(
    () => normalizeOptionalReason("a".repeat(501)),
    AdminValidationError,
  );
});

test("EF-620 step-up proof expires exactly after the policy window", () => {
  const now = new Date("2026-10-04T09:00:00.000Z");
  const expiresAt = stepUpExpiresAt(now);
  assert.equal(expiresAt.getTime(), now.getTime() + STEP_UP_WINDOW_MS);
  assert.equal(
    isStepUpProofActive(
      { verifiedAt: now, expiresAt },
      new Date(now.getTime() + STEP_UP_WINDOW_MS - 1),
    ),
    true,
  );
  assert.equal(
    isStepUpProofActive(
      { verifiedAt: now, expiresAt },
      new Date(now.getTime() + STEP_UP_WINDOW_MS),
    ),
    false,
  );
  assert.equal(
    isStepUpProofActive(
      { verifiedAt: now, expiresAt },
      new Date(now.getTime() - 1),
    ),
    false,
  );
  assert.equal(isStepUpProofActive(null, now), false);
  assert.ok(STEP_UP_DENY_LIMIT >= 1);
});

test("EF-620 keyset cursors round-trip and reject tampered values", () => {
  const point = { at: new Date("2026-10-04T08:30:00.000Z"), id: uuid(7) };
  const cursor = encodeKeysetCursor(point);
  const decoded = decodeKeysetCursor(cursor);
  assert.deepEqual(decoded, point);
  for (const bad of [
    "not-a-cursor",
    Buffer.from('{"at":"nope","id":"x"}').toString("base64url"),
    Buffer.from(
      JSON.stringify({ at: new Date().toISOString(), id: "nope" }),
    ).toString("base64url"),
    "",
    "a".repeat(600),
    42,
  ]) {
    assert.throws(
      () => decodeKeysetCursor(bad),
      AdminValidationError,
      String(bad).slice(0, 20),
    );
  }
});

test("EF-620 page limits are bounded", () => {
  assert.equal(normalizePageLimit(undefined), 50);
  assert.equal(normalizePageLimit(1), 1);
  assert.equal(normalizePageLimit(100), 100);
  for (const bad of [0, -1, 101, 1.5, "50", NaN]) {
    assert.throws(() => normalizePageLimit(bad), AdminValidationError);
  }
});

test("EF-620 admin errors carry stable codes for the UI", () => {
  assert.equal(new AdminForbiddenError().code, "ADMIN_FORBIDDEN");
  assert.equal(new AdminStepUpRequiredError().code, "STEP_UP_REQUIRED");
});
