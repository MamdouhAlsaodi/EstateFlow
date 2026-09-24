/**
 * EF-620 — typed admin console contract. Every payload is strictly
 * normalized before it reaches the UI: bounded identity/state projections
 * only — never account identifiers, password material, execution keys, or
 * raw action/provider payloads.
 */

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const ISO_INSTANT =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,6})?(Z|\+\d{2}:\d{2})$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requireUuid(name: string, value: unknown): string {
  if (typeof value !== "string" || !UUID.test(value))
    throw new TypeError(`Invalid ${name}`);
  return value;
}

function requireInstant(name: string, value: unknown): string {
  if (typeof value !== "string" || !ISO_INSTANT.test(value))
    throw new TypeError(`Invalid ${name}`);
  return value;
}

function requireText(name: string, value: unknown): string {
  if (typeof value !== "string") throw new TypeError(`Invalid ${name}`);
  return value;
}

function optionalText(name: string, value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== "string") throw new TypeError(`Invalid ${name}`);
  return value;
}

function requireCount(name: string, value: unknown): number {
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value < 0 ||
    value > 1_000_000
  )
    throw new TypeError(`Invalid ${name}`);
  return value;
}

// --- pending brokers ---------------------------------------------------------

export type PendingBroker = Readonly<{
  membershipId: string;
  organizationId: string;
  organizationName: string;
  userId: string;
  role: string;
  status: "PENDING" | "ACTIVE" | "SUSPENDED" | "REVOKED";
  createdAt: string;
  approvedAt: string | null;
}>;

export type PendingBrokersPage = Readonly<{
  items: readonly PendingBroker[];
  nextCursor: string | null;
}>;

function normalizePendingBroker(value: unknown): PendingBroker {
  if (!isRecord(value)) throw new TypeError("Invalid broker payload");
  const status = value.status;
  if (
    status !== "PENDING" &&
    status !== "ACTIVE" &&
    status !== "SUSPENDED" &&
    status !== "REVOKED"
  )
    throw new TypeError("Invalid membership status");
  return {
    membershipId: requireUuid("membership id", value.membershipId),
    organizationId: requireUuid("organization id", value.organizationId),
    organizationName: requireText("organization name", value.organizationName),
    userId: requireUuid("user id", value.userId),
    role: requireText("role", value.role),
    status,
    createdAt: requireInstant("broker createdAt", value.createdAt),
    approvedAt:
      value.approvedAt === null
        ? null
        : requireInstant("broker approvedAt", value.approvedAt),
  };
}

export function normalizePendingBrokers(value: unknown): PendingBrokersPage {
  if (!isRecord(value) || !Array.isArray(value.items))
    throw new TypeError("Invalid pending brokers payload");
  const nextCursor =
    value.nextCursor === null || value.nextCursor === undefined
      ? null
      : requireText("next cursor", value.nextCursor);
  return {
    items: value.items.map(normalizePendingBroker),
    nextCursor,
  };
}

// --- listing moderation queue -------------------------------------------------

export type ModerationStatus =
  "PENDING" | "APPROVED" | "REJECTED" | "TAKEN_DOWN";

export type ModerationItem = Readonly<{
  listingId: string;
  organizationId: string;
  propertyId: string;
  propertyTitle: string;
  propertyType: string;
  listingStatus: "DRAFT" | "PUBLISHED" | "ARCHIVED";
  moderationStatus: ModerationStatus;
  moderationReason: string | null;
  moderatedAt: string | null;
  createdAt: string;
  updatedAt: string;
}>;

export type ModerationQueuePage = Readonly<{
  items: readonly ModerationItem[];
  nextCursor: string | null;
}>;

