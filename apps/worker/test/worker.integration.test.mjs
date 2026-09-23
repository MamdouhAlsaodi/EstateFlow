import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import process from "node:process";
import { access } from "node:fs/promises";
import { createRequire } from "node:module";
import test from "node:test";
import { AppModule } from "../../api/dist/app.module.js";
import { PrismaService } from "../../api/dist/database/prisma.service.js";
import { AutomationRuleApplication } from "../../api/dist/features/automation/application/rule-application.js";
import { LeadAutomationCoordinator } from "../../api/dist/features/automation/application/lead-automation-coordinator.js";
import { PrismaLeadRepository } from "../../api/dist/features/leads/infrastructure/prisma-lead.repository.js";
import { createLead } from "../../api/dist/features/leads/domain/lead.js";
import { createAutomationWorker } from "../dist/index.js";
import { createAutomationSchedulerTick } from "../../api/dist/features/automation/application/automation-worker-tick.js";

const requireApi = createRequire(
  new URL("../../api/package.json", import.meta.url),
);
const { NestFactory } = requireApi("@nestjs/core");
const { PrismaClient } = requireApi("@prisma/client");

function hasGuardedTestTarget() {
  const value = process.env.DATABASE_URL;
  return (
    process.env.ALLOW_DESTRUCTIVE_TESTS === "1" &&
    process.env.ESTATEFLOW_TEST_DB_PORT === "55435" &&
    value?.includes("@127.0.0.1:55435/estateflow_test")
  );
}

async function waitForApiIntegrationSuite() {
  await new Promise((resolve) => globalThis.setTimeout(resolve, 15_000));
  const marker = "/tmp/estateflow-api-integration.running";
  try {
    await access(marker);
  } catch {
    return;
  }
  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    try {
      await access(marker);
    } catch {
      return;
    }
    await new Promise((resolve) => globalThis.setTimeout(resolve, 100));
  }
  throw new Error("Timed out waiting for the API integration suite");
}

function fakeTimers() {
  const timers = [];
  return {
    timers,
    setTimeoutFn(callback, delay) {
      const timer = { callback, delay };
      timers.push(timer);
      return timer;
    },
    clearTimeoutFn(timer) {
      const index = timers.indexOf(timer);
      if (index >= 0) timers.splice(index, 1);
    },
  };
}

async function waitFor(check, timeoutMs = 2_000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (await check()) return;
    await new Promise((resolve) => globalThis.setTimeout(resolve, 10));
  }
  throw new Error("Timed out waiting for worker side effect");
}

async function removeFixture(prisma) {
  // The append-only rule-version trigger intentionally rejects DELETE. This is
  // an isolated destructive test database, so use the same explicit table
  // allowlist strategy as the API integration harness.
  await prisma.$executeRaw`TRUNCATE TABLE "AutomationJob", "AutomationRuleVersion", "AutomationRule", "LeadIdempotencyRecord", "LeadTask", "LeadTimelineEvent", "Lead", "Membership", "Organization", "User" RESTART IDENTITY CASCADE`;
}

