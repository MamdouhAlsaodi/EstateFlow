import type {
  AdminCredentialReader,
  AdminRepository,
} from "./admin-repository.js";
import type { PasswordHasher } from "../../auth/domain/password-hasher.js";
import type { ApproveBrokerMembership } from "../../organizations/application/approve-broker-membership.js";
import {
  OrganizationConflictError,
  OrganizationForbiddenError,
  OrganizationNotFoundError,
} from "../../organizations/domain/organization-errors.js";
import {
  AdminAction,
  ADMIN_SEARCHABLE_ACTIONS,
  STEP_UP_DENY_LIMIT,
  STEP_UP_DENY_WINDOW_MS,
  decodeKeysetCursor,
  encodeKeysetCursor,
  isPlatformAdminActor,
  isStepUpProofActive,
  normalizeOptionalReason,
  normalizePageLimit,
  requireReason,
  stepUpExpiresAt,
  type AdminActor,
  type AdminPrincipal,
  type KeysetPoint,
} from "../domain/admin-policy.js";
import {
  AdminConflictError,
  AdminForbiddenError,
  AdminNotFoundError,
  AdminStepUpDeniedError,
  AdminStepUpRequiredError,
  AdminValidationError,
} from "../domain/admin-errors.js";
import type {
  AdminAuditRow,
  AdminBrokerRow,
  AdminFailedJobRow,
  AdminListingRow,
  KeysetPage,
} from "./admin-repository.js";

/**
 * EF-620 — platform-admin application. Every command first demands the
 * existing PLATFORM_ADMIN authority (EF-121 role; no new roles). Sensitive
 * actions (suspend broker, listing takedown) additionally require a mandatory
 * reason and a fresh step-up password re-confirmation bound to the current
 * access session. Every accepted transition is written to the append-only
 * admin audit trail. Reads are bounded keyset pages and never expose raw
 * payloads or secrets.
 */

export type BrokerDecisionResult = {
  membershipId: string;
  organizationId: string;
  userId: string;
  status: string;
};

/** A full page emits the exclusive boundary of its last row as next cursor. */
function keysetPage<T>(
  items: readonly T[],
  limit: number,
  pointOf: (item: T) => KeysetPoint,
): KeysetPage<T> {
  if (items.length < limit) return { items, nextCursor: null };
  return {
    items,
    nextCursor: encodeKeysetCursor(pointOf(items[items.length - 1])),
  };
}

function requireAdmin(actor: AdminActor): void {
  if (!isPlatformAdminActor(actor)) throw new AdminForbiddenError();
}

export class AdminApplication {
  constructor(
    private readonly repository: AdminRepository,
    private readonly credentials: AdminCredentialReader,
    private readonly passwordHasher: PasswordHasher,
    private readonly approveBrokerMembership: ApproveBrokerMembership,
  ) {}

  // --- step-up re-authentication ---------------------------------------------

  async stepUp(input: {
    actor: AdminPrincipal;
    password: unknown;
    now: Date;
  }): Promise<{ verifiedAt: Date; expiresAt: Date }> {
    requireAdmin(input.actor);
    if (
      typeof input.password !== "string" ||
      input.password.length === 0 ||
      input.password.length > 200
    ) {
      throw new AdminValidationError("Password re-confirmation is required");
    }
    const deniedCount = await this.repository.countDeniedStepUps(
      input.actor.userId,
      new Date(input.now.getTime() - STEP_UP_DENY_WINDOW_MS),
    );
    if (deniedCount >= STEP_UP_DENY_LIMIT) {
      await this.repository.appendStepUpEvent({
        userId: input.actor.userId,
        familyId: input.actor.familyId,
        accessSessionId: input.actor.accessSessionId,
        outcome: "DENIED",
        expiresAt: null,
        now: input.now,
      });
      throw new AdminStepUpDeniedError();
    }
    const passwordHash = await this.credentials.findPasswordHashByUserId(
      input.actor.userId,
    );
    const verified =
      passwordHash !== null &&
      (await this.passwordHasher.verify(input.password, passwordHash));
    const expiresAt = stepUpExpiresAt(input.now);
    await this.repository.appendStepUpEvent({
      userId: input.actor.userId,
      familyId: input.actor.familyId,
      accessSessionId: input.actor.accessSessionId,
      outcome: verified ? "SUCCEEDED" : "DENIED",
      expiresAt: verified ? expiresAt : null,
      now: input.now,
    });
    if (!verified) throw new AdminValidationError("Password does not match");
    return { verifiedAt: input.now, expiresAt };
  }

  private async requireFreshStepUp(
    actor: AdminPrincipal,
    now: Date,
  ): Promise<void> {
    const proof = await this.repository.findActiveStepUp(
      actor.userId,
      actor.accessSessionId,
      now,
    );
    if (!isStepUpProofActive(proof, now)) throw new AdminStepUpRequiredError();
  }

  // --- brokers ----------------------------------------------------------------

