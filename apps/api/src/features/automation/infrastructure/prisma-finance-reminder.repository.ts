import type { PrismaClient } from "@prisma/client";
import {
  financeReminderDueOccurrence,
  type FinanceReminderCandidate,
  type FinanceReminderTargetKind,
} from "../domain/finance-reminder.js";
import type { FinanceReminderRepository } from "../application/finance-reminder-repository.js";

type ReceivableRow = {
  organizationId: string;
  id: string;
  dueAt: Date;
  status: string;
  outstandingMinor: bigint;
  recipientUserId: string | null;
};
type CommissionRow = {
  organizationId: string;
  id: string;
  dueAt: Date;
  status: string;
  recipientUserId: string | null;
};

function receivableCandidate(
  row: ReceivableRow,
): FinanceReminderCandidate | null {
  if (!row.recipientUserId) return null;
  return Object.freeze({
    organizationId: row.organizationId,
    targetId: row.id,
    targetType: "RECEIVABLE" as const,
    reminderType: "receivable.overdue" as const,
    dueAt: new Date(row.dueAt.getTime()),
    dueOccurrence: financeReminderDueOccurrence({
      dueAt: row.dueAt,
      status: row.status,
      outstandingMinor: row.outstandingMinor,
    }),
    recipientUserId: row.recipientUserId,
    status: row.status,
    outstandingMinor: row.outstandingMinor,
  });
}

function commissionCandidate(
  row: CommissionRow,
): FinanceReminderCandidate | null {
  if (!row.recipientUserId) return null;
  return Object.freeze({
    organizationId: row.organizationId,
    targetId: row.id,
    targetType: "COMMISSION" as const,
    reminderType: "commission.due" as const,
    dueAt: new Date(row.dueAt.getTime()),
    dueOccurrence: financeReminderDueOccurrence({
      dueAt: row.dueAt,
      status: row.status,
    }),
    recipientUserId: row.recipientUserId,
    status: row.status,
  });
}

function isCandidate(
  value: FinanceReminderCandidate | null,
): value is FinanceReminderCandidate {
  return value !== null;
}

/** Narrow, organization-scoped finance reads for the automation sweep. */
export class PrismaFinanceReminderRepository implements FinanceReminderRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async listReceivableCandidates(
    organizationId?: string,
  ): Promise<readonly FinanceReminderCandidate[]> {
    const rows = organizationId
      ? await this.prisma.$queryRaw<ReceivableRow[]>`
          SELECT r."organizationId", r."id", r."dueAt", r."status", r."outstandingMinor",
            (SELECT m."userId" FROM "Membership" m
             WHERE m."organizationId" = r."organizationId" AND m."status" = 'ACTIVE'
               AND m."role" IN ('OWNER', 'MANAGER')
             ORDER BY CASE WHEN m."role" = 'OWNER' THEN 0 ELSE 1 END, m."userId" LIMIT 1) AS "recipientUserId"
          FROM "Receivable" r
          WHERE r."organizationId" = ${organizationId}::uuid
            AND r."status" IN ('OPEN', 'PARTIALLY_PAID')`
      : await this.prisma.$queryRaw<ReceivableRow[]>`
          SELECT r."organizationId", r."id", r."dueAt", r."status", r."outstandingMinor",
            (SELECT m."userId" FROM "Membership" m
             WHERE m."organizationId" = r."organizationId" AND m."status" = 'ACTIVE'
               AND m."role" IN ('OWNER', 'MANAGER')
             ORDER BY CASE WHEN m."role" = 'OWNER' THEN 0 ELSE 1 END, m."userId" LIMIT 1) AS "recipientUserId"
          FROM "Receivable" r
          WHERE r."status" IN ('OPEN', 'PARTIALLY_PAID')`;
    return Object.freeze(rows.map(receivableCandidate).filter(isCandidate));
  }

  async listCommissionCandidates(
    organizationId?: string,
  ): Promise<readonly FinanceReminderCandidate[]> {
    const rows = organizationId
      ? await this.prisma.$queryRaw<CommissionRow[]>`
          SELECT c."organizationId", c."id", c."createdAt" AS "dueAt", c."status",
            (SELECT m."userId" FROM "Membership" m
             WHERE m."organizationId" = c."organizationId" AND m."status" = 'ACTIVE'
               AND m."role" IN ('OWNER', 'MANAGER')
             ORDER BY CASE WHEN m."role" = 'OWNER' THEN 0 ELSE 1 END, m."userId" LIMIT 1) AS "recipientUserId"
          FROM "CommissionAccrual" c
          WHERE c."organizationId" = ${organizationId}::uuid AND c."status" = 'DUE'`
      : await this.prisma.$queryRaw<CommissionRow[]>`
          SELECT c."organizationId", c."id", c."createdAt" AS "dueAt", c."status",
            (SELECT m."userId" FROM "Membership" m
             WHERE m."organizationId" = c."organizationId" AND m."status" = 'ACTIVE'
               AND m."role" IN ('OWNER', 'MANAGER')
             ORDER BY CASE WHEN m."role" = 'OWNER' THEN 0 ELSE 1 END, m."userId" LIMIT 1) AS "recipientUserId"
          FROM "CommissionAccrual" c
          WHERE c."status" = 'DUE'`;
    return Object.freeze(rows.map(commissionCandidate).filter(isCandidate));
  }

  async findCurrentTarget(
    organizationId: string,
    targetType: FinanceReminderTargetKind,
    targetId: string,
  ): Promise<FinanceReminderCandidate | null> {
    const rows =
      targetType === "RECEIVABLE"
        ? await this.prisma.$queryRaw<ReceivableRow[]>`
            SELECT r."organizationId", r."id", r."dueAt", r."status", r."outstandingMinor",
              (SELECT m."userId" FROM "Membership" m
               WHERE m."organizationId" = r."organizationId" AND m."status" = 'ACTIVE'
                 AND m."role" IN ('OWNER', 'MANAGER')
               ORDER BY CASE WHEN m."role" = 'OWNER' THEN 0 ELSE 1 END, m."userId" LIMIT 1) AS "recipientUserId"
            FROM "Receivable" r
            WHERE r."organizationId" = ${organizationId}::uuid AND r."id" = ${targetId}::uuid
              AND r."status" IN ('OPEN', 'PARTIALLY_PAID')`
        : await this.prisma.$queryRaw<CommissionRow[]>`
            SELECT c."organizationId", c."id", c."createdAt" AS "dueAt", c."status",
              (SELECT m."userId" FROM "Membership" m
               WHERE m."organizationId" = c."organizationId" AND m."status" = 'ACTIVE'
                 AND m."role" IN ('OWNER', 'MANAGER')
               ORDER BY CASE WHEN m."role" = 'OWNER' THEN 0 ELSE 1 END, m."userId" LIMIT 1) AS "recipientUserId"
            FROM "CommissionAccrual" c
            WHERE c."organizationId" = ${organizationId}::uuid AND c."id" = ${targetId}::uuid
              AND c."status" = 'DUE'`;
    const row = rows[0];
    if (!row) return null;
    return targetType === "RECEIVABLE"
      ? receivableCandidate(row as ReceivableRow)
      : commissionCandidate(row as CommissionRow);
  }
}
