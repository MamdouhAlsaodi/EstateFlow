import test from "node:test";
import assert from "node:assert/strict";
import { PrismaLeadRepository } from "../dist/features/leads/infrastructure/prisma-lead.repository.js";

test("PrismaLeadRepository exposes the lead and CRM-04 repository behavior", () => {
  assert.equal(typeof PrismaLeadRepository, "function");
  for (const method of [
    "createLeadNote",
    "createLeadTask",
    "findLeadTask",
    "completeLeadTask",
    "rescheduleLeadTask",
  ]) {
    assert.equal(
      typeof PrismaLeadRepository.prototype[method],
      "function",
      method,
    );
  }
});

test("listLeads applies organization, stable cursor ordering, stage filter and bounded page", async () => {
  const calls = [];
  const rows = [
    {
      id: "lead-1",
      organizationId: "org-1",
      ownerId: "user-1",
      stage: "QUALIFIED",
      nextAction: "Call",
      source: "WEB",
      utm: null,
      version: 1,
      createdAt: new Date("2026-08-04T12:00:00.000Z"),
      updatedAt: new Date("2026-08-04T12:00:00.000Z"),
    },
    {
      id: "lead-2",
      organizationId: "org-1",
      ownerId: "user-2",
      stage: "QUALIFIED",
      nextAction: "Email",
      source: "REFERRAL",
      utm: null,
      version: 1,
      createdAt: new Date("2026-08-04T12:01:00.000Z"),
      updatedAt: new Date("2026-08-04T12:01:00.000Z"),
    },
  ];
  const repository = new PrismaLeadRepository({
    lead: {
      async findMany(args) {
        calls.push(args);
        return rows;
      },
    },
  });
  const page = await repository.listLeads("org-1", {
    stage: "QUALIFIED",
    cursor: "lead-0",
    limit: 1,
  });
  assert.equal(page.items.length, 1);
  assert.equal(page.items[0].id, "lead-1");
  assert.equal(page.nextCursor, "lead-1");
  assert.deepEqual(calls[0], {
    where: { organizationId: "org-1", stage: "QUALIFIED" },
    orderBy: { id: "asc" },
    cursor: { id: "lead-0" },
    skip: 1,
    take: 2,
  });
});

test("listLeads returns an empty page without a cursor", async () => {
  const repository = new PrismaLeadRepository({
    lead: {
      async findMany(args) {
        assert.deepEqual(args.where, { organizationId: "org-1" });
        return [];
      },
    },
  });
  assert.deepEqual(await repository.listLeads("org-1", {}), {
    items: [],
    nextCursor: null,
  });
});

test("listLeads rejects invalid stage, cursor and limit safely", async () => {
  const repository = new PrismaLeadRepository({
    lead: {
      async findMany() {
        throw new Error("must not query");
      },
    },
  });
  for (const input of [
    { stage: "INVALID" },
    { cursor: "" },
    { cursor: "x".repeat(256) },
    { limit: 0 },
    { limit: 101 },
    { limit: 1.5 },
  ]) {
    await assert.rejects(
      () => repository.listLeads("org-1", input),
      /Invalid lead list query/,
    );
  }
});

test("findLeadDetail scopes lead and timeline to the organization with stable bounded cursor ordering", async () => {
  const calls = [];
  const lead = {
    id: "lead-1",
    organizationId: "org-1",
    ownerId: "user-1",
    stage: "NEW",
    nextAction: "Call",
    source: "WEB",
    utm: null,
    version: 1,
    createdAt: new Date("2026-08-04T12:00:00.000Z"),
    updatedAt: new Date("2026-08-04T12:00:00.000Z"),
  };
  const events = [
    {
      id: "event-1",
      organizationId: "org-1",
      leadId: "lead-1",
      idempotencyId: "internal-1",
      type: "LEAD_CREATED",
      occurredAt: new Date("2026-08-04T12:00:00.000Z"),
      data: { stage: "NEW" },
    },
    {
      id: "event-2",
      organizationId: "org-1",
      leadId: "lead-1",
      idempotencyId: "internal-2",
      type: "LEAD_ASSIGNED",
      occurredAt: new Date("2026-08-04T12:01:00.000Z"),
      data: { toOwnerId: "user-2" },
    },
  ];
  const repository = new PrismaLeadRepository({
    lead: {
      async findFirst(args) {
        calls.push(["lead", args]);
        return lead;
      },
    },
    leadTimelineEvent: {
      async findMany(args) {
        calls.push(["timeline", args]);
        return events;
      },
    },
    leadNote: {
      async findMany(args) {
        calls.push(["notes", args]);
        return [];
      },
    },
    leadTask: {
      async findMany(args) {
        calls.push(["tasks", args]);
        return [];
      },
    },
  });
  const result = await repository.findLeadDetail("org-1", "lead-1", {
    cursor: "event-0",
    limit: 1,
  });
  assert.equal(result.lead.id, "lead-1");
  assert.equal(result.timeline.items[0].id, "event-1");
  assert.equal(result.timeline.nextCursor, "event-1");
  assert.deepEqual(result.notes, []);
  assert.deepEqual(result.tasks, []);
  assert.deepEqual(calls, [
    ["lead", { where: { organizationId: "org-1", id: "lead-1" } }],
    [
      "timeline",
      {
        where: { organizationId: "org-1", leadId: "lead-1" },
        orderBy: [{ occurredAt: "asc" }, { id: "asc" }],
        cursor: { id: "event-0" },
        skip: 1,
        take: 2,
      },
    ],
    [
      "notes",
      {
        where: { organizationId: "org-1", leadId: "lead-1" },
        select: { id: true, body: true, createdAt: true },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: 50,
      },
    ],
    [
      "tasks",
      {
        where: { organizationId: "org-1", leadId: "lead-1" },
        select: {
          id: true,
          title: true,
          dueAt: true,
          status: true,
          createdAt: true,
          completedAt: true,
          version: true,
        },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: 50,
      },
    ],
  ]);
  assert.equal("idempotencyId" in result.timeline.items[0], false);
});

test("findLead always applies the organization boundary", async () => {
  const calls = [];
  const row = {
    id: "lead-1",
    organizationId: "org-1",
    ownerId: "user-1",
    stage: "NEW",
    nextAction: "Call",
    source: "WEBSITE",
    utm: null,
    version: 1,
    createdAt: new Date("2026-08-04T12:00:00.000Z"),
    updatedAt: new Date("2026-08-04T12:00:00.000Z"),
  };
  const repository = new PrismaLeadRepository({
    lead: {
      async findFirst(args) {
        calls.push(args);
        return args.where.organizationId === "org-1" ? row : null;
      },
    },
  });
  assert.equal(
    (await repository.findLead("org-1", "lead-1")).organizationId,
    "org-1",
  );
  assert.equal(await repository.findLead("org-2", "lead-1"), null);
  assert.deepEqual(
    calls.map(({ where }) => where),
    [
      { organizationId: "org-1", id: "lead-1" },
      { organizationId: "org-2", id: "lead-1" },
    ],
  );
});