test(
  "worker executes one due Lead SLA breach job exactly once on replay",
  { skip: !hasGuardedTestTarget() },
  async () => {
    await waitForApiIntegrationSuite();
    Object.assign(process.env, {
      NODE_ENV: "test",
      ESTATEFLOW_BROWSER_ORIGIN: "https://app.estateflow.test",
      ESTATEFLOW_AUTH_HASH_KEY: "a".repeat(32),
      ESTATEFLOW_AUDIT_HASH_KEY: "b".repeat(32),
      ESTATEFLOW_AUTH_FAKE_DELIVERY: "true",
    });
    const ids = {
      organizationId: randomUUID(),
      ownerId: randomUUID(),
      leadId: randomUUID(),
      ruleId: randomUUID(),
    };
    const now = new Date();
    const prisma = new PrismaClient();
    let seedApp;
    let runtime;
    try {
      await prisma.$connect();
      await prisma.organization.create({
        data: { id: ids.organizationId, name: "Worker SLA Fixture" },
      });
      await prisma.user.create({
        data: {
          id: ids.ownerId,
          accountIdentifier: `${ids.ownerId}@worker.test.invalid`,
        },
      });
      await prisma.membership.create({
        data: {
          organizationId: ids.organizationId,
          userId: ids.ownerId,
          role: "OWNER",
          status: "ACTIVE",
        },
      });

      seedApp = await NestFactory.createApplicationContext(AppModule, {
        logger: false,
      });
      const leads = new PrismaLeadRepository(seedApp.get(PrismaService));
      const lead = createLead({
        id: ids.leadId,
        organizationId: ids.organizationId,
        ownerId: ids.ownerId,
        nextAction: "Call",
        source: "WEBSITE",
        now: new Date(now.getTime() - 3 * 60 * 60 * 1000),
      });
      const created = await leads.createLead({
        lead,
        idempotencyKey: "worker-fixture-create",
        timelineEvents: [
          {
            type: "LEAD_CREATED",
            leadId: ids.leadId,
            organizationId: ids.organizationId,
            occurredAt: lead.createdAt,
            data: { stage: "NEW" },
          },
        ],
      });
      assert.equal(created.kind, "ok");

      const rules = seedApp.get(AutomationRuleApplication);
      const createdRule = await rules.createRule({
        actor: { verified: true },
        userId: ids.ownerId,
        organizationId: ids.organizationId,
        ruleId: ids.ruleId,
        name: "Worker response SLA",
        definition: {
          trigger: {
            kind: "DOMAIN_EVENT",
            eventType: "lead.response_sla_breached",
          },
          conditions: [],
          action: {
            actionType: "CREATE_LEAD_TASK",
            payload: { title: "Worker SLA follow-up", dueInMinutes: "0" },
          },
        },
        createdAt: now,
      });
      assert.equal(createdRule.kind, "created");
      assert.equal(
        (
          await rules.enableRule({
            actor: { verified: true },
            userId: ids.ownerId,
            organizationId: ids.organizationId,
            ruleId: ids.ruleId,
            at: now,
          })
        ).kind,
        "enabled",
      );

      const coordinator = seedApp.get(LeadAutomationCoordinator);
      const scheduled = await coordinator.evaluateBreaches({
        organizationId: ids.organizationId,
        now,
      });
      assert.equal(scheduled.inspected, 1);
      assert.equal(scheduled.scheduled, 1);
      await seedApp.close();
      seedApp = undefined;

      // This is the same API-owned tick transport used by the real worker
      // entrypoint; only the timer is controlled to make the test deterministic.
      runtime = await createAutomationSchedulerTick();
      const clock = fakeTimers();
      const worker = createAutomationWorker({
        scheduler: runtime,
        intervalMs: 10,
        maxBackoffMs: 40,
        setTimeoutFn: clock.setTimeoutFn,
        clearTimeoutFn: clock.clearTimeoutFn,
      });
      worker.start();
      const firstTimer = clock.timers.shift();
      assert.equal(firstTimer.delay, 0);
      firstTimer.callback();
      await waitFor(async () => {
        return (
          (await prisma.leadTask.count({
            where: {
              organizationId: ids.organizationId,
              leadId: ids.leadId,
            },
          })) === 1
        );
      });
      assert.equal(
        await prisma.leadTask.count({
          where: { organizationId: ids.organizationId, leadId: ids.leadId },
        }),
        1,
      );
      const replayTimer = clock.timers.shift();
      assert.equal(replayTimer.delay, 10);
      replayTimer.callback();
      await new Promise((resolve) => globalThis.setTimeout(resolve, 20));
      assert.equal(
        await prisma.leadTask.count({
          where: { organizationId: ids.organizationId, leadId: ids.leadId },
        }),
        1,
      );
      await worker.stop();
      await runtime.close();
      runtime = undefined;
    } finally {
      if (seedApp) await seedApp.close();
      if (runtime) await runtime.close();
      await removeFixture(prisma);
      await prisma.$disconnect();
    }
  },
);

