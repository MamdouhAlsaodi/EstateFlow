import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import process from "node:process";
import test from "node:test";
import { createRequire } from "node:module";
import { AppModule } from "../../api/dist/app.module.js";
import { PrismaService } from "../../api/dist/database/prisma.service.js";
import { AutomationRuleApplication } from "../../api/dist/features/automation/application/rule-application.js";
import { PrismaViewingRepository } from "../../api/dist/features/viewings/infrastructure/prisma-viewing.repository.js";
import { createAutomationSchedulerTick } from "../../api/dist/features/automation/application/automation-worker-tick.js";
import { createAutomationWorker } from "../dist/index.js";

const requireApi = createRequire(
  new URL("../../api/package.json", import.meta.url),
);
const { NestFactory } = requireApi("@nestjs/core");
const { PrismaClient } = requireApi("@prisma/client");

function guarded() {
  return (
    process.env.ALLOW_DESTRUCTIVE_TESTS === "1" &&
    process.env.ESTATEFLOW_TEST_DB_PORT === "55435" &&
    process.env.DATABASE_URL?.includes("@127.0.0.1:55435/estateflow_test")
  );
}
function timers() {
  const values = [];
  return {
    values,
    setTimeoutFn(callback, delay) {
      const timer = { callback, delay };
      values.push(timer);
      return timer;
    },
    clearTimeoutFn(timer) {
      const index = values.indexOf(timer);
      if (index >= 0) values.splice(index, 1);
    },
  };
}
async function waitFor(check) {
  const deadline = Date.now() + 4_000;
  while (Date.now() < deadline) {
    if (await check()) return;
    await new Promise((resolve) => globalThis.setTimeout(resolve, 10));
  }
  throw new Error("Timed out waiting for EF-502 worker side effect");
}

const TABLES = [
  '"NotificationSend"',
  '"AutomationNotification"',
  '"AutomationJob"',
  '"AutomationRuleVersion"',
  '"AutomationRule"',
  '"ViewingAutomationOccurrence"',
  '"ViewingTransition"',
  '"Viewing"',
  '"BrokerAvailabilityRule"',
  '"LeadTimelineEvent"',
  '"LeadIdempotencyRecord"',
  '"Property"',
  '"Lead"',
  '"Membership"',
  '"Organization"',
  '"User"',
];

