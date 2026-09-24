import { Prisma } from "@prisma/client";
import type { PrismaService } from "../../../database/prisma.service.js";
import { AdminConflictError } from "../domain/admin-errors.js";
import type { AdminAction, KeysetPoint } from "../domain/admin-policy.js";
import type {
  AdminAuditEventInput,
  AdminAuditRow,
  AdminBrokerRow,
  AdminCredentialReader,
  AdminFailedJobRow,
  AdminListingRow,
  AdminRepository,
  KeysetPage,
  ModerationTransitionInput,
  ReinstateBrokerInput,
  StepUpEventInput,
  SuspendBrokerInput,
} from "../application/admin-repository.js";

type KeysetRow = { createdAt: Date; id: string };

/**
 * EF-620 — Prisma admin repository. Reads are bounded keyset pages with the
 * exact same column projections the DTOs render (no payloads, no secrets).
 * Listing moderation transitions and their append-only event are written in
 * one transaction. Failed automation jobs are read through parameterized raw
 * SQL, preserving the EF-301 boundary (AutomationJob is intentionally not
 * mirrored into schema.prisma).
 */
export class PrismaAdminRepository implements AdminRepository {
  constructor(private readonly prisma: PrismaService) {}

  async listPendingBrokers(
    cursor: KeysetPoint | undefined,
    limit: number,
  ): Promise<KeysetPage<AdminBrokerRow>> {
    const rows = await this.prisma.membership.findMany({
      where: { role: "BROKER", status: "PENDING" },
      select: {
        id: true,
        organizationId: true,
        userId: true,
        role: true,
        status: true,
        createdAt: true,
        approvedAt: true,
        organization: { select: { name: true } },
      },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      take: limit,
      ...(cursor
        ? {
            where: {
              role: "BROKER" as const,
              status: "PENDING" as const,
              OR: [
                { createdAt: { gt: cursor.at } },
                { createdAt: cursor.at, id: { gt: cursor.id } },
              ],
            },
          }
        : {}),
    });
    return {
      items: rows.map((row) => ({
        membershipId: row.id,
        organizationId: row.organizationId,
        organizationName: row.organization.name,
        userId: row.userId,
        role: row.role,
        status: row.status,
        createdAt: row.createdAt,
        approvedAt: row.approvedAt,
      })),
      nextCursor: null,
    };
  }

  async findMembership(
    organizationId: string,
    membershipId: string,
  ): Promise<{
    membershipId: string;
    organizationId: string;
    userId: string;
    role: string;
    status: string;
  } | null> {
    const membership = await this.prisma.membership.findFirst({
      where: { id: membershipId, organizationId },
      select: {
        id: true,
        organizationId: true,
        userId: true,
        role: true,
        status: true,
      },
    });
    if (!membership) return null;
    return {
      membershipId: membership.id,
      organizationId: membership.organizationId,
      userId: membership.userId,
      role: membership.role,
      status: membership.status,
    };
  }

  async suspendBroker(
    input: SuspendBrokerInput,
  ): Promise<"suspended" | "not-found" | "conflict"> {
    const updated = await this.prisma.membership.updateMany({
      where: {
        id: input.membershipId,
        organizationId: input.organizationId,
        role: "BROKER",
        status: "ACTIVE",
      },
      data: { status: "SUSPENDED" },
    });
    return updated.count === 1 ? "suspended" : "conflict";
  }

  async reinstateBroker(
    input: ReinstateBrokerInput,
  ): Promise<"reinstated" | "not-found" | "conflict"> {
    const updated = await this.prisma.membership.updateMany({
      where: {
        id: input.membershipId,
        organizationId: input.organizationId,
        role: "BROKER",
        status: "SUSPENDED",
      },
      data: { status: "ACTIVE" },
    });
    return updated.count === 1 ? "reinstated" : "conflict";
  }