test(
  "worker executes one due receivable reminder notification exactly once on replay",
  { skip: !hasGuardedTestTarget() },
  async () => {
    await waitForApiIntegrationSuite();
    Object.assign(process.env, {
      NODE_ENV: "test",
      ESTATEFLOW_BROWSER_ORIGIN: "https://app.estateflow.test",
      ESTATEFLOW_AUTH_HASH_KEY: "a".repeat(32),
      ESTATEFLOW_AUDIT_HASH_KEY: "b".repeat(32),
      ESTATEFLOW_AUTH_FAKE_DELIVERY: "true",
    });
    const ids = {
      organizationId: randomUUID(),
      ownerId: randomUUID(),
      leadId: randomUUID(),
      propertyId: randomUUID(),
      dealId: randomUUID(),
      invoiceId: randomUUID(),
      receivableId: randomUUID(),
      ruleId: randomUUID(),
    };
    const now = new Date();
    const dueAt = new Date(now.getTime() - 60 * 60 * 1000);
    const prisma = new PrismaClient();
    let seedApp;
    let runtime;
    try {
      await prisma.$connect();
      await prisma.organization.create({
        data: { id: ids.organizationId, name: "Worker finance fixture" },
      });
      await prisma.user.create({
        data: {
          id: ids.ownerId,
          accountIdentifier: `${ids.ownerId}@worker.finance.test.invalid`,
        },
      });
      await prisma.membership.create({
        data: {
          organizationId: ids.organizationId,
          userId: ids.ownerId,
          role: "OWNER",
          status: "ACTIVE",
        },
      });
      await prisma.property.create({
        data: {
          id: ids.propertyId,
          organizationId: ids.organizationId,
          title: "Synthetic finance property",
          propertyType: "APARTMENT",
          addressText: "Synthetic address",
        },
      });
      await prisma.lead.create({
        data: {
          id: ids.leadId,
          organizationId: ids.organizationId,
          ownerId: ids.ownerId,
          nextAction: "Synthetic follow-up",
          source: "WORKER_TEST",
        },
      });
      await prisma.deal.create({
        data: {
          id: ids.dealId,
          organizationId: ids.organizationId,
          leadId: ids.leadId,
          propertyId: ids.propertyId,
          brokerId: ids.ownerId,
        },
      });
      await prisma.invoice.create({
        data: {
          id: ids.invoiceId,
          organizationId: ids.organizationId,
          dealId: ids.dealId,
          amountMinor: 10000n,
          currency: "SAR",
          status: "ISSUED",
          draftCreatedBy: ids.ownerId,
          draftCreatedAt: new Date(now.getTime() - 3 * 86_400_000),
          issuedBy: ids.ownerId,
          issuedAt: new Date(now.getTime() - 2 * 86_400_000),
          dueAt,
        },
      });
      await prisma.receivable.create({
        data: {
          id: ids.receivableId,
          organizationId: ids.organizationId,
          invoiceId: ids.invoiceId,
          dealId: ids.dealId,
          originalAmountMinor: 10000n,
          outstandingMinor: 10000n,
          currency: "SAR",
          status: "OPEN",
          issuedAt: new Date(now.getTime() - 2 * 86_400_000),
          dueAt,
        },
      });

      seedApp = await NestFactory.createApplicationContext(AppModule, {
        logger: false,
      });
      const rules = seedApp.get(AutomationRuleApplication);
      const createdRule = await rules.createRule({
        actor: { verified: true },
        userId: ids.ownerId,
        organizationId: ids.organizationId,
        ruleId: ids.ruleId,
        name: "Worker receivable overdue",
        definition: {
          trigger: { kind: "DOMAIN_EVENT", eventType: "receivable.overdue" },
          conditions: [],
          action: {
            actionType: "CREATE_INTERNAL_NOTIFICATION",
            payload: { daysPastDue: "0", template: "receivable-overdue" },
          },
        },
        createdAt: now,
      });
      assert.equal(createdRule.kind, "created");
      assert.equal(
        (
          await rules.enableRule({
            actor: { verified: true },
            userId: ids.ownerId,
            organizationId: ids.organizationId,
            ruleId: ids.ruleId,
            at: now,
          })
        ).kind,
        "enabled",
      );
      await seedApp.close();
      seedApp = undefined;

      runtime = await createAutomationSchedulerTick();
      const clock = fakeTimers();
      const worker = createAutomationWorker({
        scheduler: runtime,
        intervalMs: 10,
        maxBackoffMs: 40,
        setTimeoutFn: clock.setTimeoutFn,
        clearTimeoutFn: clock.clearTimeoutFn,
      });
      worker.start();
      const firstTimer = clock.timers.shift();
      assert.equal(firstTimer.delay, 0);
      firstTimer.callback();
      const notificationCount = async () =>
        (
          await prisma.$queryRaw`
            SELECT COUNT(*)::int AS count FROM "AutomationNotification"
            WHERE "organizationId" = ${ids.organizationId}::uuid
          `
        )[0].count;
      await waitFor(async () => (await notificationCount()) === 1);
      assert.equal(await notificationCount(), 1);
      const replayTimer = clock.timers.shift();
      assert.equal(replayTimer.delay, 10);
      replayTimer.callback();
      await new Promise((resolve) => globalThis.setTimeout(resolve, 20));
      assert.equal(await notificationCount(), 1);
      await worker.stop();
      await runtime.close();
      runtime = undefined;
    } finally {
      if (seedApp) await seedApp.close();
      if (runtime) await runtime.close();
      await removeFixture(prisma);
      await prisma.$disconnect();
    }
  },
);
