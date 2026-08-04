import { createHash, randomUUID } from "node:crypto";
import { Prisma, type PrismaClient } from "@prisma/client";
import { LeadStage, LeadValidationError, type Lead, type TimelineEventIntent } from "../domain/lead.js";
import type {
  CreateLeadInput,
  LeadListCriteria,
  LeadMutationInput,
  LeadMutationResult,
  LeadRepository,
} from "../application/lead-repository.js";

const CREATE_SCOPE = "LEAD_CREATE";
const UPDATE_SCOPE = "LEAD_UPDATE";
const APPEND_SCOPE = "LEAD_TIMELINE_APPEND";
const MAX_RETRIES = 3;

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
  type: TimelineEventIntent["type"];
  leadId: string;
  organizationId: string;
  occurredAt: Date;
  data: unknown;
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

export class PrismaLeadRepository implements LeadRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findLead(organizationId: string, leadId: string): Promise<Lead | null> {
    const row = await this.prisma.lead.findFirst({
      where: { organizationId, id: leadId },
    });
    return row ? mapLead(row as LeadRow) : null;
  }

  async listLeads(organizationId: string, criteria: LeadListCriteria): Promise<{ items: readonly Lead[]; nextCursor: string | null }> {
    const stage = criteria.stage;
    const cursor = criteria.cursor;
    const limit = criteria.limit ?? 50;
    if (typeof organizationId !== "string" || organizationId.trim().length === 0) throw new LeadValidationError("Invalid lead list query");
    if (stage !== undefined && !Object.values(LeadStage).includes(stage)) throw new LeadValidationError("Invalid lead list query");
    if (cursor !== undefined && (typeof cursor !== "string" || cursor.trim().length === 0 || cursor.length > 255)) throw new LeadValidationError("Invalid lead list query");
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) throw new LeadValidationError("Invalid lead list query");
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
      return { items, nextCursor: hasNext ? items.at(-1)?.id ?? null : null };
    } catch (error) {
      if (isCode(error, "P2025")) throw new LeadValidationError("Invalid lead list query");
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
          !(isCode(error, "P2034") || isIdempotencyUnique(error)) ||
          attempt === MAX_RETRIES
        )
          throw error;
      }
    }
    throw new Error("Unreachable retry state");
  }
}
