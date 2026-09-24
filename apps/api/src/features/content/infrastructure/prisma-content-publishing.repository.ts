import { Prisma, type PrismaClient } from "@prisma/client";
import type {
  ContentChannel,
  ContentFailureKind,
  ContentTransitionRecord,
} from "../domain/content.js";
import {
  assertPublishJobStatus,
  type ContentPublishJob,
  type ContentPublishJobStatus,
  type PublishingDeliveryPayload,
} from "../domain/publishing.js";
import type {
  CancelScheduledResult,
  ContentPublishingRepository,
  InsertPublishJobResult,
  PublishResult,
  SettleOutcome,
  UpcomingDelivery,
} from "../application/publishing-repository.js";

type Db = Prisma.TransactionClient;

class PublishingLostRaceError extends Error {}

const FAILURE_KINDS: readonly ContentFailureKind[] = [
  "CHANNEL_REJECTED",
  "CHANNEL_TIMEOUT",
  "CONTENT_POLICY_VIOLATION",
  "SCHEDULE_MISSED",
  "OTHER",
];

type JobRow = {
  id: string;
  organizationId: string;
  contentItemId: string;
  approvedVersion: number;
  channel: ContentChannel;
  scheduledFor: Date;
  contentHash: string;
  executionKey: string;
  status: ContentPublishJobStatus;
  attemptCount: number;
  maxAttempts: number;
  nextAttemptAt: Date;
  lastErrorKind: string | null;
  lastErrorMessage: string | null;
  startedAt: Date | null;
  completedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

const jobColumns = Prisma.sql`
  "id", "organizationId", "contentItemId", "approvedVersion", "channel",
  "scheduledFor", "contentHash", "executionKey", "status", "attemptCount",
  "maxAttempts", "nextAttemptAt", "lastErrorKind", "lastErrorMessage",
  "startedAt", "completedAt", "createdAt", "updatedAt"`;

function mapJob(row: JobRow): ContentPublishJob {
  return Object.freeze({
    id: row.id,
    organizationId: row.organizationId,
    contentItemId: row.contentItemId,
    approvedVersion: assertPositive(row.approvedVersion, "approvedVersion"),
    channel: assertChannel(row.channel),
    scheduledFor: new Date(row.scheduledFor.getTime()),
    contentHash: row.contentHash,
    executionKey: row.executionKey,
    status: assertPublishJobStatus(row.status),
    attemptCount: row.attemptCount,
    maxAttempts: assertPositive(row.maxAttempts, "maxAttempts"),
    nextAttemptAt: new Date(row.nextAttemptAt.getTime()),
    ...(row.lastErrorKind === null
      ? {}
      : { lastErrorKind: assertFailureKind(row.lastErrorKind) }),
    ...(row.lastErrorMessage === null
      ? {}
      : { lastErrorMessage: row.lastErrorMessage }),
    ...(row.startedAt === null
      ? {}
      : { startedAt: new Date(row.startedAt.getTime()) }),
    ...(row.completedAt === null
      ? {}
      : { completedAt: new Date(row.completedAt.getTime()) }),
    createdAt: new Date(row.createdAt.getTime()),
    updatedAt: new Date(row.updatedAt.getTime()),
  });
}

function assertPositive(value: number, field: string): number {
  if (!Number.isSafeInteger(value) || value < 1)
    throw new RangeError(`Unexpected publish job ${field}`);
  return value;
}

function assertChannel(channel: string): ContentChannel {
  if (typeof channel !== "string" || channel.length === 0)
    throw new RangeError("Unexpected publish job channel");
  return channel as ContentChannel;
}

function assertFailureKind(kind: string): ContentFailureKind {
  if (!FAILURE_KINDS.includes(kind as ContentFailureKind))
    throw new RangeError("Unexpected publish failure kind");
  return kind as ContentFailureKind;
}

/**
 * EF-404 durable publishing persistence (raw SQL, organization-scoped
 * everywhere except the cross-tenant worker claim). `claimDuePublishJob` uses
 * FOR UPDATE SKIP LOCKED so concurrent ticks never double-claim, and
 * `insertPublishJob` relies on the unique (organizationId, executionKey)
 * index so replayed schedules never double-schedule. Every settle step runs
 * in one transaction: job outcome + delivery snapshot + audited item
 * transition all commit together or not at all.
 */
export class PrismaContentPublishingRepository implements ContentPublishingRepository {
  constructor(private readonly db: PrismaClient) {}

  async insertPublishJob(
    job: ContentPublishJob,
  ): Promise<InsertPublishJobResult> {
    const rows = await this.db.$queryRaw<{ id: string }[]>`
      INSERT INTO "ContentPublishJob"
        ("id", "organizationId", "contentItemId", "approvedVersion", "channel",
         "scheduledFor", "contentHash", "executionKey", "status", "attemptCount",
         "maxAttempts", "nextAttemptAt", "createdAt", "updatedAt")
      VALUES
        (${job.id}::uuid, ${job.organizationId}::uuid, ${job.contentItemId}::uuid,
         ${job.approvedVersion}, ${job.channel}::text::"ContentChannel",
         ${job.scheduledFor}, ${job.contentHash}, ${job.executionKey},
         ${job.status}::text::"ContentPublishJobStatus", ${job.attemptCount},
         ${job.maxAttempts}, ${job.nextAttemptAt}, ${job.createdAt}, ${job.updatedAt})
      ON CONFLICT ("organizationId", "executionKey") DO NOTHING
      RETURNING "id"`;
    return rows.length > 0
      ? { kind: "inserted", executionKey: job.executionKey }
      : { kind: "duplicate-occurrence", executionKey: job.executionKey };
  }

  async findPublishJobByExecutionKey(
    organizationId: string,
    executionKey: string,
  ): Promise<ContentPublishJob | null> {
    const rows = await this.db.$queryRaw<JobRow[]>`
      SELECT ${jobColumns}
      FROM "ContentPublishJob"
      WHERE "organizationId" = ${organizationId}::uuid AND "executionKey" = ${executionKey}
      LIMIT 1`;
    return rows[0] ? mapJob(rows[0]) : null;
  }

  async findPublishJobById(
    organizationId: string,
    publishJobId: string,
  ): Promise<ContentPublishJob | null> {
    const rows = await this.db.$queryRaw<JobRow[]>`
      SELECT ${jobColumns}
      FROM "ContentPublishJob"
      WHERE "organizationId" = ${organizationId}::uuid AND "id" = ${publishJobId}::uuid
      LIMIT 1`;
    return rows[0] ? mapJob(rows[0]) : null;
  }

  async claimDuePublishJob(now: Date): Promise<ContentPublishJob | null> {
    const rows = await this.db.$queryRaw<JobRow[]>`
      UPDATE "ContentPublishJob"
      SET "status" = 'RUNNING',
          "attemptCount" = "attemptCount" + 1,
          "startedAt" = COALESCE("startedAt", ${now}),
          "updatedAt" = ${now}
      WHERE "id" = (
        SELECT "id" FROM "ContentPublishJob"
        WHERE "status" IN ('QUEUED', 'RETRYING') AND "nextAttemptAt" <= ${now}
        ORDER BY "nextAttemptAt" ASC, "id" ASC
        FOR UPDATE SKIP LOCKED
        LIMIT 1
      )
      RETURNING ${jobColumns}`;
    return rows[0] ? mapJob(rows[0]) : null;
  }

  async settleDeliveredJob(input: {
    job: ContentPublishJob;
    payload: PublishingDeliveryPayload;
    providerMessageId: string;
    transition: ContentTransitionRecord;
    now: Date;
  }): Promise<SettleOutcome> {
    try {
      return await this.db.$transaction(async (tx: Db) => {
        const updated = await tx.$executeRaw`
          UPDATE "ContentPublishJob"
          SET "status" = 'DELIVERED', "completedAt" = ${input.now},
              "lastErrorKind" = NULL, "lastErrorMessage" = NULL,
              "updatedAt" = ${input.now}
          WHERE "id" = ${input.job.id}::uuid
            AND "organizationId" = ${input.job.organizationId}::uuid
            AND "status" = 'RUNNING'`;
        if (updated !== 1) throw new PublishingLostRaceError();
        const inserted = await tx.$executeRaw`
          INSERT INTO "ContentDelivery"
            ("organizationId", "contentItemId", "publishJobId",
             "approvedVersion", "channel", "contentHash", "payload",
             "providerMessageId", "deliveredAt", "createdAt")
          VALUES
            (${input.job.organizationId}::uuid,
             ${input.job.contentItemId}::uuid, ${input.job.id}::uuid,
             ${input.job.approvedVersion},
             ${input.job.channel}::text::"ContentChannel",
             ${input.job.contentHash},
             ${JSON.stringify(input.payload)}::jsonb,
             ${input.providerMessageId}, ${input.now}, ${input.now})
          ON CONFLICT ("organizationId", "contentItemId", "approvedVersion", "channel")
          DO NOTHING`;
        if (inserted !== 1) throw new PublishingLostRaceError();
        const item = await tx.$executeRaw`
          UPDATE "ContentItem"
          SET "status" = 'PUBLISHED', "updatedAt" = ${input.now}
          WHERE "organizationId" = ${input.job.organizationId}::uuid
            AND "id" = ${input.job.contentItemId}::uuid
            AND "status" = 'SCHEDULED'`;
        if (item !== 1) throw new PublishingLostRaceError();
        await tx.$executeRaw`
          INSERT INTO "ContentTransition"
            ("id", "organizationId", "contentItemId", "fromStatus", "toStatus",
             "reason", "actorId", "createdAt")
          VALUES
            (${input.transition.id}::uuid, ${input.transition.organizationId}::uuid,
             ${input.transition.contentItemId}::uuid, 'SCHEDULED'::text::"ContentStatus",
             'PUBLISHED'::text::"ContentStatus", ${input.transition.reason ?? null},
             ${input.transition.actorId}::uuid, ${input.transition.createdAt})`;
        return "settled" as const;
      });
    } catch (error) {
      if (error instanceof PublishingLostRaceError) return "lost-race";
      throw error;
    }
  }

  async settleFailedJob(input: {
    job: ContentPublishJob;
    terminal: boolean;
    failureKind: ContentFailureKind;
    reason: string;
    nextAttemptAt: Date | null;
    transition: ContentTransitionRecord | null;
    now: Date;
  }): Promise<SettleOutcome> {
    try {
      return await this.db.$transaction(async (tx: Db) => {
        if (input.terminal && input.transition !== null) {
          const item = await tx.$executeRaw`
            UPDATE "ContentItem"
            SET "status" = 'FAILED', "updatedAt" = ${input.now}
            WHERE "organizationId" = ${input.job.organizationId}::uuid
              AND "id" = ${input.job.contentItemId}::uuid
              AND "status" = 'SCHEDULED'`;
          if (item !== 1) throw new PublishingLostRaceError();
          await tx.$executeRaw`
            INSERT INTO "ContentTransition"
              ("id", "organizationId", "contentItemId", "fromStatus", "toStatus",
               "reason", "failureKind", "actorId", "createdAt")
            VALUES
              (${input.transition.id}::uuid, ${input.transition.organizationId}::uuid,
               ${input.transition.contentItemId}::uuid,
               'SCHEDULED'::text::"ContentStatus", 'FAILED'::text::"ContentStatus",
               ${input.transition.reason ?? null},
               ${input.failureKind}::text::"ContentFailureKind",
               ${input.transition.actorId}::uuid, ${input.transition.createdAt})`;
        }
        const updated = await tx.$executeRaw`
          UPDATE "ContentPublishJob"
          SET "status" = ${input.terminal ? "FAILED" : "RETRYING"}::text::"ContentPublishJobStatus",
              "nextAttemptAt" = COALESCE(${input.nextAttemptAt}, "nextAttemptAt"),
              "lastErrorKind" = ${input.failureKind}::text::"ContentFailureKind",
              "lastErrorMessage" = ${input.reason},
              "completedAt" = ${input.terminal ? input.now : null},
              "updatedAt" = ${input.now}
          WHERE "id" = ${input.job.id}::uuid
            AND "organizationId" = ${input.job.organizationId}::uuid
            AND "status" = 'RUNNING'`;
        if (updated !== 1) throw new PublishingLostRaceError();
        return "settled" as const;
      });
    } catch (error) {
      if (error instanceof PublishingLostRaceError) return "lost-race";
      throw error;
    }
  }

  async settleOrphanCancelledJob(input: {
    job: ContentPublishJob;
    now: Date;
  }): Promise<SettleOutcome> {
    const updated = await this.db.$executeRaw`
      UPDATE "ContentPublishJob"
      SET "status" = 'CANCELLED', "completedAt" = ${input.now},
          "lastErrorKind" = 'SCHEDULE_MISSED'::text::"ContentFailureKind",
          "lastErrorMessage" = 'publishing schedule is no longer active',
          "updatedAt" = ${input.now}
      WHERE "id" = ${input.job.id}::uuid
        AND "organizationId" = ${input.job.organizationId}::uuid
        AND "status" = 'RUNNING'`;
    return updated === 1 ? "settled" : "lost-race";
  }

  async cancelScheduledPublishing(input: {
    organizationId: string;
    contentItemId: string;
    reason: string;
    transition: ContentTransitionRecord;
    now: Date;
  }): Promise<CancelScheduledResult> {
    return this.db.$transaction(
      async (tx: Db): Promise<CancelScheduledResult> => {
        const openRows = await tx.$queryRaw<JobRow[]>`
        SELECT ${jobColumns}
        FROM "ContentPublishJob"
        WHERE "organizationId" = ${input.organizationId}::uuid
          AND "contentItemId" = ${input.contentItemId}::uuid
          AND "status" IN ('QUEUED', 'RETRYING')
        ORDER BY "scheduledFor" ASC, "id" ASC
        FOR UPDATE`;
        if (openRows.length === 0) {
          const delivered = await tx.$queryRaw<{ id: string }[]>`
          SELECT "id" FROM "ContentDelivery"
          WHERE "organizationId" = ${input.organizationId}::uuid
            AND "contentItemId" = ${input.contentItemId}::uuid
          LIMIT 1`;
          if (delivered.length > 0) return { kind: "already-delivered" };
          return { kind: "not-open" };
        }
        const job = mapJob(openRows[0]);
        const item = await tx.$executeRaw`
        UPDATE "ContentItem"
        SET "status" = 'FAILED', "updatedAt" = ${input.now}
        WHERE "organizationId" = ${input.organizationId}::uuid
          AND "id" = ${input.contentItemId}::uuid
          AND "status" = 'SCHEDULED'`;
        if (item !== 1) return { kind: "not-open" };
        const updatedJob = await tx.$executeRaw`
        UPDATE "ContentPublishJob"
        SET "status" = 'CANCELLED', "completedAt" = ${input.now},
            "lastErrorKind" = 'SCHEDULE_MISSED'::text::"ContentFailureKind",
            "lastErrorMessage" = ${input.reason},
            "updatedAt" = ${input.now}
        WHERE "id" = ${job.id}::uuid
          AND "organizationId" = ${input.organizationId}::uuid
          AND "status" IN ('QUEUED', 'RETRYING')`;
        if (updatedJob !== 1) throw new PublishingLostRaceError();
        await tx.$executeRaw`
        INSERT INTO "ContentTransition"
          ("id", "organizationId", "contentItemId", "fromStatus", "toStatus",
           "reason", "failureKind", "actorId", "createdAt")
        VALUES
          (${input.transition.id}::uuid, ${input.transition.organizationId}::uuid,
           ${input.transition.contentItemId}::uuid,
           'SCHEDULED'::text::"ContentStatus", 'FAILED'::text::"ContentStatus",
           ${input.transition.reason ?? null},
           'SCHEDULE_MISSED'::text::"ContentFailureKind",
           ${input.transition.actorId}::uuid, ${input.transition.createdAt})`;
        return {
          kind: "cancelled",
          job: Object.freeze({
            ...job,
            status: "CANCELLED" as const,
            lastErrorKind: "SCHEDULE_MISSED" as const,
            lastErrorMessage: input.reason,
            completedAt: input.now,
            updatedAt: input.now,
          }),
          transition: input.transition,
        };
      },
    );
  }

  async listUpcomingDeliveries(
    organizationId: string,
    now: Date,
    limit: number,
  ): Promise<readonly UpcomingDelivery[]> {
    const rows = await this.db.$queryRaw<
      {
        contentItemId: string;
        publishJobId: string;
        title: string;
        channel: ContentChannel;
        variantNumber: number;
        approvedVersion: number;
        scheduledFor: Date;
        status: string;
        attemptCount: number;
        maxAttempts: number;
        nextAttemptAt: Date;
        lastErrorKind: string | null;
        lastErrorMessage: string | null;
      }[]
    >`
      SELECT j."contentItemId", j."id" AS "publishJobId", c."title",
        j."channel", c."variantNumber", j."approvedVersion", j."scheduledFor",
        j."status", j."attemptCount", j."maxAttempts", j."nextAttemptAt",
        j."lastErrorKind", j."lastErrorMessage"
      FROM "ContentPublishJob" j
      JOIN "ContentItem" c
        ON c."organizationId" = j."organizationId"
       AND c."id" = j."contentItemId"
      WHERE j."organizationId" = ${organizationId}::uuid
        AND j."status" IN ('QUEUED', 'RETRYING')
      ORDER BY j."scheduledFor" ASC, j."id" ASC
      LIMIT ${limit}`;
    return Object.freeze(
      rows.map((row) =>
        Object.freeze({
          contentItemId: row.contentItemId,
          publishJobId: row.publishJobId,
          title: row.title,
          channel: assertChannel(row.channel),
          variantNumber: assertPositive(row.variantNumber, "variantNumber"),
          approvedVersion: assertPositive(
            row.approvedVersion,
            "approvedVersion",
          ),
          scheduledFor: new Date(row.scheduledFor.getTime()),
          jobStatus: row.status as "QUEUED" | "RETRYING",
          attemptCount: row.attemptCount,
          maxAttempts: row.maxAttempts,
          nextAttemptAt: new Date(row.nextAttemptAt.getTime()),
          ...(row.lastErrorKind === null
            ? {}
            : { lastErrorKind: assertFailureKind(row.lastErrorKind) }),
          ...(row.lastErrorMessage === null
            ? {}
            : { lastErrorMessage: row.lastErrorMessage }),
        }),
      ),
    );
  }

  async listPublishResults(
    organizationId: string,
    limit: number,
  ): Promise<readonly PublishResult[]> {
    const rows = await this.db.$queryRaw<
      {
        contentItemId: string;
        title: string;
        channel: ContentChannel;
        approvedVersion: number;
        outcome: string;
        failureKind: string | null;
        reason: string | null;
        providerMessageId: string | null;
        completedAt: Date;
      }[]
    >`
      SELECT j."contentItemId", c."title", j."channel", j."approvedVersion",
        CASE
          WHEN j."status" = 'DELIVERED' THEN 'DELIVERED'
          WHEN j."status" = 'FAILED' THEN 'FAILED'
          ELSE 'CANCELLED'
        END AS "outcome",
        j."lastErrorKind" AS "failureKind",
        j."lastErrorMessage" AS "reason",
        d."providerMessageId",
        COALESCE(d."deliveredAt", j."completedAt", j."updatedAt") AS "completedAt"
      FROM "ContentPublishJob" j
      JOIN "ContentItem" c
        ON c."organizationId" = j."organizationId"
       AND c."id" = j."contentItemId"
      LEFT JOIN "ContentDelivery" d
        ON d."organizationId" = j."organizationId"
       AND d."publishJobId" = j."id"
      WHERE j."organizationId" = ${organizationId}::uuid
        AND j."status" IN ('DELIVERED', 'FAILED', 'CANCELLED')
      ORDER BY "completedAt" DESC, j."id" ASC
      LIMIT ${limit}`;
    return Object.freeze(
      rows.map((row) =>
        Object.freeze({
          contentItemId: row.contentItemId,
          title: row.title,
          channel: assertChannel(row.channel),
          approvedVersion: assertPositive(
            row.approvedVersion,
            "approvedVersion",
          ),
          outcome: row.outcome as PublishResult["outcome"],
          ...(row.failureKind === null
            ? {}
            : { failureKind: assertFailureKind(row.failureKind) }),
          ...(row.reason === null ? {} : { reason: row.reason }),
          ...(row.providerMessageId === null
            ? {}
            : { providerMessageId: row.providerMessageId }),
          completedAt: new Date(row.completedAt.getTime()),
        }),
      ),
    );
  }
}
