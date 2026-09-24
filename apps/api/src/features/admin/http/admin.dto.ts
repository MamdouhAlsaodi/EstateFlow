import { Transform, Type } from "class-transformer";
import {
  IsDefined,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  Max,
  Min,
} from "class-validator";
import { ADMIN_SEARCHABLE_ACTIONS } from "../domain/admin-policy.js";

function trimText(value: unknown): unknown {
  return typeof value === "string" ? value.trim() : value;
}

export class AdminReasonDto {
  /** Optional decision reason (bounded); sensitive actions still demand a
   * mandatory reason at the application layer. */
  @IsOptional()
  @IsString()
  @Length(1, 500)
  @Matches(/\S/)
  @Transform(trimText)
  reason?: string;
}

export class AdminMandatoryReasonDto {
  @IsDefined()
  @IsString()
  @Length(1, 500)
  @Matches(/\S/)
  @Transform(trimText)
  reason!: string;
}

export class AdminStepUpDto {
  @IsDefined()
  @IsString()
  @Length(1, 200)
  password!: string;
}

export class AdminPageQueryDto {
  @IsOptional()
  @IsString()
  @Length(1, 512)
  cursor?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}

export class AdminAuditSearchQueryDto extends AdminPageQueryDto {
  @IsOptional()
  @IsIn(ADMIN_SEARCHABLE_ACTIONS as unknown as string[])
  action?: string;

  @IsOptional()
  @IsUUID()
  organizationId?: string;

  @IsOptional()
  @IsUUID()
  actorId?: string;
}

export class AdminFailedJobsQueryDto extends AdminPageQueryDto {
  @IsOptional()
  @IsUUID()
  organizationId?: string;
}

/** UTC-safe, bigint-free JSON rendering shared by every admin response.
 * Type-preserving so callers keep their concrete page/result shapes. */
export function renderAdmin<T>(value: T): T {
  if (value instanceof Date) return value.toISOString() as never;
  if (Array.isArray(value)) return value.map(renderAdmin) as never;
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, renderAdmin(item)]),
    ) as never;
  return value;
}

/** Bounded pending-broker rendering: identity + state only, no secrets. */
export function pendingBrokerItem(row: {
  membershipId: string;
  organizationId: string;
  organizationName: string;
  userId: string;
  role: string;
  status: string;
  createdAt: Date;
  approvedAt: Date | null;
}): unknown {
  return {
    membershipId: row.membershipId,
    organizationId: row.organizationId,
    organizationName: row.organizationName,
    userId: row.userId,
    role: row.role,
    status: row.status,
    createdAt: row.createdAt,
    approvedAt: row.approvedAt,
  };
}

export function moderationQueueItem(row: {
  listingId: string;
  organizationId: string;
  propertyId: string;
  propertyTitle: string;
  propertyType: string;
  listingStatus: string;
  moderationStatus: string;
  moderationReason: string | null;
  moderatedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}): unknown {
  return {
    listingId: row.listingId,
    organizationId: row.organizationId,
    propertyId: row.propertyId,
    propertyTitle: row.propertyTitle,
    propertyType: row.propertyType,
    listingStatus: row.listingStatus,
    moderationStatus: row.moderationStatus,
    moderationReason: row.moderationReason,
    moderatedAt: row.moderatedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/** Bounded audit rendering: action/target identity + reason, nothing else. */
export function auditEventItem(row: {
  id: string;
  action: string;
  organizationId: string;
  targetType: string;
  targetId: string;
  actorId: string;
  reason: string | null;
  createdAt: Date;
}): unknown {
  return {
    id: row.id,
    action: row.action,
    organizationId: row.organizationId,
    targetType: row.targetType,
    targetId: row.targetId,
    actorId: row.actorId,
    reason: row.reason,
    createdAt: row.createdAt,
  };
}

/**
 * Bounded failed-job rendering, mirroring the EF-306 closed projection:
 * typed states and failure reasons only — no execution key, no event ids,
 * and never a raw action or provider payload.
 */
export function failedJobItem(row: {
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
}): unknown {
  return {
    id: row.id,
    organizationId: row.organizationId,
    ruleId: row.ruleId,
    ruleVersion: row.ruleVersion,
    actionType: row.actionType,
    targetType: row.targetType,
    targetId: row.targetId,
    status: row.status,
    attemptCount: row.attemptCount,
    maxAttempts: row.maxAttempts,
    lastError:
      row.lastErrorKind && row.lastErrorMessage
        ? { kind: row.lastErrorKind, message: row.lastErrorMessage }
        : null,
    scheduledFor: row.scheduledFor,
    startedAt: row.startedAt,
    completedAt: row.completedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function brokerDecisionItem(result: {
  membershipId: string;
  organizationId: string;
  userId: string;
  status: string;
}): unknown {
  return result;
}

export function moderationDecisionItem(result: {
  listingId: string;
  moderationStatus: string;
  listingStatus: string;
}): unknown {
  return result;
}
