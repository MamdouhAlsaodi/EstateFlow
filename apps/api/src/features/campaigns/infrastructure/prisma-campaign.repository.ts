import { Prisma, type PrismaClient } from "@prisma/client";
import type {
  Campaign,
  CampaignBudgetCorrectionRecord,
  CampaignPerformanceEntryRecord,
  CampaignStatus,
  CampaignTransitionRecord,
} from "../domain/campaign.js";
import type { CampaignChannel } from "../domain/campaign.js";
import {
  applyAttributionOverride,
  latestCorrection,
  type LeadAttributionCorrectionRecord,
  type LeadTouch,
  type TouchChannel,
  type TouchUtm,
} from "../domain/attribution.js";
import type {
  CampaignCursor,
  CampaignListQuery,
  CampaignListItem,
  CampaignMoneyRow,
  CampaignRepository,
} from "../application/campaign-repository.js";
import type { EffectiveAttribution } from "../domain/attribution.js";

type Db = Prisma.TransactionClient;

const CAMPAIGN_STATUSES: readonly CampaignStatus[] = [
  "DRAFT",
  "ACTIVE",
  "COMPLETED",
  "CANCELLED",
];
const CAMPAIGN_CHANNELS: readonly CampaignChannel[] = [
  "META",
  "GOOGLE",
  "SNAPCHAT",
  "TIKTOK",
  "X",
  "LINKEDIN",
  "PRINT",
  "OUTDOOR",
  "REFERRAL",
  "OTHER",
];
const TOUCH_CHANNELS = [
  "WEBSITE",
  "WHATSAPP",
  "PHONE_CALL",
  "WALK_IN",
  "REFERRAL",
  "META",
  "GOOGLE",
  "SNAPCHAT",
  "TIKTOK",
  "X",
  "OTHER",
] as const;

type CampaignRow = {
  id: string;
  organizationId: string;
  name: string;
  objective: string;
  channel: CampaignChannel;
  status: CampaignStatus;
  startsAt: Date;
  endsAt: Date;
  budgetPlannedMinor: bigint;
  currency: string;
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
  utmContent: string | null;
  utmTerm: string | null;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
};

type ListItemRow = {
  id: string;
  name: string;
  objective: string;
  channel: CampaignChannel;
  status: CampaignStatus;
  startsAt: Date;
  endsAt: Date;
  budgetPlannedMinor: bigint;
  currency: string;
  createdAt: Date;
  actualMinor: string | null;
  touchCount: number;
};

type TouchRow = {
  id: string;
  leadId: string;
  campaignId: string | null;
  channel: TouchChannel;
  source: string | null;
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
  utmContent: string | null;
  utmTerm: string | null;
  occurredAt: Date;
  createdBy: string;
  createdAt: Date;
};

type CorrectionRow = {
  id: string;
  leadId: string;
  previousCampaignId: string | null;
  correctedCampaignId: string | null;
  reason: string;
  createdBy: string;
  createdAt: Date;
};

function mapUtm(row: {
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
  utmContent: string | null;
  utmTerm: string | null;
}): TouchUtm {
  return Object.freeze({
    ...(row.utmSource === null ? {} : { utmSource: row.utmSource }),
    ...(row.utmMedium === null ? {} : { utmMedium: row.utmMedium }),
    ...(row.utmCampaign === null ? {} : { utmCampaign: row.utmCampaign }),
    ...(row.utmContent === null ? {} : { utmContent: row.utmContent }),
    ...(row.utmTerm === null ? {} : { utmTerm: row.utmTerm }),
  });
}

function mapCampaign(row: CampaignRow): Campaign {
  return Object.freeze({
    id: row.id,
    organizationId: row.organizationId,
    name: row.name,
    objective: row.objective,
    channel: assertChannel(row.channel),
    status: assertStatus(row.status),
    startsAt: new Date(row.startsAt.getTime()),
    endsAt: new Date(row.endsAt.getTime()),
    budget: Object.freeze({
      amountMinor: row.budgetPlannedMinor,
      currency: row.currency,
    }),
    utm: mapUtm(row),
    createdBy: row.createdBy,
    createdAt: new Date(row.createdAt.getTime()),
    updatedAt: new Date(row.updatedAt.getTime()),
  });
}

function assertStatus(status: string): CampaignStatus {
  if (!CAMPAIGN_STATUSES.includes(status as CampaignStatus))
    throw new RangeError("Unexpected campaign status");
  return status as CampaignStatus;
}

function assertChannel(channel: string): CampaignChannel {
  if (!CAMPAIGN_CHANNELS.includes(channel as CampaignChannel))
    throw new RangeError("Unexpected campaign channel");
  return channel as CampaignChannel;
}

