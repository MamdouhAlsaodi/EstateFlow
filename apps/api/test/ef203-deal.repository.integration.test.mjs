import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import process from "node:process";
import { URL } from "node:url";
import test from "node:test";
import { PrismaClient } from "@prisma/client";
import { PrismaLeadRepository } from "../dist/features/leads/infrastructure/prisma-lead.repository.js";
import { createLead } from "../dist/features/leads/domain/lead.js";
import {
  assertTablesAreEmpty,
  cleanupDatabase,
} from "./support/cleanup-database.mjs";

const TEST_TABLES = [
  "DealDomainEvent",
  "Deal",
  "LeadTimelineEvent",
  "LeadTask",
  "LeadNote",
  "LeadIdempotencyRecord",
  "Lead",
  "Property",
  "Membership",
  "Organization",
  "User",
];

function hasGuardedTestTarget() {
  const value = process.env.DATABASE_URL;
  if (process.env.ALLOW_DESTRUCTIVE_TESTS !== "1" || !value) return false;
  const parsed = new URL(value);
  return (
    ["postgres:", "postgresql:"].includes(parsed.protocol) &&
    ["127.0.0.1", "localhost", "::1"].includes(parsed.hostname) &&
    parsed.port === "55433" &&
    parsed.username === "estateflow_test" &&
    parsed.pathname === "/estateflow_test"
  );
}

function leadFixture(organizationId, ownerId, leadId, now) {
  return {
    ...createLead({
      id: leadId,
      organizationId,
      ownerId,
      nextAction: "Call",
      source: "WEB",
      now,
    }),
    stage: "QUALIFIED",
    version: 1,
  };
}

function closeWonCommand({
  organizationId,
  lead,
  actor,
  propertyId,
  brokerId,
  key,
  now,
}) {
  return {
    organizationId,
    leadId: lead.id,
    actor,
    idempotencyKey: key,
    expectedVersion: lead.version,
    lead: { ...lead, stage: "CLOSED_WON", version: 2, updatedAt: now },
    deal: {
      id: randomUUID(),
      organizationId,
      leadId: lead.id,
      propertyId,
      brokerId,
      status: "OPEN",
      version: 1,
      createdAt: now,
      updatedAt: now,
    },
    timelineEvent: {
      leadId: lead.id,
      organizationId,
      type: "LEAD_CLOSED_WON",
      occurredAt: now,
      data: { dealId: "pending", propertyId, brokerId },
    },
    event: {
      schemaVersion: 1,
      organizationId,
      dealId: "pending",
      leadId: lead.id,
      propertyId,
      brokerId,
      occurredAt: now,
    },
  };
}

async function seedLead(
  prisma,
  organizationId,
  ownerId,
  leadId,
  now,
  key = randomUUID(),
) {
  const lead = leadFixture(organizationId, ownerId, leadId, now);
  await new PrismaLeadRepository(prisma).createLead({
    lead,
    idempotencyKey: key,
    timelineEvents: [
      {
        leadId,
        organizationId,
        type: "LEAD_CREATED",
        occurredAt: now,
        data: { stage: "QUALIFIED" },
      },
    ],
  });
  return lead;
}

async function countCloseRows(prisma, leadId) {
  return {
    deals: await prisma.deal.count({ where: { leadId } }),
    events: await prisma.dealDomainEvent.count({ where: { deal: { leadId } } }),
    timelines: await prisma.leadTimelineEvent.count({
      where: { leadId, type: { in: ["LEAD_CLOSED_WON", "LEAD_CLOSED_LOST"] } },
    }),
  };
}