function normalizeModerationItem(value: unknown): ModerationItem {
  if (!isRecord(value)) throw new TypeError("Invalid moderation item payload");
  const listingStatus = value.listingStatus;
  if (
    listingStatus !== "DRAFT" &&
    listingStatus !== "PUBLISHED" &&
    listingStatus !== "ARCHIVED"
  )
    throw new TypeError("Invalid listing status");
  const moderationStatus = value.moderationStatus;
  if (
    moderationStatus !== "PENDING" &&
    moderationStatus !== "APPROVED" &&
    moderationStatus !== "REJECTED" &&
    moderationStatus !== "TAKEN_DOWN"
  )
    throw new TypeError("Invalid moderation status");
  return {
    listingId: requireUuid("listing id", value.listingId),
    organizationId: requireUuid("organization id", value.organizationId),
    propertyId: requireUuid("property id", value.propertyId),
    propertyTitle: requireText("property title", value.propertyTitle),
    propertyType: requireText("property type", value.propertyType),
    listingStatus,
    moderationStatus,
    moderationReason: optionalText("moderation reason", value.moderationReason),
    moderatedAt:
      value.moderatedAt === null
        ? null
        : requireInstant("moderatedAt", value.moderatedAt),
    createdAt: requireInstant("listing createdAt", value.createdAt),
    updatedAt: requireInstant("listing updatedAt", value.updatedAt),
  };
}

export function normalizeModerationQueue(value: unknown): ModerationQueuePage {
  if (!isRecord(value) || !Array.isArray(value.items))
    throw new TypeError("Invalid moderation queue payload");
  const nextCursor =
    value.nextCursor === null || value.nextCursor === undefined
      ? null
      : requireText("next cursor", value.nextCursor);
  return {
    items: value.items.map(normalizeModerationItem),
    nextCursor,
  };
}

// --- audit events ---------------------------------------------------------------

export const ADMIN_AUDIT_ACTIONS = [
  "BROKER_APPROVED",
  "BROKER_SUSPENDED",
  "BROKER_REINSTATED",
  "LISTING_MODERATION_APPROVED",
  "LISTING_MODERATION_REJECTED",
  "LISTING_MODERATION_TAKEN_DOWN",
] as const;
export type AdminAuditAction = (typeof ADMIN_AUDIT_ACTIONS)[number];

export type AdminAuditEvent = Readonly<{
  id: string;
  action: AdminAuditAction;
  organizationId: string;
  targetType: "MEMBERSHIP" | "LISTING";
  targetId: string;
  actorId: string;
  reason: string | null;
  createdAt: string;
}>;

export type AdminAuditPage = Readonly<{
  items: readonly AdminAuditEvent[];
  nextCursor: string | null;
}>;

function normalizeAuditAction(value: unknown): AdminAuditAction {
  for (const action of ADMIN_AUDIT_ACTIONS) {
    if (action === value) return action;
  }
  throw new TypeError("Invalid audit action");
}

function normalizeAuditEvent(value: unknown): AdminAuditEvent {
  if (!isRecord(value)) throw new TypeError("Invalid audit event payload");
  const targetType = value.targetType;
  if (targetType !== "MEMBERSHIP" && targetType !== "LISTING")
    throw new TypeError("Invalid audit target type");
  return {
    id: requireUuid("audit id", value.id),
    action: normalizeAuditAction(value.action),
    organizationId: requireUuid("audit organization id", value.organizationId),
    targetType,
    targetId: requireText("audit target id", value.targetId),
    actorId: requireUuid("audit actor id", value.actorId),
    reason: optionalText("audit reason", value.reason),
    createdAt: requireInstant("audit createdAt", value.createdAt),
  };
}

export function normalizeAuditPage(value: unknown): AdminAuditPage {
  if (!isRecord(value) || !Array.isArray(value.items))
    throw new TypeError("Invalid audit page payload");
  const nextCursor =
    value.nextCursor === null || value.nextCursor === undefined
      ? null
      : requireText("next cursor", value.nextCursor);
  return {
    items: value.items.map(normalizeAuditEvent),
    nextCursor,
  };
}

// --- failed automation jobs --------------------------------------------------------

export type AdminFailedJob = Readonly<{
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
  lastError: { kind: string; message: string } | null;
  scheduledFor: string;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}>;

export type AdminFailedJobsPage = Readonly<{
  items: readonly AdminFailedJob[];
  nextCursor: string | null;
}>;

