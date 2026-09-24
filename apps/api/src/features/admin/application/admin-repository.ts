import type {
  AdminAction,
  AdminTargetType,
  KeysetPoint,
} from "../domain/admin-policy.js";

/**
 * EF-620 — bounded admin read/write port. Every list method is keyset-paginated
 * and returns at most `limit` rows plus an exclusive next-boundary cursor.
 * No method ever returns raw payloads or secret material.
 */

export type AdminBrokerRow = {
  membershipId: string;
  organizationId: string;
  organizationName: string;
  userId: string;
  role: "OWNER" | "MANAGER" | "BROKER" | "CLIENT";
  status: "PENDING" | "ACTIVE" | "SUSPENDED" | "REVOKED";
  createdAt: Date;
  approvedAt: Date | null;
};

export type AdminListingRow = {
  listingId: string;
  organizationId: string;
  propertyId: string;
  propertyTitle: string;
  propertyType: string;
  listingStatus: "DRAFT" | "PUBLISHED" | "ARCHIVED";
  moderationStatus: "PENDING" | "APPROVED" | "REJECTED" | "TAKEN_DOWN";
  moderationReason: string | null;
  moderatedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export type AdminAuditRow = {
  id: string;
  action: AdminAction;
  organizationId: string;
  targetType: AdminTargetType;
  targetId: string;
  actorId: string;
  reason: string | null;
  createdAt: Date;
};

export type AdminFailedJobRow = {
  id: string;
  organizationId: string;
  ruleId: string;
  ruleVersion: number;
  actionType: string;
  targetType: string;
  targetId: string;
  status: string;
  attemptCount: number;
  maxAttempts: number;
  lastErrorKind: string | null;
  lastErrorMessage: string | null;
  scheduledFor: Date;
  startedAt: Date | null;
  completedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export type KeysetPage<T> = {
  items: readonly T[];
  nextCursor: string | null;
};

export type SuspendBrokerInput = {
  organizationId: string;
  membershipId: string;
  reason: string;
  suspendedBy: string;
  now: Date;
};

export type ReinstateBrokerInput = {
  organizationId: string;
  membershipId: string;
  reason: string;
  reinstatedBy: string;
  now: Date;
};

export type ModerationTransitionInput = {
  organizationId: string;
  listingId: string;
  action: "APPROVED" | "REJECTED" | "TAKEN_DOWN";
  fromModerationStatus: readonly (
    "PENDING" | "APPROVED" | "REJECTED" | "TAKEN_DOWN"
  )[];
  reason: string | null;
  actorId: string;
  now: Date;
};

export type AdminAuditEventInput = {
  action: AdminAction;
  organizationId: string;
  targetType: AdminTargetType;
  targetId: string;
  actorId: string;
  reason: string | null;
  now: Date;
};

export type AuditSearchFilter = {
  action: AdminAction | null;
  organizationId: string | null;
  actorId: string | null;
};

export type StepUpEventInput = {
  userId: string;
  familyId: string;
  accessSessionId: string;
  outcome: "SUCCEEDED" | "DENIED";
  expiresAt: Date | null;
  now: Date;
};

export interface AdminRepository {
  // --- brokers ---------------------------------------------------------------
  listPendingBrokers(
    cursor: KeysetPoint | undefined,
    limit: number,
  ): Promise<KeysetPage<AdminBrokerRow>>;
  findMembership(
    organizationId: string,
    membershipId: string,
  ): Promise<{
    membershipId: string;
    organizationId: string;
    userId: string;
    role: string;
    status: string;
  } | null>;
  suspendBroker(
    input: SuspendBrokerInput,
  ): Promise<"suspended" | "not-found" | "conflict">;
  reinstateBroker(
    input: ReinstateBrokerInput,
  ): Promise<"reinstated" | "not-found" | "conflict">;

  // --- listing moderation ------------------------------------------------------
  listModerationQueue(
    cursor: KeysetPoint | undefined,
    limit: number,
  ): Promise<KeysetPage<AdminListingRow>>;
  findListingWithModeration(
    organizationId: string,
    listingId: string,
  ): Promise<AdminListingRow | null>;
  /** Transactional guarded transition + append-only event write. */
  applyListingModeration(
    input: ModerationTransitionInput,
  ): Promise<"applied" | "conflict">;

  // --- audit -----------------------------------------------------------------
  appendAuditEvent(event: AdminAuditEventInput): Promise<void>;
  searchAuditEvents(
    filter: AuditSearchFilter,
    cursor: KeysetPoint | undefined,
    limit: number,
  ): Promise<KeysetPage<AdminAuditRow>>;

  // --- failed automation jobs (EF-302 raw-SQL boundary preserved) -------------
  listFailedJobs(
    organizationId: string | null,
    cursor: KeysetPoint | undefined,
    limit: number,
  ): Promise<KeysetPage<AdminFailedJobRow>>;

  // --- step-up ----------------------------------------------------------------
  appendStepUpEvent(event: StepUpEventInput): Promise<void>;
  findActiveStepUp(
    userId: string,
    accessSessionId: string,
    now: Date,
  ): Promise<{ verifiedAt: Date; expiresAt: Date } | null>;
  countDeniedStepUps(userId: string, since: Date): Promise<number>;
}

/** Read-only credential access for the step-up password confirmation. */
export interface AdminCredentialReader {
  findPasswordHashByUserId(userId: string): Promise<string | null>;
}