test(
  "closeLost atomically persists the trimmed terminal outcome and exact replay/conflicts",
  { skip: !hasGuardedTestTarget() },
  async () => {
    const prisma = new PrismaClient();
    const repository = new PrismaLeadRepository(prisma);
    const organizationId = randomUUID();
    const ownerId = randomUUID();
    const leadId = randomUUID();
    const now = new Date("2026-08-13T12:00:00.000Z");
    const lead = leadFixture(organizationId, ownerId, leadId, now);
    const command = {
      organizationId,
      leadId,
      actor: ownerId,
      idempotencyKey: "close-lost-1",
      expectedVersion: 1,
      lead: { ...lead, stage: "CLOSED_LOST", version: 2, updatedAt: now },
      timelineEvent: {
        leadId,
        organizationId,
        type: "LEAD_CLOSED_LOST",
        occurredAt: now,
        data: { reason: "No budget" },
      },
    };
    try {
      await prisma.$connect();
      await cleanupDatabase(prisma, TEST_TABLES);
      await prisma.organization.create({
        data: { id: organizationId, name: "Org" },
      });
      await prisma.user.create({
        data: { id: ownerId, accountIdentifier: `${ownerId}@test.invalid` },
      });
      await prisma.membership.create({
        data: {
          organizationId,
          userId: ownerId,
          role: "BROKER",
          status: "ACTIVE",
        },
      });
      await seedLead(prisma, organizationId, ownerId, leadId, now, "lead-lost");

      const result = await repository.closeLost(command);
      assert.equal(result.kind, "ok");
      assert.equal(result.lead.stage, "CLOSED_LOST");
      assert.equal(result.lead.version, 2);
      assert.equal(result.timelineEvent.data.reason, "No budget");
      assert.deepEqual(await countCloseRows(prisma, leadId), {
        deals: 0,
        events: 0,
        timelines: 1,
      });
      const replay = await repository.closeLost(command);
      assert.equal(replay.kind, "idempotent-replay");
      assert.equal(replay.lead.stage, "CLOSED_LOST");
      assert.equal(replay.lead.version, 2);
      assert.equal(replay.timelineEvent.data.reason, "No budget");
      assert.deepEqual(
        await repository.closeLost({
          ...command,
          timelineEvent: {
            ...command.timelineEvent,
            data: { reason: "Changed" },
          },
        }),
        { kind: "idempotency-conflict", idempotencyKey: "close-lost-1" },
      );
      assert.deepEqual(
        await repository.closeLost({ ...command, expectedVersion: 2 }),
        { kind: "idempotency-conflict", idempotencyKey: "close-lost-1" },
      );
      assert.deepEqual(await countCloseRows(prisma, leadId), {
        deals: 0,
        events: 0,
        timelines: 1,
      });
    } finally {
      await cleanupDatabase(prisma, TEST_TABLES);
      await assertTablesAreEmpty(prisma, TEST_TABLES);
      await prisma.$disconnect();
    }
  },
);

test(
  "closeWon rejects stale, cross-tenant/missing/archived properties, and invalid broker ownership without disclosure",
  { skip: !hasGuardedTestTarget() },
  async () => {
    const prisma = new PrismaClient();
    const repository = new PrismaLeadRepository(prisma);
    const org = randomUUID();
    const otherOrg = randomUUID();
    const broker = randomUUID();
    const otherBroker = randomUUID();
    const client = randomUUID();
    const now = new Date("2026-08-13T12:00:00.000Z");
    const property = (organizationId, id, status = "ACTIVE") => ({
      id,
      organizationId,
      title: "Home",
      propertyType: "HOUSE",
      addressText: "Street",
      status,
    });
    const cases = [
      ["missing-property", randomUUID(), "BROKER", "ACTIVE", org],
      ["cross-org-property", randomUUID(), "BROKER", "ACTIVE", otherOrg],
      ["archived-property", randomUUID(), "BROKER", "ACTIVE", org],
      ["inactive-broker", randomUUID(), "BROKER", "INACTIVE", org],
      ["non-broker", randomUUID(), "CLIENT", "ACTIVE", org],
    ];
    try {
      await prisma.$connect();
      await cleanupDatabase(prisma, TEST_TABLES);
      await prisma.organization.createMany({
        data: [
          { id: org, name: "Org" },
          { id: otherOrg, name: "Other" },
        ],
      });
      await prisma.user.createMany({
        data: [broker, otherBroker, client].map((id) => ({
          id,
          accountIdentifier: `${id}@test.invalid`,
        })),
      });
      await prisma.membership.createMany({
        data: [
          {
            organizationId: org,
            userId: broker,
            role: "BROKER",
            status: "ACTIVE",
          },
          {
            organizationId: org,
            userId: otherBroker,
            role: "BROKER",
            status: "SUSPENDED",
          },
          {
            organizationId: org,
            userId: client,
            role: "CLIENT",
            status: "ACTIVE",
          },
          {
            organizationId: otherOrg,
            userId: otherBroker,
            role: "BROKER",
            status: "ACTIVE",
          },
        ],
      });
      await prisma.property.createMany({
        data: [
          property(otherOrg, cases[1][1]),
          property(org, cases[2][1], "ARCHIVED"),
          property(org, cases[3][1]),
          property(org, cases[4][1]),
        ],
      });
      for (const [key, propertyId, role, status, propertyOrg] of cases) {
        const lead = await seedLead(
          prisma,
          org,
          broker,
          randomUUID(),
          now,
          `lead-${key}`,
        );
        const brokerId =
          role === "CLIENT"
            ? client
            : status === "INACTIVE"
              ? otherBroker
              : broker;
        const command = closeWonCommand({
          organizationId: org,
          lead,
          actor: broker,
          propertyId,
          brokerId,
          key,
          now,
        });
        const result = await repository.closeWon(command);
        assert.deepEqual(result, { kind: "ownership-conflict" }, key);
        assert.deepEqual(
          await countCloseRows(prisma, lead.id),
          { deals: 0, events: 0, timelines: 0 },
          key,
        );
        assert.equal(
          (await repository.findLead(org, lead.id)).stage,
          "QUALIFIED",
        );
        void propertyOrg;
      }
      const foreignLead = await seedLead(
        prisma,
        otherOrg,
        otherBroker,
        randomUUID(),
        now,
        "foreign-lead",
      );
      assert.deepEqual(
        await repository.closeWon(
          closeWonCommand({
            organizationId: org,
            lead: foreignLead,
            actor: broker,
            propertyId: cases[1][1],
            brokerId: broker,
            key: "foreign-lead-access",
            now,
          }),
        ),
        { kind: "ownership-conflict" },
      );
    } finally {
      await cleanupDatabase(prisma, TEST_TABLES);
      await assertTablesAreEmpty(prisma, TEST_TABLES);
      await prisma.$disconnect();
    }
  },
);

