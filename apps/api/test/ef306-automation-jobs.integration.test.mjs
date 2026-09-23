import assert from "node:assert/strict";
import process from "node:process";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "../dist/app.module.js";
import { PrismaService } from "../dist/database/prisma.service.js";
import { AutomationRuleApplication } from "../dist/features/automation/application/rule-application.js";
import { PrismaAutomationJobRepository } from "../dist/features/automation/infrastructure/prisma-automation-job.repository.js";
import {
  createAutomationJob,
  deriveRetryExecutionKey,
  failAutomationJob,
  succeedAutomationJob,
} from "../dist/features/automation/domain/execution.js";
import {
  cleanupDatabase,
  assertTablesAreEmpty,
} from "./support/cleanup-database.mjs";

const ORIGIN = "https://app.estateflow.test";
const TABLES = [
  "AutomationJob",
  "AutomationRuleVersion",
  "AutomationRule",
  "Membership",
  "Organization",
  "User",
];
Object.assign(process.env, {
  NODE_ENV: "test",
  ESTATEFLOW_BROWSER_ORIGIN: ORIGIN,
  ESTATEFLOW_AUTH_HASH_KEY: "a".repeat(32),
  ESTATEFLOW_AUDIT_HASH_KEY: "b".repeat(32),
  ESTATEFLOW_AUTH_FAKE_DELIVERY: "true",
});
const expectedPort = process.env.ESTATEFLOW_TEST_DB_PORT ?? "55433";
function guardedTarget() {
  if (process.env.ALLOW_DESTRUCTIVE_TESTS !== "1" || !process.env.DATABASE_URL)
    return false;
  const url = new URL(process.env.DATABASE_URL);
  return (
    ["postgres:", "postgresql:"].includes(url.protocol) &&
    ["127.0.0.1", "localhost", "::1"].includes(url.hostname) &&
    url.port === expectedPort &&
    url.username === "estateflow_test" &&
    url.pathname === "/estateflow_test"
  );
}

const definition = {
  trigger: { kind: "DOMAIN_EVENT", eventType: "lead.created" },
  conditions: [],
  action: { actionType: "CREATE_LEAD_TASK", payload: {} },
};

