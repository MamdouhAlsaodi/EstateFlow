import { createHash, randomUUID } from "node:crypto";
import { Prisma, type PrismaClient } from "@prisma/client";
import {
  LeadStage,
  LeadValidationError,
  type Deal,
  type DealClosedWonEventIntent,
  type Lead,
  type LeadNote,
  type LeadTask,
  type TimelineEventIntent,
} from "../domain/lead.js";
import type {
  CloseLostPreflight,
  CloseLostPreflightResult,
  ClosePreflightInput,
  CloseWonPreflight,
  CloseWonPreflightResult,
  CreateLeadInput,
  DealCloseLostCommand,
  DealCloseLostResult,
  DealCloseWonCommand,
  DealCloseWonResult,
  LeadDetail,
  LeadListCriteria,
  LeadMutationInput,
  LeadMutationResult,
  LeadNoteCommand,
  LeadNoteCommandResult,
  LeadRepository,
  LeadTaskCommand,
  LeadTaskCommandResult,
  LeadTaskTransitionCommand,
} from "../application/lead-repository.js";

const CREATE_SCOPE = "LEAD_CREATE";
const UPDATE_SCOPE = "LEAD_UPDATE";
const APPEND_SCOPE = "LEAD_TIMELINE_APPEND";
const NOTE_CREATE_SCOPE = "LEAD_NOTE_CREATE";
const TASK_CREATE_SCOPE = "LEAD_TASK_CREATE";
const TASK_COMPLETE_SCOPE = "LEAD_TASK_COMPLETE";
const TASK_RESCHEDULE_SCOPE = "LEAD_TASK_RESCHEDULE";
const MAX_RETRIES = 3;
const MAX_LEAD_DETAIL_CHILDREN = 50;

type LeadRow = {
  id: string;
  organizationId: string;
  ownerId: string;
  stage: Lead["stage"];
  nextAction: string;
  source: string;
  utm: unknown;
  version: number;
  createdAt: Date;
  updatedAt: Date;
};
type EventRow = {
  id?: string;
  type: TimelineEventIntent["type"];
  leadId: string;
  organizationId: string;
  occurredAt: Date;
  data: unknown;
};
type NoteRow = Omit<LeadNote, "timelineEvent">;
type TaskRow = Omit<LeadTask, "timelineEvent">;
type ChildIdempotencyRow = {
  payloadHash: string;
  leadId: string;
  organizationId: string;
  id: string;
};
type DealRow = {
  id: string;
  organizationId: string;
  leadId: string;
  propertyId: string;
  brokerId: string;
  status: string;
  version: number;
  createdAt: Date;
  updatedAt: Date;
};
type DealEventRow = {
  schemaVersion: number;
  organizationId: string;
  dealId: string;
  data: unknown;
  occurredAt: Date;
};

