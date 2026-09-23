import { Prisma, type PrismaClient } from "@prisma/client";
import type {
  ContentChannel,
  ContentFailureKind,
  ContentItem,
  ContentStatus,
  ContentTransitionRecord,
} from "../domain/content.js";
import type {
  CalendarEntry,
  ContentListQuery,
  ContentListItem,
  ContentRepository,
  ReviewQueueEntry,
} from "../application/content-repository.js";

type Db = Prisma.TransactionClient;

const CONTENT_STATUSES: readonly ContentStatus[] = [
  "IDEA",
  "DRAFT",
  "REVIEW",
  "APPROVED",
  "SCHEDULED",
  "PUBLISHED",
  "FAILED",
];
const CONTENT_CHANNELS: readonly ContentChannel[] = [
  "INSTAGRAM",
  "X",
  "SNAPCHAT",
  "TIKTOK",
  "LINKEDIN",
  "FACEBOOK",
  "WHATSAPP",
  "EMAIL",
  "WEBSITE",
  "OTHER",
];
const FAILURE_KINDS: readonly ContentFailureKind[] = [
  "CHANNEL_REJECTED",
  "CHANNEL_TIMEOUT",
  "CONTENT_POLICY_VIOLATION",
  "SCHEDULE_MISSED",
  "OTHER",
];

type ContentRow = {
  id: string;
  organizationId: string;
  campaignId: string | null;
  rootContentId: string | null;
  variantOfId: string | null;
  variantNumber: number;
  title: string;
  body: string;
  channel: ContentChannel;
  status: ContentStatus;
  scheduledFor: Date | null;
  approvedVersion: number | null;
  contentHash: string | null;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
};

function mapItem(row: ContentRow): ContentItem {
  return Object.freeze({
    id: row.id,
    organizationId: row.organizationId,
    ...(row.campaignId === null ? {} : { campaignId: row.campaignId }),
    ...(row.rootContentId === null ? {} : { rootContentId: row.rootContentId }),
    ...(row.variantOfId === null ? {} : { variantOfId: row.variantOfId }),
    variantNumber: row.variantNumber,
    title: row.title,
    body: row.body,
    channel: assertChannel(row.channel),
    status: assertStatus(row.status),
    ...(row.scheduledFor === null
      ? {}
      : { scheduledFor: new Date(row.scheduledFor.getTime()) }),
    ...(row.approvedVersion === null
      ? {}
      : { approvedVersion: row.approvedVersion }),
    ...(row.contentHash === null ? {} : { contentHash: row.contentHash }),
    createdBy: row.createdBy,
    createdAt: new Date(row.createdAt.getTime()),
    updatedAt: new Date(row.updatedAt.getTime()),
  });
}

function assertStatus(status: string): ContentStatus {
  if (!CONTENT_STATUSES.includes(status as ContentStatus))
    throw new RangeError("Unexpected content status");
  return status as ContentStatus;
}

function assertChannel(channel: string): ContentChannel {
  if (!CONTENT_CHANNELS.includes(channel as ContentChannel))
    throw new RangeError("Unexpected content channel");
  return channel as ContentChannel;
}

function assertFailureKind(kind: string): ContentFailureKind {
  if (!FAILURE_KINDS.includes(kind as ContentFailureKind))
    throw new RangeError("Unexpected content failure kind");
  return kind as ContentFailureKind;
}

function mapTransition(row: {
  id: string;
  organizationId: string;
  contentItemId: string;
  fromStatus: string;
  toStatus: string;
  reason: string | null;
  failureKind: string | null;
  version: number | null;
  contentHash: string | null;
  actorId: string;
  createdAt: Date;
}): ContentTransitionRecord {
  return Object.freeze({
    id: row.id,
    organizationId: row.organizationId,
    contentItemId: row.contentItemId,
    fromStatus: assertStatus(row.fromStatus),
    toStatus: assertStatus(row.toStatus),
    ...(row.reason === null ? {} : { reason: row.reason }),
    ...(row.failureKind === null
      ? {}
      : { failureKind: assertFailureKind(row.failureKind) }),
    ...(row.version === null ? {} : { version: row.version }),
    ...(row.contentHash === null ? {} : { contentHash: row.contentHash }),
    actorId: row.actorId,
    createdAt: new Date(row.createdAt.getTime()),
  });
}

