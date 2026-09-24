import assert from "node:assert/strict";
import test from "node:test";
import { AdminApplication } from "../dist/features/admin/application/admin-application.js";
import { AdminAction } from "../dist/features/admin/domain/admin-policy.js";
import {
  AdminConflictError,
  AdminForbiddenError,
  AdminNotFoundError,
  AdminStepUpDeniedError,
  AdminStepUpRequiredError,
  AdminValidationError,
} from "../dist/features/admin/domain/admin-errors.js";
import { ApproveBrokerMembership } from "../dist/features/organizations/application/approve-broker-membership.js";
import { PlatformRole } from "../dist/features/organizations/domain/organization-access.js";

const uuid = (n) => {
  const h = (n % 16).toString(16);
  return `${h.repeat(8)}-${h.repeat(4)}-4${h.repeat(3)}-8${h.repeat(3)}-${h.repeat(12)}`;
};
const NOW = new Date("2026-10-04T09:00:00.000Z");

const adminPrincipal = {
  userId: uuid(1),
  verified: true,
  platformRole: PlatformRole.PLATFORM_ADMIN,
  accessSessionId: uuid(2),
  familyId: uuid(3),
};
const memberPrincipal = {
  userId: uuid(4),
  verified: true,
  platformRole: PlatformRole.NONE,
  accessSessionId: uuid(5),
  familyId: uuid(6),
};

/** In-memory AdminRepository fake recording every audit/step-up append. */
function fakeRepository(seed = {}) {
  const state = {
    pendingBrokers: seed.pendingBrokers ?? [],
    memberships: seed.memberships ?? [],
    queue: seed.queue ?? [],
    audit: [],
    stepUps: [],
    ...seed.overrides,
  };
  return {
    state,
    async listPendingBrokers(cursor, limit) {
      const items = state.pendingBrokers.filter(
        (row) => !cursor || row.createdAt > cursor.at,
      );
      return { items: items.slice(0, limit), nextCursor: null };
    },
    async findMembership(organizationId, membershipId) {
      return (
        state.memberships.find(
          (m) =>
            m.membershipId === membershipId &&
            m.organizationId === organizationId,
        ) ?? null
      );
    },
    async suspendBroker(input) {
      const membership = state.memberships.find(
        (m) =>
          m.membershipId === input.membershipId &&
          m.organizationId === input.organizationId,
      );
      if (!membership || membership.role !== "BROKER") return "conflict";
      if (membership.status !== "ACTIVE") return "conflict";
      membership.status = "SUSPENDED";
      return "suspended";
    },
    async reinstateBroker(input) {
      const membership = state.memberships.find(
        (m) =>
          m.membershipId === input.membershipId &&
          m.organizationId === input.organizationId,
      );
      if (!membership || membership.role !== "BROKER") return "conflict";
      if (membership.status !== "SUSPENDED") return "conflict";
      membership.status = "ACTIVE";
      return "reinstated";
    },
    async listModerationQueue(cursor, limit) {
      const items = state.queue.filter(
        (row) => !cursor || row.createdAt > cursor.at,
      );
      return { items: items.slice(0, limit), nextCursor: null };
    },
    async findListingWithModeration(organizationId, listingId) {
      return (
        state.queue.find(
          (l) =>
            l.listingId === listingId && l.organizationId === organizationId,
        ) ?? null
      );
    },
    async applyListingModeration(input) {
      const listing = state.queue.find(
        (l) =>
          l.listingId === input.listingId &&
          l.organizationId === input.organizationId,
      );
      if (!listing) return "conflict";
      if (listing.listingStatus !== "PUBLISHED") return "conflict";
      if (!input.fromModerationStatus.includes(listing.moderationStatus))
        return "conflict";
      listing.moderationStatus =
        input.action === "APPROVED"
          ? "APPROVED"
          : input.action === "REJECTED"
            ? "REJECTED"
            : "TAKEN_DOWN";
      if (input.action !== "APPROVED") listing.listingStatus = "ARCHIVED";
      return "applied";
    },
    async appendAuditEvent(event) {
      state.audit.push(event);
    },
    async searchAuditEvents(filter, cursor, limit) {
      let items = state.audit.filter(
        (e) =>
          (!filter.action || e.action === filter.action) &&
          (!filter.organizationId ||
            e.organizationId === filter.organizationId) &&
          (!filter.actorId || e.actorId === filter.actorId) &&
          (!cursor || e.createdAt < cursor.at),
      );
      return { items: items.slice(0, limit), nextCursor: null };
    },
    async listFailedJobs(organizationId, cursor, limit) {
      let items = (state.failedJobs ?? []).filter(
        (j) =>
          (!organizationId || j.organizationId === organizationId) &&
          (!cursor || j.createdAt < cursor.at),
      );
      return { items: items.slice(0, limit), nextCursor: null };
    },
    async appendStepUpEvent(event) {
      // Mirrors the Prisma repository: event.now lands in the createdAt column.
      state.stepUps.push({ ...event, createdAt: event.now });
    },
    async findActiveStepUp(userId, accessSessionId, now) {
      const proof = [...state.stepUps]
        .reverse()
        .find(
          (s) =>
            s.userId === userId &&
            s.accessSessionId === accessSessionId &&
            s.outcome === "SUCCEEDED" &&
            s.expiresAt.getTime() > now.getTime(),
        );
      return proof
        ? { verifiedAt: proof.createdAt, expiresAt: proof.expiresAt }
        : null;
    },
    async countDeniedStepUps(userId, since) {
      return state.stepUps.filter(
        (s) =>
          s.userId === userId &&
          s.outcome === "DENIED" &&
          s.createdAt.getTime() >= since.getTime(),
      ).length;
    },
  };
}

