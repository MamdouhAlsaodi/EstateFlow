import { PlatformRole } from "../../organizations/domain/organization-access.js";
import { AdminValidationError } from "./admin-errors.js";

/**
 * EF-620 — platform-admin policy. The ADMIN authority is the existing
 * `PLATFORM_ADMIN` platform role from EF-121 (no new roles); organization
 * Owner/Manager authority never grants admin surface access.
 */

export type AdminActor = {
  userId: string;
  verified: boolean;
  platformRole: PlatformRole;
};

/** A session principal enriched with the access-session binding used by
 * step-up proofs (mirrors `SessionPrincipal`). */
export type AdminPrincipal = AdminActor & {
  accessSessionId: string;
  familyId: string;
};

export const AdminAction = {
  BROKER_APPROVED: "BROKER_APPROVED",
  BROKER_SUSPENDED: "BROKER_SUSPENDED",
  BROKER_REINSTATED: "BROKER_REINSTATED",
  LISTING_MODERATION_APPROVED: "LISTING_MODERATION_APPROVED",
  LISTING_MODERATION_REJECTED: "LISTING_MODERATION_REJECTED",
  LISTING_MODERATION_TAKEN_DOWN: "LISTING_MODERATION_TAKEN_DOWN",
} as const;
export type AdminAction = (typeof AdminAction)[keyof typeof AdminAction];

export const ADMIN_SEARCHABLE_ACTIONS: readonly AdminAction[] = [
  AdminAction.BROKER_APPROVED,
  AdminAction.BROKER_SUSPENDED,
  AdminAction.BROKER_REINSTATED,
  AdminAction.LISTING_MODERATION_APPROVED,
  AdminAction.LISTING_MODERATION_REJECTED,
  AdminAction.LISTING_MODERATION_TAKEN_DOWN,
];

export const AdminTargetType = {
  MEMBERSHIP: "MEMBERSHIP",
  LISTING: "LISTING",
} as const;
export type AdminTargetType =
  (typeof AdminTargetType)[keyof typeof AdminTargetType];

/**
 * Sensitive/destructive privileged actions demand a fresh password
 * re-confirmation (step-up) in addition to the mandatory reason.
 */
const STEP_UP_REQUIRED_ACTIONS: ReadonlySet<string> = new Set([
  "BROKER_SUSPENDED",
  "LISTING_MODERATION_TAKEN_DOWN",
]);

export function requiresStepUp(action: AdminAction): boolean {
  return STEP_UP_REQUIRED_ACTIONS.has(action);
}

export function requirePlatformAdminActor(actor: AdminActor): void {
  if (!actor?.verified || actor.platformRole !== PlatformRole.PLATFORM_ADMIN) {
    throw new AdminValidationError("Actor must be a platform admin");
  }
}

export function isPlatformAdminActor(actor: AdminActor): boolean {
  return Boolean(
    actor?.verified && actor.platformRole === PlatformRole.PLATFORM_ADMIN,
  );
}

export const MAX_REASON_LENGTH = 500;

/** Optional reason: trimmed, bounded, empty collapses to null. */
export function normalizeOptionalReason(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string") {
    throw new AdminValidationError("Reason must be text");
  }
  const trimmed = value.trim();
  if (trimmed.length === 0) return null;
  if (trimmed.length > MAX_REASON_LENGTH) {
    throw new AdminValidationError("Reason is too long");
  }
  return trimmed;
}

/** Mandatory reason for every sensitive or corrective privileged action. */
export function requireReason(value: unknown): string {
  const reason = normalizeOptionalReason(value);
  if (!reason) throw new AdminValidationError("A reason is required");
  return reason;
}

// --- Step-up re-auth policy -------------------------------------------------

/** A step-up proof is valid for ten minutes after the password confirmation. */
export const STEP_UP_WINDOW_MS = 10 * 60 * 1000;
/** Abuse-control window for failed confirmations. */
export const STEP_UP_DENY_WINDOW_MS = 15 * 60 * 1000;
/** Maximum failed confirmations per user inside the deny window. */
export const STEP_UP_DENY_LIMIT = 5;

export type StepUpProof = {
  verifiedAt: Date;
  expiresAt: Date;
};

export function stepUpExpiresAt(verifiedAt: Date): Date {
  return new Date(verifiedAt.getTime() + STEP_UP_WINDOW_MS);
}

export function isStepUpProofActive(
  proof: StepUpProof | null,
  now: Date,
): boolean {
  return (
    proof !== null &&
    proof.expiresAt.getTime() > now.getTime() &&
    proof.verifiedAt.getTime() <= now.getTime()
  );
}

// --- Keyset pagination -------------------------------------------------------

export type KeysetPoint = { at: Date; id: string };

export const ADMIN_PAGE_LIMIT_DEFAULT = 50;
export const ADMIN_PAGE_LIMIT_BOUND = 100;

export function normalizePageLimit(limit: unknown): number {
  if (limit === undefined || limit === null) return ADMIN_PAGE_LIMIT_DEFAULT;
  if (typeof limit !== "number" || !Number.isSafeInteger(limit)) {
    throw new AdminValidationError("Invalid limit");
  }
  if (limit < 1 || limit > ADMIN_PAGE_LIMIT_BOUND) {
    throw new AdminValidationError("Invalid limit");
  }
  return limit;
}

const CANONICAL_UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Opaque keyset cursor: base64url JSON of { at: ISO timestamp, id: UUID }.
 * Direction (ascending queue / descending history) belongs to each query;
 * the cursor only carries the exclusive boundary point.
 */
export function encodeKeysetCursor(point: KeysetPoint): string {
  return Buffer.from(
    JSON.stringify({ at: point.at.toISOString(), id: point.id }),
    "utf8",
  ).toString("base64url");
}

export function decodeKeysetCursor(cursor: unknown): KeysetPoint {
  if (
    typeof cursor !== "string" ||
    cursor.length === 0 ||
    cursor.length > 512
  ) {
    throw new AdminValidationError("Invalid cursor");
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8"));
  } catch {
    throw new AdminValidationError("Invalid cursor");
  }
  if (
    typeof parsed !== "object" ||
    parsed === null ||
    !("at" in parsed) ||
    !("id" in parsed)
  ) {
    throw new AdminValidationError("Invalid cursor");
  }
  const { at, id } = parsed as { at: unknown; id: unknown };
  if (typeof at !== "string" || typeof id !== "string") {
    throw new AdminValidationError("Invalid cursor");
  }
  const timestamp = new Date(at);
  if (Number.isNaN(timestamp.getTime()) || !CANONICAL_UUID.test(id)) {
    throw new AdminValidationError("Invalid cursor");
  }
  return { at: timestamp, id };
}
