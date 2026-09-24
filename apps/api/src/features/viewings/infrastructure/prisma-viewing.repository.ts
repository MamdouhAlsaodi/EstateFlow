import { Prisma, type PrismaClient } from "@prisma/client";
import {
  ViewingConflictError,
  ViewingValidationError,
  nextViewingState,
} from "../domain/viewing.js";
import type {
  Viewing,
  ViewingAction,
  ViewingStatus,
  ViewingTransition,
} from "../domain/viewing.js";
import type {
  Availability,
  AvailabilityException,
  AvailabilityRule,
  ViewingDetail,
  ViewingPage,
  ViewingRepository,
} from "../application/viewing-repository.js";

type Db = Prisma.TransactionClient;
type ViewingRow = {
  id: string;
  organizationId: string;
  leadId: string;
  propertyId: string;
  brokerId: string;
  requestedByUserId: string;
  startAt: Date;
  endAt: Date;
  status: ViewingStatus;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
};
type TransitionRow = {
  id: string;
  organizationId: string;
  viewingId: string;
  action: ViewingAction;
  fromStatus: ViewingStatus | null;
  toStatus: ViewingStatus;
  startAt: Date;
  endAt: Date;
  reason: string | null;
  actorId: string;
  createdAt: Date;
};

function mapViewing(row: ViewingRow): Viewing {
  return {
    id: row.id,
    organizationId: row.organizationId,
    leadId: row.leadId,
    propertyId: row.propertyId,
    brokerId: row.brokerId,
    requestedByUserId: row.requestedByUserId,
    startAt: row.startAt,
    endAt: row.endAt,
    status: row.status,
    ...(row.notes === null ? {} : { notes: row.notes }),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}
function mapTransition(row: TransitionRow): ViewingTransition {
  return {
    id: row.id,
    organizationId: row.organizationId,
    viewingId: row.viewingId,
    action: row.action,
    ...(row.fromStatus === null ? {} : { fromStatus: row.fromStatus }),
    toStatus: row.toStatus,
    startAt: row.startAt,
    endAt: row.endAt,
    ...(row.reason === null ? {} : { reason: row.reason }),
    actorId: row.actorId,
    createdAt: row.createdAt,
  };
}
function isCode(error: unknown, code: string): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError && error.code === code
  );
}
function isViewingConflict(error: unknown): boolean {
  if (isCode(error, "P2004")) return true;
  if (!(error instanceof Error)) return false;
  const message = error.message.toLowerCase();
  return (
    message.includes("23p01") ||
    message.includes("viewing_confirmed_broker_interval_exclusion")
  );
}
function isRetryable(error: unknown): boolean {
  return isCode(error, "P2034");
}

