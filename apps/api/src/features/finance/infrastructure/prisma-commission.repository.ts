import { Prisma } from "@prisma/client";
import type { PrismaClient } from "@prisma/client";
import {
  createCommissionPlanVersion,
  createCommissionableValue,
  createExpectedAccrual,
} from "../domain/commission.js";
import type { Money } from "../domain/money.js";
import type {
  CommissionAccrual,
  CommissionPlanVersion,
  CommissionableValue,
  PersistedDeal,
  PersistedDealClosedWonEvent,
} from "../domain/commission.js";
import type {
  CommissionAccrualCommand,
  CommissionCaptureCommand,
  CommissionMutationResult,
  CommissionPlanVersionCommand,
  CommissionPlanVersionMutationResult,
  CommissionRepository,
} from "../application/commission-repository.js";

type Db = Prisma.TransactionClient;
type PlanRow = Prisma.CommissionPlanVersionGetPayload<{
  include: { recipients: true };
}>;
type AccrualRow = Prisma.CommissionAccrualGetPayload<{
  include: {
    splits: true;
    deal: true;
    event: true;
    value: true;
    plan: { include: { recipients: true } };
  };
}>;
type EventRow = {
  id: string;
  organizationId: string;
  dealId: string;
  type: string;
  schemaVersion: number;
};

function isConstraint(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    (error.code === "P2002" || error.code === "P2003")
  );
}
function isScopedEventUniqueConflict(error: unknown): boolean {
  if (
    !(error instanceof Prisma.PrismaClientKnownRequestError) ||
    error.code !== "P2002"
  )
    return false;
  const target = error.meta?.target;
  return (
    Array.isArray(target) &&
    target.includes("organizationId") &&
    target.includes("dealClosedWonEventId")
  );
}
function recipientKind(value: string): "BROKER" | "OFFICE" {
  if (value === "BROKER" || value === "OFFICE") return value;
  throw new Error("Persisted commission recipient kind is invalid");
}
function mapPlan(row: PlanRow): CommissionPlanVersion {
  return createCommissionPlanVersion({
    id: row.id,
    organizationId: row.organizationId,
    version: row.version,
    rateBps: row.rateBps,
    recipients: row.recipients
      .sort((a, b) => a.order - b.order)
      .map((recipient) => ({
        order: recipient.order,
        kind: recipientKind(recipient.kind),
        splitBps: recipient.splitBps,
      })),
  });
}
function mapValue(row: {
  id: string;
  dealId: string;
  organizationId: string;
  amountMinor: bigint;
  currency: string;
  capturedBy: string;
  capturedAt: Date;
}): CommissionableValue {
  return createCommissionableValue(row);
}
function validEvent(
  row: EventRow | null,
): row is EventRow & { type: "DEAL_CLOSED_WON"; schemaVersion: 1 } {
  return (
    row !== null && row.type === "DEAL_CLOSED_WON" && row.schemaVersion === 1
  );
}
function allocationMoney(amountMinor: bigint, currency: string): Money {
  if (
    typeof amountMinor !== "bigint" ||
    amountMinor < 0n ||
    !/^[A-Za-z]{3}$/.test(currency)
  )
    throw new Error("Persisted commission allocation is invalid");
  return Object.freeze({ amountMinor, currency: currency.toUpperCase() });
}
function mapAccrual(row: AccrualRow): CommissionAccrual {
  const event = row.event;
  if (!validEvent(event) || row.status !== "EXPECTED")
    throw new Error("Persisted commission accrual authority is invalid");
  const value = mapValue(row.value);
  const plan = mapPlan(row.plan);
  const splits = row.splits.map((split) =>
    Object.freeze({
      order: split.order,
      kind: recipientKind(split.kind),
      money: allocationMoney(split.amountMinor, split.currency),
    }),
  );
  return Object.freeze({
    id: row.id,
    organizationId: row.organizationId,
    dealId: row.dealId,
    dealClosedWonEventId: row.dealClosedWonEventId,
    plan,
    value,
    totalMoney: allocationMoney(row.totalAmountMinor, row.currency),
    splits: Object.freeze(splits),
    status: "EXPECTED",
    createdAt: new Date(row.createdAt.getTime()),
  });
}
function includeAccrual() {
  return {
    splits: { orderBy: { order: "asc" as const } },
    deal: true,
    event: true,
    value: true,
    plan: { include: { recipients: { orderBy: { order: "asc" as const } } } },
  };
}

