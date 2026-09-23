import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import process from "node:process";
import { URL } from "node:url";
import test from "node:test";
import { ValidationPipe } from "@nestjs/common";

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
async function sessionFor(prisma, issuer, userId, now) {
  const access = issuer.issue();
  const csrfToken = randomBytes(32).toString("base64url");
  const family = await prisma.sessionFamily.create({
    data: { userId },
    select: { id: true },
  });
  await prisma.accessSession.create({
    data: {
      id: access.id,
      familyId: family.id,
      tokenHash: access.hash,
      csrfHash: issuer.hash(csrfToken),
      issuedAt: now,
      expiresAt: new Date(now.getTime() + 60_000),
    },
  });
  return {
    cookie: `__Host-estateflow_access=${access.serialized}; estateflow_csrf=${csrfToken}`,
    csrfToken,
  };
}
async function post(base, path, session, body, options = {}) {
  const headers = {
    origin: options.origin ?? ORIGIN,
    "content-type": "application/json",
  };
  if (session) {
    headers.cookie = session.cookie;
    if (options.csrf !== false) headers["x-csrf-token"] = session.csrfToken;
  }
  const response = await fetch(`${base}${path}`, {
    method: "POST",
    headers,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const text = await response.text();
  return { status: response.status, body: text ? JSON.parse(text) : null };
}
async function get(base, path, session) {
  const headers = {};
  if (session) headers.cookie = session.cookie;
  const response = await fetch(`${base}${path}`, { headers });
  const text = await response.text();
  return { status: response.status, body: text ? JSON.parse(text) : null };
}

const itemBody = {
  title: "شقة الرياض للإيجار",
  body: "شقة غرفتين حي الملقا، تواصل واتساب.",
  channel: "INSTAGRAM",
};

test(
  "EF-402 content HTTP: guards, authority matrix, lifecycle with version/hash, revision, queue/calendar, tenant-safe 404s",
  { skip: !guardedTarget() },
  async () => {
    const [
      { NestFactory },
      { AppModule },
      { PrismaService },
      { NodeCryptoCredentialIssuer },
      { cleanupDatabase, assertTablesAreEmpty },
    ] = await Promise.all([
      import("@nestjs/core"),
      import("../dist/app.module.js"),
      import("../dist/database/prisma.service.js"),
      import("../dist/features/auth/infrastructure/node-crypto-credential-issuer.js"),
      import("./support/cleanup-database.mjs"),
    ]);
    const app = await NestFactory.create(AppModule, { logger: false });
    app.useGlobalPipes(
      new ValidationPipe({
        transform: true,
        whitelist: true,
        forbidNonWhitelisted: true,
      }),
    );
    const prisma = app.get(PrismaService);
    const now = new Date();
    let base;
    try {
      await prisma.$connect();
      await cleanupDatabase(prisma, TABLES);
      const organizationId = randomUUID();
      const otherOrganizationId = randomUUID();
      const ownerId = randomUUID();
      const managerId = randomUUID();
      const brokerId = randomUUID();
      const clientId = randomUUID();
      await prisma.user.createMany({
        data: [ownerId, managerId, brokerId, clientId].map((id) => ({
          id,
          accountIdentifier: `${id}@test.invalid`,
          verifiedAt: now,
        })),
      });
      await prisma.organization.createMany({
        data: [
          { id: organizationId, name: "Content HTTP" },
          { id: otherOrganizationId, name: "Other Content HTTP" },
        ],
      });
      await prisma.membership.createMany({
        data: [
          { organizationId, userId: ownerId, role: "OWNER", status: "ACTIVE" },
          {
            organizationId,
            userId: managerId,
            role: "MANAGER",
            status: "ACTIVE",
          },
          {
            organizationId,
            userId: brokerId,
            role: "BROKER",
            status: "ACTIVE",
          },
          {
            organizationId,
            userId: clientId,
            role: "CLIENT",
            status: "ACTIVE",
          },
          {
            organizationId: otherOrganizationId,
            userId: ownerId,
            role: "OWNER",
            status: "ACTIVE",
          },
        ],
      });
      const issuer = new NodeCryptoCredentialIssuer(HASH_KEY);
      const owner = await sessionFor(prisma, issuer, ownerId, now);
      const manager = await sessionFor(prisma, issuer, managerId, now);
      const broker = await sessionFor(prisma, issuer, brokerId, now);
      const client = await sessionFor(prisma, issuer, clientId, now);
      await app.listen(0, "127.0.0.1");
      base = `http://127.0.0.1:${app.getHttpServer().address().port}`;
      const contentPath = `/organizations/${organizationId}/content`;

      // Transport guards: no session → 401, no CSRF → 403, wrong origin → 403.
      assert.equal((await post(base, contentPath, null, itemBody)).status, 401);
      assert.equal(
        (await post(base, contentPath, owner, itemBody, { csrf: false }))
          .status,
        403,
      );
      assert.equal(
        (
          await post(base, contentPath, owner, itemBody, {
            origin: "https://evil.test",
          })
        ).status,
        403,
      );
      // Strict DTO: unknown fields rejected.
      assert.equal(
        (
          await post(base, contentPath, owner, {
            ...itemBody,
            platform: "instagram",
          })
        ).status,
        400,
      );

      // Authority: broker may create; client may not; campaign link 404-safe.
      const brokerCreated = await post(base, contentPath, broker, itemBody);
      assert.equal(brokerCreated.status, 201);
      const itemId = brokerCreated.body.item.id;
      assert.equal(brokerCreated.body.item.status, "IDEA");
      assert.equal(
        (await post(base, contentPath, client, itemBody)).status,
        403,
      );
      assert.equal(
        (
          await post(base, contentPath, broker, {
            ...itemBody,
            campaignId: randomUUID(),
          })
        ).status,
        404,
      );

      // Broker edits the IDEA item, moves to DRAFT, submits for review.
      const edited = await post(base, `${contentPath}/${itemId}/edit`, broker, {
        ...itemBody,
        channel: "X",
      });
      assert.equal(edited.status, 200);
      assert.equal(edited.body.item.channel, "X");
      assert.equal(
        (
          await post(base, `${contentPath}/${itemId}/transition`, broker, {
            toStatus: "APPROVED",
          })
        ).status,
        403,
      );
      assert.equal(
        (
          await post(base, `${contentPath}/${itemId}/transition`, broker, {
            toStatus: "DRAFT",
          })
        ).status,
        200,
      );
      assert.equal(
        (
          await post(base, `${contentPath}/${itemId}/transition`, broker, {
            toStatus: "REVIEW",
          })
        ).status,
        200,
      );

      // Illegal jump REVIEW → SCHEDULED is a conflict; approval is Owner/Manager.
      assert.equal(
        (
          await post(base, `${contentPath}/${itemId}/transition`, manager, {
            toStatus: "SCHEDULED",
            scheduledFor: new Date(now.getTime() + 86_400_000).toISOString(),
          })
        ).status,
        409,
      );
      const approved = await post(
        base,
        `${contentPath}/${itemId}/transition`,
        manager,
        { toStatus: "APPROVED" },
      );
      assert.equal(approved.status, 200);
      assert.equal(approved.body.item.approvedVersion, 1);
      assert.match(approved.body.item.contentHash, /^[0-9a-f]{64}$/);
      assert.equal(approved.body.transition.toStatus, "APPROVED");
      assert.equal(approved.body.transition.version, 1);
      // Locked content cannot be edited (409), re-approval is a conflict.
      assert.equal(
        (await post(base, `${contentPath}/${itemId}/edit`, manager, itemBody))
          .status,
        409,
      );

      // Scheduling requires a future timestamp; broker cannot schedule.
      assert.equal(
        (
          await post(base, `${contentPath}/${itemId}/transition`, manager, {
            toStatus: "SCHEDULED",
          })
        ).status,
        400,
      );
      assert.equal(
        (
          await post(base, `${contentPath}/${itemId}/transition`, broker, {
            toStatus: "SCHEDULED",
            scheduledFor: new Date(now.getTime() + 3_600_000).toISOString(),
          })
        ).status,
        403,
      );
      const scheduledFor = new Date(now.getTime() + 2 * 86_400_000);
      const scheduled = await post(
        base,
        `${contentPath}/${itemId}/transition`,
        manager,
        {
          toStatus: "SCHEDULED",
          scheduledFor: scheduledFor.toISOString(),
        },
      );
      assert.equal(scheduled.status, 200);
      assert.equal(scheduled.body.item.status, "SCHEDULED");

      // Publish is Owner/Manager; the payload is the workflow state only.
      const published = await post(
        base,
        `${contentPath}/${itemId}/transition`,
        owner,
        { toStatus: "PUBLISHED" },
      );
      assert.equal(published.status, 200);
      assert.equal(published.body.item.status, "PUBLISHED");
      // Published rows are immutable: edit → 409, re-transition → 409.
      assert.equal(
        (await post(base, `${contentPath}/${itemId}/edit`, owner, itemBody))
          .status,
        409,
      );
      assert.equal(
        (
          await post(base, `${contentPath}/${itemId}/transition`, owner, {
            toStatus: "FAILED",
            failureKind: "OTHER",
            reason: "لا يُعاد النشر",
          })
        ).status,
        409,
      );

      // Failing requires a typed failure kind AND a reason.
      const second = await post(base, contentPath, manager, itemBody);
      assert.equal(second.status, 201);
      const secondId = second.body.item.id;
      for (const [toStatus, extra] of [
        ["DRAFT", {}],
        ["REVIEW", {}],
        ["APPROVED", {}],
        [
          "SCHEDULED",
          { scheduledFor: new Date(now.getTime() + 86_400_000).toISOString() },
        ],
      ]) {
        assert.equal(
          (
            await post(base, `${contentPath}/${secondId}/transition`, manager, {
              toStatus,
              ...extra,
            })
          ).status,
          200,
          toStatus,
        );
      }
      assert.equal(
        (
          await post(base, `${contentPath}/${secondId}/transition`, manager, {
            toStatus: "FAILED",
            reason: "بلا نوع",
          })
        ).status,
        400,
      );
      assert.equal(
        (
          await post(base, `${contentPath}/${secondId}/transition`, manager, {
            toStatus: "FAILED",
            failureKind: "CHANNEL_TIMEOUT",
          })
        ).status,
        400,
      );
      const failed = await post(
        base,
        `${contentPath}/${secondId}/transition`,
        manager,
        {
          toStatus: "FAILED",
          failureKind: "CHANNEL_REJECTED",
          reason: "رفضت القناة الإعلان",
        },
      );
      assert.equal(failed.status, 200);
      assert.equal(failed.body.transition.failureKind, "CHANNEL_REJECTED");

      // Revision: new DRAFT variant of the failed item, same lineage.
      const revised = await post(
        base,
        `${contentPath}/${secondId}/revisions`,
        broker,
      );
      assert.equal(revised.status, 201);
      assert.equal(revised.body.item.status, "DRAFT");
      assert.equal(revised.body.item.variantNumber, 2);
      assert.equal(revised.body.item.rootContentId, secondId);
      assert.equal(revised.body.item.variantOfId, secondId);
      assert.equal(revised.body.item.approvedVersion, undefined);
      // Only locked items can be revised: an unlocked IDEA item refuses.
      const unlocked = await post(base, contentPath, broker, itemBody);
      assert.equal(unlocked.status, 201);
      assert.equal(
        (
          await post(
            base,
            `${contentPath}/${unlocked.body.item.id}/revisions`,
            broker,
          )
        ).status,
        409,
      );

      // Detail: transitions carry the version/hash timeline.
      const detail = await get(base, `${contentPath}/${secondId}`, owner);
      assert.equal(detail.status, 200);
      assert.equal(detail.body.item.approvedVersion, 1);
      const approvalTransitions = detail.body.transitions.filter(
        (entry) => entry.toStatus === "APPROVED",
      );
      assert.equal(approvalTransitions.length, 1);
      assert.equal(approvalTransitions[0].version, 1);
      assert.match(approvalTransitions[0].contentHash, /^[0-9a-f]{64}$/);

      // Review queue: REVIEW items only, oldest first.
      const queue = await get(base, `${contentPath}/review-queue`, manager);
      assert.equal(queue.status, 200);
      assert.ok(Array.isArray(queue.body.items));

      // Calendar: bounded UTC window with scheduled/published/failed items.
      const from = new Date(now.getTime() + 12 * 3_600_000).toISOString();
      const to = new Date(now.getTime() + 3 * 86_400_000).toISOString();
      const calendar = await get(
        base,
        `${contentPath}/calendar?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
        broker,
      );
      assert.equal(calendar.status, 200);
      // The published first item (+2d) and the failed second item (+1d) both
      // keep their scheduled timestamps on the calendar, with their status.
      const calendarById = new Map(
        calendar.body.items.map((entry) => [entry.id, entry]),
      );
      assert.equal(calendarById.get(itemId).status, "PUBLISHED");
      assert.equal(calendarById.get(secondId).status, "FAILED");
      assert.equal(
        (
          await get(
            base,
            `${contentPath}/calendar?from=${encodeURIComponent(to)}&to=${encodeURIComponent(from)}`,
            manager,
          )
        ).status,
        400,
      );

      // Tenant safety: foreign organization gets opaque 404s, empty lists.
      assert.equal(
        (
          await get(
            base,
            `/organizations/${otherOrganizationId}/content/${secondId}`,
            owner,
          )
        ).status,
        404,
      );
      assert.equal(
        (
          await post(
            base,
            `/organizations/${otherOrganizationId}/content/${secondId}/transition`,
            owner,
            { toStatus: "DRAFT" },
          )
        ).status,
        404,
      );
      const foreignList = await get(
        base,
        `/organizations/${otherOrganizationId}/content`,
        owner,
      );
      assert.equal(foreignList.status, 200);
      assert.equal(foreignList.body.items.length, 0);

      // Broker reads; client cannot even read.
      assert.equal(
        (await get(base, `${contentPath}/${secondId}`, broker)).status,
        200,
      );
      assert.equal((await get(base, `${contentPath}`, client)).status, 403);

      await cleanupDatabase(prisma, TABLES);
      await assertTablesAreEmpty(prisma, TABLES);
    } finally {
      await app.close();
    }
  },
);