function mapTouch(row: TouchRow): LeadTouch {
  return Object.freeze({
    id: row.id,
    organizationId: "",
    leadId: row.leadId,
    ...(row.campaignId === null ? {} : { campaignId: row.campaignId }),
    channel: assertTouchChannel(row.channel),
    ...(row.source === null ? {} : { source: row.source }),
    utm: mapUtm(row),
    occurredAt: new Date(row.occurredAt.getTime()),
    createdBy: row.createdBy,
    createdAt: new Date(row.createdAt.getTime()),
  });
}

function assertTouchChannel(channel: string): TouchChannel {
  if (!TOUCH_CHANNELS.includes(channel as TouchChannel))
    throw new RangeError("Unexpected touch channel");
  return channel as TouchChannel;
}

function mapCorrection(row: CorrectionRow): LeadAttributionCorrectionRecord {
  return Object.freeze({
    id: row.id,
    organizationId: "",
    leadId: row.leadId,
    ...(row.previousCampaignId === null
      ? {}
      : { previousCampaignId: row.previousCampaignId }),
    ...(row.correctedCampaignId === null
      ? {}
      : { correctedCampaignId: row.correctedCampaignId }),
    reason: row.reason,
    createdBy: row.createdBy,
    createdAt: new Date(row.createdAt.getTime()),
  });
}

function isUniqueOrForeign(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    (error.code === "P2002" || error.code === "P2003")
  );
}