export class PrismaViewingRepository implements ViewingRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async createViewing(
    viewing: Viewing,
  ): Promise<ViewingDetail | { kind: "not-found" }> {
    return this.prisma.$transaction(async (tx) => {
      const [lead, property, broker] = await Promise.all([
        tx.lead.findFirst({
          where: { organizationId: viewing.organizationId, id: viewing.leadId },
          select: { id: true },
        }),
        tx.property.findFirst({
          where: {
            organizationId: viewing.organizationId,
            id: viewing.propertyId,
            status: "ACTIVE",
          },
          select: { id: true },
        }),
        tx.membership.findFirst({
          where: {
            organizationId: viewing.organizationId,
            userId: viewing.brokerId,
            role: "BROKER",
            status: "ACTIVE",
          },
          select: { userId: true },
        }),
      ]);
      if (!lead || !property || !broker) return { kind: "not-found" };
      const row = await tx.viewing.create({
        data: {
          id: viewing.id,
          organizationId: viewing.organizationId,
          leadId: viewing.leadId,
          propertyId: viewing.propertyId,
          brokerId: viewing.brokerId,
          requestedByUserId: viewing.requestedByUserId,
          startAt: viewing.startAt,
          endAt: viewing.endAt,
          status: "REQUESTED",
          notes: viewing.notes ?? null,
          createdAt: viewing.createdAt,
          updatedAt: viewing.updatedAt,
        },
      });
      await this.insertTransition(
        tx,
        row as ViewingRow,
        "REQUESTED",
        viewing.requestedByUserId,
        viewing.createdAt,
      );
      return (
        (await this.detailInTransaction(
          tx,
          viewing.organizationId,
          viewing.id,
        )) ?? { kind: "not-found" as const }
      );
    });
  }

  async findViewing(
    organizationId: string,
    viewingId: string,
  ): Promise<ViewingDetail | null> {
    return this.detailInTransaction(this.prisma, organizationId, viewingId);
  }

  async listViewings(input: {
    organizationId: string;
    brokerId?: string;
    from?: Date;
    to?: Date;
    cursor?: string;
    limit: number;
  }): Promise<ViewingPage> {
    try {
      const rows = await this.prisma.viewing.findMany({
        where: {
          organizationId: input.organizationId,
          ...(input.brokerId === undefined ? {} : { brokerId: input.brokerId }),
          ...(input.from === undefined && input.to === undefined
            ? {}
            : {
                startAt: {
                  ...(input.from === undefined ? {} : { gte: input.from }),
                  ...(input.to === undefined ? {} : { lt: input.to }),
                },
              }),
        },
        orderBy: [{ startAt: "asc" }, { id: "asc" }],
        ...(input.cursor === undefined
          ? {}
          : { cursor: { id: input.cursor }, skip: 1 }),
        take: input.limit + 1,
      });
      const items = (rows as ViewingRow[])
        .slice(0, input.limit)
        .map(mapViewing);
      return {
        items,
        nextCursor:
          rows.length > input.limit ? (items.at(-1)?.id ?? null) : null,
      };
    } catch (error) {
      if (isCode(error, "P2025"))
        throw new ViewingValidationError("Invalid viewing cursor");
      throw error;
    }
  }

  async confirmViewing(input: {
    organizationId: string;
    viewingId: string;
    actorId: string;
    at: Date;
  }): Promise<
    ViewingDetail | { kind: "not-found" } | { kind: "invalid-state" }
  > {
    try {
      return await this.withRetry(() =>
        this.prisma.$transaction(
          async (tx) => {
            const row = await tx.viewing.findFirst({
              where: {
                organizationId: input.organizationId,
                id: input.viewingId,
              },
            });
            if (!row) return { kind: "not-found" };
            if (row.status !== "REQUESTED") return { kind: "invalid-state" };
            if (
              !(await this.isAvailable(
                tx,
                input.organizationId,
                row.brokerId,
                row.startAt,
                row.endAt,
              ))
            )
              throw new ViewingValidationError(
                "Viewing is outside broker availability",
              );
            const updated = await tx.viewing.updateMany({
              where: {
                organizationId: input.organizationId,
                id: input.viewingId,
                status: "REQUESTED",
              },
              data: { status: "CONFIRMED", updatedAt: input.at },
            });
            if (updated.count !== 1) return { kind: "invalid-state" };
            await this.insertTransition(
              tx,
              {
                ...row,
                status: "CONFIRMED",
                updatedAt: input.at,
              } as ViewingRow,
              "CONFIRMED",
              input.actorId,
              input.at,
              "CONFIRMED",
            );
            return (
              (await this.detailInTransaction(
                tx,
                input.organizationId,
                input.viewingId,
              )) ?? { kind: "not-found" as const }
            );
          },
          { isolationLevel: "Serializable" },
        ),
      );
    } catch (error) {
      if (isViewingConflict(error)) throw new ViewingConflictError();
      throw error;
    }
  }

  async rescheduleViewing(input: {
    organizationId: string;
    viewingId: string;
    startAt: Date;
    endAt: Date;
    reason?: string;
    actorId: string;
    at: Date;
  }): Promise<
    ViewingDetail | { kind: "not-found" } | { kind: "invalid-state" }
  > {
    try {
      return await this.withRetry(() =>
        this.prisma.$transaction(
          async (tx) => {
            const row = await tx.viewing.findFirst({
              where: {
                organizationId: input.organizationId,
                id: input.viewingId,
              },
            });
            if (!row) return { kind: "not-found" };
            if (row.status !== "REQUESTED" && row.status !== "CONFIRMED")
              return { kind: "invalid-state" };
            if (input.startAt >= input.endAt)
              throw new ViewingValidationError(
                "Viewing interval must be positive",
              );
            if (
              row.status === "CONFIRMED" &&
              !(await this.isAvailable(
                tx,
                input.organizationId,
                row.brokerId,
                input.startAt,
                input.endAt,
              ))
            )
              throw new ViewingValidationError(
                "Viewing is outside broker availability",
              );
            const updated = await tx.viewing.updateMany({
              where: {
                organizationId: input.organizationId,
                id: input.viewingId,
                status: row.status,
              },
              data: {
                startAt: input.startAt,
                endAt: input.endAt,
                updatedAt: input.at,
              },
            });
            if (updated.count !== 1) return { kind: "invalid-state" };
            await this.insertTransition(
              tx,
              {
                ...row,
                startAt: input.startAt,
                endAt: input.endAt,
                updatedAt: input.at,
              } as ViewingRow,
              "RESCHEDULED",
              input.actorId,
              input.at,
              row.status,
            );
            return (
              (await this.detailInTransaction(
                tx,
                input.organizationId,
                input.viewingId,
              )) ?? { kind: "not-found" as const }
            );
          },
          { isolationLevel: "Serializable" },
        ),
      );
    } catch (error) {
      if (isViewingConflict(error)) throw new ViewingConflictError();
      throw error;
    }
  }

  async transitionViewing(input: {
    organizationId: string;
    viewingId: string;
    action: Exclude<ViewingAction, "CONFIRMED" | "RESCHEDULED" | "REQUESTED">;
    reason?: string;
    actorId: string;
    at: Date;
  }): Promise<
    ViewingDetail | { kind: "not-found" } | { kind: "invalid-state" }
  > {
    return this.prisma
      .$transaction(async (tx) => {
        const row = await tx.viewing.findFirst({
          where: { organizationId: input.organizationId, id: input.viewingId },
        });
        if (!row) return { kind: "not-found" as const };
        const toStatus = nextViewingState(row.status, input.action);
        const updated = await tx.viewing.updateMany({
          where: {
            organizationId: input.organizationId,
            id: input.viewingId,
            status: row.status,
          },
          data: { status: toStatus, updatedAt: input.at },
        });
        if (updated.count !== 1) return { kind: "invalid-state" as const };
        await this.insertTransition(
          tx,
          { ...row, status: toStatus, updatedAt: input.at } as ViewingRow,
          input.action,
          input.actorId,
          input.at,
          row.status,
          input.reason,
        );
        return (
          (await this.detailInTransaction(
            tx,
            input.organizationId,
            input.viewingId,
          )) ?? { kind: "not-found" as const }
        );
      })
      .catch((error: unknown) => {
        if (error instanceof Error && error.name === "ViewingTransitionError")
          throw error;
        throw error;
      });
  }

  async getAvailability(
    organizationId: string,
    brokerId: string,
  ): Promise<Availability | null> {
    if (!(await this.activeBroker(organizationId, brokerId))) return null;
    const [rules, exceptions] = await Promise.all([
      this.prisma.brokerAvailabilityRule.findMany({
        where: { organizationId, brokerId },
        orderBy: [{ weekday: "asc" }, { startMinute: "asc" }],
      }),
      this.prisma.brokerAvailabilityException.findMany({
        where: { organizationId, brokerId },
        orderBy: [{ localDate: "asc" }, { startMinute: "asc" }],
      }),
    ]);
    return {
      rules: rules.map((row) => ({
        id: row.id,
        brokerId: row.brokerId,
        weekday: row.weekday,
        startMinute: row.startMinute,
        endMinute: row.endMinute,
        timezone: row.timezone,
      })),
      exceptions: exceptions.map((row) => ({
        id: row.id,
        brokerId: row.brokerId,
        localDate: row.localDate,
        kind: row.kind,
        startMinute: row.startMinute,
        endMinute: row.endMinute,
        timezone: row.timezone,
      })),
    };
  }

  async addAvailabilityRule(input: {
    id: string;
    organizationId: string;
    brokerId: string;
    weekday: number;
    startMinute: number;
    endMinute: number;
    timezone: string;
    createdBy: string;
  }): Promise<AvailabilityRule | { kind: "not-found" }> {
    const broker = await this.activeBroker(
      input.organizationId,
      input.brokerId,
    );
    if (!broker) return { kind: "not-found" };
    const row = await this.prisma.brokerAvailabilityRule.create({
      data: input,
    });
    return {
      id: row.id,
      brokerId: row.brokerId,
      weekday: row.weekday,
      startMinute: row.startMinute,
      endMinute: row.endMinute,
      timezone: row.timezone,
    };
  }

  async addAvailabilityException(input: {
    id: string;
    organizationId: string;
    brokerId: string;
    localDate: string;
    kind: "BLOCKED" | "EXTRA";
    startMinute: number;
    endMinute: number;
    timezone: string;
    createdBy: string;
  }): Promise<AvailabilityException | { kind: "not-found" }> {
    const broker = await this.activeBroker(
      input.organizationId,
      input.brokerId,
    );
    if (!broker) return { kind: "not-found" };
    const row = await this.prisma.brokerAvailabilityException.create({
      data: input,
    });
    return {
      id: row.id,
      brokerId: row.brokerId,
      localDate: row.localDate,
      kind: row.kind,
      startMinute: row.startMinute,
      endMinute: row.endMinute,
      timezone: row.timezone,
    };
  }

  private async activeBroker(organizationId: string, brokerId: string) {
    return this.prisma.membership.findFirst({
      where: {
        organizationId,
        userId: brokerId,
        role: "BROKER",
        status: "ACTIVE",
      },
      select: { userId: true },
    });
  }

  private async detailInTransaction(
    db: Db | PrismaClient,
    organizationId: string,
    viewingId: string,
  ): Promise<ViewingDetail | null> {
    const row = await db.viewing.findFirst({
      where: { organizationId, id: viewingId },
    });
    if (!row) return null;
    const transitions = await db.viewingTransition.findMany({
      where: { organizationId, viewingId },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    });
    return {
      viewing: mapViewing(row as ViewingRow),
      transitions: (transitions as TransitionRow[]).map(mapTransition),
    };
  }

  private async insertTransition(
    db: Db,
    row: ViewingRow,
    action: ViewingAction,
    actorId: string,
    at: Date,
    fromStatus?: ViewingStatus,
    reason?: string,
  ): Promise<void> {
    await db.viewingTransition.create({
      data: {
        id: crypto.randomUUID(),
        organizationId: row.organizationId,
        viewingId: row.id,
        action,
        fromStatus: fromStatus ?? null,
        toStatus: row.status,
        startAt: row.startAt,
        endAt: row.endAt,
        reason: reason ?? null,
        actorId,
        createdAt: at,
      },
    });
    const idempotencyKey = crypto.randomUUID();
    const record = await db.leadIdempotencyRecord.create({
      data: {
        organizationId: row.organizationId,
        commandScope: "VIEWING_TIMELINE",
        idempotencyKey,
        payloadHash: idempotencyKey.replaceAll("-", ""),
        leadId: row.leadId,
      },
    });
    await db.leadTimelineEvent.create({
      data: {
        organizationId: row.organizationId,
        leadId: row.leadId,
        idempotencyId: record.id,
        type: `VIEWING_${action}` as "VIEWING_REQUESTED",
        occurredAt: at,
        data: {
          viewingId: row.id,
          status: row.status,
          startAt: row.startAt.toISOString(),
          endAt: row.endAt.toISOString(),
          ...(reason === undefined ? {} : { reason }),
        },
      },
    });
  }

  private async isAvailable(
    db: Db,
    organizationId: string,
    brokerId: string,
    startAt: Date,
    endAt: Date,
  ): Promise<boolean> {
    const [rules, exceptions] = await Promise.all([
      db.brokerAvailabilityRule.findMany({
        where: { organizationId, brokerId },
        orderBy: { startMinute: "asc" },
      }),
      db.brokerAvailabilityException.findMany({
        where: { organizationId, brokerId },
        orderBy: { startMinute: "asc" },
      }),
    ]);
    if (rules.length === 0 && exceptions.length === 0) return false;
    const timezone = rules[0]?.timezone ?? exceptions[0]?.timezone;
    if (!timezone) return false;
    const start = localParts(startAt, timezone);
    const end = localParts(endAt, timezone);
    if (start.localDate !== end.localDate) return false;
    const intervalStart = start.minute;
    const intervalEnd = end.minute;
    const dayRules = rules.filter(
      (rule) => rule.weekday === start.weekday && rule.timezone === timezone,
    );
    const dayExceptions = exceptions.filter(
      (exception) =>
        exception.localDate === start.localDate &&
        exception.timezone === timezone,
    );
    if (
      dayExceptions.some(
        (exception) =>
          exception.kind === "BLOCKED" &&
          exception.startMinute < intervalEnd &&
          exception.endMinute > intervalStart,
      )
    )
      return false;
    const weekly = dayRules.some(
      (rule) =>
        rule.startMinute <= intervalStart && rule.endMinute >= intervalEnd,
    );
    const extra = dayExceptions.some(
      (exception) =>
        exception.kind === "EXTRA" &&
        exception.startMinute <= intervalStart &&
        exception.endMinute >= intervalEnd,
    );
    return weekly || extra;
  }

  private async withRetry<T>(operation: () => Promise<T>): Promise<T> {
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      try {
        return await operation();
      } catch (error) {
        if (!isRetryable(error) || attempt === 3) throw error;
      }
    }
    throw new Error("Unreachable retry state");
  }
}

function localParts(
  value: Date,
  timezone: string,
): { localDate: string; weekday: number; minute: number } {
  const parts: Record<string, string> = {};
  try {
    for (const part of new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      weekday: "short",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).formatToParts(value)) {
      if (part.type !== "literal") parts[part.type] = part.value;
    }
  } catch {
    throw new ViewingValidationError("Invalid availability timezone");
  }
  const weekday = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(
    parts.weekday,
  );
  if (weekday < 0)
    throw new ViewingValidationError("Invalid availability timezone");
  return {
    localDate: `${parts.year}-${parts.month}-${parts.day}`,
    weekday,
    minute: Number(parts.hour) * 60 + Number(parts.minute),
  };
}