const fakeCredentials = (passwordHash) => ({
  async findPasswordHashByUserId(userId) {
    return userId === adminPrincipal.userId ? passwordHash : null;
  },
});

const fakeHasher = {
  async verify(password, stored) {
    return stored === `hash:${password}`;
  },
};

/** EF-121 broker approval reused verbatim over a fake org repository. */
function fakeOrgRepository(memberships) {
  return {
    async approvePendingBrokerMembership(input) {
      const membership = memberships.find(
        (m) =>
          m.membershipId === input.membershipId &&
          m.organizationId === input.organizationId,
      );
      if (!membership) return { status: "not-found" };
      if (membership.status !== "PENDING") return { status: "conflict" };
      membership.status = "ACTIVE";
      membership.approvedAt = input.approvedAt;
      return {
        status: "approved",
        membership: {
          id: membership.membershipId,
          organizationId: membership.organizationId,
          userId: membership.userId,
          role: membership.role,
          status: membership.status,
          approvedAt: input.approvedAt,
        },
      };
    },
  };
}

function buildApplication(options = {}) {
  const repository = options.repository ?? fakeRepository();
  const memberships = options.orgMemberships ?? [];
  const approveBrokerMembership = new ApproveBrokerMembership(
    fakeOrgRepository(memberships),
    { now: () => NOW },
  );
  const application = new AdminApplication(
    repository,
    options.credentials ?? fakeCredentials("hash:correct-password"),
    fakeHasher,
    approveBrokerMembership,
  );
  return { application, repository };
}

test("EF-620 every admin read/command denies non-admin principals with 403 semantics", async () => {
  const { application } = buildApplication();
  for (const actor of [
    memberPrincipal,
    {
      ...memberPrincipal,
      verified: false,
      platformRole: PlatformRole.PLATFORM_ADMIN,
    },
    { ...adminPrincipal, verified: false },
  ]) {
    await assert.rejects(
      application.listPendingBrokers({ actor }),
      AdminForbiddenError,
      JSON.stringify(actor),
    );
    await assert.rejects(
      application.suspendBroker({
        actor,
        organizationId: uuid(10),
        membershipId: uuid(11),
        reason: "x",
        now: NOW,
      }),
      AdminForbiddenError,
    );
    await assert.rejects(
      application.moderationQueue({ actor }),
      AdminForbiddenError,
    );
    await assert.rejects(
      application.searchAudit({ actor }),
      AdminForbiddenError,
    );
    await assert.rejects(
      application.failedJobs({ actor }),
      AdminForbiddenError,
    );
    await assert.rejects(
      application.stepUp({ actor, password: "x", now: NOW }),
      AdminForbiddenError,
    );
  }
});