function normalizeFailedJob(value: unknown): AdminFailedJob {
  if (!isRecord(value)) throw new TypeError("Invalid failed job payload");
  const attemptCount = requireCount("attempt count", value.attemptCount);
  const maxAttempts = requireCount("max attempts", value.maxAttempts);
  if (attemptCount > maxAttempts)
    throw new TypeError("Invalid attempt bookkeeping");
  let lastError: { kind: string; message: string } | null = null;
  if (value.lastError !== null && value.lastError !== undefined) {
    if (!isRecord(value.lastError)) throw new TypeError("Invalid last error");
    lastError = {
      kind: requireText("error kind", value.lastError.kind),
      message: requireText("error message", value.lastError.message),
    };
  }
  return {
    id: requireUuid("job id", value.id),
    organizationId: requireUuid("job organization id", value.organizationId),
    ruleId: requireUuid("job rule id", value.ruleId),
    ruleVersion: requireCount("job rule version", value.ruleVersion),
    actionType: requireText("job action type", value.actionType),
    targetType: requireText("job target type", value.targetType),
    targetId: requireText("job target id", value.targetId),
    status: requireText("job status", value.status),
    attemptCount,
    maxAttempts,
    lastError,
    scheduledFor: requireInstant("job scheduledFor", value.scheduledFor),
    startedAt:
      value.startedAt === null
        ? null
        : requireInstant("job startedAt", value.startedAt),
    completedAt:
      value.completedAt === null
        ? null
        : requireInstant("job completedAt", value.completedAt),
    createdAt: requireInstant("job createdAt", value.createdAt),
    updatedAt: requireInstant("job updatedAt", value.updatedAt),
  };
}

export function normalizeFailedJobs(value: unknown): AdminFailedJobsPage {
  if (!isRecord(value) || !Array.isArray(value.items))
    throw new TypeError("Invalid failed jobs payload");
  const nextCursor =
    value.nextCursor === null || value.nextCursor === undefined
      ? null
      : requireText("next cursor", value.nextCursor);
  return {
    items: value.items.map(normalizeFailedJob),
    nextCursor,
  };
}

// --- command results -------------------------------------------------------------

export type BrokerDecision = Readonly<{
  membershipId: string;
  organizationId: string;
  userId: string;
  status: string;
}>;

export type ModerationDecision = Readonly<{
  listingId: string;
  moderationStatus: ModerationStatus;
  listingStatus: string;
}>;

export function normalizeBrokerDecision(value: unknown): BrokerDecision {
  if (!isRecord(value)) throw new TypeError("Invalid broker decision payload");
  return {
    membershipId: requireUuid("decision membership id", value.membershipId),
    organizationId: requireUuid(
      "decision organization id",
      value.organizationId,
    ),
    userId: requireUuid("decision user id", value.userId),
    status: requireText("decision status", value.status),
  };
}

export function normalizeModerationDecision(
  value: unknown,
): ModerationDecision {
  if (!isRecord(value))
    throw new TypeError("Invalid moderation decision payload");
  const moderationStatus = value.moderationStatus;
  if (
    moderationStatus !== "APPROVED" &&
    moderationStatus !== "REJECTED" &&
    moderationStatus !== "TAKEN_DOWN"
  )
    throw new TypeError("Invalid decision moderation status");
  return {
    listingId: requireUuid("decision listing id", value.listingId),
    moderationStatus,
    listingStatus: requireText("decision listing status", value.listingStatus),
  };
}

/** Keyset pagination serializes the opaque cursor verbatim. */
export function serializeAdminQuery(query: {
  cursor?: string | null;
  limit?: number;
  organizationId?: string;
  action?: string;
}): string {
  const params = new URLSearchParams();
  if (query.cursor) params.set("cursor", query.cursor);
  if (query.limit !== undefined) params.set("limit", String(query.limit));
  if (query.organizationId) params.set("organizationId", query.organizationId);
  if (query.action) params.set("action", query.action);
  const encoded = params.toString();
  return encoded ? `?${encoded}` : "";
}
