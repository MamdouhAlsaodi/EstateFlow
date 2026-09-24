import type { PrismaClient } from "@prisma/client";
import type {
  ViewingAutomationOccurrence,
  ViewingAutomationRepository,
} from "../application/viewing-automation-repository.js";
import type { ViewingAutomationKind } from "../domain/viewing-automation.js";

type OccurrenceRow = {
  organizationId: string;
  viewingId: string;
  leadId: string;
  brokerId: string;
  kind: string;
  occurrenceKey: string;
  id: string;
  scheduledFor: Date;
  suggestedLeadStage: string | null;
  startAt: Date;
  endAt: Date;
  status: "PENDING" | "VOIDED";
};

/** Cross-tenant worker reads are bounded by the occurrence source; action reads remain tenant-scoped. */
export class PrismaViewingAutomationRepository implements ViewingAutomationRepository {
  constructor(private readonly db: PrismaClient) {}

  async listDueOccurrences(
    now: Date,
  ): Promise<readonly ViewingAutomationOccurrence[]> {
    const rows = await this.db.$queryRaw<OccurrenceRow[]>`
      SELECT o."organizationId", o."viewingId", v."leadId", v."brokerId",
             o."kind", o."occurrenceKey", o."id", o."scheduledFor",
             o."suggestedLeadStage", v."startAt", v."endAt", o."status"
      FROM "ViewingAutomationOccurrence" o
      JOIN "Viewing" v
        ON v."organizationId" = o."organizationId" AND v."id" = o."viewingId"
      WHERE o."status" = 'PENDING'
        AND o."scheduledFor" <= ${now}
        AND ((o."kind" IN ('REMINDER_24H', 'REMINDER_1H') AND v."status" = 'CONFIRMED')
          OR (o."kind" = 'OUTCOME_REQUEST' AND v."status" = 'COMPLETED'))
      ORDER BY o."scheduledFor" ASC, o."id" ASC`;
    return rows.map(mapOccurrence);
  }

  async findPendingOccurrence(
    organizationId: string,
    eventId: string,
  ): Promise<ViewingAutomationOccurrence | null> {
    const rows = await this.db.$queryRaw<OccurrenceRow[]>`
      SELECT o."organizationId", o."viewingId", v."leadId", v."brokerId",
             o."kind", o."occurrenceKey", o."id", o."scheduledFor",
             o."suggestedLeadStage", v."startAt", v."endAt", o."status"
      FROM "ViewingAutomationOccurrence" o
      JOIN "Viewing" v
        ON v."organizationId" = o."organizationId" AND v."id" = o."viewingId"
      WHERE o."organizationId" = ${organizationId}::uuid
        AND o."id" = ${eventId}::uuid
        AND o."status" = 'PENDING'
        AND ((o."kind" IN ('REMINDER_24H', 'REMINDER_1H') AND v."status" = 'CONFIRMED')
          OR (o."kind" = 'OUTCOME_REQUEST' AND v."status" = 'COMPLETED'))
      LIMIT 1`;
    return rows[0] ? mapOccurrence(rows[0]) : null;
  }
}

function mapOccurrence(row: OccurrenceRow): ViewingAutomationOccurrence {
  return {
    organizationId: row.organizationId,
    viewingId: row.viewingId,
    leadId: row.leadId,
    brokerId: row.brokerId,
    kind: row.kind as ViewingAutomationKind,
    occurrenceKey: row.occurrenceKey,
    eventId: row.id,
    scheduledFor: row.scheduledFor,
    suggestedLeadStage:
      row.suggestedLeadStage === "QUALIFIED" ||
      row.suggestedLeadStage === "NURTURING"
        ? row.suggestedLeadStage
        : null,
    startAt: row.startAt,
    endAt: row.endAt,
    status: row.status,
  };
}