  async listPendingBrokers(input: {
    actor: AdminActor;
    cursor?: unknown;
    limit?: unknown;
  }): Promise<KeysetPage<AdminBrokerRow>> {
    requireAdmin(input.actor);
    const cursor = decodeOptionalCursor(input.cursor);
    const limit = normalizePageLimit(input.limit);
    const page = await this.repository.listPendingBrokers(cursor, limit);
    return keysetPage(page.items, limit, (row) => ({
      at: row.createdAt,
      id: row.membershipId,
    }));
  }

  async approveBroker(input: {
    actor: AdminPrincipal;
    organizationId: string;
    membershipId: string;
    reason?: unknown;
    now: Date;
  }): Promise<BrokerDecisionResult> {
    requireAdmin(input.actor);
    const reason = normalizeOptionalReason(input.reason);
    try {
      const membership = await this.approveBrokerMembership.execute(
        {
          userId: input.actor.userId,
          verified: input.actor.verified,
          platformRole: input.actor.platformRole,
        },
        {
          organizationId: input.organizationId,
          membershipId: input.membershipId,
        },
      );
      await this.repository.appendAuditEvent({
        action: AdminAction.BROKER_APPROVED,
        organizationId: membership.organizationId,
        targetType: "MEMBERSHIP",
        targetId: membership.id,
        actorId: input.actor.userId,
        reason,
        now: input.now,
      });
      return {
        membershipId: membership.id,
        organizationId: membership.organizationId,
        userId: membership.userId,
        status: membership.status,
      };
    } catch (error) {
      if (error instanceof OrganizationForbiddenError)
        throw new AdminForbiddenError();
      if (error instanceof OrganizationNotFoundError)
        throw new AdminNotFoundError();
      if (error instanceof OrganizationConflictError)
        throw new AdminConflictError();
      throw error;
    }
  }

  async suspendBroker(input: {
    actor: AdminPrincipal;
    organizationId: string;
    membershipId: string;
    reason: unknown;
    now: Date;
  }): Promise<BrokerDecisionResult> {
    requireAdmin(input.actor);
    const reason = requireReason(input.reason);
    await this.requireFreshStepUp(input.actor, input.now);
    const membership = await this.repository.findMembership(
      input.organizationId,
      input.membershipId,
    );
    if (!membership) throw new AdminNotFoundError();
    const outcome = await this.repository.suspendBroker({
      organizationId: input.organizationId,
      membershipId: input.membershipId,
      reason,
      suspendedBy: input.actor.userId,
      now: input.now,
    });
    if (outcome === "not-found") throw new AdminNotFoundError();
    if (outcome === "conflict") throw new AdminConflictError();
    await this.repository.appendAuditEvent({
      action: AdminAction.BROKER_SUSPENDED,
      organizationId: input.organizationId,
      targetType: "MEMBERSHIP",
      targetId: input.membershipId,
      actorId: input.actor.userId,
      reason,
      now: input.now,
    });
    return {
      membershipId: input.membershipId,
      organizationId: input.organizationId,
      userId: membership.userId,
      status: "SUSPENDED",
    };
  }

  async reinstateBroker(input: {
    actor: AdminPrincipal;
    organizationId: string;
    membershipId: string;
    reason: unknown;
    now: Date;
  }): Promise<BrokerDecisionResult> {
    requireAdmin(input.actor);
    const reason = requireReason(input.reason);
    const membership = await this.repository.findMembership(
      input.organizationId,
      input.membershipId,
    );
    if (!membership) throw new AdminNotFoundError();
    const outcome = await this.repository.reinstateBroker({
      organizationId: input.organizationId,
      membershipId: input.membershipId,
      reason,
      reinstatedBy: input.actor.userId,
      now: input.now,
    });
    if (outcome === "not-found") throw new AdminNotFoundError();
    if (outcome === "conflict") throw new AdminConflictError();
    await this.repository.appendAuditEvent({
      action: AdminAction.BROKER_REINSTATED,
      organizationId: input.organizationId,
      targetType: "MEMBERSHIP",
      targetId: input.membershipId,
      actorId: input.actor.userId,
      reason,
      now: input.now,
    });
    return {
      membershipId: input.membershipId,
      organizationId: input.organizationId,
      userId: membership.userId,
      status: "ACTIVE",
    };
  }

  // --- listing moderation -------------------------------------------------------

  async moderationQueue(input: {
    actor: AdminActor;
    cursor?: unknown;
    limit?: unknown;
  }): Promise<KeysetPage<AdminListingRow>> {
    requireAdmin(input.actor);
    const cursor = decodeOptionalCursor(input.cursor);
    const limit = normalizePageLimit(input.limit);
    const page = await this.repository.listModerationQueue(cursor, limit);
    return keysetPage(page.items, limit, (row) => ({
      at: row.createdAt,
      id: row.listingId,
    }));
  }

