import { Prisma, type PrismaClient } from "@prisma/client";
import type { AutomationJobRepository } from "../application/job-repository.js";
import {
  AUTOMATION_JOB_STATUSES,
  type AutomationJob,
  type AutomationJobErrorKind,
  type AutomationJobStatus,
} from "../domain/execution.js";

type Db = PrismaClient;

/**
 * EF-302 durable job persistence (raw SQL, organization-scoped everywhere).
 * `claimNextDueJob` uses FOR UPDATE SKIP LOCKED so concurrent ticks never
 * double-claim, and `insertJob` relies on the unique
 * (organizationId, executionKey) index so replays never double-schedule.
 */
export class PrismaAutomationJobRepository implements AutomationJobRepository {
  constructor(private readonly db: Db) {}

  async findJobByExecutionKey(
    organizationId: string,
    executionKey: string,
  ): Promise<AutomationJob | null> {
    const rows = await this.db.$queryRaw<JobRow[]>`
      SELECT ${jobColumns}
      FROM "AutomationJob"
      WHERE "organizationId" = ${organizationId}::uuid AND "executionKey" = ${executionKey}
      LIMIT 1`;
    return rows[0] ? mapJob(rows[0]) : null;
  }

  async insertJob(
    job: AutomationJob,
  ): Promise<Readonly<{ kind: "inserted" }> | Readonly<{ kind: "duplicate" }>> {
    const rows = await this.db.$queryRaw<{ id: string }[]>`
      INSERT INTO "AutomationJob"
        ("id", "organizationId", "ruleId", "ruleVersion", "executionKey", "triggerKind",
         "eventType", "eventId", "actionType", "targetType", "targetId", "scheduleBucket",
         "scheduledFor", "status", "attemptCount", "maxAttempts", "nextAttemptAt",
         "lastErrorKind", "lastErrorMessage", "startedAt", "completedAt", "createdAt", "updatedAt")
      VALUES
        (${job.id}::uuid, ${job.organizationId}::uuid, ${job.ruleId}::uuid, ${job.ruleVersion},
         ${job.executionKey}, ${job.triggerKind}, ${job.eventType}, ${job.eventId}::uuid,
         ${job.actionType}, ${job.targetType}, ${job.targetId}, ${job.scheduleBucket},
         ${job.scheduledFor}, ${job.status}, ${job.attemptCount}, ${job.maxAttempts},
         ${job.nextAttemptAt}, ${job.lastError?.kind ?? null}, ${job.lastError?.message ?? null},
         ${job.startedAt}, ${job.completedAt}, ${job.createdAt}, ${job.updatedAt})
      ON CONFLICT ("organizationId", "executionKey") DO NOTHING
      RETURNING "id"`;
    return rows.length > 0 ? { kind: "inserted" } : { kind: "duplicate" };
  }

  async claimNextDueJob(now: Date): Promise<AutomationJob | null> {
    const rows = await this.db.$queryRaw<JobRow[]>`
      UPDATE "AutomationJob"
      SET "status" = 'RUNNING',
          "attemptCount" = "attemptCount" + 1,
          "startedAt" = COALESCE("startedAt", ${now}),
          "updatedAt" = ${now}
      WHERE "id" = (
        SELECT "id" FROM "AutomationJob"
        WHERE "status" IN ('QUEUED', 'RETRYING') AND "nextAttemptAt" <= ${now}
        ORDER BY "nextAttemptAt" ASC, "id" ASC
        FOR UPDATE SKIP LOCKED
        LIMIT 1
      )
      RETURNING ${jobColumns}`;
    return rows[0] ? mapJob(rows[0]) : null;
  }

  async saveJobOutcome(job: AutomationJob): Promise<boolean> {
    const rows = await this.db.$queryRaw<{ id: string }[]>`
      UPDATE "AutomationJob"
      SET "status" = ${job.status},
          "nextAttemptAt" = ${job.nextAttemptAt},
          "lastErrorKind" = ${job.lastError?.kind ?? null},
          "lastErrorMessage" = ${job.lastError?.message ?? null},
          "completedAt" = ${job.completedAt},
          "updatedAt" = ${job.updatedAt}
      WHERE "id" = ${job.id}::uuid
        AND "organizationId" = ${job.organizationId}::uuid
        AND "status" = 'RUNNING'
        AND "attemptCount" = ${job.attemptCount}
      RETURNING "id"`;
    return rows.length > 0;
  }

