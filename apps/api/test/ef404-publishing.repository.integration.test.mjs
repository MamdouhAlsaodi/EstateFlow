import assert from "node:assert/strict";
import process from "node:process";
import { URL } from "node:url";
import test from "node:test";
import { randomUUID } from "node:crypto";

const ORIGIN = "https://app.estateflow.test";
const HASH_KEY = "a".repeat(32);
const AUDIT_KEY = "b".repeat(32);
const TABLES = [
  "ContentDelivery",
  "ContentPublishJob",
  "ContentTransition",
  "ContentItem",
  "LeadTouch",
  "LeadAttributionCorrection",
  "CampaignPerformanceEntry",
  "CampaignBudgetCorrection",
  "CampaignTransition",
  "ExpenseEvidenceMetadata",
  "ExpenseApprovalPolicy",
  "Expense",
  "Campaign",
  "Deal",
  "Property",
  "Lead",
  "Membership",
  "Organization",
  "User",
  "AccessSession",
  "SessionFamily",
  "RefreshSession",
  "Credential",
  "PasswordReset",
  "EmailVerification",
  "AuthAttempt",
  "AuthRateLimitEvent",
  "SecurityAuditEvent",
];
Object.assign(process.env, {
  NODE_ENV: "test",
  ESTATEFLOW_BROWSER_ORIGIN: ORIGIN,
  ESTATEFLOW_AUTH_HASH_KEY: HASH_KEY,
  ESTATEFLOW_AUDIT_HASH_KEY: AUDIT_KEY,
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

const org = "11111111-1111-4111-8111-111111111111";
const otherOrg = "22222222-2222-4222-8222-222222222222";
const owner = "33333333-3333-4333-8333-333333333333";
const now = new Date("2026-10-01T10:00:00.000Z");
const scheduledFor = new Date("2026-10-01T12:00:00.000Z");

test(
  "EF-404 publishing persistence: exactly-once delivery on replay/restart, cancel-before-delivery, typed failure + retry, tenant isolation, payload audit",
  { skip: !guardedTarget() },
  async () => {
    const [
      { NestFactory },
      { AppModule },
      { PrismaService },
      { PrismaContentRepository },
      { PrismaContentPublishingRepository },
      { ContentPublishingApplication },
      { InMemoryRecordingPublishingAdapter },
      { createContentItem, transitionContentItem },
      { cleanupDatabase, assertTablesAreEmpty },
    ] = await Promise.all([
      import("@nestjs/core"),
      import("../dist/app.module.js"),
      import("../dist/database/prisma.service.js"),
      import("../dist/features/content/infrastructure/prisma-content.repository.js"),
      import("../dist/features/content/infrastructure/prisma-content-publishing.repository.js"),
      import("../dist/features/content/application/publishing-application.js"),
      import("../dist/features/content/application/publishing-channel.port.js"),
      import("../dist/features/content/domain/content.js"),
      import("./support/cleanup-database.mjs"),
    ]);

    const app = await NestFactory.createApplicationContext(AppModule, {
      logger: false,
    });
    const prisma = app.get(PrismaService);
    try {
      await prisma.$connect();
      await cleanupDatabase(prisma, TABLES);
      await prisma.user.createMany({
        data: [
          {
            id: owner,
            accountIdentifier: `${owner}@test.invalid`,
            verifiedAt: now,
          },
        ],
      });
      await prisma.organization.createMany({
        data: [
          { id: org, name: "Publishing Org" },
          { id: otherOrg, name: "Other Publishing Org" },
        ],
      });
      await prisma.membership.createMany({
        data: [
          {
            organizationId: org,
            userId: owner,
            role: "OWNER",
            status: "ACTIVE",
          },
        ],
      });

      const buildApplication = () =>
        new ContentPublishingApplication(
          new PrismaContentPublishingRepository(prisma),
          new PrismaContentRepository(prisma),
          {
            async findMembership(organizationId, userId) {
              return prisma.membership.findUnique({
                where: {
                  organizationId_userId: { organizationId, userId },
                },
                select: { organizationId: true, role: true, status: true },
              });
            },
          },
          new InMemoryRecordingPublishingAdapter(),
        );

      async function seedScheduledItem(organizationId, channel = "INSTAGRAM") {
        const itemId = randomUUID();
        const item = createContentItem({
          id: itemId,
          organizationId,
          title: "محتوى مجدول للنشر",
          body: "نص تجريبي آمن",
          channel,
          createdBy: owner,
          createdAt: now,
        });
        let current = item;
        for (const step of ["DRAFT", "REVIEW", "APPROVED"]) {
          current = transitionContentItem(current, {
            toStatus: step,
            actorId: owner,
            at: now,
          }).item;
        }
        const { item: scheduled } = transitionContentItem(current, {
          toStatus: "SCHEDULED",
          actorId: owner,
          at: now,
          scheduledFor,
        });
        await prisma.contentItem.create({
          data: {
            id: scheduled.id,
            organizationId: scheduled.organizationId,
            title: scheduled.title,
            body: scheduled.body,
            channel: scheduled.channel,
            status: "SCHEDULED",
            scheduledFor: scheduled.scheduledFor,
            approvedVersion: scheduled.approvedVersion,
            contentHash: scheduled.contentHash,
            createdBy: scheduled.createdBy,
            createdAt: scheduled.createdAt,
            updatedAt: scheduled.updatedAt,
          },
        });
        return scheduled;
      }

      const application = buildApplication();
      const item = await seedScheduledItem(org);
      const foreignItem = await seedScheduledItem(otherOrg, "X");
      await application.scheduleOccurrence({ item: foreignItem, at: now });

      // Schedule the occurrence twice: the replay resolves to a typed
      // duplicate and only one row exists.
      const inserted = await application.scheduleOccurrence({
        item,
        at: now,
      });
      assert.equal(inserted.kind, "inserted");
      const replayed = await application.scheduleOccurrence({
        item,
        at: now,
      });
      assert.equal(replayed.kind, "duplicate-occurrence");
      assert.equal(replayed.executionKey, inserted.executionKey);
      assert.equal(
        await prisma.contentPublishJob.count({
          where: { organizationId: org, contentItemId: item.id },
        }),
        1,
      );

      // Cancel-before-delivery check on a SECOND item, then the main flow.
      const cancelItem = await seedScheduledItem(org, "FACEBOOK");
      await application.scheduleOccurrence({ item: cancelItem, at: now });
      const cancelled = await application.cancelScheduledPublishing({
        actor: { verified: true },
        userId: owner,
        organizationId: org,
        contentItemId: cancelItem.id,
        reason: "إلغاء قبل موعد النشر",
        at: new Date("2026-10-01T11:00:00.000Z"),
      });
      assert.equal(cancelled.kind, "cancelled");
      assert.equal(cancelled.job.status, "CANCELLED");
      assert.equal(cancelled.transition.toStatus, "FAILED");
      assert.equal(cancelled.transition.failureKind, "SCHEDULE_MISSED");
      const cancelRow = await prisma.contentItem.findUnique({
        where: {
          organizationId_id: { organizationId: org, id: cancelItem.id },
        },
      });
      assert.equal(cancelRow.status, "FAILED");
      // The transition is append-only and audited.
      const cancelTransitions = await prisma.contentTransition.findMany({
        where: { organizationId: org, contentItemId: cancelItem.id },
      });
      assert.equal(cancelTransitions.length, 1);
      assert.equal(cancelTransitions[0].actorId, owner);

      // The delivery tick at the scheduled time delivers both open
      // occurrences exactly once (tenant isolation: org A and org B rows are
      // both claimed cross-tenant by design, but never cross-delivered).
      const firstTick = await application.runDueDeliveries({
        now: scheduledFor,
        limit: 10,
      });
      assert.equal(firstTick.claimed, 2);
      assert.equal(firstTick.delivered, 2);
      assert.equal(firstTick.retried, 0);

      const deliveredCount = async (organizationId, contentItemId) =>
        prisma.contentDelivery.count({
          where: { organizationId, contentItemId },
        });
      assert.equal(await deliveredCount(org, item.id), 1);
      assert.equal(await deliveredCount(otherOrg, foreignItem.id), 1);
      assert.equal(await deliveredCount(org, cancelItem.id), 0);

      // Both items are PUBLISHED with exactly one audited transition each.
      for (const [organizationId, contentItemId] of [
        [org, item.id],
        [otherOrg, foreignItem.id],
      ]) {
        const row = await prisma.contentItem.findUnique({
          where: {
            organizationId_id: { organizationId, id: contentItemId },
          },
        });
        assert.equal(row.status, "PUBLISHED");
        const transitions = await prisma.contentTransition.findMany({
          where: { organizationId, contentItemId },
        });
        assert.equal(transitions.length, 1);
        assert.equal(transitions[0].toStatus, "PUBLISHED");
        assert.equal(transitions[0].fromStatus, "SCHEDULED");
      }

      // The delivered payload snapshot is the audited exact bundle.
      const delivery = await prisma.contentDelivery.findFirst({
        where: { organizationId: org, contentItemId: item.id },
      });
      assert.ok(delivery);
      assert.match(delivery.providerMessageId, /^fake-publish:INSTAGRAM:/);
      assert.equal(delivery.payload.title, item.title);
      assert.equal(delivery.payload.body, item.body);
      assert.equal(delivery.payload.approvedVersion, 1);
      assert.equal(delivery.payload.contentHash, item.contentHash);
      assert.equal(delivery.payload.deliveredAt, scheduledFor.toISOString());
      assert.ok(delivery.payload.linkPath.includes("utm_source=estateflow"));
      assert.equal(delivery.payload.utm.medium, "instagram");

      // REPLAY: worker restart (a whole new application/context) re-runs the
      // tick over the same data — still exactly one delivery, no new rows.
      const restarted = buildApplication();
      for (let i = 0; i < 2; i++) {
        const replayTick = await restarted.runDueDeliveries({
          now: new Date("2026-10-02T12:00:00.000Z"),
          limit: 10,
        });
        assert.equal(replayTick.claimed, 0);
        assert.equal(replayTick.delivered, 0);
      }
      assert.equal(await deliveredCount(org, item.id), 1);
      assert.equal(await deliveredCount(otherOrg, foreignItem.id), 1);
      assert.equal(
        await prisma.contentTransition.count({
          where: { organizationId: org, contentItemId: item.id },
        }),
        1,
      );

      // Published content is immutable (EF-402 trigger): any update is
      // rejected by the database.
      await assert.rejects(
        prisma.$executeRaw`UPDATE "ContentItem" SET "title" = 'تلاعب' WHERE "organizationId" = ${org}::uuid AND "id" = ${item.id}::uuid`,
        /published content is immutable/,
      );
      await assert.rejects(
        prisma.$executeRaw`UPDATE "ContentDelivery" SET "payload" = '{}'::jsonb WHERE "organizationId" = ${org}::uuid`,
        /delivered payload snapshots are append-only/,
      );
      await assert.rejects(
        prisma.$executeRaw`UPDATE "ContentPublishJob" SET "status" = 'QUEUED' WHERE "organizationId" = ${org}::uuid`,
        /publish job is terminal/,
      );

      // Failure + retry on a dedicated item with a rejecting adapter.
      let calls = 0;
      const rejecting = new ContentPublishingApplication(
        new PrismaContentPublishingRepository(prisma),
        new PrismaContentRepository(prisma),
        {
          async findMembership(organizationId, userId) {
            return prisma.membership.findUnique({
              where: {
                organizationId_userId: { organizationId, userId },
              },
              select: { organizationId: true, role: true, status: true },
            });
          },
        },
        {
          async deliver() {
            calls++;
            if (calls === 1)
              return {
                kind: "rejected",
                failureKind: "CHANNEL_TIMEOUT",
                reason: "المحاولة الأولى تجاوزت المهلة",
              };
            return {
              kind: "rejected",
              failureKind: "CHANNEL_REJECTED",
              reason: "سياسة القناة ترفض المحتوى",
            };
          },
        },
      );
      const failingItem = await seedScheduledItem(org, "TIKTOK");
      await rejecting.scheduleOccurrence({ item: failingItem, at: now });

      const retryTick = await rejecting.runDueDeliveries({
        now: scheduledFor,
        limit: 10,
      });
      assert.equal(retryTick.retried, 1);
      const failedRow = await prisma.contentItem.findUnique({
        where: {
          organizationId_id: { organizationId: org, id: failingItem.id },
        },
      });
      assert.equal(failedRow.status, "SCHEDULED");
      const retryingJob = await prisma.contentPublishJob.findFirst({
        where: { organizationId: org, contentItemId: failingItem.id },
      });
      assert.equal(retryingJob.status, "RETRYING");
      assert.equal(retryingJob.lastErrorKind, "CHANNEL_TIMEOUT");
      assert.equal(
        retryingJob.lastErrorMessage,
        "المحاولة الأولى تجاوزت المهلة",
      );
      assert.equal(
        retryingJob.nextAttemptAt.getTime(),
        scheduledFor.getTime() + 30_000,
      );

      // Before the backoff elapses: no claim.
      const earlyTick = await rejecting.runDueDeliveries({
        now: new Date(scheduledFor.getTime() + 10_000),
        limit: 10,
      });
      assert.equal(earlyTick.claimed, 0);

      // After the backoff: the permanent rejection lands the job in FAILED
      // and the item in FAILED with the typed audited reason.
      const terminalTick = await rejecting.runDueDeliveries({
        now: new Date(scheduledFor.getTime() + 60_000),
        limit: 10,
      });
      assert.equal(terminalTick.failed, 1);
      const failedAfter = await prisma.contentItem.findUnique({
        where: {
          organizationId_id: { organizationId: org, id: failingItem.id },
        },
      });
      assert.equal(failedAfter.status, "FAILED");
      const failTransition = await prisma.contentTransition.findFirst({
        where: {
          organizationId: org,
          contentItemId: failingItem.id,
          toStatus: "FAILED",
        },
      });
      assert.ok(failTransition);
      assert.equal(failTransition.failureKind, "CHANNEL_REJECTED");
      assert.equal(failTransition.reason, "سياسة القناة ترفض المحتوى");
      assert.equal(
        failTransition.actorId,
        "00000000-0000-4000-8000-00000000ef04",
      );
      const results = await application.listPublishResults({
        actor: { verified: true },
        userId: owner,
        organizationId: org,
      });
      const deliveredResult = results.find(
        (entry) => entry.contentItemId === item.id,
      );
      assert.equal(deliveredResult.outcome, "DELIVERED");
      const failedResult = results.find(
        (entry) => entry.contentItemId === failingItem.id,
      );
      assert.equal(failedResult.outcome, "FAILED");
      assert.equal(failedResult.failureKind, "CHANNEL_REJECTED");
      const cancelledResult = results.find(
        (entry) => entry.contentItemId === cancelItem.id,
      );
      assert.equal(cancelledResult.outcome, "CANCELLED");
      const upcoming = await application.listUpcomingDeliveries({
        actor: { verified: true },
        userId: owner,
        organizationId: org,
      });
      assert.equal(
        upcoming.some((entry) => entry.contentItemId === item.id),
        false,
      );

      await cleanupDatabase(prisma, TABLES);
      await assertTablesAreEmpty(prisma, TABLES);
    } finally {
      await app.close();
    }
  },
);
