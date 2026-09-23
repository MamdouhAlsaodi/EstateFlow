import assert from "node:assert/strict";
import process from "node:process";
import { URL } from "node:url";
import test from "node:test";

const ORIGIN = "https://app.estateflow.test";
const HASH_KEY = "a".repeat(32);
const AUDIT_KEY = "b".repeat(32);
const TABLES = [
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
const campaign = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const itemA = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const itemB = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const itemC = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
const revision = "77777777-7777-4777-8777-777777777777";
const now = new Date("2026-10-01T10:00:00.000Z");

test(
  "EF-402 content persistence: version/hash lock, published immutability trigger, revision variants, queue/calendar, tenant isolation",
  { skip: !guardedTarget() },
  async () => {
    const [
      { NestFactory },
      { AppModule },
      { PrismaService },
      { PrismaContentRepository },
      { ContentApplication },
      { contentHashOf },
      { cleanupDatabase, assertTablesAreEmpty },
    ] = await Promise.all([
      import("@nestjs/core"),
      import("../dist/app.module.js"),
      import("../dist/database/prisma.service.js"),
      import("../dist/features/content/infrastructure/prisma-content.repository.js"),
      import("../dist/features/content/application/content-application.js"),
      import("../dist/features/content/domain/content.js"),
      import("./support/cleanup-database.mjs"),
    ]);
    const app = await NestFactory.create(AppModule, { logger: false });
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
          { id: org, name: "Content Repo" },
          { id: otherOrg, name: "Other Content Repo" },
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
          {
            organizationId: otherOrg,
            userId: owner,
            role: "OWNER",
            status: "ACTIVE",
          },
        ],
      });
      await prisma.campaign.create({
        data: {
          id: campaign,
          organizationId: org,
          name: "حملة المحتوى",
          objective: "عملاء مؤهلون",
          channel: "META",
          status: "ACTIVE",
          startsAt: now,
          endsAt: new Date(now.getTime() + 30 * 86_400_000),
          budgetPlannedMinor: 1000000n,
          currency: "SAR",
          createdBy: owner,
          createdAt: now,
          updatedAt: now,
        },
      });

      const repository = new PrismaContentRepository(prisma);
      const application = new ContentApplication(repository, {
        async findMembership(organizationId, userId) {
          const row = await prisma.membership.findUnique({
            where: { organizationId_userId: { organizationId, userId } },
            select: { organizationId: true, role: true, status: true },
          });
          return row;
        },
      });

      // ---- Lifecycle to APPROVED locks version 1 + persisted hash. ----
      const created = await application.createContentItem({
        actor: { verified: true },
        userId: owner,
        organizationId: org,
        contentItemId: itemA,
        title: "شقة الرياض",
        body: "شقة غرفتين للإيجار.",
        channel: "INSTAGRAM",
        campaignId: campaign,
        createdAt: now,
      });
      assert.equal(created.kind, "created");
      await application.transitionContentItem({
        actor: { verified: true },
        userId: owner,
        organizationId: org,
        contentItemId: itemA,
        toStatus: "DRAFT",
        at: new Date(now.getTime() + 60_000),
      });
      await application.transitionContentItem({
        actor: { verified: true },
        userId: owner,
        organizationId: org,
        contentItemId: itemA,
        toStatus: "REVIEW",
        at: new Date(now.getTime() + 120_000),
      });
      const approved = await application.transitionContentItem({
        actor: { verified: true },
        userId: owner,
        organizationId: org,
        contentItemId: itemA,
        toStatus: "APPROVED",
        at: new Date(now.getTime() + 180_000),
      });
      assert.equal(approved.kind, "transitioned");
      const persisted = await repository.findContentItem(org, itemA);
      assert.equal(persisted.approvedVersion, 1);
      assert.equal(persisted.contentHash, contentHashOf(persisted));
      assert.equal(persisted.campaignId, campaign);

      // ---- Approval hash immutability: editing a locked item conflicts. ----
      const lockedEdit = await application.editContentItem({
        actor: { verified: true },
        userId: owner,
        organizationId: org,
        contentItemId: itemA,
        title: "محاولة تغيير المحتوى المعتمد",
        at: new Date(now.getTime() + 200_000),
      });
      assert.equal(lockedEdit.kind, "conflict");
      const afterLockedEdit = await repository.findContentItem(org, itemA);
      assert.equal(afterLockedEdit.title, "شقة الرياض");
      assert.equal(afterLockedEdit.contentHash, persisted.contentHash);
      // Raw SQL mutation of locked content is rejected by the trigger.
      await assert.rejects(() =>
        prisma.$executeRawUnsafe(
          `UPDATE "ContentItem" SET "title" = 'تغيير مباشر' WHERE "id" = '${itemA}'`,
        ),
      );
      // Version/hash bookkeeping cannot be forged directly.
      await assert.rejects(() =>
        prisma.$executeRawUnsafe(
          `UPDATE "ContentItem" SET "approvedVersion" = 7 WHERE "id" = '${itemA}'`,
        ),
      );
      await assert.rejects(() =>
        prisma.$executeRawUnsafe(
          `UPDATE "ContentItem" SET "contentHash" = repeat('0', 64) WHERE "id" = '${itemA}'`,
        ),
      );

      // ---- Illegal status pairs are rejected at the database level. ----
      await assert.rejects(() =>
        prisma.$executeRawUnsafe(
          `UPDATE "ContentItem" SET "status" = 'PUBLISHED' WHERE "id" = '${itemA}'`,
        ),
      );

      // ---- Schedule → publish; published rows are fully immutable. ----
      const scheduledFor = new Date(now.getTime() + 7 * 86_400_000);
      const scheduled = await application.transitionContentItem({
        actor: { verified: true },
        userId: owner,
        organizationId: org,
        contentItemId: itemA,
        toStatus: "SCHEDULED",
        scheduledFor,
        at: new Date(now.getTime() + 240_000),
      });
      assert.equal(scheduled.kind, "transitioned");
      const published = await application.transitionContentItem({
        actor: { verified: true },
        userId: owner,
        organizationId: org,
        contentItemId: itemA,
        toStatus: "PUBLISHED",
        at: new Date(now.getTime() + 7 * 86_400_000),
      });
      assert.equal(published.kind, "transitioned");
      await assert.rejects(() =>
        prisma.$executeRawUnsafe(
          `UPDATE "ContentItem" SET "updatedAt" = "updatedAt" + interval '1 second' WHERE "id" = '${itemA}'`,
        ),
      );
      await assert.rejects(() =>
        prisma.$executeRawUnsafe(
          `DELETE FROM "ContentItem" WHERE "id" = '${itemA}'`,
        ),
      );
      // Transitions are append-only.
      await assert.rejects(() =>
        prisma.$executeRawUnsafe(
          `UPDATE "ContentTransition" SET "reason" = 'tampered' WHERE "contentItemId" = '${itemA}'`,
        ),
      );
      await assert.rejects(() =>
        prisma.$executeRawUnsafe(
          `DELETE FROM "ContentTransition" WHERE "contentItemId" = '${itemA}'`,
        ),
      );

      // ---- Failed publish records a typed reason; revision carries the flow. ----
      const createdB = await application.createContentItem({
        actor: { verified: true },
        userId: owner,
        organizationId: org,
        contentItemId: itemB,
        title: "فيلا جدة",
        body: "فيلا للتصميم.",
        channel: "X",
        createdAt: now,
      });
      assert.equal(createdB.kind, "created");
      for (const [toStatus, extra, at] of [
        ["DRAFT", {}, 60_000],
        ["REVIEW", {}, 120_000],
        ["APPROVED", {}, 180_000],
        [
          "SCHEDULED",
          { scheduledFor: new Date(now.getTime() + 3 * 86_400_000) },
          240_000,
        ],
      ]) {
        const step = await application.transitionContentItem({
          actor: { verified: true },
          userId: owner,
          organizationId: org,
          contentItemId: itemB,
          toStatus,
          ...extra,
          at: new Date(now.getTime() + at),
        });
        assert.equal(step.kind, "transitioned", toStatus);
      }
      const failed = await application.transitionContentItem({
        actor: { verified: true },
        userId: owner,
        organizationId: org,
        contentItemId: itemB,
        toStatus: "FAILED",
        failureKind: "CHANNEL_TIMEOUT",
        reason: "انتهت مهلة النشر",
        at: new Date(now.getTime() + 3 * 86_400_000 + 1000),
      });
      assert.equal(failed.kind, "transitioned");
      const failureRow = await prisma.contentTransition.findFirst({
        where: {
          organizationId: org,
          contentItemId: itemB,
          toStatus: "FAILED",
        },
      });
      assert.equal(failureRow.failureKind, "CHANNEL_TIMEOUT");
      assert.equal(failureRow.reason, "انتهت مهلة النشر");
      // The typed reason is database-enforced too.
      await assert.rejects(() =>
        prisma.$executeRawUnsafe(
          `INSERT INTO "ContentTransition" ("id", "organizationId", "contentItemId", "fromStatus", "toStatus", "actorId", "createdAt")
           VALUES (gen_random_uuid(), '${org}', '${itemB}', 'SCHEDULED', 'FAILED', '${owner}', now())`,
        ),
      );
      // FAILED → REVIEW → APPROVED locks version 2 (new hash after an edit via a
      // revision is impossible on the same row; re-approval bumps the version).
      await application.transitionContentItem({
        actor: { verified: true },
        userId: owner,
        organizationId: org,
        contentItemId: itemB,
        toStatus: "REVIEW",
        at: new Date(now.getTime() + 4 * 86_400_000),
      });
      const approvedAgain = await application.transitionContentItem({
        actor: { verified: true },
        userId: owner,
        organizationId: org,
        contentItemId: itemB,
        toStatus: "APPROVED",
        at: new Date(now.getTime() + 5 * 86_400_000),
      });
      assert.equal(approvedAgain.kind, "transitioned");
      const itemBRow = await repository.findContentItem(org, itemB);
      assert.equal(itemBRow.approvedVersion, 2);
      assert.equal(itemBRow.contentHash, contentHashOf(itemBRow));

      // ---- Revision variants: new row, same lineage, source untouched. ----
      const revised = await application.createRevision({
        actor: { verified: true },
        userId: owner,
        organizationId: org,
        contentItemId: itemB,
        revisionId: revision,
        createdAt: new Date(now.getTime() + 6 * 86_400_000),
      });
      assert.equal(revised.kind, "revised");
      assert.equal(revised.item.status, "DRAFT");
      assert.equal(revised.item.variantNumber, 2);
      assert.equal(revised.item.rootContentId, itemB);
      assert.equal(revised.item.title, itemBRow.title);
      const sourceAfterRevision = await repository.findContentItem(org, itemB);
      assert.equal(sourceAfterRevision.approvedVersion, 2);
      const lineage = await repository.listLineage(org, itemBRow);
      assert.equal(lineage.length, 2);
      assert.deepEqual(
        lineage.map((item) => item.variantNumber),
        [1, 2],
      );

      // ---- Review queue: REVIEW items, oldest first. ----
      await application.createContentItem({
        actor: { verified: true },
        userId: owner,
        organizationId: org,
        contentItemId: itemC,
        title: "أرض abstraction",
        body: "إعلان أرض.",
        channel: "LINKEDIN",
        createdAt: now,
      });
      // itemC → REVIEW submitted later than the revision of itemB.
      await application.transitionContentItem({
        actor: { verified: true },
        userId: owner,
        organizationId: org,
        contentItemId: itemC,
        toStatus: "DRAFT",
        at: new Date(now.getTime() + 7 * 86_400_000 + 60_000),
      });
      await application.transitionContentItem({
        actor: { verified: true },
        userId: owner,
        organizationId: org,
        contentItemId: revision,
        toStatus: "REVIEW",
        at: new Date(now.getTime() + 7 * 86_400_000 + 120_000),
      });
      await application.transitionContentItem({
        actor: { verified: true },
        userId: owner,
        organizationId: org,
        contentItemId: itemC,
        toStatus: "REVIEW",
        at: new Date(now.getTime() + 7 * 86_400_000 + 240_000),
      });
      const queue = await repository.listReviewQueue(org, 100);
      assert.deepEqual(
        queue.map((entry) => entry.id),
        [revision, itemC],
      );

      // ---- Calendar: scheduled/published items within the requested window. ----
      const from = new Date(now.getTime() + 6 * 86_400_000);
      const to = new Date(now.getTime() + 8 * 86_400_000);
      const calendar = await repository.listCalendar({
        organizationId: org,
        from,
        to,
      });
      // itemB's scheduledFor is absent (failed), itemA published at +7d.
      assert.deepEqual(
        calendar.map((entry) => entry.id),
        [itemA],
      );

      // ---- Tenant isolation: foreign org sees nothing. ----
      assert.equal(await repository.findContentItem(otherOrg, itemA), null);
      assert.equal(
        (
          await repository.listContentItems({
            organizationId: otherOrg,
            limit: 10,
          })
        ).length,
        0,
      );
      assert.equal((await repository.listReviewQueue(otherOrg, 100)).length, 0);
      assert.equal(
        (await repository.listCalendar({ organizationId: otherOrg, from, to }))
          .length,
        0,
      );
      // Cross-tenant campaign link violates the composite tenant FK.
      await assert.rejects(() =>
        prisma.contentItem.create({
          data: {
            id: "88888888-8888-4888-8888-888888888888",
            organizationId: otherOrg,
            campaignId: campaign,
            title: "حقل عبر المستأجرين",
            body: "يجب أن يُرفض.",
            channel: "OTHER",
            createdBy: owner,
            createdAt: now,
            updatedAt: now,
          },
        }),
      );

      // IDEA/DRAFT rows may still be deleted (cleanup path).
      const ideaItem = "99999999-9999-4999-8999-999999999999";
      await application.createContentItem({
        actor: { verified: true },
        userId: owner,
        organizationId: org,
        contentItemId: ideaItem,
        title: "فكرة",
        body: "فكرة إعلان.",
        channel: "EMAIL",
        createdAt: now,
      });
      await prisma.$executeRawUnsafe(
        `DELETE FROM "ContentItem" WHERE "id" = '${ideaItem}'`,
      );

      await cleanupDatabase(prisma, TABLES);
      await assertTablesAreEmpty(prisma, TABLES);
    } finally {
      await app.close();
    }
  },
);