test(
  "closeWon explicitly persists exact Deal, domain event, timeline, and replay rows",
  { skip: !hasGuardedTestTarget() },
  async () => {
    const prisma = new PrismaClient();
    const repository = new PrismaLeadRepository(prisma);
    const organizationId = randomUUID();
    const ownerId = randomUUID();
    const leadId = randomUUID();
    const propertyId = randomUUID();
    const dealId = randomUUID();
    const now = new Date("2026-08-13T13:00:00.000Z");
    try {
      await prisma.$connect();
      await cleanupDatabase(prisma, TEST_TABLES);
      await prisma.organization.create({
        data: { id: organizationId, name: "Org" },
      });
      await prisma.user.create({
        data: { id: ownerId, accountIdentifier: `${ownerId}@test.invalid` },
      });
      await prisma.membership.create({
        data: {
          organizationId,
          userId: ownerId,
          role: "BROKER",
          status: "ACTIVE",
        },
      });
      await prisma.property.create({
        data: {
          id: propertyId,
          organizationId,
          title: "Home",
          propertyType: "HOUSE",
          addressText: "Street",
          status: "ACTIVE",
        },
      });
      const lead = await seedLead(
        prisma,
        organizationId,
        ownerId,
        leadId,
        now,
        "won-exact-lead",
      );
      const command = closeWonCommand({
        organizationId,
        lead,
        actor: ownerId,
        propertyId,
        brokerId: ownerId,
        key: "won-exact",
        now,
      });
      command.deal.id = dealId;
      command.timelineEvent.data.dealId = dealId;
      command.event.dealId = dealId;

      const result = await repository.closeWon(command);
      assert.equal(result.kind, "ok");
      assert.deepEqual(result.lead, {
        ...lead,
        stage: "CLOSED_WON",
        version: 2,
        updatedAt: now,
      });
      assert.deepEqual(result.deal, {
        id: dealId,
        organizationId,
        leadId,
        propertyId,
        brokerId: ownerId,
        status: "OPEN",
        version: 1,
        createdAt: now,
        updatedAt: now,
      });
      assert.deepEqual(result.timelineEvent, {
        leadId,
        organizationId,
        type: "LEAD_CLOSED_WON",
        occurredAt: now,
        data: { dealId, propertyId, brokerId: ownerId },
      });
      assert.deepEqual(result.event, {
        schemaVersion: 1,
        organizationId,
        dealId,
        leadId,
        propertyId,
        brokerId: ownerId,
        occurredAt: now,
      });
      assert.deepEqual(
        await prisma.deal.findUnique({
          where: { id: dealId },
          select: {
            id: true,
            organizationId: true,
            leadId: true,
            propertyId: true,
            brokerId: true,
            status: true,
            version: true,
            createdAt: true,
            updatedAt: true,
          },
        }),
        result.deal,
      );
      assert.deepEqual(
        await prisma.leadTimelineEvent.findMany({
          where: { leadId },
          select: {
            organizationId: true,
            leadId: true,
            type: true,
            occurredAt: true,
            data: true,
          },
        }),
        [
          {
            organizationId,
            leadId,
            type: "LEAD_CREATED",
            occurredAt: now,
            data: { stage: "QUALIFIED" },
          },
          {
            organizationId,
            leadId,
            type: "LEAD_CLOSED_WON",
            occurredAt: now,
            data: { dealId, propertyId, brokerId: ownerId },
          },
        ],
      );
      assert.deepEqual(
        await prisma.dealDomainEvent.findMany({
          where: { dealId },
          select: {
            organizationId: true,
            dealId: true,
            type: true,
            schemaVersion: true,
            occurredAt: true,
            data: true,
          },
        }),
        [
          {
            organizationId,
            dealId,
            type: "DEAL_CLOSED_WON",
            schemaVersion: 1,
            occurredAt: now,
            data: {
              schemaVersion: 1,
              organizationId,
              dealId,
              leadId,
              propertyId,
              brokerId: ownerId,
              occurredAt: now.toISOString(),
            },
          },
        ],
      );
      const replay = await repository.closeWon(command);
      assert.equal(replay.kind, "idempotent-replay");
      assert.deepEqual(replay, { ...result, kind: "idempotent-replay" });
      assert.deepEqual(await countCloseRows(prisma, leadId), {
        deals: 1,
        events: 1,
        timelines: 1,
      });
    } finally {
      await cleanupDatabase(prisma, TEST_TABLES);
      await assertTablesAreEmpty(prisma, TEST_TABLES);
      await prisma.$disconnect();
    }
  },
);