export class PrismaCommissionRepository implements CommissionRepository {
  public constructor(private readonly prisma: PrismaClient) {}

  public async findDeal(
    organizationId: string,
    dealId: string,
  ): Promise<PersistedDeal | null> {
    return this.prisma.deal.findUnique({
      where: { organizationId_id: { organizationId, id: dealId } },
      select: { id: true, organizationId: true },
    });
  }

  public async findDealClosedWonEvent(
    organizationId: string,
    eventId: string,
  ): Promise<PersistedDealClosedWonEvent | null> {
    const row = await this.prisma.dealDomainEvent.findUnique({
      where: { organizationId_id: { organizationId, id: eventId } },
      select: {
        id: true,
        organizationId: true,
        dealId: true,
        type: true,
        schemaVersion: true,
      },
    });
    if (!validEvent(row)) return null;
    return {
      id: row.id,
      organizationId: row.organizationId,
      dealId: row.dealId,
      type: "DEAL_CLOSED_WON",
      schemaVersion: 1,
    };
  }

  public async findCommissionableValue(
    organizationId: string,
    valueId: string,
  ): Promise<CommissionableValue | null> {
    const row = await this.prisma.commissionableValue.findUnique({
      where: { organizationId_id: { organizationId, id: valueId } },
    });
    return row ? mapValue(row) : null;
  }

  public async findPlanVersion(
    organizationId: string,
    planVersionId: string,
  ): Promise<CommissionPlanVersion | null> {
    const row = await this.prisma.commissionPlanVersion.findUnique({
      where: { organizationId_id: { organizationId, id: planVersionId } },
      include: { recipients: { orderBy: { order: "asc" } } },
    });
    return row ? mapPlan(row) : null;
  }

  public async createPlanVersion(
    input: CommissionPlanVersionCommand,
  ): Promise<CommissionPlanVersionMutationResult> {
    const plan = input.plan;
    try {
      await this.prisma.commissionPlanVersion.create({
        data: {
          id: plan.id,
          organizationId: plan.organizationId,
          version: plan.version,
          rateBps: plan.rateBps,
          recipients: {
            create: plan.recipients.map((recipient) => ({
              order: recipient.order,
              kind: recipient.kind,
              splitBps: recipient.splitBps,
            })),
          },
        },
      });
      return { kind: "created-plan", plan };
    } catch (error) {
      if (isConstraint(error))
        return {
          kind: "conflict",
          reason: "plan-ownership-or-version-conflict",
        };
      throw error;
    }
  }

  public async captureCommissionableValue(
    input: CommissionCaptureCommand,
  ): Promise<CommissionMutationResult> {
    const value = input.value;
    try {
      await this.prisma.commissionableValue.create({
        data: {
          id: value.id,
          organizationId: value.organizationId,
          dealId: value.dealId,
          amountMinor: value.money.amountMinor,
          currency: value.money.currency,
          capturedBy: value.capturedBy,
          capturedAt: value.capturedAt,
        },
      });
      return { kind: "captured", value };
    } catch (error) {
      if (isConstraint(error))
        return { kind: "conflict", reason: "value-ownership-or-deal-conflict" };
      throw error;
    }
  }