function hash(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function mapLead(row: LeadRow): Lead {
  return {
    id: row.id,
    organizationId: row.organizationId,
    ownerId: row.ownerId,
    stage: row.stage,
    nextAction: row.nextAction,
    source: row.source,
    utm: (row.utm ?? {}) as Lead["utm"],
    version: row.version,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function mapEvent(row: EventRow): TimelineEventIntent {
  return {
    type: row.type,
    leadId: row.leadId,
    organizationId: row.organizationId,
    occurredAt: row.occurredAt,
    data: row.data as TimelineEventIntent["data"],
  };
}

function mapNote(row: NoteRow, timelineEvent: TimelineEventIntent): LeadNote {
  return { ...row, timelineEvent };
}

function mapTask(row: TaskRow, timelineEvent: TimelineEventIntent): LeadTask {
  return { ...row, status: row.status as LeadTask["status"], timelineEvent };
}

function eventResourceId(row: EventRow, field: string): string | null {
  const data = row.data;
  if (!data || typeof data !== "object" || Array.isArray(data)) return null;
  const resourceId = (data as Record<string, unknown>)[field];
  return typeof resourceId === "string" ? resourceId : null;
}

function isCode(error: unknown, code: string): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError && error.code === code
  );
}

function isIdempotencyUnique(error: unknown): boolean {
  if (!isCode(error, "P2002")) return false;
  const target = (error as Prisma.PrismaClientKnownRequestError).meta?.target;
  return (
    Array.isArray(target) &&
    target.includes("commandScope") &&
    target.includes("idempotencyKey")
  );
}

function isTerminal(stage: LeadStage): boolean {
  return stage === LeadStage.CLOSED_WON || stage === LeadStage.CLOSED_LOST;
}

function isClosableStage(stage: LeadStage): stage is "QUALIFIED" | "NURTURING" {
  return stage === LeadStage.QUALIFIED || stage === LeadStage.NURTURING;
}

function closeHash(input: {
  organizationId: string;
  leadId: string;
  actor: string;
  scope: "CLOSE_WON" | "CLOSE_LOST";
  idempotencyKey: string;
  expectedVersion: number;
  propertyId?: string;
  brokerId?: string;
  reason?: string;
}): string {
  return hash({
    organizationId: input.organizationId,
    leadId: input.leadId,
    actor: input.actor,
    scope: input.scope,
    idempotencyKey: input.idempotencyKey,
    expectedVersion: input.expectedVersion,
    payload:
      input.scope === "CLOSE_WON"
        ? {
            propertyId: input.propertyId?.trim(),
            brokerId: input.brokerId?.trim(),
          }
        : { reason: input.reason?.trim() },
  });
}

function mapDeal(row: DealRow): Deal {
  return {
    id: row.id,
    organizationId: row.organizationId,
    leadId: row.leadId,
    propertyId: row.propertyId,
    brokerId: row.brokerId,
    status: "OPEN",
    version: 1,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function mapDealEvent(row: DealEventRow): DealClosedWonEventIntent {
  const payload = row.data as {
    leadId: string;
    propertyId: string;
    brokerId: string;
  };
  return {
    schemaVersion: 1,
    organizationId: row.organizationId,
    dealId: row.dealId,
    leadId: payload.leadId,
    propertyId: payload.propertyId,
    brokerId: payload.brokerId,
    occurredAt: row.occurredAt,
  };
}

export class PrismaLeadRepository implements LeadRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findLead(organizationId: string, leadId: string): Promise<Lead | null> {
    const row = await this.prisma.lead.findFirst({
      where: { organizationId, id: leadId },
    });
    return row ? mapLead(row as LeadRow) : null;
  }

  async findLeadDetail(
    organizationId: string,
    leadId: string,
    criteria: { cursor?: string; limit?: number },
  ): Promise<LeadDetail | null> {
    const limit = criteria.limit ?? 50;
    if (
      typeof organizationId !== "string" ||
      organizationId.trim().length === 0 ||
      typeof leadId !== "string" ||
      leadId.trim().length === 0
    )
      throw new LeadValidationError("Invalid lead detail query");
    if (
      criteria.cursor !== undefined &&
      (typeof criteria.cursor !== "string" ||
        criteria.cursor.trim().length === 0 ||
        criteria.cursor.length > 255)
    )
      throw new LeadValidationError("Invalid lead detail query");
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100)
      throw new LeadValidationError("Invalid lead detail query");
    const lead = await this.prisma.lead.findFirst({
      where: { organizationId, id: leadId },
    });
    if (!lead) return null;
    try {
      const [rows, notes, tasks] = await Promise.all([
        this.prisma.leadTimelineEvent.findMany({
          where: { organizationId, leadId },
          orderBy: [{ occurredAt: "asc" }, { id: "asc" }],
          ...(criteria.cursor !== undefined
            ? { cursor: { id: criteria.cursor }, skip: 1 }
            : {}),
          take: limit + 1,
        }),
        this.prisma.leadNote.findMany({
          where: { organizationId, leadId },
          select: { id: true, body: true, createdAt: true },
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          take: MAX_LEAD_DETAIL_CHILDREN,
        }),
        this.prisma.leadTask.findMany({
          where: { organizationId, leadId },
          select: {
            id: true,
            title: true,
            dueAt: true,
            status: true,
            createdAt: true,
            completedAt: true,
            version: true,
          },
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          take: MAX_LEAD_DETAIL_CHILDREN,
        }),
      ]);
      const pageRows = rows as (EventRow & { id: string })[];
      const hasNext = pageRows.length > limit;
      const items = pageRows.slice(0, limit).map((row) => ({
        id: row.id,
        type: row.type,
        occurredAt: row.occurredAt,
        data: row.data as Record<string, string | null>,
      }));
      return {
        lead: mapLead(lead as LeadRow),
        timeline: {
          items,
          nextCursor: hasNext ? (items.at(-1)?.id ?? null) : null,
        },
        notes,
        tasks: tasks as LeadDetail["tasks"],
      };
    } catch (error) {
      if (isCode(error, "P2025"))
        throw new LeadValidationError("Invalid lead detail query");
      throw error;
    }
  }

  async listLeads(
    organizationId: string,
    criteria: LeadListCriteria,
  ): Promise<{ items: readonly Lead[]; nextCursor: string | null }> {
    const stage = criteria.stage;
    const cursor = criteria.cursor;
    const limit = criteria.limit ?? 50;
    if (
      typeof organizationId !== "string" ||
      organizationId.trim().length === 0
    )
      throw new LeadValidationError("Invalid lead list query");
    if (stage !== undefined && !Object.values(LeadStage).includes(stage))
      throw new LeadValidationError("Invalid lead list query");
    if (
      cursor !== undefined &&
      (typeof cursor !== "string" ||
        cursor.trim().length === 0 ||
        cursor.length > 255)
    )
      throw new LeadValidationError("Invalid lead list query");
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100)
      throw new LeadValidationError("Invalid lead list query");
    try {
      const rows = await this.prisma.lead.findMany({
        where: { organizationId, ...(stage !== undefined ? { stage } : {}) },
        orderBy: { id: "asc" },
        ...(cursor !== undefined ? { cursor: { id: cursor }, skip: 1 } : {}),
        take: limit + 1,
      });
      const pageRows = rows as LeadRow[];
      const hasNext = pageRows.length > limit;
      const items = pageRows.slice(0, limit).map(mapLead);
      return { items, nextCursor: hasNext ? (items.at(-1)?.id ?? null) : null };
    } catch (error) {
      if (isCode(error, "P2025"))
        throw new LeadValidationError("Invalid lead list query");
      throw error;
    }
  }

  async createLead(input: CreateLeadInput): Promise<LeadMutationResult> {
    const payloadHash = hash({
      lead: input.lead,
      timelineEvents: input.timelineEvents,
    });
    return this.withRetry(() =>
      this.prisma.$transaction(
        (tx) => this.createInTransaction(tx, input, payloadHash),
        { isolationLevel: "Serializable" },
      ),
    );
  }

  private async createInTransaction(
    tx: Prisma.TransactionClient,
    input: CreateLeadInput,
    payloadHash: string,
  ): Promise<LeadMutationResult> {
    const prior = await tx.leadIdempotencyRecord.findUnique({
      where: {
        organizationId_commandScope_idempotencyKey: {
          organizationId: input.lead.organizationId,
          commandScope: CREATE_SCOPE,
          idempotencyKey: input.idempotencyKey,
        },
      },
    });
    if (prior)
      return this.replayOrConflict(
        tx,
        prior,
        payloadHash,
        input.idempotencyKey,
      );
    try {
      const lead = await tx.lead.create({
        data: { ...input.lead, utm: input.lead.utm as Prisma.InputJsonValue },
      });
      const record = await tx.leadIdempotencyRecord.create({
        data: {
          organizationId: lead.organizationId,
          commandScope: CREATE_SCOPE,
          idempotencyKey: input.idempotencyKey,
          payloadHash,
          leadId: lead.id,
        },
      });
      await this.createEvents(tx, record.id, input.timelineEvents);
      return {
        kind: "ok",
        lead: mapLead(lead as LeadRow),
        timelineEvents: input.timelineEvents,
      };
    } catch (error) {
      if (isIdempotencyUnique(error)) throw error;
      if (isCode(error, "P2003")) return { kind: "ownership-conflict" };
      throw error;
    }
  }

  async updateLead(input: LeadMutationInput): Promise<LeadMutationResult> {
    const payloadHash = hash({
      organizationId: input.organizationId,
      leadId: input.leadId,
      expectedVersion: input.expectedVersion,
      lead: input.lead,
      timelineEvents: input.timelineEvents,
    });
    return this.withRetry(() =>
      this.prisma.$transaction(
        (tx) => this.updateInTransaction(tx, input, payloadHash),
        { isolationLevel: "Serializable" },
      ),
    );
  }

  private async updateInTransaction(
    tx: Prisma.TransactionClient,
    input: LeadMutationInput,
    payloadHash: string,
  ): Promise<LeadMutationResult> {
    const prior = await tx.leadIdempotencyRecord.findUnique({
      where: {
        organizationId_commandScope_idempotencyKey: {
          organizationId: input.organizationId,
          commandScope: UPDATE_SCOPE,
          idempotencyKey: input.idempotencyKey,
        },
      },
    });
    if (prior)
      return this.replayOrConflict(
        tx,
        prior,
        payloadHash,
        input.idempotencyKey,
      );
    const current = await tx.lead.findFirst({
      where: { organizationId: input.organizationId, id: input.leadId },
    });
    if (!current) return { kind: "ownership-conflict" };
    if (current.version !== input.expectedVersion)
      return {
        kind: "stale-version-conflict",
        expectedVersion: input.expectedVersion,
        actualVersion: current.version,
      };
    const updated = await tx.lead.updateMany({
      where: {
        organizationId: input.organizationId,
        id: input.leadId,
        version: input.expectedVersion,
      },
      data: {
        ownerId: input.lead.ownerId,
        stage: input.lead.stage,
        nextAction: input.lead.nextAction,
        source: input.lead.source,
        utm: input.lead.utm as Prisma.InputJsonValue,
        version: input.lead.version,
        updatedAt: input.lead.updatedAt,
      },
    });
    if (updated.count !== 1) {
      const actual = await tx.lead.findFirst({
        where: { organizationId: input.organizationId, id: input.leadId },
        select: { version: true },
      });
      return actual
        ? {
            kind: "stale-version-conflict",
            expectedVersion: input.expectedVersion,
            actualVersion: actual.version,
          }
        : { kind: "ownership-conflict" };
    }
    const record = await tx.leadIdempotencyRecord.create({
      data: {
        organizationId: input.organizationId,
        commandScope: UPDATE_SCOPE,
        idempotencyKey: input.idempotencyKey,
        payloadHash,
        leadId: input.leadId,
      },
    });
    await this.createEvents(tx, record.id, input.timelineEvents);
    const lead = await tx.lead.findFirstOrThrow({
      where: { organizationId: input.organizationId, id: input.leadId },
    });
    return {
      kind: "ok",
      lead: mapLead(lead as LeadRow),
      timelineEvents: input.timelineEvents,
    };
  }

  private async replayOrConflict(
    tx: Prisma.TransactionClient,
    prior: {
      payloadHash: string;
      leadId: string;
      organizationId: string;
      id: string;
    },
    payloadHash: string,
    idempotencyKey: string,
  ): Promise<LeadMutationResult> {
    if (prior.payloadHash !== payloadHash)
      return { kind: "idempotency-conflict", idempotencyKey };
    const lead = await tx.lead.findFirst({
      where: { organizationId: prior.organizationId, id: prior.leadId },
    });
    if (!lead) return { kind: "ownership-conflict" };
    const events = await tx.leadTimelineEvent.findMany({
      where: { organizationId: prior.organizationId, idempotencyId: prior.id },
      orderBy: { occurredAt: "asc" },
    });
    return {
      kind: "idempotent-replay",
      lead: mapLead(lead as LeadRow),
      timelineEvents: (events as EventRow[]).map(mapEvent),
    };
  }

  private async createEvents(
    tx: Prisma.TransactionClient,
    idempotencyId: string,
    events: readonly TimelineEventIntent[],
  ): Promise<void> {
    for (const event of events)
      await tx.leadTimelineEvent.create({
        data: {
          organizationId: event.organizationId,
          leadId: event.leadId,
          idempotencyId,
          type: event.type,
          occurredAt: event.occurredAt,
          data: event.data as Prisma.InputJsonValue,
        },
      });
  }

  async preflightClose(
    input: CloseWonPreflight,
  ): Promise<CloseWonPreflightResult>;
  async preflightClose(
    input: CloseLostPreflight,
  ): Promise<CloseLostPreflightResult>;
  async preflightClose(
    input: ClosePreflightInput,
  ): Promise<CloseWonPreflightResult | CloseLostPreflightResult> {
    const record = await this.prisma.leadIdempotencyRecord.findUnique({
      where: {
        organizationId_commandScope_idempotencyKey: {
          organizationId: input.organizationId,
          commandScope: input.scope,
          idempotencyKey: input.idempotencyKey,
        },
      },
    });
    if (!record) return { kind: "no-prior-command" };
    const payloadHash = closeHash(input);
    if (record.payloadHash !== payloadHash)
      return {
        kind: "idempotency-conflict",
        idempotencyKey: input.idempotencyKey,
      };
    const lead = await this.prisma.lead.findFirst({
      where: { organizationId: input.organizationId, id: record.leadId },
    });
    const timeline = await this.prisma.leadTimelineEvent.findFirst({
      where: {
        organizationId: input.organizationId,
        idempotencyId: record.id,
        type:
          input.scope === "CLOSE_WON" ? "LEAD_CLOSED_WON" : "LEAD_CLOSED_LOST",
      },
      orderBy: { occurredAt: "asc" },
    });
    if (!lead || !timeline)
      return {
        kind: "idempotency-conflict",
        idempotencyKey: input.idempotencyKey,
      };
    if (input.scope === "CLOSE_LOST")
      return {
        kind: "idempotent-replay",
        lead: mapLead(lead as LeadRow),
        timelineEvent: mapEvent(timeline as EventRow),
      };
    const dealId = eventResourceId(timeline as EventRow, "dealId");
    const deal = dealId
      ? await this.prisma.deal.findFirst({
          where: { organizationId: input.organizationId, id: dealId },
        })
      : null;
    const event = deal
      ? await this.prisma.dealDomainEvent.findFirst({
          where: { organizationId: input.organizationId, dealId: deal.id },
          orderBy: { occurredAt: "asc" },
        })
      : null;
    if (!deal || !event)
      return {
        kind: "idempotency-conflict",
        idempotencyKey: input.idempotencyKey,
      };
    return {
      kind: "idempotent-replay",
      lead: mapLead(lead as LeadRow),
      deal: mapDeal(deal as DealRow),
      timelineEvent: mapEvent(timeline as EventRow),
      event: mapDealEvent(event as DealEventRow),
    };
  }

  async closeWon(input: DealCloseWonCommand): Promise<DealCloseWonResult> {
    return this.withRetry(() =>
      this.prisma.$transaction((tx) => this.closeWonInTransaction(tx, input), {
        isolationLevel: "Serializable",
      }),
    );
  }

  private async closeWonInTransaction(
    tx: Prisma.TransactionClient,
    input: DealCloseWonCommand,
  ): Promise<DealCloseWonResult> {
    const payloadHash = closeHash({
      organizationId: input.organizationId,
      leadId: input.leadId,
      actor: input.actor,
      scope: "CLOSE_WON",
      idempotencyKey: input.idempotencyKey,
      expectedVersion: input.expectedVersion,
      propertyId: input.deal.propertyId,
      brokerId: input.deal.brokerId,
    });
    const prior = await tx.leadIdempotencyRecord.findUnique({
      where: {
        organizationId_commandScope_idempotencyKey: {
          organizationId: input.organizationId,
          commandScope: "CLOSE_WON",
          idempotencyKey: input.idempotencyKey,
        },
      },
    });
    if (prior)
      return this.replayWonInTransaction(
        tx,
        prior,
        payloadHash,
        input.idempotencyKey,
      );
    const lead = await tx.lead.findFirst({
      where: { organizationId: input.organizationId, id: input.leadId },
    });
    if (
      !lead ||
      lead.version !== input.expectedVersion ||
      isTerminal(lead.stage) ||
      !isClosableStage(lead.stage)
    )
      return lead && lead.version !== input.expectedVersion
        ? {
            kind: "stale-version-conflict",
            expectedVersion: input.expectedVersion,
            actualVersion: lead.version,
          }
        : { kind: "ownership-conflict" };
    const property = await tx.property.findFirst({
      where: {
        organizationId: input.organizationId,
        id: input.deal.propertyId,
        status: "ACTIVE",
      },
    });
    const broker = await tx.membership.findFirst({
      where: {
        organizationId: input.organizationId,
        userId: input.deal.brokerId,
        role: "BROKER",
        status: "ACTIVE",
      },
    });
    if (!property || !broker) return { kind: "ownership-conflict" };
    const updated = await tx.lead.updateMany({
      where: {
        organizationId: input.organizationId,
        id: input.leadId,
        version: input.expectedVersion,
      },
      data: {
        stage: "CLOSED_WON",
        version: input.lead.version,
        updatedAt: input.lead.updatedAt,
      },
    });
    if (updated.count !== 1)
      return {
        kind: "stale-version-conflict",
        expectedVersion: input.expectedVersion,
        actualVersion: input.expectedVersion + 1,
      };
    const record = await tx.leadIdempotencyRecord.create({
      data: {
        organizationId: input.organizationId,
        commandScope: "CLOSE_WON",
        idempotencyKey: input.idempotencyKey,
        payloadHash,
        leadId: input.leadId,
      },
    });
    const deal = await tx.deal.create({
      data: {
        id: input.deal.id,
        organizationId: input.organizationId,
        leadId: input.leadId,
        propertyId: input.deal.propertyId,
        brokerId: input.deal.brokerId,
        status: "OPEN",
        version: 1,
        createdAt: input.deal.createdAt,
        updatedAt: input.deal.updatedAt,
      },
    });
    await tx.leadTimelineEvent.create({
      data: {
        organizationId: input.organizationId,
        leadId: input.leadId,
        idempotencyId: record.id,
        type: input.timelineEvent.type,
        occurredAt: input.timelineEvent.occurredAt,
        data: input.timelineEvent.data as Prisma.InputJsonValue,
      },
    });
    await tx.dealDomainEvent.create({
      data: {
        organizationId: input.organizationId,
        dealId: deal.id,
        type: "DEAL_CLOSED_WON",
        schemaVersion: 1,
        occurredAt: input.event.occurredAt,
        data: {
          schemaVersion: input.event.schemaVersion,
          organizationId: input.event.organizationId,
          dealId: input.event.dealId,
          leadId: input.event.leadId,
          propertyId: input.event.propertyId,
          brokerId: input.event.brokerId,
          occurredAt: input.event.occurredAt.toISOString(),
        },
      },
    });
    return {
      kind: "ok",
      lead: mapLead({
        ...lead,
        stage: "CLOSED_WON",
        version: input.lead.version,
        updatedAt: input.lead.updatedAt,
      } as LeadRow),
      deal: mapDeal(deal as DealRow),
      timelineEvent: input.timelineEvent,
      event: input.event,
    };
  }

  private async replayWonInTransaction(
    tx: Prisma.TransactionClient,
    prior: ChildIdempotencyRow,
    payloadHash: string,
    idempotencyKey: string,
  ): Promise<DealCloseWonResult> {
    if (prior.payloadHash !== payloadHash)
      return { kind: "idempotency-conflict", idempotencyKey };
    const lead = await tx.lead.findFirst({
      where: { organizationId: prior.organizationId, id: prior.leadId },
    });
    const timeline = await tx.leadTimelineEvent.findFirst({
      where: {
        organizationId: prior.organizationId,
        idempotencyId: prior.id,
        type: "LEAD_CLOSED_WON",
      },
    });
    const dealId = timeline
      ? eventResourceId(timeline as EventRow, "dealId")
      : null;
    const deal = dealId
      ? await tx.deal.findFirst({
          where: { organizationId: prior.organizationId, id: dealId },
        })
      : null;
    const event = deal
      ? await tx.dealDomainEvent.findFirst({
          where: { organizationId: prior.organizationId, dealId: deal.id },
        })
      : null;
    if (!lead || !timeline || !deal || !event)
      return { kind: "ownership-conflict" };
    return {
      kind: "idempotent-replay",
      lead: mapLead(lead as LeadRow),
      deal: mapDeal(deal as DealRow),
      timelineEvent: mapEvent(timeline as EventRow),
      event: mapDealEvent(event as DealEventRow),
    };
  }

  async closeLost(input: DealCloseLostCommand): Promise<DealCloseLostResult> {
    return this.withRetry(() =>
      this.prisma.$transaction((tx) => this.closeLostInTransaction(tx, input), {
        isolationLevel: "Serializable",
      }),
    );
  }

  private async closeLostInTransaction(
    tx: Prisma.TransactionClient,
    input: DealCloseLostCommand,
  ): Promise<DealCloseLostResult> {
    const reason =
      typeof input.timelineEvent.data.reason === "string"
        ? input.timelineEvent.data.reason.trim()
        : "";
    const payloadHash = closeHash({
      organizationId: input.organizationId,
      leadId: input.leadId,
      actor: input.actor,
      scope: "CLOSE_LOST",
      idempotencyKey: input.idempotencyKey,
      expectedVersion: input.expectedVersion,
      reason,
    });
    const prior = await tx.leadIdempotencyRecord.findUnique({
      where: {
        organizationId_commandScope_idempotencyKey: {
          organizationId: input.organizationId,
          commandScope: "CLOSE_LOST",
          idempotencyKey: input.idempotencyKey,
        },
      },
    });
    if (prior) {
      if (prior.payloadHash !== payloadHash)
        return {
          kind: "idempotency-conflict",
          idempotencyKey: input.idempotencyKey,
        };
      const lead = await tx.lead.findFirst({
        where: { organizationId: input.organizationId, id: input.leadId },
      });
      const timeline = await tx.leadTimelineEvent.findFirst({
        where: {
          organizationId: input.organizationId,
          idempotencyId: prior.id,
          type: "LEAD_CLOSED_LOST",
        },
      });
      return lead && timeline
        ? {
            kind: "idempotent-replay",
            lead: mapLead(lead as LeadRow),
            timelineEvent: mapEvent(timeline as EventRow),
          }
        : { kind: "ownership-conflict" };
    }
    const lead = await tx.lead.findFirst({
      where: { organizationId: input.organizationId, id: input.leadId },
    });
    if (
      !lead ||
      lead.version !== input.expectedVersion ||
      isTerminal(lead.stage) ||
      !isClosableStage(lead.stage)
    )
      return lead && lead.version !== input.expectedVersion
        ? {
            kind: "stale-version-conflict",
            expectedVersion: input.expectedVersion,
            actualVersion: lead.version,
          }
        : { kind: "ownership-conflict" };
    const updated = await tx.lead.updateMany({
      where: {
        organizationId: input.organizationId,
        id: input.leadId,
        version: input.expectedVersion,
      },
      data: {
        stage: "CLOSED_LOST",
        version: input.lead.version,
        updatedAt: input.lead.updatedAt,
      },
    });
    if (updated.count !== 1)
      return {
        kind: "stale-version-conflict",
        expectedVersion: input.expectedVersion,
        actualVersion: input.expectedVersion + 1,
      };
    const record = await tx.leadIdempotencyRecord.create({
      data: {
        organizationId: input.organizationId,
        commandScope: "CLOSE_LOST",
        idempotencyKey: input.idempotencyKey,
        payloadHash,
        leadId: input.leadId,
      },
    });
    await tx.leadTimelineEvent.create({
      data: {
        organizationId: input.organizationId,
        leadId: input.leadId,
        idempotencyId: record.id,
        type: input.timelineEvent.type,
        occurredAt: input.timelineEvent.occurredAt,
        data: input.timelineEvent.data as Prisma.InputJsonValue,
      },
    });
    return {
      kind: "ok",
      lead: mapLead({
        ...lead,
        stage: "CLOSED_LOST",
        version: input.lead.version,
        updatedAt: input.lead.updatedAt,
      } as LeadRow),
      timelineEvent: input.timelineEvent,
    };
  }

  async createLeadNote(input: LeadNoteCommand): Promise<LeadNoteCommandResult> {
    const payloadHash = hash({
      organizationId: input.organizationId,
      leadId: input.leadId,
      note: input.note,
      timelineEvent: input.timelineEvent,
    });
    return this.withRetry(() =>
      this.prisma.$transaction(
        (tx) => this.createNoteInTransaction(tx, input, payloadHash),
        { isolationLevel: "Serializable" },
      ),
    );
  }

  private async createNoteInTransaction(
    tx: Prisma.TransactionClient,
    input: LeadNoteCommand,
    payloadHash: string,
  ): Promise<LeadNoteCommandResult> {
    const prior = await tx.leadIdempotencyRecord.findUnique({
      where: {
        organizationId_commandScope_idempotencyKey: {
          organizationId: input.organizationId,
          commandScope: NOTE_CREATE_SCOPE,
          idempotencyKey: input.idempotencyKey,
        },
      },
    });
    if (prior) {
      if (prior.payloadHash !== payloadHash)
        return {
          kind: "idempotency-conflict",
          idempotencyKey: input.idempotencyKey,
        };
      const event = await tx.leadTimelineEvent.findFirst({
        where: {
          organizationId: input.organizationId,
          idempotencyId: prior.id,
          type: "LEAD_NOTE_ADDED",
        },
      });
      const noteId = event && eventResourceId(event as EventRow, "noteId");
      const note = noteId
        ? await tx.leadNote.findFirst({
            where: { organizationId: input.organizationId, id: noteId },
          })
        : null;
      if (!event || !note) return { kind: "ownership-conflict" };
      return {
        kind: "idempotent-replay",
        note: mapNote(note as NoteRow, mapEvent(event as EventRow)),
        timelineEvent: mapEvent(event as EventRow),
      };
    }
    const lead = await tx.lead.findFirst({
      where: { organizationId: input.organizationId, id: input.leadId },
    });
    if (!lead || isTerminal(lead.stage)) return { kind: "ownership-conflict" };
    try {
      const note = await tx.leadNote.create({
        data: {
          id: input.note.id,
          organizationId: input.organizationId,
          leadId: input.leadId,
          body: input.note.body,
          createdByUserId: input.createdByUserId,
          createdAt: input.note.createdAt,
        },
      });
      const record = await tx.leadIdempotencyRecord.create({
        data: {
          organizationId: input.organizationId,
          commandScope: NOTE_CREATE_SCOPE,
          idempotencyKey: input.idempotencyKey,
          payloadHash,
          leadId: input.leadId,
        },
      });
      await this.createEvents(tx, record.id, [input.timelineEvent]);
      return {
        kind: "ok",
        note: mapNote(note as NoteRow, input.timelineEvent),
        timelineEvent: input.timelineEvent,
      };
    } catch (error) {
      if (isIdempotencyUnique(error)) throw error;
      if (isCode(error, "P2003")) return { kind: "ownership-conflict" };
      throw error;
    }
  }

  async createLeadTask(input: LeadTaskCommand): Promise<LeadTaskCommandResult> {
    const payloadHash = hash({
      organizationId: input.organizationId,
      leadId: input.leadId,
      task: input.task,
      timelineEvent: input.timelineEvent,
    });
    return this.withRetry(() =>
      this.prisma.$transaction(
        (tx) => this.createTaskInTransaction(tx, input, payloadHash),
        { isolationLevel: "Serializable" },
      ),
    );
  }

  private async createTaskInTransaction(
    tx: Prisma.TransactionClient,
    input: LeadTaskCommand,
    payloadHash: string,
  ): Promise<LeadTaskCommandResult> {
    const prior = await tx.leadIdempotencyRecord.findUnique({
      where: {
        organizationId_commandScope_idempotencyKey: {
          organizationId: input.organizationId,
          commandScope: TASK_CREATE_SCOPE,
          idempotencyKey: input.idempotencyKey,
        },
      },
    });
    if (prior) {
      if (prior.payloadHash !== payloadHash)
        return {
          kind: "idempotency-conflict",
          idempotencyKey: input.idempotencyKey,
        };
      const event = await tx.leadTimelineEvent.findFirst({
        where: {
          organizationId: input.organizationId,
          idempotencyId: prior.id,
          type: "LEAD_TASK_CREATED",
        },
      });
      const taskId = event && eventResourceId(event as EventRow, "taskId");
      const task = taskId
        ? await tx.leadTask.findFirst({
            where: { organizationId: input.organizationId, id: taskId },
          })
        : null;
      if (!event || !task) return { kind: "ownership-conflict" };
      return {
        kind: "idempotent-replay",
        task: mapTask(task as TaskRow, mapEvent(event as EventRow)),
        timelineEvent: mapEvent(event as EventRow),
      };
    }
    const lead = await tx.lead.findFirst({
      where: { organizationId: input.organizationId, id: input.leadId },
    });
    if (!lead || isTerminal(lead.stage)) return { kind: "ownership-conflict" };
    try {
      const task = await tx.leadTask.create({
        data: {
          id: input.task.id,
          organizationId: input.organizationId,
          leadId: input.leadId,
          title: input.task.title,
          dueAt: input.task.dueAt,
          status: input.task.status,
          completedAt: input.task.completedAt,
          version: input.task.version,
          createdByUserId: input.createdByUserId,
          createdAt: input.task.createdAt,
        },
      });
      const record = await tx.leadIdempotencyRecord.create({
        data: {
          organizationId: input.organizationId,
          commandScope: TASK_CREATE_SCOPE,
          idempotencyKey: input.idempotencyKey,
          payloadHash,
          leadId: input.leadId,
        },
      });
      await this.createEvents(tx, record.id, [input.timelineEvent]);
      return {
        kind: "ok",
        task: mapTask(task as TaskRow, input.timelineEvent),
        timelineEvent: input.timelineEvent,
      };
    } catch (error) {
      if (isIdempotencyUnique(error)) throw error;
      if (isCode(error, "P2003")) return { kind: "ownership-conflict" };
      throw error;
    }
  }

  async findLeadTask(
    organizationId: string,
    leadId: string,
    taskId: string,
  ): Promise<LeadTask | null> {
    const task = await this.prisma.leadTask.findFirst({
      where: { organizationId, leadId, id: taskId },
    });
    if (!task) return null;
    const event = await this.prisma.leadTimelineEvent.findFirst({
      where: {
        organizationId,
        leadId,
        type: "LEAD_TASK_CREATED",
        data: { path: ["taskId"], equals: taskId },
      },
    });
    return event ? mapTask(task as TaskRow, mapEvent(event as EventRow)) : null;
  }

  async completeLeadTask(
    input: LeadTaskTransitionCommand,
  ): Promise<LeadTaskCommandResult> {
    return this.transitionLeadTask(
      input,
      TASK_COMPLETE_SCOPE,
      "LEAD_TASK_COMPLETED",
    );
  }

  async rescheduleLeadTask(
    input: LeadTaskTransitionCommand,
  ): Promise<LeadTaskCommandResult> {
    return this.transitionLeadTask(
      input,
      TASK_RESCHEDULE_SCOPE,
      "LEAD_TASK_RESCHEDULED",
    );
  }

  private async transitionLeadTask(
    input: LeadTaskTransitionCommand,
    scope: string,
    eventType: "LEAD_TASK_COMPLETED" | "LEAD_TASK_RESCHEDULED",
  ): Promise<LeadTaskCommandResult> {
    const payloadHash = hash({
      organizationId: input.organizationId,
      leadId: input.leadId,
      expectedVersion: input.expectedVersion,
      task: input.task,
      timelineEvent: input.timelineEvent,
    });
    return this.withRetry(() =>
      this.prisma.$transaction(
        (tx) =>
          this.transitionTaskInTransaction(
            tx,
            input,
            scope,
            eventType,
            payloadHash,
          ),
        { isolationLevel: "Serializable" },
      ),
    );
  }

  private async transitionTaskInTransaction(
    tx: Prisma.TransactionClient,
    input: LeadTaskTransitionCommand,
    scope: string,
    eventType: "LEAD_TASK_COMPLETED" | "LEAD_TASK_RESCHEDULED",
    payloadHash: string,
  ): Promise<LeadTaskCommandResult> {
    const prior = await tx.leadIdempotencyRecord.findUnique({
      where: {
        organizationId_commandScope_idempotencyKey: {
          organizationId: input.organizationId,
          commandScope: scope,
          idempotencyKey: input.idempotencyKey,
        },
      },
    });
    if (prior) {
      if (prior.payloadHash !== payloadHash)
        return {
          kind: "idempotency-conflict",
          idempotencyKey: input.idempotencyKey,
        };
      const event = await tx.leadTimelineEvent.findFirst({
        where: {
          organizationId: input.organizationId,
          idempotencyId: prior.id,
          type: eventType,
        },
      });
      const taskId = event && eventResourceId(event as EventRow, "taskId");
      const task = taskId
        ? await tx.leadTask.findFirst({
            where: { organizationId: input.organizationId, id: taskId },
          })
        : null;
      if (!event || !task) return { kind: "ownership-conflict" };
      return {
        kind: "idempotent-replay",
        task: mapTask(task as TaskRow, mapEvent(event as EventRow)),
        timelineEvent: mapEvent(event as EventRow),
      };
    }
    const lead = await tx.lead.findFirst({
      where: { organizationId: input.organizationId, id: input.leadId },
    });
    if (!lead || isTerminal(lead.stage)) return { kind: "ownership-conflict" };
    const current = await tx.leadTask.findFirst({
      where: {
        organizationId: input.organizationId,
        leadId: input.leadId,
        id: input.task.id,
      },
    });
    if (!current || current.status !== "OPEN")
      return { kind: "ownership-conflict" };
    if (current.version !== input.expectedVersion)
      return {
        kind: "stale-version-conflict",
        expectedVersion: input.expectedVersion,
        actualVersion: current.version,
      };
    const updated = await tx.leadTask.updateMany({
      where: {
        organizationId: input.organizationId,
        leadId: input.leadId,
        id: input.task.id,
        status: "OPEN",
        version: input.expectedVersion,
      },
      data: {
        dueAt: input.task.dueAt,
        status: input.task.status,
        completedAt: input.task.completedAt,
        version: input.task.version,
      },
    });
    if (updated.count !== 1) return { kind: "ownership-conflict" };
    const record = await tx.leadIdempotencyRecord.create({
      data: {
        organizationId: input.organizationId,
        commandScope: scope,
        idempotencyKey: input.idempotencyKey,
        payloadHash,
        leadId: input.leadId,
      },
    });
    await this.createEvents(tx, record.id, [input.timelineEvent]);
    const task = await tx.leadTask.findFirstOrThrow({
      where: {
        organizationId: input.organizationId,
        leadId: input.leadId,
        id: input.task.id,
      },
    });
    return {
      kind: "ok",
      task: mapTask(task as TaskRow, input.timelineEvent),
      timelineEvent: input.timelineEvent,
    };
  }

  async appendTimelineEvents(
    events: readonly TimelineEventIntent[],
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      for (const event of events) {
        const record = await tx.leadIdempotencyRecord.create({
          data: {
            organizationId: event.organizationId,
            commandScope: APPEND_SCOPE,
            idempotencyKey: randomUUID(),
            payloadHash: hash(event),
            leadId: event.leadId,
          },
        });
        await this.createEvents(tx, record.id, [event]);
      }
    });
  }

  private async withRetry<T>(operation: () => Promise<T>): Promise<T> {
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt += 1) {
      try {
        return await operation();
      } catch (error) {
        if (
          !(isCode(error, "P2034") || isCode(error, "P2002")) ||
          attempt === MAX_RETRIES
        )
          throw error;
      }
    }
    throw new Error("Unreachable retry state");
  }
}