  async listModerationQueue(
    cursor: KeysetPoint | undefined,
    limit: number,
  ): Promise<KeysetPage<AdminListingRow>> {
    const baseWhere = {
      status: "PUBLISHED" as const,
      moderationStatus: "PENDING" as const,
    };
    const rows = await this.prisma.listing.findMany({
      where: cursor
        ? {
            ...baseWhere,
            OR: [
              { createdAt: { gt: cursor.at } },
              { createdAt: cursor.at, id: { gt: cursor.id } },
            ],
          }
        : baseWhere,
      select: {
        id: true,
        organizationId: true,
        propertyId: true,
        status: true,
        moderationStatus: true,
        moderationReason: true,
        moderatedAt: true,
        createdAt: true,
        updatedAt: true,
        property: { select: { title: true, propertyType: true } },
      },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      take: limit,
    });
    return {
      items: rows.map((row) => ({
        listingId: row.id,
        organizationId: row.organizationId,
        propertyId: row.propertyId,
        propertyTitle: row.property.title,
        propertyType: row.property.propertyType,
        listingStatus: row.status,
        moderationStatus: row.moderationStatus,
        moderationReason: row.moderationReason,
        moderatedAt: row.moderatedAt,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      })),
      nextCursor: null,
    };
  }

  async findListingWithModeration(
    organizationId: string,
    listingId: string,
  ): Promise<AdminListingRow | null> {
    const row = await this.prisma.listing.findFirst({
      where: { id: listingId, organizationId },
      select: {
        id: true,
        organizationId: true,
        propertyId: true,
        status: true,
        moderationStatus: true,
        moderationReason: true,
        moderatedAt: true,
        createdAt: true,
        updatedAt: true,
        property: { select: { title: true, propertyType: true } },
      },
    });
    if (!row) return null;
    return {
      listingId: row.id,
      organizationId: row.organizationId,
      propertyId: row.propertyId,
      propertyTitle: row.property.title,
      propertyType: row.property.propertyType,
      listingStatus: row.status,
      moderationStatus: row.moderationStatus,
      moderationReason: row.moderationReason,
      moderatedAt: row.moderatedAt,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  async applyListingModeration(
    input: ModerationTransitionInput,
  ): Promise<"applied" | "conflict"> {
    const toModerationStatus =
      input.action === "APPROVED"
        ? "APPROVED"
        : input.action === "REJECTED"
          ? "REJECTED"
          : "TAKEN_DOWN";
    const listingStatusAfter =
      input.action === "APPROVED" ? "PUBLISHED" : "ARCHIVED";
    try {
      await this.prisma.$transaction(async (tx) => {
        const current = await tx.listing.findFirst({
          where: { id: input.listingId, organizationId: input.organizationId },
          select: {
            status: true,
            moderationStatus: true,
          },
        });
        if (
          !current ||
          !input.fromModerationStatus.includes(
            current.moderationStatus as never,
          ) ||
          current.status !== "PUBLISHED"
        ) {
          throw new AdminConflictError();
        }
        await tx.listing.update({
          where: { id: input.listingId },
          data: {
            moderationStatus: toModerationStatus,
            moderationReason: input.reason,
            moderatedBy: input.actorId,
            moderatedAt: input.now,
            ...(listingStatusAfter === "ARCHIVED"
              ? { status: "ARCHIVED" as const }
              : {}),
          },
        });
        await tx.listingModerationEvent.create({
          data: {
            organizationId: input.organizationId,
            listingId: input.listingId,
            action: input.action,
            fromModerationStatus: current.moderationStatus,
            toModerationStatus,
            listingStatusBefore: current.status,
            listingStatusAfter,
            reason: input.reason,
            actorId: input.actorId,
            createdAt: input.now,
          },
        });
      });
    } catch (error) {
      if (error instanceof AdminConflictError) return "conflict";
      throw error;
    }
    return "applied";
  }

  async appendAuditEvent(event: AdminAuditEventInput): Promise<void> {
    await this.prisma.adminAuditEvent.create({
      data: {
        action: event.action,
        organizationId: event.organizationId,
        targetType: event.targetType,
        targetId: event.targetId,
        actorId: event.actorId,
        reason: event.reason,
        createdAt: event.now,
      },
    });
  }

  async searchAuditEvents(
    filter: {
      action: AdminAction | null;
      organizationId: string | null;
      actorId: string | null;
    },
    cursor: KeysetPoint | undefined,
    limit: number,
  ): Promise<KeysetPage<AdminAuditRow>> {
    const baseWhere = {
      ...(filter.action ? { action: filter.action } : {}),
      ...(filter.organizationId
        ? { organizationId: filter.organizationId }
        : {}),
      ...(filter.actorId ? { actorId: filter.actorId } : {}),
    };
    const rows = await this.prisma.adminAuditEvent.findMany({
      where: cursor
        ? {
            ...baseWhere,
            OR: [
              { createdAt: { lt: cursor.at } },
              { createdAt: cursor.at, id: { lt: cursor.id } },
            ],
          }
        : baseWhere,
      select: {
        id: true,
        action: true,
        organizationId: true,
        targetType: true,
        targetId: true,
        actorId: true,
        reason: true,
        createdAt: true,
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: limit,
    });
    return { items: rows.map(toAuditRow), nextCursor: null };
  }

  async listFailedJobs(
    organizationId: string | null,
    cursor: KeysetPoint | undefined,
    limit: number,
  ): Promise<KeysetPage<AdminFailedJobRow>> {
    const cursorClause = cursor
      ? Prisma.sql` AND ("createdAt", "id") < (${cursor.at}, ${cursor.id}::uuid)`
      : Prisma.empty;
    const orgClause = organizationId
      ? Prisma.sql` AND "organizationId" = ${organizationId}::uuid`
      : Prisma.empty;
    const rows = await this.prisma.$queryRaw<FailedJobRowTuple[]>`
      SELECT "id", "organizationId", "ruleId", "ruleVersion", "actionType",
             "targetType", "targetId", "status", "attemptCount", "maxAttempts",
             "lastErrorKind", "lastErrorMessage", "scheduledFor", "startedAt",
             "completedAt", "createdAt", "updatedAt"
      FROM "AutomationJob"
      WHERE "status" = 'FAILED'${orgClause}${cursorClause}
      ORDER BY "createdAt" DESC, "id" DESC
      LIMIT ${limit}`;
    return {
      items: rows.map((row) => ({
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
        lastErrorKind: row.lastErrorKind,
        lastErrorMessage: row.lastErrorMessage,
        scheduledFor: new Date(row.scheduledFor),
        startedAt: row.startedAt ? new Date(row.startedAt) : null,
        completedAt: row.completedAt ? new Date(row.completedAt) : null,
        createdAt: new Date(row.createdAt),
        updatedAt: new Date(row.updatedAt),
      })),
      nextCursor: null,
    };
  }

  async appendStepUpEvent(event: StepUpEventInput): Promise<void> {
    await this.prisma.adminStepUpEvent.create({
      data: {
        userId: event.userId,
        familyId: event.familyId,
        accessSessionId: event.accessSessionId,
        outcome: event.outcome,
        expiresAt: event.expiresAt,
        createdAt: event.now,
      },
    });
  }

  async findActiveStepUp(
    userId: string,
    accessSessionId: string,
    now: Date,
  ): Promise<{ verifiedAt: Date; expiresAt: Date } | null> {
    const proof = await this.prisma.adminStepUpEvent.findFirst({
      where: {
        userId,
        accessSessionId,
        outcome: "SUCCEEDED",
        expiresAt: { gt: now },
      },
      select: { createdAt: true, expiresAt: true },
      orderBy: { createdAt: "desc" },
    });
    if (!proof?.expiresAt) return null;
    return { verifiedAt: proof.createdAt, expiresAt: proof.expiresAt };
  }

  async countDeniedStepUps(userId: string, since: Date): Promise<number> {
    return this.prisma.adminStepUpEvent.count({
      where: { userId, outcome: "DENIED", createdAt: { gte: since } },
    });
  }
}

/** Read-only credential projection for the step-up password confirmation. */
export class PrismaAdminCredentialReader implements AdminCredentialReader {
  constructor(private readonly prisma: PrismaService) {}

  async findPasswordHashByUserId(userId: string): Promise<string | null> {
    const credential = await this.prisma.credential.findUnique({
      where: { userId },
      select: { passwordHash: true },
    });
    return credential?.passwordHash ?? null;
  }
}

type FailedJobRowTuple = {
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

function toAuditRow(row: {
  id: string;
  action: AdminAction;
  organizationId: string;
  targetType: string;
  targetId: string;
  actorId: string;
  reason: string | null;
  createdAt: Date;
}): AdminAuditRow & KeysetRow {
  return {
    id: row.id,
    action: row.action,
    organizationId: row.organizationId,
    targetType: row.targetType as AdminAuditRow["targetType"],
    targetId: row.targetId,
    actorId: row.actorId,
    reason: row.reason,
    createdAt: row.createdAt,
  };
}