test(
  "closeWon stale expectedVersion returns conflict without mutating valid fixture",
  { skip: !hasGuardedTestTarget() },
  async () => {
    const prisma = new PrismaClient();
    const repository = new PrismaLeadRepository(prisma);
    const organizationId = randomUUID();
    const ownerId = randomUUID();
    const leadId = randomUUID();
    const propertyId = randomUUID();
    const now = new Date("2026-08-13T14:00:00.000Z");
    try {
      await prisma.$connect();
      await cleanupDatabase(prisma, TEST_TABLES);
      await prisma.organization.create({
        data: { id: organizationId, name: "Org" },
      });
      await prisma.user.create({
        data: { id: ownerId, accountIdentifier: `${ownerId}@test.invalid` },
      });
      await prisma.membership.create({
        data: {
          organizationId,
          userId: ownerId,
          role: "BROKER",
          status: "ACTIVE",
        },
      });
      await prisma.property.create({
        data: {
          id: propertyId,
          organizationId,
          title: "Home",
          propertyType: "HOUSE",
          addressText: "Street",
          status: "ACTIVE",
        },
      });
      const lead = await seedLead(
        prisma,
        organizationId,
        ownerId,
        leadId,
        now,
        "won-stale-lead",
      );
      const command = closeWonCommand({
        organizationId,
        lead,
        actor: ownerId,
        propertyId,
        brokerId: ownerId,
        key: "won-stale",
        now,
      });
      const result = await repository.closeWon({
        ...command,
        expectedVersion: 2,
      });
      assert.deepEqual(result, {
        kind: "stale-version-conflict",
        expectedVersion: 2,
        actualVersion: 1,
      });
      assert.deepEqual(await repository.findLead(organizationId, leadId), lead);
      assert.deepEqual(await countCloseRows(prisma, leadId), {
        deals: 0,
        events: 0,
        timelines: 0,
      });
    } finally {
      await cleanupDatabase(prisma, TEST_TABLES);
      await assertTablesAreEmpty(prisma, TEST_TABLES);
      await prisma.$disconnect();
    }
  },
);

