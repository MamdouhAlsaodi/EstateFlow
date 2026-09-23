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
const propertyId = "3f9d5f6e-6b1d-4c4e-9a9a-0f3e2d1c0b9a";
const generatedId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const revisionId = "77777777-7777-4777-8777-777777777777";
const now = new Date("2026-09-27T10:00:00.000Z");

test(
  "EF-403 generation persistence: provenance stamp, atomic IDEA→DRAFT transition, all-or-nothing CHECK, immutable stamp trigger, tenant-bound FK, revision inheritance",
  { skip: !guardedTarget() },
  async () => {
    const [
      { NestFactory },
      { AppModule },
      { PrismaService },
      { PrismaContentRepository },
      { PrismaPropertyProjectionReader },
      { GenerationApplication },
      { cleanupDatabase, assertTablesAreEmpty },
    ] = await Promise.all([
      import("@nestjs/core"),
      import("../dist/app.module.js"),
      import("../dist/database/prisma.service.js"),
      import("../dist/features/content/infrastructure/prisma-content.repository.js"),
      import("../dist/features/content/infrastructure/prisma-property-projection.reader.js"),
      import("../dist/features/content/application/generation-application.js"),
      import("./support/cleanup-database.mjs"),
    ]);
    const app = await NestFactory.create(AppModule, { logger: false });
    const prisma = app.get(PrismaService);
    try {
      await prisma.$connect();
      await cleanupDatabase(prisma, TABLES);
      await prisma.user.create({
        data: {
          id: owner,
          accountIdentifier: `${owner}@test.invalid`,
          verifiedAt: now,
        },
      });
      await prisma.organization.createMany({
        data: [
          { id: org, name: "Generation Repo" },
          { id: otherOrg, name: "Other Generation Repo" },
        ],
      });
      await prisma.membership.create({
        data: {
          organizationId: org,
          userId: owner,
          role: "OWNER",
          status: "ACTIVE",
        },
      });
      await prisma.property.create({
        data: {
          id: propertyId,
          organizationId: org,
          title: "شقة حي الملقا",
          propertyType: "شقة",
          addressText: "حي الملقا، الرياض",
          ownerReference: "المالك صالح — 0555 123 456",
          status: "ACTIVE",
          version: 1,
          createdAt: now,
          updatedAt: now,
        },
      });

      const repository = new PrismaContentRepository(prisma);
      const projectionReader = new PrismaPropertyProjectionReader(prisma);
      const application = new GenerationApplication(
        repository,
        {
          async findMembership(organizationId, userId) {
            return prisma.membership.findUnique({
              where: { organizationId_userId: { organizationId, userId } },
              select: { organizationId: true, role: true, status: true },
            });
          },
        },
        projectionReader,
      );

      // ---- The projection reader itself never fetches owner PII. ----
      const outcome = await projectionReader.findContentProjection(
        org,
        propertyId,
      );
      assert.equal(outcome.kind, "found");
      assert.equal(outcome.projection.version, 1);
      const serializedProjection = JSON.stringify(outcome);
      assert.ok(!serializedProjection.includes("صالح"));
      assert.ok(!serializedProjection.includes("0555"));
      assert.ok(!serializedProjection.includes("ownerReference"));

      // ---- Guarded generation persists item + transition atomically. ----
      const result = await application.generateContentDraft({
        actor: { verified: true },
        userId: owner,
        organizationId: org,
        contentItemId: generatedId,
        propertyId,
        channel: "INSTAGRAM",
        createdAt: now,
      });
      assert.equal(result.kind, "generated");
      const row = await prisma.contentItem.findUnique({
        where: { id: generatedId },
      });
      assert.equal(row.status, "DRAFT");
      assert.equal(row.sourcePropertyId, propertyId);
      assert.equal(row.sourcePropertyVersion, 1);
      assert.equal(row.generatedTemplateId, "PROPERTY_LISTING_INSTAGRAM_V1");
      assert.equal(row.generatedTemplateVersion, 1);
      const transitions = await prisma.contentTransition.findMany({
        where: { contentItemId: generatedId },
      });
      assert.equal(transitions.length, 1);
      assert.equal(transitions[0].fromStatus, "IDEA");
      assert.equal(transitions[0].toStatus, "DRAFT");

      // ---- Provenance is all-or-nothing at the database level. ----
      await assert.rejects(
        () =>
          prisma.contentItem.create({
            data: {
              id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
              organizationId: org,
              title: "جزئي",
              body: "بصمة ناقصة",
              channel: "X",
              status: "IDEA",
              sourcePropertyId: propertyId,
              createdBy: owner,
              createdAt: now,
              updatedAt: now,
            },
          }),
        (error) =>
          String(error.message).includes("generation_provenance_complete"),
      );

      // ---- The stamp is identity-immutable under the EF-402 trigger. ----
      await assert.rejects(
        () =>
          prisma.contentItem.update({
            where: { id: generatedId },
            data: { generatedTemplateVersion: 2 },
          }),
        (error) =>
          String(error.message).includes("content identity is immutable"),
      );
      await assert.rejects(
        () =>
          prisma.contentItem.update({
            where: { id: generatedId },
            data: { sourcePropertyVersion: 2 },
          }),
        (error) =>
          String(error.message).includes("content identity is immutable"),
      );

      // ---- The stamp is tenant-bound: a cross-tenant property id cannot exist. ----
      await prisma.property.create({
        data: {
          id: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
          organizationId: otherOrg,
          title: "عقار مؤسسة أخرى",
          propertyType: "أرض",
          addressText: "جدة",
          status: "ACTIVE",
          version: 1,
          createdAt: now,
          updatedAt: now,
        },
      });
      await assert.rejects(
        () =>
          prisma.contentItem.create({
            data: {
              id: "99999999-9999-4999-8999-999999999999",
              organizationId: org,
              title: "بصمة مزورة",
              body: "عبر حدود المؤسسة",
              channel: "X",
              status: "IDEA",
              sourcePropertyId: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
              sourcePropertyVersion: 1,
              generatedTemplateId: "PROPERTY_LISTING_X_V1",
              generatedTemplateVersion: 1,
              createdBy: owner,
              createdAt: now,
              updatedAt: now,
            },
          }),
        (error) => String(error.message).includes("Foreign key constraint"),
      );

      // ---- Generation from another tenant's property is opaque 404. ----
      const foreign = await application.generateContentDraft({
        actor: { verified: true },
        userId: owner,
        organizationId: otherOrg,
        contentItemId: "88888888-8888-4888-8888-888888888888",
        propertyId,
        channel: "X",
        createdAt: now,
      });
      assert.equal(foreign.kind, "access-denied");

      // ---- A revision inherits the stamp unchanged, through the workflow. ----
      const submit = await repository.recordContentTransition({
        item: { ...result.item },
        transition: {
          id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa01",
          organizationId: org,
          contentItemId: generatedId,
          fromStatus: "DRAFT",
          toStatus: "REVIEW",
          actorId: owner,
          createdAt: now,
        },
      });
      assert.equal(submit.toStatus, "REVIEW");
      const approval = await repository.recordContentTransition({
        item: { ...result.item, status: "REVIEW" },
        transition: {
          id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa02",
          organizationId: org,
          contentItemId: generatedId,
          fromStatus: "REVIEW",
          toStatus: "APPROVED",
          version: 1,
          contentHash: "b".repeat(64),
          actorId: owner,
          createdAt: now,
        },
      });
      assert.equal(approval.toStatus, "APPROVED");
      const revision = await repository.recordContentRevision({
        revision: {
          id: revisionId,
          organizationId: org,
          rootContentId: generatedId,
          variantOfId: generatedId,
          variantNumber: 2,
          title: result.item.title,
          body: result.item.body,
          channel: result.item.channel,
          sourcePropertyId: propertyId,
          sourcePropertyVersion: 1,
          generatedTemplateId: "PROPERTY_LISTING_INSTAGRAM_V1",
          generatedTemplateVersion: 1,
          createdBy: owner,
          createdAt: now,
        },
        source: { ...result.item, status: "APPROVED" },
      });
      assert.equal(revision.status, "DRAFT");
      assert.equal(revision.sourcePropertyId, propertyId);
      assert.equal(revision.sourcePropertyVersion, 1);
      assert.equal(
        revision.generatedTemplateId,
        "PROPERTY_LISTING_INSTAGRAM_V1",
      );
      assert.equal(revision.generatedTemplateVersion, 1);
      // Lineage listing carries the stamp too.
      const lineage = await repository.listLineage(org, {
        ...result.item,
        status: "APPROVED",
      });
      assert.equal(lineage.length, 2);
      for (const member of lineage) {
        assert.equal(member.sourcePropertyId, propertyId);
        assert.equal(
          member.generatedTemplateId,
          "PROPERTY_LISTING_INSTAGRAM_V1",
        );
      }

      await cleanupDatabase(prisma, TABLES);
      await assertTablesAreEmpty(prisma, TABLES);
    } finally {
      await app.close();
    }
  },
);