test("EF-620 suspend broker requires mandatory reason AND fresh step-up, then audits", async () => {
  const orgId = uuid(10);
  const membershipId = uuid(11);
  const { application, repository } = buildApplication({
    repository: fakeRepository({
      memberships: [
        {
          membershipId,
          organizationId: orgId,
          userId: uuid(12),
          role: "BROKER",
          status: "ACTIVE",
        },
      ],
    }),
  });

  await assert.rejects(
    application.suspendBroker({
      actor: adminPrincipal,
      organizationId: orgId,
      membershipId,
      reason: "   ",
      now: NOW,
    }),
    AdminValidationError,
  );
  await assert.rejects(
    application.suspendBroker({
      actor: adminPrincipal,
      organizationId: orgId,
      membershipId,
      reason: "سبب الإيقاف",
      now: NOW,
    }),
    AdminStepUpRequiredError,
  );

  await application.stepUp({
    actor: adminPrincipal,
    password: "correct-password",
    now: NOW,
  });
  const result = await application.suspendBroker({
    actor: adminPrincipal,
    organizationId: orgId,
    membershipId,
    reason: "سبب الإيقاف",
    now: NOW,
  });
  assert.equal(result.status, "SUSPENDED");
  const suspended = repository.state.memberships[0];
  assert.equal(suspended.status, "SUSPENDED");
  const audit = repository.state.audit;
  assert.equal(audit.length, 1);
  assert.equal(audit[0].action, AdminAction.BROKER_SUSPENDED);
  assert.equal(audit[0].reason, "سبب الإيقاف");
  assert.equal(audit[0].targetId, membershipId);
  assert.equal(audit[0].actorId, adminPrincipal.userId);
});

test("EF-620 approve broker reuses the EF-121 platform approval and audits it", async () => {
  const orgId = uuid(10);
  const membershipId = uuid(11);
  const { application, repository } = buildApplication({
    orgMemberships: [
      {
        membershipId,
        organizationId: orgId,
        userId: uuid(12),
        role: "BROKER",
        status: "PENDING",
      },
    ],
  });
  const result = await application.approveBroker({
    actor: adminPrincipal,
    organizationId: orgId,
    membershipId,
    reason: undefined,
    now: NOW,
  });
  assert.equal(result.status, "ACTIVE");
  assert.equal(repository.state.audit.length, 1);
  assert.equal(repository.state.audit[0].action, AdminAction.BROKER_APPROVED);
  assert.equal(repository.state.audit[0].reason, null);

  await assert.rejects(
    application.approveBroker({
      actor: adminPrincipal,
      organizationId: orgId,
      membershipId: uuid(99),
      now: NOW,
    }),
    AdminNotFoundError,
  );
  await assert.rejects(
    application.approveBroker({
      actor: adminPrincipal,
      organizationId: orgId,
      membershipId,
      now: NOW,
    }),
    AdminConflictError,
  );
});

test("EF-620 reinstate broker requires a reason, is audited, and refuses non-suspended targets", async () => {
  const orgId = uuid(10);
  const membershipId = uuid(11);
  const { application, repository } = buildApplication({
    repository: fakeRepository({
      memberships: [
        {
          membershipId,
          organizationId: orgId,
          userId: uuid(12),
          role: "BROKER",
          status: "SUSPENDED",
        },
      ],
    }),
  });
  await assert.rejects(
    application.reinstateBroker({
      actor: adminPrincipal,
      organizationId: orgId,
      membershipId,
      reason: undefined,
      now: NOW,
    }),
    AdminValidationError,
  );
  const result = await application.reinstateBroker({
    actor: adminPrincipal,
    organizationId: orgId,
    membershipId,
    reason: "الاعتراف بالخطأ",
    now: NOW,
  });
  assert.equal(result.status, "ACTIVE");
  assert.equal(repository.state.audit[0].action, AdminAction.BROKER_REINSTATED);
  await assert.rejects(
    application.reinstateBroker({
      actor: adminPrincipal,
      organizationId: orgId,
      membershipId,
      reason: "مرة أخرى",
      now: NOW,
    }),
    AdminConflictError,
  );
  await assert.rejects(
    application.reinstateBroker({
      actor: adminPrincipal,
      organizationId: orgId,
      membershipId: uuid(99),
      reason: "مرة أخرى",
      now: NOW,
    }),
    AdminNotFoundError,
  );
});