test(
  "EF-502 worker path delivers one due reminder after reschedule reset and replays exactly once",
  { skip: !guarded() },
  async () => {
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
      brokerId: randomUUID(),
      leadId: randomUUID(),
      propertyId: randomUUID(),
      viewingId: randomUUID(),
      ruleId: randomUUID(),
    };
    const now = new Date();
    const prisma = new PrismaClient();
    let seedApp;
    let runtime;
    try {
      await prisma.$connect();
      await prisma.$executeRawUnsafe(
        `TRUNCATE TABLE ${TABLES.join(", ")} CASCADE`,
      );
      await prisma.user.createMany({
        data: [
          { id: ids.ownerId, accountIdentifier: `${ids.ownerId}@ef502.test` },
          { id: ids.brokerId, accountIdentifier: `${ids.brokerId}@ef502.test` },
        ],
      });
      await prisma.organization.create({
        data: { id: ids.organizationId, name: "EF502 worker" },
      });
      await prisma.membership.createMany({
        data: [
          {
            organizationId: ids.organizationId,
            userId: ids.ownerId,
            role: "OWNER",
            status: "ACTIVE",
          },
          {
            organizationId: ids.organizationId,
            userId: ids.brokerId,
            role: "BROKER",
            status: "ACTIVE",
          },
        ],
      });
      await prisma.lead.create({
        data: {
          id: ids.leadId,
          organizationId: ids.organizationId,
          ownerId: ids.ownerId,
          nextAction: "viewing",
          source: "EF502",
        },
      });
      await prisma.property.create({
        data: {
          id: ids.propertyId,
          organizationId: ids.organizationId,
          title: "EF502",
          propertyType: "HOME",
          addressText: "Synthetic",
          status: "ACTIVE",
        },
      });
      const weekdayIndex = [
        "Sun",
        "Mon",
        "Tue",
        "Wed",
        "Thu",
        "Fri",
        "Sat",
      ].indexOf(
        new Intl.DateTimeFormat("en-US", {
          weekday: "short",
          timeZone: "UTC",
        }).format(now),
      );
      await prisma.brokerAvailabilityRule.create({
        data: {
          organizationId: ids.organizationId,
          brokerId: ids.brokerId,
          weekday: weekdayIndex,
          startMinute: 0,
          endMinute: 1440,
          timezone: "UTC",
          createdBy: ids.ownerId,
        },
      });
      await prisma.$executeRaw`
        INSERT INTO "NotificationDeliveryPolicy" ("organizationId", "timeZone", "quietStart", "quietEnd", "updatedBy", "updatedAt")
        VALUES (${ids.organizationId}::uuid, 'UTC', '23:59', '00:00', ${ids.ownerId}::uuid, ${now})`;
      seedApp = await NestFactory.createApplicationContext(AppModule, {
        logger: false,
      });
      const rules = seedApp.get(AutomationRuleApplication);
      const created = await rules.createRule({
        actor: { verified: true },
        userId: ids.ownerId,
        organizationId: ids.organizationId,
        ruleId: ids.ruleId,
        name: "EF502 one hour reminder",
        definition: {
          trigger: { kind: "DOMAIN_EVENT", eventType: "viewing.reminder_1h" },
          conditions: [],
          action: {
            actionType: "CREATE_INTERNAL_NOTIFICATION",
            payload: { template: "viewing-reminder-1h" },
          },
        },
        createdAt: now,
      });
      assert.equal(created.kind, "created");
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
      const repository = new PrismaViewingRepository(
        seedApp.get(PrismaService),
      );
      const viewing = await repository.createViewing({
        id: ids.viewingId,
        organizationId: ids.organizationId,
        leadId: ids.leadId,
        propertyId: ids.propertyId,
        brokerId: ids.brokerId,
        requestedByUserId: ids.ownerId,
        startAt: new Date(now.getTime() + 2 * 60 * 60 * 1000),
        endAt: new Date(now.getTime() + 3 * 60 * 60 * 1000),
        createdAt: now,
      });
      assert.equal(viewing.viewing.status, "REQUESTED");
      await repository.confirmViewing({
        organizationId: ids.organizationId,
        viewingId: ids.viewingId,
        actorId: ids.ownerId,
        at: now,
      });
      await repository.rescheduleViewing({
        organizationId: ids.organizationId,
        viewingId: ids.viewingId,
        startAt: new Date(now.getTime() + 30 * 60 * 1000),
        endAt: new Date(now.getTime() + 90 * 60 * 1000),
        actorId: ids.ownerId,
        at: now,
      });
      await seedApp.close();
      seedApp = undefined;
      runtime = await createAutomationSchedulerTick();
      const clock = timers();
      const worker = createAutomationWorker({
        scheduler: runtime,
        setTimeoutFn: clock.setTimeoutFn,
        clearTimeoutFn: clock.clearTimeoutFn,
      });
      worker.start();
      await waitFor(() => clock.values.length > 0);
      const first = clock.values.shift();
      assert.equal(first.delay, 0);
      first.callback();
      await waitFor(async () => {
        const rows =
          await prisma.$queryRaw`SELECT COUNT(*)::int AS count FROM "NotificationSend" WHERE "organizationId" = ${ids.organizationId}::uuid AND "status" = 'SENT'`;
        return rows[0].count === 1;
      });
      assert.equal(
        (
          await prisma.$queryRaw`SELECT COUNT(*)::int AS count FROM "ViewingAutomationOccurrence" WHERE "organizationId" = ${ids.organizationId}::uuid AND "status" = 'VOIDED'`
        )[0].count,
        2,
      );
      await waitFor(async () => {
        const jobs =
          await prisma.$queryRaw`SELECT COUNT(*)::int AS count FROM "AutomationJob" WHERE "organizationId" = ${ids.organizationId}::uuid AND "status" = 'SUCCEEDED'`;
        return jobs[0].count === 1;
      });
      const compatibilityRows =
        await prisma.$queryRaw`SELECT COUNT(*)::int AS count FROM "AutomationNotification" WHERE "organizationId" = ${ids.organizationId}::uuid`;
      const jobRows =
        await prisma.$queryRaw`SELECT "status", "lastErrorKind", "lastErrorMessage" FROM "AutomationJob" WHERE "organizationId" = ${ids.organizationId}::uuid`;
      assert.equal(compatibilityRows[0].count, 1, JSON.stringify(jobRows));
      await waitFor(() => clock.values.length > 0);
      const replay = clock.values.shift();
      assert.equal(replay.delay, 5_000);
      replay.callback();
      await new Promise((resolve) => globalThis.setTimeout(resolve, 50));
      assert.equal(
        (
          await prisma.$queryRaw`SELECT COUNT(*)::int AS count FROM "NotificationSend" WHERE "organizationId" = ${ids.organizationId}::uuid AND "status" = 'SENT'`
        )[0].count,
        1,
      );
      await worker.stop();
      await runtime.close();
      runtime = undefined;
    } finally {
      if (seedApp) await seedApp.close();
      if (runtime) await runtime.close();
      await prisma.$executeRawUnsafe(
        `TRUNCATE TABLE ${TABLES.join(", ")} CASCADE`,
      );
      await prisma.$disconnect();
    }
  },
);
