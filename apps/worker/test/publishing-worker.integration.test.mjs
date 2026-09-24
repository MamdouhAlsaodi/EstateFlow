import assert from "node:assert/strict";
import process from "node:process";
import { access } from "node:fs/promises";
import { createRequire } from "node:module";
import { randomUUID } from "node:crypto";
import test from "node:test";

import { createComposedSchedulerRuntime } from "../dist/index.js";

const requireApi = createRequire(
  new URL("../../api/package.json", import.meta.url),
);
const { NestFactory } = requireApi("@nestjs/core");
const { PrismaClient } = requireApi("@prisma/client");

const TABLES = [
  "ContentDelivery",
  "ContentPublishJob",
  "ContentTransition",
  "ContentItem",
  "Membership",
  "Organization",
  "User",
];

function guardedTarget() {
  return (
    process.env.ALLOW_DESTRUCTIVE_TESTS === "1" &&
    process.env.ESTATEFLOW_TEST_DB_PORT === "55435" &&
    process.env.DATABASE_URL?.includes("@127.0.0.1:55435/estateflow_test")
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

test(
  "EF-404 worker path delivers exactly once across a fresh runtime restart",
  { skip: !guardedTarget() },
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
      contentItemId: randomUUID(),
    };
    const now = new Date();
    const scheduledFor = new Date(now.getTime() + 60_000);
    const prisma = new PrismaClient();
    let seedApp;
    let runtime;
    try {
      await prisma.$connect();
      await prisma.organization.create({
        data: { id: ids.organizationId, name: "EF-404 worker fixture" },
      });
      await prisma.user.create({
        data: {
          id: ids.ownerId,
          accountIdentifier: `${ids.ownerId}@ef404.worker.test.invalid`,
          verifiedAt: now,
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

      const { AppModule } = await import("../../api/dist/app.module.js");
      seedApp = await NestFactory.createApplicationContext(AppModule, {
        logger: false,
      });
      const { ContentApplication } =
        await import("../../api/dist/features/content/application/content-application.js");
      const content = seedApp.get(ContentApplication);
      const actor = { verified: true };
      const base = {
        actor,
        userId: ids.ownerId,
        organizationId: ids.organizationId,
        contentItemId: ids.contentItemId,
      };
      assert.equal(
        (
          await content.createContentItem({
            ...base,
            title: "محتوى اختبار العامل",
            body: "نص اصطناعي للتسليم مرة واحدة",
            channel: "INSTAGRAM",
            createdAt: now,
          })
        ).kind,
        "created",
      );
      for (const toStatus of ["DRAFT", "REVIEW", "APPROVED"]) {
        assert.equal(
          (
            await content.transitionContentItem({
              ...base,
              toStatus,
              at: now,
            })
          ).kind,
          "transitioned",
        );
      }
      assert.equal(
        (
          await content.transitionContentItem({
            ...base,
            toStatus: "SCHEDULED",
            scheduledFor,
            at: now,
          })
        ).kind,
        "transitioned",
      );
      assert.equal(
        await prisma.contentPublishJob.count({
          where: {
            organizationId: ids.organizationId,
            contentItemId: ids.contentItemId,
          },
        }),
        1,
      );
      await seedApp.close();
      seedApp = undefined;

      // This is the same composed scheduler transport used by apps/worker:
      // AutomationScheduler.runTick runs first, then the EF-404 delivery half
      // runs in that same loop and batch.
      runtime = await createComposedSchedulerRuntime();
      const first = await runtime.scheduler.tick({
        now: scheduledFor,
        limit: 10,
      });
      assert.equal(first.deliveries.delivered, 1);
      assert.equal(
        await prisma.contentDelivery.count({
          where: {
            organizationId: ids.organizationId,
            contentItemId: ids.contentItemId,
          },
        }),
        1,
      );
      await runtime.close();
      runtime = undefined;

      // A new worker/API context sees only the terminal occurrence; replaying
      // the tick cannot call the fake adapter or append another snapshot.
      runtime = await createComposedSchedulerRuntime();
      const replay = await runtime.scheduler.tick({
        now: new Date(scheduledFor.getTime() + 60_000),
        limit: 10,
      });
      assert.equal(replay.deliveries.claimed, 0);
      assert.equal(replay.deliveries.delivered, 0);
      const item = await prisma.contentItem.findUnique({
        where: {
          organizationId_id: {
            organizationId: ids.organizationId,
            id: ids.contentItemId,
          },
        },
      });
      assert.equal(item.status, "PUBLISHED");
      assert.equal(
        await prisma.contentTransition.count({
          where: {
            organizationId: ids.organizationId,
            contentItemId: ids.contentItemId,
            toStatus: "PUBLISHED",
          },
        }),
        1,
      );
    } finally {
      if (seedApp) await seedApp.close();
      if (runtime) await runtime.close();
      await prisma.$executeRawUnsafe(
        `TRUNCATE TABLE ${TABLES.map((name) => `"${name}"`).join(", ")} RESTART IDENTITY CASCADE`,
      );
      await prisma.$disconnect();
    }
  },
);