  async listJobsByStatus(input: {
    organizationId: string;
    status: AutomationJobStatus;
    limit: number;
  }): Promise<AutomationJob[]> {
    const status = requireStatus(input.status);
    const rows = await this.db.$queryRaw<JobRow[]>`
      SELECT ${jobColumns}
      FROM "AutomationJob"
      WHERE "organizationId" = ${input.organizationId}::uuid AND "status" = ${status}
      ORDER BY "updatedAt" DESC, "id" ASC
      LIMIT ${input.limit}`;
    return rows.map(mapJob);
  }

  async listJobsForRule(input: {
    organizationId: string;
    ruleId: string;
    limit: number;
  }): Promise<AutomationJob[]> {
    const rows = await this.db.$queryRaw<JobRow[]>`
      SELECT ${jobColumns}
      FROM "AutomationJob"
      WHERE "organizationId" = ${input.organizationId}::uuid AND "ruleId" = ${input.ruleId}::uuid
      ORDER BY "createdAt" DESC, "id" ASC
      LIMIT ${input.limit}`;
    return rows.map(mapJob);
  }

  async listRecentFinanceJobs(input: {
    organizationId: string;
    limit: number;
  }): Promise<AutomationJob[]> {
    const rows = await this.db.$queryRaw<JobRow[]>`
      SELECT ${jobColumns}
      FROM "AutomationJob"
      WHERE "organizationId" = ${input.organizationId}::uuid
        AND "targetType" IN ('RECEIVABLE', 'COMMISSION')
      ORDER BY "createdAt" DESC, "id" ASC
      LIMIT ${input.limit}`;
    return rows.map(mapJob);
  }
}

const jobColumns = Prisma.sql`"id", "organizationId", "ruleId", "ruleVersion", "executionKey", "triggerKind", "eventType", "eventId", "actionType", "targetType", "targetId", "scheduleBucket", "scheduledFor", "status", "attemptCount", "maxAttempts", "nextAttemptAt", "lastErrorKind", "lastErrorMessage", "startedAt", "completedAt", "createdAt", "updatedAt"`;

type JobRow = {
  id: string;
  organizationId: string;
  ruleId: string;
  ruleVersion: number;
  executionKey: string;
  triggerKind: string;
  eventType: string | null;
  eventId: string | null;
  actionType: string;
  targetType: string;
  targetId: string;
  scheduleBucket: string | null;
  scheduledFor: Date;
  status: string;
  attemptCount: number;
  maxAttempts: number;
  nextAttemptAt: Date | null;
  lastErrorKind: string | null;
  lastErrorMessage: string | null;
  startedAt: Date | null;
  completedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

function requireStatus(status: AutomationJobStatus): AutomationJobStatus {
  if (!AUTOMATION_JOB_STATUSES.includes(status))
    throw new RangeError(`unknown automation job status: ${status}`);
  return status;
}

function mapJob(row: JobRow): AutomationJob {
  return Object.freeze({
    id: row.id,
    organizationId: row.organizationId,
    ruleId: row.ruleId,
    ruleVersion: row.ruleVersion,
    executionKey: row.executionKey,
    triggerKind: row.triggerKind as AutomationJob["triggerKind"],
    eventType: row.eventType,
    eventId: row.eventId,
    actionType: row.actionType,
    targetType: row.targetType,
    targetId: row.targetId,
    scheduleBucket: row.scheduleBucket,
    scheduledFor: row.scheduledFor,
    status: row.status as AutomationJobStatus,
    attemptCount: row.attemptCount,
    maxAttempts: row.maxAttempts,
    nextAttemptAt: row.nextAttemptAt,
    lastError:
      row.lastErrorKind && row.lastErrorMessage
        ? Object.freeze({
            kind: row.lastErrorKind as AutomationJobErrorKind,
            message: row.lastErrorMessage,
          })
        : null,
    startedAt: row.startedAt,
    completedAt: row.completedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  });
}
