import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import process from "node:process";
import { URL } from "node:url";
import test from "node:test";

const TEST_BROWSER_ORIGIN = "https://app.estateflow.test";
const TABLES = [
  "AdminAuditEvent",
  "AdminStepUpEvent",
  "ListingModerationEvent",
  "AutomationJob",
  "AutomationRuleVersion",
  "AutomationRule",
  "Listing",
  "Property",
  "Membership",
  "Organization",
  "User",
];

Object.assign(process.env, {
  NODE_ENV: "test",
  ESTATEFLOW_BROWSER_ORIGIN: TEST_BROWSER_ORIGIN,
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

test(
  "EF-620 privileged authorization, audited moderation transitions, cross-tenant admin visibility, and tenant isolation on estateflow_test",
  { skip: !guardedTarget() },
  async () => {
    const [
      { NestFactory },
      { AppModule },
      { PrismaService },
      { AdminApplication },
      { AdminAction },
      {
        AdminConflictError,
        AdminForbiddenError,
        AdminStepUpRequiredError,
        AdminValidationError,
      },
      { NodeCryptoPasswordHasher },
      cleanup,
    ] = await Promise.all([
      import("@nestjs/core"),
      import("../dist/app.module.js"),
      import("../dist/database/prisma.service.js"),
      import("../dist/features/admin/application/admin-application.js"),
      import("../dist/features/admin/domain/admin-policy.js"),
      import("../dist/features/admin/domain/admin-errors.js"),
      import("../dist/features/auth/infrastructure/node-crypto-password-hasher.js"),
      import("./support/cleanup-database.mjs"),
    ]);
    const { cleanupDatabase, assertTablesAreEmpty } = cleanup;

    const app = await NestFactory.create(AppModule, { logger: false });
    const prisma = app.get(PrismaService);
    await prisma.$connect();
    await cleanupDatabase(prisma, TABLES);
    try {
      // ---- seed: platform admin, two tenants, brokers, listings ----------
      const password = "correct-step-up-password";
      const passwordHash = await new NodeCryptoPasswordHasher().hash(password);
      const adminId = randomUUID();
      const orgA = randomUUID();
      const orgB = randomUUID();
      const ownerA = randomUUID();
      const pendingBrokerA = randomUUID();
      const pendingBrokerB = randomUUID();
      const activeBrokerA = randomUUID();
      const pendingMembershipA = randomUUID();
      const pendingMembershipB = randomUUID();
      const activeMembershipA = randomUUID();
      const propertyA = randomUUID();
      const propertyB = randomUUID();
      const listingA = randomUUID();
      const listingB = randomUUID();
      const now = new Date();

      await prisma.user.createMany({
        data: [
          {
            id: adminId,
            accountIdentifier: `${adminId}@admin.test.invalid`,
            platformRole: "PLATFORM_ADMIN",
            verifiedAt: now,
          },
          {
            id: ownerA,
            accountIdentifier: `${ownerA}@owner.test.invalid`,
            verifiedAt: now,
          },
          {
            id: pendingBrokerA,
            accountIdentifier: `${pendingBrokerA}@broker.test.invalid`,
          },
          {
            id: pendingBrokerB,
            accountIdentifier: `${pendingBrokerB}@broker.test.invalid`,
          },
          {
            id: activeBrokerA,
            accountIdentifier: `${activeBrokerA}@broker.test.invalid`,
            verifiedAt: now,
          },
        ],
      });
      await prisma.credential.create({
        data: { userId: adminId, passwordHash, passwordChangedAt: now },
      });
      await prisma.organization.createMany({
        data: [
          { id: orgA, name: "مكتب الرياض" },
          { id: orgB, name: "مكتب جدة" },
        ],
      });
      await prisma.membership.createMany({
        data: [
          {
            id: randomUUID(),
            organizationId: orgA,
            userId: ownerA,
            role: "OWNER",
            status: "ACTIVE",
          },
          {
            id: pendingMembershipA,
            organizationId: orgA,
            userId: pendingBrokerA,
            role: "BROKER",
            status: "PENDING",
          },
          {
            id: pendingMembershipB,
            organizationId: orgB,
            userId: pendingBrokerB,
            role: "BROKER",
            status: "PENDING",
          },
          {
            id: activeMembershipA,
            organizationId: orgA,
            userId: activeBrokerA,
            role: "BROKER",
            status: "ACTIVE",
          },
        ],
      });
      for (const [orgId, propertyId, listingId, title] of [
        [orgA, propertyA, listingA, "فيلا النخيل"],
        [orgB, propertyB, listingB, "شقة الكورنيش"],
      ]) {
        await prisma.property.create({
          data: {
            id: propertyId,
            organizationId: orgId,
            title,
            propertyType: "VILLA",
            addressText: "عنوان تجريبي",
            version: 1,
          },
        });
        await prisma.listing.create({
          data: {
            id: listingId,
            organizationId: orgId,
            propertyId,
            status: "PUBLISHED",
            version: 1,
          },
        });
      }

      const admin = app.get(AdminApplication);
      const adminPrincipal = {
        userId: adminId,
        verified: true,
        platformRole: "PLATFORM_ADMIN",
        accessSessionId: randomUUID(),
        familyId: randomUUID(),
      };
      let clock = now.getTime();
      const tick = () => new Date((clock += 1000));
      const plainOwnerPrincipal = {
        userId: ownerA,
        verified: true,
        platformRole: "NONE",
        accessSessionId: randomUUID(),
        familyId: randomUUID(),
      };

      // ---- privileged authorization: non-admin denied everywhere ----------
      for (const command of [
        () => admin.listPendingBrokers({ actor: plainOwnerPrincipal }),
        () =>
          admin.suspendBroker({
            actor: plainOwnerPrincipal,
            organizationId: orgA,
            membershipId: activeBrokerA,
            reason: "x",
            now,
          }),
        () => admin.moderationQueue({ actor: plainOwnerPrincipal }),
        () => admin.searchAudit({ actor: plainOwnerPrincipal }),
        () => admin.failedJobs({ actor: plainOwnerPrincipal }),
        () => admin.stepUp({ actor: plainOwnerPrincipal, password, now }),
      ]) {
        await assert.rejects(command, AdminForbiddenError);
      }

      // ---- cross-tenant visibility: one admin sees both tenants -----------
      const pending = await admin.listPendingBrokers({ actor: adminPrincipal });
      assert.deepEqual(
        pending.items.map((row) => [row.organizationId, row.status]).sort(),
        [
          [orgA, "PENDING"],
          [orgB, "PENDING"],
        ].sort(),
      );
      const queue = await admin.moderationQueue({ actor: adminPrincipal });
      assert.deepEqual(
        queue.items.map((row) => row.listingId).sort(),
        [listingA, listingB].sort(),
      );
      // Bounded views never carry raw payloads or secrets.
      const serialized = JSON.stringify(pending) + JSON.stringify(queue);
      assert.equal(serialized.includes("passwordHash"), false);
      assert.equal(serialized.includes(password), false);
      assert.equal(serialized.includes("accountIdentifier"), false);

      // ---- suspend broker: reason + step-up enforcement --------------------
      await assert.rejects(
        admin.suspendBroker({
          actor: adminPrincipal,
          organizationId: orgA,
          membershipId: activeBrokerA,
          reason: " ",
          now: tick(),
        }),
        AdminValidationError,
      );
      await assert.rejects(
        admin.suspendBroker({
          actor: adminPrincipal,
          organizationId: orgA,
          membershipId: activeMembershipA,
          reason: "مخالفة سياسة المنصة",
          now: tick(),
        }),
        AdminStepUpRequiredError,
      );
      await assert.rejects(
        admin.stepUp({
          actor: adminPrincipal,
          password: "wrong-password",
          now,
        }),
        AdminValidationError,
      );
      const deniedCount = await prisma.adminStepUpEvent.count({
        where: { userId: adminId, outcome: "DENIED" },
      });
      assert.equal(deniedCount, 1, "failed step-up is audited append-only");

      await admin.stepUp({ actor: adminPrincipal, password, now });
      const suspended = await admin.suspendBroker({
        actor: adminPrincipal,
        organizationId: orgA,
        membershipId: activeMembershipA,
        reason: "مخالفة سياسة المنصة",
        now: tick(),
      });
      assert.equal(suspended.status, "SUSPENDED");
      const suspendedRow = await prisma.membership.findUnique({
        where: {
          organizationId_userId: {
            organizationId: orgA,
            userId: activeBrokerA,
          },
        },
      });
      assert.equal(suspendedRow.status, "SUSPENDED");

      // Reinstate with mandatory reason, audited.
      const reinstated = await admin.reinstateBroker({
        actor: adminPrincipal,
        organizationId: orgA,
        membershipId: activeMembershipA,
        reason: "تم تصحيح المخالفة",
        now: tick(),
      });
      assert.equal(reinstated.status, "ACTIVE");

      // ---- listing moderation: audited transitions + tenant-safe 404s -----
      const approved = await admin.approveListing({
        actor: adminPrincipal,
        organizationId: orgA,
        listingId: listingA,
        now: tick(),
      });
      assert.deepEqual(approved, {
        listingId: listingA,
        moderationStatus: "APPROVED",
        listingStatus: "PUBLISHED",
      });
      const rejected = await admin.rejectListing({
        actor: adminPrincipal,
        organizationId: orgB,
        listingId: listingB,
        reason: "صور غير مطابقة للعقار",
        now: tick(),
      });
      assert.deepEqual(rejected, {
        listingId: listingB,
        moderationStatus: "REJECTED",
        listingStatus: "ARCHIVED",
      });
      const rejectedRow = await prisma.listing.findUnique({
        where: { id: listingB },
      });
      assert.equal(rejectedRow.status, "ARCHIVED");
      assert.equal(rejectedRow.moderationStatus, "REJECTED");

      // Approve again is a conflict (queue-only state machine).
      await assert.rejects(
        admin.rejectListing({
          actor: adminPrincipal,
          organizationId: orgB,
          listingId: listingB,
          reason: "مرة أخرى",
          now: tick(),
        }),
        AdminConflictError,
      );
      // Cross-org id mismatch resolves tenant-safely, never mutating org B.
      await assert.rejects(
        admin.rejectListing({
          actor: adminPrincipal,
          organizationId: orgB,
          listingId: listingA,
          reason: "لا يخص هذه المؤسسة",
          now: tick(),
        }),
        AdminConflictError,
      );
      await assert.rejects(
        admin.rejectListing({
          actor: adminPrincipal,
          organizationId: orgB,
          listingId: randomUUID(),
          reason: "غير موجود",
          now: tick(),
        }),
        AdminConflictError,
      );

      // Takedown needs a fresh step-up for the current access session.
      const freshSession = {
        ...adminPrincipal,
        accessSessionId: randomUUID(),
      };
      await assert.rejects(
        admin.takedownListing({
          actor: freshSession,
          organizationId: orgA,
          listingId: listingA,
          reason: "مخالفة بعد النشر",
          now: tick(),
        }),
        AdminStepUpRequiredError,
      );
      await admin.stepUp({ actor: freshSession, password, now });
      const takenDown = await admin.takedownListing({
        actor: freshSession,
        organizationId: orgA,
        listingId: listingA,
        reason: "مخالفة بعد النشر",
        now: tick(),
      });
      assert.deepEqual(takenDown, {
        listingId: listingA,
        moderationStatus: "TAKEN_DOWN",
        listingStatus: "ARCHIVED",
      });

      // ---- broker approval (reused EF-121 platform approval) --------------
      const approvedBroker = await admin.approveBroker({
        actor: adminPrincipal,
        organizationId: orgB,
        membershipId: pendingMembershipB,
        now: tick(),
      });
      assert.equal(approvedBroker.status, "ACTIVE");
      const approvedRow = await prisma.membership.findUnique({
        where: {
          organizationId_userId: {
            organizationId: orgB,
            userId: pendingBrokerB,
          },
        },
      });
      assert.equal(approvedRow.status, "ACTIVE");
      assert.equal(approvedRow.approvedByUserId, adminId);

      // ---- audit trail: complete, bounded, filterable, keyset -------------
      const auditPage = await admin.searchAudit({
        actor: adminPrincipal,
        limit: 100,
      });
      assert.deepEqual(
        auditPage.items.map((event) => event.action),
        [
          "BROKER_APPROVED",
          "LISTING_MODERATION_TAKEN_DOWN",
          "LISTING_MODERATION_REJECTED",
          "LISTING_MODERATION_APPROVED",
          "BROKER_REINSTATED",
          "BROKER_SUSPENDED",
        ].map((action) => AdminAction[action]),
      );
      for (const event of auditPage.items) {
        if (
          [
            "LISTING_MODERATION_REJECTED",
            "LISTING_MODERATION_TAKEN_DOWN",
            "BROKER_SUSPENDED",
            "BROKER_REINSTATED",
          ].includes(event.action)
        ) {
          assert.ok(event.reason, `${event.action} carries a reason`);
        }
      }
      const orgBOnly = await admin.searchAudit({
        actor: adminPrincipal,
        organizationId: orgB,
        limit: 100,
      });
      assert.ok(orgBOnly.items.length >= 2);
      assert.ok(orgBOnly.items.every((event) => event.organizationId === orgB));

      // Keyset walk: no duplicates, bounded pages, stable total.
      const collected = [];
      let cursor;
      for (let page = 0; page < 10; page += 1) {
        const result = await admin.searchAudit({
          actor: adminPrincipal,
          cursor,
          limit: 2,
        });
        collected.push(...result.items.map((event) => event.id));
        if (!result.nextCursor) break;
        cursor = result.nextCursor;
      }
      assert.equal(new Set(collected).size, collected.length);
      assert.equal(collected.length, auditPage.items.length);

      // ---- append-only enforcement lives in the database -------------------
      const auditRow = await prisma.adminAuditEvent.findFirstOrThrow();
      await assert.rejects(
        prisma.$executeRawUnsafe(
          `UPDATE "AdminAuditEvent" SET "reason" = 'tampered' WHERE "id" = $1`,
          auditRow.id,
        ),
      );
      await assert.rejects(
        prisma.$executeRawUnsafe(
          `DELETE FROM "AdminAuditEvent" WHERE "id" = $1`,
          auditRow.id,
        ),
      );
      const moderationEvent =
        await prisma.listingModerationEvent.findFirstOrThrow();
      await assert.rejects(
        prisma.$executeRawUnsafe(
          `UPDATE "ListingModerationEvent" SET "reason" = 'tampered' WHERE "id" = $1`,
          moderationEvent.id,
        ),
      );
      const stepUpRow = await prisma.adminStepUpEvent.findFirstOrThrow();
      await assert.rejects(
        prisma.$executeRawUnsafe(
          `DELETE FROM "AdminStepUpEvent" WHERE "id" = $1`,
          stepUpRow.id,
        ),
      );

      // ---- failed automation jobs review (bounded, cross-org) --------------
      const { AutomationRuleApplication } =
        await import("../dist/features/automation/application/rule-application.js");
      const { PrismaAutomationJobRepository } =
        await import("../dist/features/automation/infrastructure/prisma-automation-job.repository.js");
      const { createAutomationJob, failAutomationJob } =
        await import("../dist/features/automation/domain/execution.js");
      const rules = app.get(AutomationRuleApplication);
      const jobs = app.get(PrismaAutomationJobRepository);
      const created = await rules.createRule({
        actor: { verified: true },
        userId: ownerA,
        organizationId: orgA,
        ruleId: randomUUID(),
        name: "قاعدة مهام العملاء المحتملين",
        definition: {
          trigger: { kind: "DOMAIN_EVENT", eventType: "lead.created" },
          conditions: [],
          action: { actionType: "CREATE_LEAD_TASK", payload: {} },
        },
        createdAt: now,
      });
      assert.equal(created.kind, "created");
      const failedJob = createAutomationJob({
        id: randomUUID(),
        organizationId: orgA,
        ruleId: created.rule.id,
        ruleVersion: 1,
        executionKey: `ef620-${randomUUID()}`,
        triggerKind: "DOMAIN_EVENT",
        eventType: "lead.created",
        eventId: randomUUID(),
        actionType: "CREATE_LEAD_TASK",
        targetType: "LEAD",
        targetId: `lead-${randomUUID()}`,
        scheduleBucket: null,
        scheduledFor: now,
        now,
      });
      assert.deepEqual(await jobs.insertJob(failedJob), { kind: "inserted" });
      const claimed = await jobs.claimNextDueJob(now);
      assert.equal(claimed?.id, failedJob.id);
      const failedOutcome = failAutomationJob(claimed, now, {
        kind: "action-permanent-failure",
        message: "executor rejected the action",
      });
      assert.equal(await jobs.saveJobOutcome(failedOutcome), true);

      const failed = await admin.failedJobs({ actor: adminPrincipal });
      assert.equal(failed.items.length, 1);
      assert.equal(failed.items[0].organizationId, orgA);
      assert.equal(failed.items[0].lastErrorKind, "action-permanent-failure");
      // Typed failure reasons only — no execution key or payload leaves the API.
      const failedSerialized = JSON.stringify(failed);
      assert.equal(failedSerialized.includes("executionKey"), false);
      assert.equal(failedSerialized.includes(failedJob.executionKey), false);
      const orgBFailed = await admin.failedJobs({
        actor: adminPrincipal,
        organizationId: orgB,
      });
      assert.equal(orgBFailed.items.length, 0);
    } finally {
      await app.close();
      await cleanupDatabase(prisma, TABLES);
      await assertTablesAreEmpty(prisma, TABLES);
    }
  },
);

test(
  "EF-620 admin HTTP boundary: guard wiring, tenant-safe denial, and step-up enforcement over real HTTP",
  { skip: !guardedTarget() },
  async () => {
    const [
      { NestFactory },
      { AppModule },
      { PrismaService },
      { NodeCryptoPasswordHasher },
      credentialsModule,
      cleanup,
    ] = await Promise.all([
      import("@nestjs/core"),
      import("../dist/app.module.js"),
      import("../dist/database/prisma.service.js"),
      import("../dist/features/auth/infrastructure/node-crypto-password-hasher.js"),
      import("../dist/features/auth/infrastructure/node-crypto-credential-issuer.js"),
      import("./support/cleanup-database.mjs"),
    ]);
    const { NodeCryptoCredentialIssuer } = credentialsModule;
    const { cleanupDatabase, assertTablesAreEmpty } = cleanup;

    const app = await NestFactory.create(AppModule, { logger: false });
    const prisma = app.get(PrismaService);
    await prisma.$connect();
    await cleanupDatabase(prisma, TABLES);
    let baseUrl;
    try {
      const issuer = new NodeCryptoCredentialIssuer("a".repeat(32));
      const password = "correct-step-up-password";
      const passwordHash = await new NodeCryptoPasswordHasher().hash(password);
      const adminId = randomUUID();
      const ownerId = randomUUID();
      const orgA = randomUUID();
      const now = new Date();

      await prisma.user.createMany({
        data: [
          {
            id: adminId,
            accountIdentifier: `${adminId}@admin.test.invalid`,
            platformRole: "PLATFORM_ADMIN",
            verifiedAt: now,
          },
          {
            id: ownerId,
            accountIdentifier: `${ownerId}@owner.test.invalid`,
            verifiedAt: now,
          },
        ],
      });
      await prisma.credential.create({
        data: { userId: adminId, passwordHash, passwordChangedAt: now },
      });
      await prisma.organization.create({
        data: { id: orgA, name: "مكتب الدمام" },
      });

      async function browserSession(sessionUserId) {
        const access = issuer.issue();
        const csrfToken = randomBytes(32).toString("base64url");
        const family = await prisma.sessionFamily.create({
          data: { userId: sessionUserId },
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

      async function get(path, session) {
        const response = await fetch(`${baseUrl}${path}`, {
          headers: {
            ...(session ? { cookie: session.cookie } : {}),
            origin: TEST_BROWSER_ORIGIN,
          },
        });
        return { status: response.status, body: await response.json() };
      }

      async function post(path, session, body) {
        const response = await fetch(`${baseUrl}${path}`, {
          method: "POST",
          headers: {
            ...(session
              ? { cookie: session.cookie, "x-csrf-token": session.csrfToken }
              : {}),
            origin: TEST_BROWSER_ORIGIN,
            "content-type": "application/json",
          },
          body: JSON.stringify(body ?? {}),
        });
        const text = await response.text();
        return {
          status: response.status,
          body: text ? JSON.parse(text) : null,
        };
      }

      const adminSession = await browserSession(adminId);
      const ownerSession = await browserSession(ownerId);

      await app.listen(0, "127.0.0.1");
      baseUrl = `http://127.0.0.1:${app.getHttpServer().address().port}`;

      // Unauthenticated → 401 (session guard fires first).
      assert.equal((await get("/admin/brokers/pending")).status, 401);

      // Authenticated non-admin (org Owner!) → 403: platform authority only.
      const ownerDenied = await get("/admin/brokers/pending", ownerSession);
      assert.equal(ownerDenied.status, 403);
      const ownerMutationDenied = await post(
        `/admin/organizations/${orgA}/brokers/${randomUUID()}/suspend`,
        ownerSession,
        { reason: "لا يملك صلاحية" },
      );
      assert.equal(ownerMutationDenied.status, 403);

      // Admin reads work.
      const pending = await get("/admin/brokers/pending", adminSession);
      assert.equal(pending.status, 200);
      assert.deepEqual(pending.body, { items: [], nextCursor: null });

      // Sensitive command without step-up → 403 STEP_UP_REQUIRED. The
      // integration app is created without the bootstrap global filter, so
      // assert on the raw Nest error body carrying the stable code.
      const noStepUp = await post(
        `/admin/organizations/${orgA}/brokers/${randomUUID()}/suspend`,
        adminSession,
        { reason: "قبل إعادة التأكيد" },
      );
      assert.equal(noStepUp.status, 403);
      assert.equal(
        JSON.stringify(noStepUp.body).includes("STEP_UP_REQUIRED"),
        true,
      );

      // Step-up with wrong password → 400; correct → 204.
      const wrongPassword = await post("/admin/auth/step-up", adminSession, {
        password: "wrong-password",
      });
      assert.equal(wrongPassword.status, 400);
      const stepUp = await post("/admin/auth/step-up", adminSession, {
        password,
      });
      assert.equal(stepUp.status, 204);

      // Missing reason → 400; unknown membership → tenant-safe 404.
      const missingReason = await post(
        `/admin/organizations/${orgA}/brokers/${randomUUID()}/suspend`,
        adminSession,
        {},
      );
      assert.equal(missingReason.status, 400);
      const unknownMembership = await post(
        `/admin/organizations/${orgA}/brokers/${randomUUID()}/suspend`,
        adminSession,
        { reason: "عضوية غير موجودة" },
      );
      assert.equal(unknownMembership.status, 404);

      // Invalid cursor → 400; audit and failed-jobs reads stay bounded.
      assert.equal(
        (await get("/admin/audit/events?cursor=not-a-cursor", adminSession))
          .status,
        400,
      );
      const audit = await get("/admin/audit/events", adminSession);
      assert.equal(audit.status, 200);
      const failedJobs = await get(
        "/admin/automation/failed-jobs",
        adminSession,
      );
      assert.equal(failedJobs.status, 200);
      assert.deepEqual(failedJobs.body, { items: [], nextCursor: null });
    } finally {
      await app.close();
      await cleanupDatabase(prisma, TABLES);
      await assertTablesAreEmpty(prisma, TABLES);
    }
  },
);