test(
  "terminal leads reject child creation and task transitions without mutation or timeline additions",
  { skip: !hasGuardedTestTarget() },
  async () => {
    const prisma = new PrismaClient();
    const repository = new PrismaLeadRepository(prisma);
    const organizationId = randomUUID();
    const ownerId = randomUUID();
    const leadId = randomUUID();
    const now = new Date("2026-08-13T12:00:00.000Z");
    try {
      await prisma.$connect();
      await cleanupDatabase(prisma, TEST_TABLES);
      await prisma.organization.create({
        data: { id: organizationId, name: "Org" },
      });
      await prisma.user.create({
        data: { id: ownerId, accountIdentifier: `${ownerId}@test.invalid` },
      });
      await prisma.membership.create({
        data: {
          organizationId,
          userId: ownerId,
          role: "BROKER",
          status: "ACTIVE",
        },
      });
      const lead = await seedLead(
        prisma,
        organizationId,
        ownerId,
        leadId,
        now,
        "lead-terminal",
      );
      const task = {
        id: randomUUID(),
        organizationId,
        leadId,
        title: "Call owner",
        dueAt: new Date("2026-08-14T12:00:00.000Z"),
        status: "OPEN",
        createdByUserId: ownerId,
        createdAt: now,
        completedAt: null,
        version: 1,
      };
      await repository.createLeadTask({
        organizationId,
        leadId,
        createdByUserId: ownerId,
        idempotencyKey: "task-before-close",
        task,
        timelineEvent: {
          leadId,
          organizationId,
          type: "LEAD_TASK_CREATED",
          occurredAt: now,
          data: { taskId: task.id },
        },
      });
      const propertyId = randomUUID();
      await prisma.property.create({
        data: {
          id: propertyId,
          organizationId,
          title: "Home",
          propertyType: "HOUSE",
          addressText: "Street",
          status: "ACTIVE",
        },
      });
      const won = closeWonCommand({
        organizationId,
        lead,
        actor: ownerId,
        propertyId,
        brokerId: ownerId,
        key: "close-terminal",
        now,
      });
      won.timelineEvent.data.dealId = won.deal.id;
      won.event.dealId = won.deal.id;
      assert.equal((await repository.closeWon(won)).kind, "ok");
      const before = await countCloseRows(prisma, leadId);
      const note = {
        id: randomUUID(),
        organizationId,
        leadId,
        body: "late",
        createdByUserId: ownerId,
        createdAt: now,
      };
      assert.deepEqual(
        await repository.createLeadNote({
          organizationId,
          leadId,
          createdByUserId: ownerId,
          idempotencyKey: "late-note",
          note,
          timelineEvent: {
            leadId,
            organizationId,
            type: "LEAD_NOTE_ADDED",
            occurredAt: now,
            data: { noteId: note.id },
          },
        }),
        { kind: "ownership-conflict" },
      );
      const lateTask = { ...task, id: randomUUID(), title: "late" };
      assert.deepEqual(
        await repository.createLeadTask({
          organizationId,
          leadId,
          createdByUserId: ownerId,
          idempotencyKey: "late-task",
          task: lateTask,
          timelineEvent: {
            leadId,
            organizationId,
            type: "LEAD_TASK_CREATED",
            occurredAt: now,
            data: { taskId: lateTask.id },
          },
        }),
        { kind: "ownership-conflict" },
      );
      const completed = {
        ...task,
        status: "COMPLETED",
        completedAt: now,
        version: 2,
      };
      const transition = {
        organizationId,
        leadId,
        idempotencyKey: "late-complete",
        expectedVersion: 1,
        task: completed,
        timelineEvent: {
          leadId,
          organizationId,
          type: "LEAD_TASK_COMPLETED",
          occurredAt: now,
          data: { taskId: task.id },
        },
      };
      assert.deepEqual(await repository.completeLeadTask(transition), {
        kind: "ownership-conflict",
      });
      assert.deepEqual(
        await repository.rescheduleLeadTask({
          ...transition,
          idempotencyKey: "late-reschedule",
          task: {
            ...task,
            dueAt: new Date("2026-08-15T12:00:00.000Z"),
            version: 2,
          },
          timelineEvent: {
            ...transition.timelineEvent,
            type: "LEAD_TASK_RESCHEDULED",
          },
        }),
        { kind: "ownership-conflict" },
      );
      assert.deepEqual(
        await prisma.leadTask.findUnique({
          where: { id: task.id },
          select: { status: true, dueAt: true, version: true },
        }),
        { status: "OPEN", dueAt: task.dueAt, version: 1 },
      );
      assert.deepEqual(await countCloseRows(prisma, leadId), before);
      assert.equal(
        await prisma.leadTimelineEvent.count({ where: { leadId } }),
        3,
      );
    } finally {
      await cleanupDatabase(prisma, TEST_TABLES);
      await assertTablesAreEmpty(prisma, TEST_TABLES);
      await prisma.$disconnect();
    }
  },
);