test("EF-620 moderation transitions are audited and enforce state/reason/step-up rules", async () => {
  const orgId = uuid(20);
  const listingId = uuid(21);
  const base = {
    listingId,
    organizationId: orgId,
    propertyId: uuid(22),
    propertyTitle: "فيلا",
    propertyType: "VILLA",
    listingStatus: "PUBLISHED",
    moderationStatus: "PENDING",
    moderationReason: null,
    moderatedAt: null,
    createdAt: NOW,
    updatedAt: NOW,
  };
  const { application, repository } = buildApplication({
    repository: fakeRepository({ queue: [{ ...base }] }),
  });

  await assert.rejects(
    application.rejectListing({
      actor: adminPrincipal,
      organizationId: orgId,
      listingId,
      reason: undefined,
      now: NOW,
    }),
    AdminValidationError,
  );
  await assert.rejects(
    application.takedownListing({
      actor: adminPrincipal,
      organizationId: orgId,
      listingId,
      reason: "مخالفة",
      now: NOW,
    }),
    AdminStepUpRequiredError,
  );
  await assert.rejects(
    application.rejectListing({
      actor: adminPrincipal,
      organizationId: uuid(99),
      listingId,
      reason: "مخالفة",
      now: NOW,
    }),
    AdminConflictError,
    "tenant mismatch resolves to conflict/404 semantics, never cross-tenant mutation",
  );

  await application.stepUp({
    actor: adminPrincipal,
    password: "correct-password",
    now: NOW,
  });

  const approved = await application.approveListing({
    actor: adminPrincipal,
    organizationId: orgId,
    listingId,
    now: NOW,
  });
  assert.deepEqual(approved, {
    listingId,
    moderationStatus: "APPROVED",
    listingStatus: "PUBLISHED",
  });

  await application.takedownListing({
    actor: adminPrincipal,
    organizationId: orgId,
    listingId,
    reason: "مخالفة الشروط",
    now: NOW,
  });
  const takenDown = repository.state.queue[0];
  assert.equal(takenDown.moderationStatus, "TAKEN_DOWN");
  assert.equal(takenDown.listingStatus, "ARCHIVED");

  const actions = repository.state.audit.map((event) => event.action);
  assert.deepEqual(actions, [
    AdminAction.LISTING_MODERATION_APPROVED,
    AdminAction.LISTING_MODERATION_TAKEN_DOWN,
  ]);
  assert.equal(repository.state.audit[0].reason, null);
  assert.equal(repository.state.audit[1].reason, "مخالفة الشروط");
});

test("EF-620 reject archives the listing and records the mandatory reason", async () => {
  const orgId = uuid(20);
  const listingId = uuid(21);
  const { application, repository } = buildApplication({
    repository: fakeRepository({
      queue: [
        {
          listingId,
          organizationId: orgId,
          propertyId: uuid(22),
          propertyTitle: "شقة",
          propertyType: "APARTMENT",
          listingStatus: "PUBLISHED",
          moderationStatus: "PENDING",
          moderationReason: null,
          moderatedAt: null,
          createdAt: NOW,
          updatedAt: NOW,
        },
      ],
    }),
  });
  const result = await application.rejectListing({
    actor: adminPrincipal,
    organizationId: orgId,
    listingId,
    reason: "صور غير مطابقة",
    now: NOW,
  });
  assert.deepEqual(result, {
    listingId,
    moderationStatus: "REJECTED",
    listingStatus: "ARCHIVED",
  });
  assert.equal(
    repository.state.audit[0].action,
    AdminAction.LISTING_MODERATION_REJECTED,
  );
  assert.equal(repository.state.audit[0].reason, "صور غير مطابقة");
});

test("EF-620 step-up verifies the password, binds the proof to the access session, and rate-limits", async () => {
  const { application, repository } = buildApplication();
  await assert.rejects(
    application.stepUp({
      actor: adminPrincipal,
      password: "wrong-password",
      now: NOW,
    }),
    AdminValidationError,
  );
  assert.equal(repository.state.stepUps[0].outcome, "DENIED");
  assert.equal(
    repository.state.stepUps[0].accessSessionId,
    adminPrincipal.accessSessionId,
  );

  const proof = await application.stepUp({
    actor: adminPrincipal,
    password: "correct-password",
    now: NOW,
  });
  assert.ok(proof.expiresAt.getTime() > proof.verifiedAt.getTime());
  assert.equal(repository.state.stepUps[1].outcome, "SUCCEEDED");

  const bounded = fakeRepository({
    overrides: {
      stepUps: Array.from({ length: 5 }, (_, i) => ({
        userId: adminPrincipal.userId,
        familyId: adminPrincipal.familyId,
        accessSessionId: adminPrincipal.accessSessionId,
        outcome: "DENIED",
        expiresAt: null,
        createdAt: new Date(NOW.getTime() - i * 1000 - 1),
      })),
    },
  });
  const { application: rateLimited } = buildApplication({
    repository: bounded,
  });
  await assert.rejects(
    rateLimited.stepUp({
      actor: adminPrincipal,
      password: "correct-password",
      now: NOW,
    }),
    AdminStepUpDeniedError,
  );
});