export class PrismaCampaignRepository implements CampaignRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async createCampaign(campaign: Campaign): Promise<void> {
    await this.prisma.campaign.create({
      data: {
        id: campaign.id,
        organizationId: campaign.organizationId,
        name: campaign.name,
        objective: campaign.objective,
        channel: campaign.channel,
        status: campaign.status,
        startsAt: campaign.startsAt,
        endsAt: campaign.endsAt,
        budgetPlannedMinor: campaign.budget.amountMinor,
        currency: campaign.budget.currency,
        utmSource: campaign.utm.utmSource ?? null,
        utmMedium: campaign.utm.utmMedium ?? null,
        utmCampaign: campaign.utm.utmCampaign ?? null,
        utmContent: campaign.utm.utmContent ?? null,
        utmTerm: campaign.utm.utmTerm ?? null,
        createdBy: campaign.createdBy,
        createdAt: campaign.createdAt,
        updatedAt: campaign.updatedAt,
      },
    });
  }

  async findCampaign(
    organizationId: string,
    campaignId: string,
  ): Promise<Campaign | null> {
    const row = await this.prisma.campaign.findUnique({
      where: { organizationId_id: { organizationId, id: campaignId } },
    });
    return row ? mapCampaign(row) : null;
  }

  async findCampaignRequired(
    organizationId: string,
    campaignId: string,
  ): Promise<Campaign | null> {
    return this.findCampaign(organizationId, campaignId);
  }

  async listCampaigns(
    query: CampaignListQuery,
  ): Promise<readonly CampaignListItem[]> {
    const statusFilter =
      query.status === undefined
        ? Prisma.empty
        : Prisma.sql` AND c."status" = ${query.status}::text`;
    const cursorFilter =
      query.after === undefined
        ? Prisma.empty
        : Prisma.sql` AND (c."createdAt" < ${query.after.at} OR (c."createdAt" = ${query.after.at} AND c."id" < ${query.after.id}::uuid))`;
    const rows = await this.prisma.$queryRaw<ListItemRow[]>`
        SELECT c."id", c."name", c."objective", c."channel", c."status",
          c."startsAt", c."endsAt", c."budgetPlannedMinor", c."currency",
          c."createdAt",
          a."amountMinor" AS "actualMinor",
          COALESCE(t."touchCount", 0)::int AS "touchCount"
        FROM "Campaign" c
        LEFT JOIN LATERAL (
          SELECT SUM(e."amountMinor") AS "amountMinor" FROM "Expense" e
          WHERE e."organizationId" = c."organizationId"
            AND e."campaignId" = c."id"
            AND e."status" = 'APPROVED'
            AND e."currency" = c."currency"
        ) a ON TRUE
        LEFT JOIN LATERAL (
          SELECT COUNT(*) AS "touchCount" FROM "LeadTouch" t
          WHERE t."organizationId" = c."organizationId"
            AND t."campaignId" = c."id"
        ) t ON TRUE
        WHERE c."organizationId" = ${query.organizationId}::uuid
          ${statusFilter}${cursorFilter}
        ORDER BY c."createdAt" DESC, c."id" DESC
        LIMIT ${query.limit}`;
    return Object.freeze(
      rows.map((row) =>
        Object.freeze({
          id: row.id,
          name: row.name,
          objective: row.objective,
          channel: assertChannel(row.channel),
          status: assertStatus(row.status),
          startsAt: new Date(row.startsAt.getTime()),
          endsAt: new Date(row.endsAt.getTime()),
          budgetPlannedMinor: row.budgetPlannedMinor,
          currency: row.currency,
          ...(row.actualMinor === null
            ? {}
            : { budgetActualMinor: BigInt(row.actualMinor) }),
          touchCount: Number(row.touchCount),
          createdAt: new Date(row.createdAt.getTime()),
        }),
      ),
    );
  }

  async campaignActualByCurrency(
    organizationId: string,
    campaignId: string,
  ): Promise<readonly CampaignMoneyRow[]> {
    const rows = await this.prisma.$queryRaw<
      { currency: string; count: number; total: string }[]
    >`
        SELECT "currency", COUNT(*)::int AS "count", SUM("amountMinor")::text AS "total"
        FROM "Expense"
        WHERE "organizationId" = ${organizationId}::uuid
          AND "campaignId" = ${campaignId}::uuid
          AND "status" = 'APPROVED'
        GROUP BY "currency"
        ORDER BY "currency" ASC`;
    return Object.freeze(
      rows.map((row) =>
        Object.freeze({
          currency: row.currency,
          count: row.count,
          amountMinor: BigInt(row.total),
        }),
      ),
    );
  }

  async campaignTouchCount(
    organizationId: string,
    campaignId: string,
  ): Promise<number> {
    const rows = await this.prisma.$queryRaw<{ count: bigint }[]>`
        SELECT COUNT(*) AS "count" FROM "LeadTouch"
        WHERE "organizationId" = ${organizationId}::uuid
          AND "campaignId" = ${campaignId}::uuid`;
    return Number(rows[0]?.count ?? 0n);
  }

  async recordCampaignTransition(input: {
    campaign: Campaign;
    transition: CampaignTransitionRecord;
  }): Promise<CampaignTransitionRecord | null> {
    return this.prisma.$transaction(async (tx: Db) => {
      const updated = await tx.campaign.updateMany({
        where: {
          organizationId: input.campaign.organizationId,
          id: input.campaign.id,
          status: input.transition.fromStatus,
        },
        data: {
          status: input.transition.toStatus,
          updatedAt: input.transition.createdAt,
        },
      });
      if (updated.count !== 1) return null;
      const row = await tx.campaignTransition.create({
        data: {
          id: input.transition.id,
          organizationId: input.transition.organizationId,
          campaignId: input.transition.campaignId,
          fromStatus: input.transition.fromStatus,
          toStatus: input.transition.toStatus,
          reason: input.transition.reason ?? null,
          actorId: input.transition.actorId,
          createdAt: input.transition.createdAt,
        },
      });
      return Object.freeze({
        id: row.id,
        organizationId: row.organizationId,
        campaignId: row.campaignId,
        fromStatus: assertStatus(row.fromStatus),
        toStatus: assertStatus(row.toStatus),
        ...(row.reason === null ? {} : { reason: row.reason }),
        actorId: row.actorId,
        createdAt: new Date(row.createdAt.getTime()),
      });
    });
  }

  async listCampaignTransitions(
    organizationId: string,
    campaignId: string,
  ): Promise<readonly CampaignTransitionRecord[]> {
    const rows = await this.prisma.campaignTransition.findMany({
      where: { organizationId, campaignId },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      take: 200,
    });
    return Object.freeze(
      rows.map((row) =>
        Object.freeze({
          id: row.id,
          organizationId: row.organizationId,
          campaignId: row.campaignId,
          fromStatus: assertStatus(row.fromStatus),
          toStatus: assertStatus(row.toStatus),
          ...(row.reason === null ? {} : { reason: row.reason }),
          actorId: row.actorId,
          createdAt: new Date(row.createdAt.getTime()),
        }),
      ),
    );
  }

  async recordBudgetCorrection(input: {
    campaign: Campaign;
    correction: CampaignBudgetCorrectionRecord;
  }): Promise<CampaignBudgetCorrectionRecord | null> {
    return this.prisma.$transaction(async (tx: Db) => {
      const updated = await tx.campaign.updateMany({
        where: {
          organizationId: input.campaign.organizationId,
          id: input.campaign.id,
          status: { not: "CANCELLED" },
          budgetPlannedMinor: input.correction.previousMinor,
        },
        data: {
          budgetPlannedMinor: input.correction.correctedMinor,
          updatedAt: input.correction.createdAt,
        },
      });
      if (updated.count !== 1) return null;
      const row = await tx.campaignBudgetCorrection.create({
        data: {
          id: input.correction.id,
          organizationId: input.correction.organizationId,
          campaignId: input.correction.campaignId,
          previousMinor: input.correction.previousMinor,
          correctedMinor: input.correction.correctedMinor,
          currency: input.correction.currency,
          reason: input.correction.reason,
          createdBy: input.correction.createdBy,
          createdAt: input.correction.createdAt,
        },
      });
      return Object.freeze({
        id: row.id,
        organizationId: row.organizationId,
        campaignId: row.campaignId,
        previousMinor: row.previousMinor,
        correctedMinor: row.correctedMinor,
        currency: row.currency,
        reason: row.reason,
        createdBy: row.createdBy,
        createdAt: new Date(row.createdAt.getTime()),
      });
    });
  }

  async listBudgetCorrections(
    organizationId: string,
    campaignId: string,
  ): Promise<readonly CampaignBudgetCorrectionRecord[]> {
    const rows = await this.prisma.campaignBudgetCorrection.findMany({
      where: { organizationId, campaignId },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      take: 200,
    });
    return Object.freeze(
      rows.map((row) =>
        Object.freeze({
          id: row.id,
          organizationId: row.organizationId,
          campaignId: row.campaignId,
          previousMinor: row.previousMinor,
          correctedMinor: row.correctedMinor,
          currency: row.currency,
          reason: row.reason,
          createdBy: row.createdBy,
          createdAt: new Date(row.createdAt.getTime()),
        }),
      ),
    );
  }

  async insertPerformanceEntry(
    entry: CampaignPerformanceEntryRecord,
  ): Promise<void> {
    await this.prisma.campaignPerformanceEntry.create({
      data: {
        id: entry.id,
        organizationId: entry.organizationId,
        campaignId: entry.campaignId,
        occurredAt: entry.occurredAt,
        impressions: entry.impressions,
        clicks: entry.clicks,
        leadsCount: entry.leadsCount,
        note: entry.note ?? null,
        createdBy: entry.createdBy,
        createdAt: entry.createdAt,
      },
    });
  }

  async listPerformanceEntries(input: {
    organizationId: string;
    campaignId: string;
    after?: CampaignCursor;
    limit: number;
  }): Promise<readonly CampaignPerformanceEntryRecord[]> {
    const cursorFilter =
      input.after === undefined
        ? Prisma.empty
        : Prisma.sql` AND ("createdAt" < ${input.after.at} OR ("createdAt" = ${input.after.at} AND "id" < ${input.after.id}::uuid))`;
    const rows = await this.prisma.$queryRaw<
      {
        id: string;
        campaignId: string;
        occurredAt: Date;
        impressions: number;
        clicks: number;
        leadsCount: number;
        note: string | null;
        createdBy: string;
        createdAt: Date;
      }[]
    >`
        SELECT "id", "campaignId", "occurredAt", "impressions", "clicks",
          "leadsCount", "note", "createdBy", "createdAt"
        FROM "CampaignPerformanceEntry"
        WHERE "organizationId" = ${input.organizationId}::uuid
          AND "campaignId" = ${input.campaignId}::uuid
          ${cursorFilter}
        ORDER BY "createdAt" DESC, "id" DESC
        LIMIT ${input.limit}`;
    return Object.freeze(
      rows.map((row) =>
        Object.freeze({
          id: row.id,
          organizationId: input.organizationId,
          campaignId: row.campaignId,
          occurredAt: new Date(row.occurredAt.getTime()),
          impressions: row.impressions,
          clicks: row.clicks,
          leadsCount: row.leadsCount,
          ...(row.note === null ? {} : { note: row.note }),
          createdBy: row.createdBy,
          createdAt: new Date(row.createdAt.getTime()),
        }),
      ),
    );
  }

  async leadExistsInOrganization(
    organizationId: string,
    leadId: string,
  ): Promise<boolean> {
    const row = await this.prisma.lead.findUnique({
      where: { organizationId_id: { organizationId, id: leadId } },
      select: { id: true },
    });
    return row !== null;
  }

  async campaignExistsInOrganization(
    organizationId: string,
    campaignId: string,
  ): Promise<boolean> {
    const row = await this.prisma.campaign.findUnique({
      where: { organizationId_id: { organizationId, id: campaignId } },
      select: { id: true },
    });
    return row !== null;
  }

  async insertLeadTouch(touch: LeadTouch): Promise<LeadTouch | null> {
    try {
      await this.prisma.leadTouch.create({
        data: {
          id: touch.id,
          organizationId: touch.organizationId,
          leadId: touch.leadId,
          campaignId: touch.campaignId ?? null,
          channel: touch.channel,
          source: touch.source ?? null,
          utmSource: touch.utm.utmSource ?? null,
          utmMedium: touch.utm.utmMedium ?? null,
          utmCampaign: touch.utm.utmCampaign ?? null,
          utmContent: touch.utm.utmContent ?? null,
          utmTerm: touch.utm.utmTerm ?? null,
          occurredAt: touch.occurredAt,
          createdBy: touch.createdBy,
          createdAt: touch.createdAt,
        },
      });
      return touch;
    } catch (error) {
      if (isUniqueOrForeign(error)) return null;
      throw error;
    }
  }

  async listLeadTouches(input: {
    organizationId: string;
    leadId: string;
    after?: CampaignCursor;
    limit: number;
  }): Promise<readonly LeadTouch[]> {
    const cursorFilter =
      input.after === undefined
        ? Prisma.empty
        : Prisma.sql` AND ("occurredAt" < ${input.after.at} OR ("occurredAt" = ${input.after.at} AND "id" < ${input.after.id}::uuid))`;
    const rows = await this.prisma.$queryRaw<TouchRow[]>`
        SELECT "id", "leadId", "campaignId", "channel", "source",
          "utmSource", "utmMedium", "utmCampaign", "utmContent", "utmTerm",
          "occurredAt", "createdBy", "createdAt"
        FROM "LeadTouch"
        WHERE "organizationId" = ${input.organizationId}::uuid
          AND "leadId" = ${input.leadId}::uuid
          ${cursorFilter}
        ORDER BY "occurredAt" DESC, "id" DESC
        LIMIT ${input.limit}`;
    return Object.freeze(rows.map(mapTouch));
  }

  async listAttributionCorrections(
    organizationId: string,
    leadId: string,
  ): Promise<readonly LeadAttributionCorrectionRecord[]> {
    const rows = await this.prisma.leadAttributionCorrection.findMany({
      where: { organizationId, leadId },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      take: 200,
    });
    return Object.freeze(rows.map(mapCorrection));
  }

  async insertAttributionCorrection(
    correction: LeadAttributionCorrectionRecord,
  ): Promise<void> {
    await this.prisma.leadAttributionCorrection.create({
      data: {
        id: correction.id,
        organizationId: correction.organizationId,
        leadId: correction.leadId,
        previousCampaignId: correction.previousCampaignId ?? null,
        correctedCampaignId: correction.correctedCampaignId ?? null,
        reason: correction.reason,
        createdBy: correction.createdBy,
        createdAt: correction.createdAt,
      },
    });
  }

  async getLeadAttribution(
    organizationId: string,
    leadId: string,
  ): Promise<EffectiveAttribution> {
    const first = await this.prisma.$queryRaw<TouchRow[]>`
        SELECT "id", "leadId", "campaignId", "channel", "source",
          "utmSource", "utmMedium", "utmCampaign", "utmContent", "utmTerm",
          "occurredAt", "createdBy", "createdAt"
        FROM "LeadTouch"
        WHERE "organizationId" = ${organizationId}::uuid
          AND "leadId" = ${leadId}::uuid
          AND "campaignId" IS NOT NULL
        ORDER BY "occurredAt" ASC, "id" ASC
        LIMIT 1`;
    const last = await this.prisma.$queryRaw<TouchRow[]>`
        SELECT "id", "leadId", "campaignId", "channel", "source",
          "utmSource", "utmMedium", "utmCampaign", "utmContent", "utmTerm",
          "occurredAt", "createdBy", "createdAt"
        FROM "LeadTouch"
        WHERE "organizationId" = ${organizationId}::uuid
          AND "leadId" = ${leadId}::uuid
          AND "campaignId" IS NOT NULL
        ORDER BY "occurredAt" DESC, "id" DESC
        LIMIT 1`;
    const corrections = await this.listAttributionCorrections(
      organizationId,
      leadId,
    );
    const firstTouch = first[0] ? mapTouch(first[0]) : undefined;
    const lastTouch = last[0] ? mapTouch(last[0]) : undefined;
    const override = latestCorrection(corrections);
    return applyAttributionOverride(
      {
        ...(firstTouch === undefined ? {} : { firstTouch }),
        ...(lastTouch === undefined ? {} : { lastTouch }),
      },
      override,
    );
  }
}