test(
  "EF-306 job history, authority matrix, tenant isolation, retry-new-occurrence, and cancel gating",
  { skip: !guardedTarget() },
  async () => {
    let app;
    const prisma = new PrismaService();
    await cleanupDatabase(prisma, TABLES);
    try {
      // ---- seed organizations, memberships, and a rule -------------------
      const orgA = randomUUID();
      const orgB = randomUUID();
      const owner = randomUUID();
      const manager = randomUUID();
      const broker = randomUUID();
      const suspendedManager = randomUUID();
      const ownerB = randomUUID();
      await prisma.organization.createMany({
        data: [
          { id: orgA, name: "Automation A" },
          { id: orgB, name: "Automation B" },
        ],
      });
      await prisma.user.createMany({
        data: [
          { id: owner, accountIdentifier: `${owner}@test.invalid` },
          { id: manager, accountIdentifier: `${manager}@test.invalid` },
          { id: broker, accountIdentifier: `${broker}@test.invalid` },
          {
            id: suspendedManager,
            accountIdentifier: `${suspendedManager}@test.invalid`,
          },
          { id: ownerB, accountIdentifier: `${ownerB}@test.invalid` },
        ],
      });
      await prisma.membership.createMany({
        data: [
          {
            organizationId: orgA,
            userId: owner,
            role: "OWNER",
            status: "ACTIVE",
          },
          {
            organizationId: orgA,
            userId: manager,
            role: "MANAGER",
            status: "ACTIVE",
          },
          {
            organizationId: orgA,
            userId: broker,
            role: "BROKER",
            status: "ACTIVE",
          },
          {
            organizationId: orgA,
            userId: suspendedManager,
            role: "MANAGER",
            status: "SUSPENDED",
          },
          {
            organizationId: orgB,
            userId: ownerB,
            role: "OWNER",
            status: "ACTIVE",
          },
        ],
      });

      app = await NestFactory.create(AppModule, { logger: false });
      const rules = app.get(AutomationRuleApplication);
      const jobs = app.get(PrismaAutomationJobRepository);
      const actor = { verified: true };

      const created = await rules.createRule({
        actor,
        userId: owner,
        organizationId: orgA,
        ruleId: randomUUID(),
        name: "قاعدة ترحيب",
        definition,
        createdAt: new Date("2026-09-28T08:00:00.000Z"),
      });
      assert.equal(created.kind, "created");
      const ruleId = created.rule.id;

      // ---- seed one job per interesting state ----------------------------
      // Seeding follows the real scheduler path: the atomic claim marks the
      // row RUNNING in the database before an outcome can be saved.
      async function seedJob(status, index) {
        const now = new Date(`2026-09-28T09:0${index}:00.000Z`);
        let job = createAutomationJob({
          id: randomUUID(),
          organizationId: orgA,
          ruleId,
          ruleVersion: 1,
          executionKey: `seed-${status}-${index}`,
          triggerKind: "DOMAIN_EVENT",
          eventType: "lead.created",
          eventId: randomUUID(),
          actionType: "CREATE_LEAD_TASK",
          targetType: "LEAD",
          targetId: `lead-${index}`,
          scheduleBucket: null,
          // The QUEUED job keeps a future due time so the scheduler claim
          // used by this seed never picks it up.
          scheduledFor:
            status === "QUEUED" ? new Date("2026-09-28T23:00:00.000Z") : now,
          now,
        });
        assert.deepEqual(await jobs.insertJob(job), { kind: "inserted" });
        if (status === "QUEUED") return job;
        const claimed = await jobs.claimNextDueJob(now);
        assert.ok(claimed, `claim ${status}`);
        assert.equal(claimed.id, job.id);
        job = claimed;
        if (status === "SUCCEEDED") {
          job = succeedAutomationJob(job, now);
          assert.equal(await jobs.saveJobOutcome(job), true);
        }
        if (status === "FAILED") {
          job = failAutomationJob(job, now, {
            kind: "action-permanent-failure",
            message: "executor rejected the action",
          });
          assert.equal(await jobs.saveJobOutcome(job), true);
        }
        return job;
      }

      const failedJob = await seedJob("FAILED", 1);
      const queuedJob = await seedJob("QUEUED", 2);
      const succeededJob = await seedJob("SUCCEEDED", 3);

      // ---- execution history per rule and per organization ---------------
      const deniedHistory = await rules.listOrganizationJobs({
        actor,
        userId: broker,
        organizationId: orgA,
        limit: 100,
      });
      assert.equal(deniedHistory.kind, "access-denied");

      const history = await rules.listOrganizationJobs({
        actor,
        userId: manager,
        organizationId: orgA,
        limit: 100,
      });
      assert.equal(history.kind, "found");
      assert.equal(history.jobs.length, 3);
      assert.deepEqual(history.jobs.map((job) => job.status).sort(), [
        "FAILED",
        "QUEUED",
        "SUCCEEDED",
      ]);

      const ruleHistory = await rules.listRuleJobs({
        actor,
        userId: owner,
        organizationId: orgA,
        ruleId,
        limit: 100,
      });
      assert.equal(ruleHistory.kind, "found");
      assert.equal(ruleHistory.jobs.length, 3);

      const foreignRuleHistory = await rules.listRuleJobs({
        actor,
        userId: owner,
        organizationId: orgA,
        ruleId: randomUUID(),
        limit: 100,
      });
      assert.equal(foreignRuleHistory.kind, "not-found");

      // ---- authority matrix: retry/cancel is Owner/Manager only ----------
      for (const [userId, expected] of [
        [owner, "authorized"],
        [manager, "authorized"],
        [broker, "access-denied"],
        [suspendedManager, "access-denied"],
      ]) {
        const access = await rules.getJob({
          actor,
          userId,
          organizationId: orgA,
          jobId: failedJob.id,
        });
        assert.equal(
          access.kind === "found" ? "authorized" : "access-denied",
          expected,
          `authority for ${userId}`,
        );
      }

      // ---- retry creates exactly one NEW occurrence ----------------------
      const brokerRetry = await rules.retryJob({
        actor,
        userId: broker,
        organizationId: orgA,
        jobId: failedJob.id,
        now: new Date("2026-09-28T10:00:00.000Z"),
      });
      assert.equal(brokerRetry.kind, "access-denied");

      const retryAt = new Date("2026-09-28T10:00:00.000Z");
      const retried = await rules.retryJob({
        actor,
        userId: owner,
        organizationId: orgA,
        jobId: failedJob.id,
        now: retryAt,
      });
      assert.equal(retried.kind, "retried");
      assert.notEqual(retried.job.id, failedJob.id);
      assert.equal(retried.job.status, "QUEUED");
      assert.equal(retried.job.attemptCount, 0);
      assert.equal(retried.job.organizationId, orgA);
      assert.equal(retried.job.ruleId, failedJob.ruleId);
      assert.equal(retried.job.actionType, failedJob.actionType);
      assert.equal(retried.job.targetId, failedJob.targetId);
      assert.equal(
        retried.job.executionKey,
        deriveRetryExecutionKey(failedJob),
      );
      assert.notEqual(retried.job.executionKey, failedJob.executionKey);
      assert.deepEqual(await jobs.findJob(orgA, retried.job.id), retried.job);

      // Idempotency: retrying the same failed occurrence again resolves to a
      // typed duplicate — never a second new job row.
      const duplicateRetry = await rules.retryJob({
        actor,
        userId: manager,
        organizationId: orgA,
        jobId: failedJob.id,
        now: new Date("2026-09-28T10:01:00.000Z"),
      });
      assert.equal(duplicateRetry.kind, "duplicate");
      const [retryCount] = await prisma.$queryRaw`
        SELECT COUNT(*)::integer AS count FROM "AutomationJob"
        WHERE "organizationId" = ${orgA}::uuid
          AND "executionKey" = ${deriveRetryExecutionKey(failedJob)}`;
      assert.equal(retryCount.count, 1);

      // ---- retry/cancel refuse non-actionable states ---------------------
      const retrySucceeded = await rules.retryJob({
        actor,
        userId: owner,
        organizationId: orgA,
        jobId: succeededJob.id,
        now: retryAt,
      });
      assert.equal(retrySucceeded.kind, "invalid-state");

      const cancelFailed = await rules.cancelJob({
        actor,
        userId: owner,
        organizationId: orgA,
        jobId: failedJob.id,
        now: retryAt,
      });
      assert.equal(cancelFailed.kind, "invalid-state");

      // ---- cancel works only for queued/pending jobs ---------------------
      const cancelled = await rules.cancelJob({
        actor,
        userId: owner,
        organizationId: orgA,
        jobId: queuedJob.id,
        now: retryAt,
      });
      assert.equal(cancelled.kind, "cancelled");
      assert.equal(cancelled.job.status, "CANCELLED");
      assert.equal(cancelled.job.lastError, null);
      const persisted = await jobs.findJob(orgA, queuedJob.id);
      assert.equal(persisted.status, "CANCELLED");
      assert.notEqual(persisted.completedAt, null);

      const cancelTwice = await rules.cancelJob({
        actor,
        userId: owner,
        organizationId: orgA,
        jobId: queuedJob.id,
        now: retryAt,
      });
      assert.equal(cancelTwice.kind, "invalid-state");

      // ---- tenant isolation: foreign ids are absent, never leaked --------
      const missing = await rules.getJob({
        actor,
        userId: ownerB,
        organizationId: orgB,
        jobId: failedJob.id,
      });
      assert.equal(missing.kind, "not-found");

      const crossRetry = await rules.retryJob({
        actor,
        userId: ownerB,
        organizationId: orgB,
        jobId: failedJob.id,
        now: retryAt,
      });
      assert.equal(crossRetry.kind, "not-found");

      const crossCancel = await rules.cancelJob({
        actor,
        userId: ownerB,
        organizationId: orgB,
        jobId: queuedJob.id,
        now: retryAt,
      });
      assert.equal(crossCancel.kind, "not-found");

      const orgBHistory = await rules.listOrganizationJobs({
        actor,
        userId: ownerB,
        organizationId: orgB,
        limit: 100,
      });
      assert.equal(orgBHistory.kind, "found");
      assert.equal(orgBHistory.jobs.length, 0);

      // A job id from another organization is unreachable as a retry source,
      // so no cross-tenant side effect can ever be duplicated.
      const [orgAJobCount] = await prisma.$queryRaw`
        SELECT COUNT(*)::integer AS count FROM "AutomationJob"
        WHERE "organizationId" = ${orgA}::uuid`;
      assert.equal(orgAJobCount.count, 4);
    } finally {
      await app?.close();
      await cleanupDatabase(prisma, TABLES);
      await assertTablesAreEmpty(prisma, TABLES);
      await prisma.$disconnect();
    }
  },
);