test("EF-620 keyset pages emit the last-row cursor only when the page is full", async () => {
  const rows = Array.from({ length: 3 }, (_, i) => ({
    membershipId: uuid(i + 1),
    organizationId: uuid(10),
    organizationName: `مكتب ${i}`,
    userId: uuid(i + 30),
    role: "BROKER",
    status: "PENDING",
    createdAt: new Date(NOW.getTime() + i * 1000),
    approvedAt: null,
  }));
  const { application } = buildApplication({
    repository: fakeRepository({ pendingBrokers: rows }),
  });
  const full = await application.listPendingBrokers({
    actor: adminPrincipal,
    limit: 2,
  });
  assert.equal(full.items.length, 2);
  assert.ok(full.nextCursor);
  const rest = await application.listPendingBrokers({
    actor: adminPrincipal,
    cursor: full.nextCursor,
    limit: 2,
  });
  assert.equal(rest.items.length, 1);
  assert.equal(rest.nextCursor, null);
  const single = await application.listPendingBrokers({
    actor: adminPrincipal,
    limit: 100,
  });
  assert.equal(single.items.length, 3);
  assert.equal(single.nextCursor, null);
});

test("EF-620 audit search validates its filters and passes them through", async () => {
  const { application, repository } = buildApplication({
    repository: fakeRepository({
      overrides: {
        audit: [
          {
            id: uuid(41),
            action: AdminAction.BROKER_SUSPENDED,
            organizationId: uuid(10),
            targetType: "MEMBERSHIP",
            targetId: uuid(11),
            actorId: adminPrincipal.userId,
            reason: "مخالفة",
            createdAt: NOW,
          },
        ],
      },
    }),
  });
  await assert.rejects(
    application.searchAudit({ actor: adminPrincipal, action: "NOT_AN_ACTION" }),
    AdminValidationError,
  );
  await assert.rejects(
    application.searchAudit({ actor: adminPrincipal, organizationId: "nope" }),
    AdminValidationError,
  );
  const page = await application.searchAudit({
    actor: adminPrincipal,
    action: AdminAction.BROKER_SUSPENDED,
    organizationId: uuid(10),
  });
  assert.equal(page.items.length, 1);
  assert.equal(page.items[0].action, AdminAction.BROKER_SUSPENDED);
  assert.equal(repository.state.audit.length, 1);
});

test("EF-620 failed jobs review stays bounded and org-filterable", async () => {
  const orgA = uuid(30);
  const orgB = uuid(31);
  const failedJobs = [
    {
      id: uuid(40),
      organizationId: orgA,
      ruleId: uuid(41),
      ruleVersion: 1,
      actionType: "CREATE_LEAD_TASK",
      targetType: "LEAD",
      targetId: "lead-1",
      status: "FAILED",
      attemptCount: 3,
      maxAttempts: 5,
      lastErrorKind: "action-permanent-failure",
      lastErrorMessage: "executor rejected the action",
      scheduledFor: NOW,
      startedAt: NOW,
      completedAt: NOW,
      createdAt: NOW,
      updatedAt: NOW,
    },
    {
      id: uuid(42),
      organizationId: orgB,
      ruleId: uuid(43),
      ruleVersion: 1,
      actionType: "CREATE_INTERNAL_NOTIFICATION",
      targetType: "RECEIVABLE",
      targetId: uuid(44),
      status: "FAILED",
      attemptCount: 5,
      maxAttempts: 5,
      lastErrorKind: "action-transient-failure",
      lastErrorMessage: "temporary executor outage",
      scheduledFor: NOW,
      startedAt: NOW,
      completedAt: NOW,
      createdAt: NOW,
      updatedAt: NOW,
    },
  ];
  const { application } = buildApplication({
    repository: fakeRepository({ overrides: { failedJobs } }),
  });
  const all = await application.failedJobs({ actor: adminPrincipal, limit: 1 });
  assert.equal(all.items.length, 1, "bounded page");
  assert.ok(all.nextCursor);
  const orgOnly = await application.failedJobs({
    actor: adminPrincipal,
    organizationId: orgB,
    limit: 10,
  });
  assert.equal(orgOnly.items.length, 1);
  assert.equal(orgOnly.items[0].organizationId, orgB);
});