  public async createExpectedAccrual(
    input: CommissionAccrualCommand,
  ): Promise<CommissionMutationResult> {
    const requested = input.accrual;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        return await this.prisma.$transaction(
          async (tx) => this.createAccrualInTransaction(tx, requested),
          { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
        );
      } catch (error) {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === "P2034" &&
          attempt < 2
        )
          continue;
        if (isScopedEventUniqueConflict(error)) {
          const replay = await this.prisma.commissionAccrual.findUnique({
            where: {
              organizationId_dealClosedWonEventId: {
                organizationId: requested.organizationId,
                dealClosedWonEventId: requested.dealClosedWonEventId,
              },
            },
            include: includeAccrual(),
          });
          if (replay) {
            if (
              replay.dealId !== requested.dealId ||
              replay.commissionableValueId !== requested.value.id ||
              replay.commissionPlanVersionId !== requested.plan.id
            )
              return {
                kind: "conflict",
                reason: "accrual-ownership-or-event-conflict",
              };
            return { kind: "replayed", accrual: mapAccrual(replay) };
          }
        }
        if (isConstraint(error))
          return {
            kind: "conflict",
            reason: "accrual-ownership-or-event-conflict",
          };
        throw error;
      }
    }
    throw new Error(
      "Serializable commission accrual transaction retries exhausted",
    );
  }

  private async createAccrualInTransaction(
    tx: Db,
    requested: CommissionAccrual,
  ): Promise<CommissionMutationResult> {
    const existing = await tx.commissionAccrual.findUnique({
      where: {
        organizationId_dealClosedWonEventId: {
          organizationId: requested.organizationId,
          dealClosedWonEventId: requested.dealClosedWonEventId,
        },
      },
      include: includeAccrual(),
    });
    if (existing) {
      if (
        existing.dealId !== requested.dealId ||
        existing.commissionableValueId !== requested.value.id ||
        existing.commissionPlanVersionId !== requested.plan.id
      )
        return {
          kind: "conflict",
          reason: "accrual-ownership-or-event-conflict",
        };
      return { kind: "replayed", accrual: mapAccrual(existing) };
    }
    const [deal, event, value, plan] = await Promise.all([
      tx.deal.findUnique({
        where: {
          organizationId_id: {
            organizationId: requested.organizationId,
            id: requested.dealId,
          },
        },
        select: { id: true, organizationId: true },
      }),
      tx.dealDomainEvent.findUnique({
        where: {
          organizationId_id: {
            organizationId: requested.organizationId,
            id: requested.dealClosedWonEventId,
          },
        },
        select: {
          id: true,
          organizationId: true,
          dealId: true,
          type: true,
          schemaVersion: true,
        },
      }),
      tx.commissionableValue.findUnique({
        where: {
          organizationId_id: {
            organizationId: requested.organizationId,
            id: requested.value.id,
          },
        },
      }),
      tx.commissionPlanVersion.findUnique({
        where: {
          organizationId_id: {
            organizationId: requested.organizationId,
            id: requested.plan.id,
          },
        },
        include: { recipients: { orderBy: { order: "asc" } } },
      }),
    ]);
    if (
      !deal ||
      !validEvent(event) ||
      !value ||
      !plan ||
      event.dealId !== deal.id ||
      value.dealId !== deal.id ||
      plan.organizationId !== deal.organizationId
    )
      return {
        kind: "conflict",
        reason: "accrual-ownership-or-event-conflict",
      };
    const authority = createExpectedAccrual({
      id: requested.id,
      deal,
      event: {
        id: event.id,
        organizationId: event.organizationId,
        dealId: event.dealId,
        type: "DEAL_CLOSED_WON",
        schemaVersion: 1,
      },
      value: mapValue(value),
      plan: mapPlan(plan),
      createdAt: requested.createdAt,
    });
    const created = await tx.commissionAccrual.create({
      data: {
        id: authority.id,
        organizationId: authority.organizationId,
        dealId: authority.dealId,
        dealClosedWonEventId: authority.dealClosedWonEventId,
        commissionableValueId: authority.value.id,
        commissionPlanVersionId: authority.plan.id,
        totalAmountMinor: authority.totalMoney.amountMinor,
        currency: authority.totalMoney.currency,
        status: authority.status,
        createdAt: authority.createdAt,
        splits: {
          create: authority.splits.map((split) => ({
            order: split.order,
            kind: split.kind,
            amountMinor: split.money.amountMinor,
            currency: split.money.currency,
          })),
        },
      },
      include: includeAccrual(),
    });
    return { kind: "created", accrual: mapAccrual(created) };
  }
}