export class PrismaContentRepository implements ContentRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async createContentItem(item: ContentItem): Promise<void> {
    await this.prisma.contentItem.create({
      data: {
        id: item.id,
        organizationId: item.organizationId,
        campaignId: item.campaignId ?? null,
        rootContentId: item.rootContentId ?? null,
        variantOfId: item.variantOfId ?? null,
        variantNumber: item.variantNumber,
        title: item.title,
        body: item.body,
        channel: item.channel,
        status: item.status,
        scheduledFor: item.scheduledFor ?? null,
        approvedVersion: item.approvedVersion ?? null,
        contentHash: item.contentHash ?? null,
        createdBy: item.createdBy,
        createdAt: item.createdAt,
        updatedAt: item.updatedAt,
      },
    });
  }

  async findContentItem(
    organizationId: string,
    contentItemId: string,
  ): Promise<ContentItem | null> {
    const row = await this.prisma.contentItem.findUnique({
      where: { organizationId_id: { organizationId, id: contentItemId } },
    });
    return row ? mapItem(row) : null;
  }

  async listContentItems(
    query: ContentListQuery,
  ): Promise<readonly ContentListItem[]> {
    const statusFilter =
      query.status === undefined
        ? Prisma.empty
        : Prisma.sql` AND c."status" = ${query.status}::text`;
    const cursorFilter =
      query.after === undefined
        ? Prisma.empty
        : Prisma.sql` AND (c."createdAt" < ${query.after.at} OR (c."createdAt" = ${query.after.at} AND c."id" < ${query.after.id}::uuid))`;
    const rows = await this.prisma.$queryRaw<
      {
        id: string;
        campaignId: string | null;
        rootContentId: string | null;
        variantOfId: string | null;
        variantNumber: number;
        title: string;
        channel: ContentChannel;
        status: ContentStatus;
        scheduledFor: Date | null;
        approvedVersion: number | null;
        createdAt: Date;
      }[]
    >`
        SELECT c."id", c."campaignId", c."rootContentId", c."variantOfId",
          c."variantNumber", c."title", c."channel", c."status",
          c."scheduledFor", c."approvedVersion", c."createdAt"
        FROM "ContentItem" c
        WHERE c."organizationId" = ${query.organizationId}::uuid
          ${statusFilter}${cursorFilter}
        ORDER BY c."createdAt" DESC, c."id" DESC
        LIMIT ${query.limit}`;
    return Object.freeze(
      rows.map((row) =>
        Object.freeze({
          id: row.id,
          ...(row.campaignId === null ? {} : { campaignId: row.campaignId }),
          ...(row.rootContentId === null
            ? {}
            : { rootContentId: row.rootContentId }),
          ...(row.variantOfId === null ? {} : { variantOfId: row.variantOfId }),
          variantNumber: row.variantNumber,
          title: row.title,
          channel: assertChannel(row.channel),
          status: assertStatus(row.status),
          ...(row.scheduledFor === null
            ? {}
            : { scheduledFor: new Date(row.scheduledFor.getTime()) }),
          ...(row.approvedVersion === null
            ? {}
            : { approvedVersion: row.approvedVersion }),
          createdAt: new Date(row.createdAt.getTime()),
        }),
      ),
    );
  }

  async listReviewQueue(
    organizationId: string,
    limit: number,
  ): Promise<readonly ReviewQueueEntry[]> {
    const rows = await this.prisma.$queryRaw<
      {
        id: string;
        title: string;
        channel: ContentChannel;
        campaignId: string | null;
        variantNumber: number;
        submittedAt: Date;
      }[]
    >`
        SELECT c."id", c."title", c."channel", c."campaignId",
          c."variantNumber", c."updatedAt" AS "submittedAt"
        FROM "ContentItem" c
        WHERE c."organizationId" = ${organizationId}::uuid
          AND c."status" = 'REVIEW'
        ORDER BY c."updatedAt" ASC, c."id" ASC
        LIMIT ${limit}`;
    return Object.freeze(
      rows.map((row) =>
        Object.freeze({
          id: row.id,
          title: row.title,
          channel: assertChannel(row.channel),
          ...(row.campaignId === null ? {} : { campaignId: row.campaignId }),
          variantNumber: row.variantNumber,
          submittedAt: new Date(row.submittedAt.getTime()),
        }),
      ),
    );
  }

  async listCalendar(input: {
    organizationId: string;
    from: Date;
    to: Date;
  }): Promise<readonly CalendarEntry[]> {
    const rows = await this.prisma.$queryRaw<
      {
        id: string;
        title: string;
        channel: ContentChannel;
        status: ContentStatus;
        variantNumber: number;
        scheduledFor: Date;
      }[]
    >`
        SELECT c."id", c."title", c."channel", c."status",
          c."variantNumber", c."scheduledFor"
        FROM "ContentItem" c
        WHERE c."organizationId" = ${input.organizationId}::uuid
          AND c."scheduledFor" IS NOT NULL
          AND c."scheduledFor" >= ${input.from}
          AND c."scheduledFor" < ${input.to}
        ORDER BY c."scheduledFor" ASC, c."id" ASC
        LIMIT 500`;
    return Object.freeze(
      rows.map((row) =>
        Object.freeze({
          id: row.id,
          title: row.title,
          channel: assertChannel(row.channel),
          status: assertStatus(row.status),
          variantNumber: row.variantNumber,
          scheduledFor: new Date(row.scheduledFor.getTime()),
        }),
      ),
    );
  }

  async listTransitions(
    organizationId: string,
    contentItemId: string,
  ): Promise<readonly ContentTransitionRecord[]> {
    const rows = await this.prisma.contentTransition.findMany({
      where: { organizationId, contentItemId },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      take: 200,
    });
    return Object.freeze(rows.map(mapTransition));
  }

  async listLineage(
    organizationId: string,
    item: ContentItem,
  ): Promise<readonly ContentItem[]> {
    const rows = await this.prisma.$queryRaw<ContentRow[]>`
        SELECT "id", "organizationId", "campaignId", "rootContentId",
          "variantOfId", "variantNumber", "title", "body", "channel",
          "status", "scheduledFor", "approvedVersion", "contentHash",
          "createdBy", "createdAt", "updatedAt"
        FROM "ContentItem"
        WHERE "organizationId" = ${organizationId}::uuid
          AND COALESCE("rootContentId", "id") = ${
            item.rootContentId ?? item.id
          }::uuid
        ORDER BY "variantNumber" ASC, "createdAt" ASC
        LIMIT 200`;
    return Object.freeze(rows.map(mapItem));
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

  async lineageMaxVariantNumber(
    organizationId: string,
    lineageRootId: string,
  ): Promise<number> {
    const rows = await this.prisma.$queryRaw<{ max: number | null }[]>`
        SELECT MAX("variantNumber") AS "max" FROM "ContentItem"
        WHERE "organizationId" = ${organizationId}::uuid
          AND COALESCE("rootContentId", "id") = ${lineageRootId}::uuid`;
    return rows[0]?.max ?? 0;
  }

  async recordContentEdit(input: {
    item: ContentItem;
    title: string;
    body: string;
    channel: ContentChannel;
    campaignId?: string;
    editedAt: Date;
  }): Promise<ContentItem | null> {
    const updated = await this.prisma.contentItem.updateMany({
      where: {
        organizationId: input.item.organizationId,
        id: input.item.id,
        status: { in: ["IDEA", "DRAFT"] },
      },
      data: {
        title: input.title,
        body: input.body,
        channel: input.channel,
        campaignId: input.campaignId ?? null,
        updatedAt: input.editedAt,
      },
    });
    if (updated.count !== 1) return null;
    return this.findContentItem(input.item.organizationId, input.item.id);
  }

  async recordContentTransition(input: {
    item: ContentItem;
    transition: ContentTransitionRecord;
    scheduledFor?: Date;
  }): Promise<ContentTransitionRecord | null> {
    return this.prisma.$transaction(async (tx: Db) => {
      const isApproval = input.transition.toStatus === "APPROVED";
      const isScheduling = input.transition.toStatus === "SCHEDULED";
      const updated = await tx.contentItem.updateMany({
        where: {
          organizationId: input.item.organizationId,
          id: input.item.id,
          status: input.transition.fromStatus,
        },
        data: {
          status: input.transition.toStatus,
          ...(isApproval
            ? {
                approvedVersion: input.transition.version ?? null,
                contentHash: input.transition.contentHash ?? null,
              }
            : {}),
          ...(isScheduling ? { scheduledFor: input.scheduledFor ?? null } : {}),
          updatedAt: input.transition.createdAt,
        },
      });
      if (updated.count !== 1) return null;
      const row = await tx.contentTransition.create({
        data: {
          id: input.transition.id,
          organizationId: input.transition.organizationId,
          contentItemId: input.transition.contentItemId,
          fromStatus: input.transition.fromStatus,
          toStatus: input.transition.toStatus,
          reason: input.transition.reason ?? null,
          failureKind: input.transition.failureKind ?? null,
          version: input.transition.version ?? null,
          contentHash: input.transition.contentHash ?? null,
          actorId: input.transition.actorId,
          createdAt: input.transition.createdAt,
        },
      });
      return mapTransition(row);
    });
  }

  async recordContentRevision(input: {
    revision: ContentItem;
    source: ContentItem;
  }): Promise<ContentItem | null> {
    return this.prisma.$transaction(async (tx: Db) => {
      // Serialize revision creation per lineage through the source row.
      const locked = await tx.$queryRaw<{ status: ContentStatus }[]>`
          SELECT "status" FROM "ContentItem"
          WHERE "organizationId" = ${input.source.organizationId}::uuid
            AND "id" = ${input.source.id}::uuid
          FOR UPDATE`;
      if (locked.length !== 1) return null;
      const rootId = input.source.rootContentId ?? input.source.id;
      const maxRow = await tx.$queryRaw<{ max: number | null }[]>`
          SELECT MAX("variantNumber") AS "max" FROM "ContentItem"
          WHERE "organizationId" = ${input.source.organizationId}::uuid
            AND COALESCE("rootContentId", "id") = ${rootId}::uuid`;
      const nextVariantNumber = (maxRow[0]?.max ?? 0) + 1;
      const row = await tx.contentItem.create({
        data: {
          id: input.revision.id,
          organizationId: input.revision.organizationId,
          campaignId: input.revision.campaignId ?? null,
          rootContentId: rootId,
          variantOfId: input.source.id,
          variantNumber: nextVariantNumber,
          title: input.revision.title,
          body: input.revision.body,
          channel: input.revision.channel,
          status: "DRAFT",
          createdBy: input.revision.createdBy,
          createdAt: input.revision.createdAt,
          updatedAt: input.revision.createdAt,
        },
      });
      return mapItem(row);
    });
  }
}