  private async moderateListing(input: {
    actor: AdminPrincipal;
    organizationId: string;
    listingId: string;
    action: "APPROVED" | "REJECTED" | "TAKEN_DOWN";
    reason?: unknown;
    mandatoryReason: boolean;
    now: Date;
  }): Promise<{
    listingId: string;
    moderationStatus: string;
    listingStatus: string;
  }> {
    requireAdmin(input.actor);
    const reason = input.mandatoryReason
      ? requireReason(input.reason)
      : normalizeOptionalReason(input.reason);
    const from =
      input.action === "APPROVED"
        ? (["PENDING"] as const)
        : input.action === "REJECTED"
          ? (["PENDING"] as const)
          : (["PENDING", "APPROVED"] as const);
    const outcome = await this.repository.applyListingModeration({
      organizationId: input.organizationId,
      listingId: input.listingId,
      action: input.action,
      fromModerationStatus: from,
      reason,
      actorId: input.actor.userId,
      now: input.now,
    });
    if (outcome === "conflict") throw new AdminConflictError();
    const auditAction =
      input.action === "APPROVED"
        ? AdminAction.LISTING_MODERATION_APPROVED
        : input.action === "REJECTED"
          ? AdminAction.LISTING_MODERATION_REJECTED
          : AdminAction.LISTING_MODERATION_TAKEN_DOWN;
    await this.repository.appendAuditEvent({
      action: auditAction,
      organizationId: input.organizationId,
      targetType: "LISTING",
      targetId: input.listingId,
      actorId: input.actor.userId,
      reason,
      now: input.now,
    });
    return {
      listingId: input.listingId,
      moderationStatus:
        input.action === "APPROVED"
          ? "APPROVED"
          : input.action === "REJECTED"
            ? "REJECTED"
            : "TAKEN_DOWN",
      listingStatus: input.action === "APPROVED" ? "PUBLISHED" : "ARCHIVED",
    };
  }

  async approveListing(input: {
    actor: AdminPrincipal;
    organizationId: string;
    listingId: string;
    reason?: unknown;
    now: Date;
  }) {
    return this.moderateListing({
      ...input,
      action: "APPROVED",
      mandatoryReason: false,
    });
  }

  async rejectListing(input: {
    actor: AdminPrincipal;
    organizationId: string;
    listingId: string;
    reason: unknown;
    now: Date;
  }) {
    return this.moderateListing({
      ...input,
      action: "REJECTED",
      mandatoryReason: true,
    });
  }

  async takedownListing(input: {
    actor: AdminPrincipal;
    organizationId: string;
    listingId: string;
    reason: unknown;
    now: Date;
  }) {
    await this.requireFreshStepUp(input.actor, input.now);
    return this.moderateListing({
      ...input,
      action: "TAKEN_DOWN",
      mandatoryReason: true,
    });
  }

  // --- audit search -------------------------------------------------------------

  async searchAudit(input: {
    actor: AdminActor;
    action?: unknown;
    organizationId?: unknown;
    actorId?: unknown;
    cursor?: unknown;
    limit?: unknown;
  }): Promise<KeysetPage<AdminAuditRow>> {
    requireAdmin(input.actor);
    const action = normalizeAuditActionFilter(input.action);
    const organizationId = normalizeUuidFilter(
      input.organizationId,
      "organizationId",
    );
    const actorId = normalizeUuidFilter(input.actorId, "actorId");
    const cursor = decodeOptionalCursor(input.cursor);
    const limit = normalizePageLimit(input.limit);
    const page = await this.repository.searchAuditEvents(
      { action, organizationId, actorId },
      cursor,
      limit,
    );
    return keysetPage(page.items, limit, (row) => ({
      at: row.createdAt,
      id: row.id,
    }));
  }

  // --- failed automation jobs ------------------------------------------------------

  async failedJobs(input: {
    actor: AdminActor;
    organizationId?: unknown;
    cursor?: unknown;
    limit?: unknown;
  }): Promise<KeysetPage<AdminFailedJobRow>> {
    requireAdmin(input.actor);
    const organizationId = normalizeUuidFilter(
      input.organizationId,
      "organizationId",
    );
    const cursor = decodeOptionalCursor(input.cursor);
    const limit = normalizePageLimit(input.limit);
    const page = await this.repository.listFailedJobs(
      organizationId,
      cursor,
      limit,
    );
    return keysetPage(page.items, limit, (row) => ({
      at: row.createdAt,
      id: row.id,
    }));
  }
}

function decodeOptionalCursor(cursor: unknown): KeysetPoint | undefined {
  if (cursor === undefined || cursor === null) return undefined;
  return decodeKeysetCursor(cursor);
}

const AUDIT_ACTION_FILTERS: ReadonlySet<string> = new Set([
  ...ADMIN_SEARCHABLE_ACTIONS,
]);

function normalizeAuditActionFilter(value: unknown) {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string" || !AUDIT_ACTION_FILTERS.has(value)) {
    throw new AdminValidationError("Invalid action filter");
  }
  return value as (typeof ADMIN_SEARCHABLE_ACTIONS)[number];
}

function normalizeUuidFilter(value: unknown, name: string): string | null {
  if (value === undefined || value === null) return null;
  if (
    typeof value !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value,
    )
  ) {
    throw new AdminValidationError(`Invalid ${name} filter`);
  }
  return value;
}
