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
  "LeadTimelineEvent",
  "LeadTask",
  "LeadNote",
  "LeadIdempotencyRecord",
  "Lead",
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

function event(lead, type, occurredAt, data) {
  return {
    leadId: lead.id,
    organizationId: lead.organizationId,
    type,
    occurredAt,
    data,
  };
}

test(
  "Prisma lead repository atomically persists create/replay, conflicts, ownership, and append-only timeline",
  { skip: !hasGuardedTestTarget() },
  async () => {
    const prisma = new PrismaClient();
    const repository = new PrismaLeadRepository(prisma);
    const organizationId = randomUUID();
    const otherOrganizationId = randomUUID();
    const ownerId = randomUUID();
    const otherOwnerId = randomUUID();
    const leadId = randomUUID();
    const now = new Date("2026-08-04T12:00:00.000Z");
    const lead = createLead({
      id: leadId,
      organizationId,
      ownerId,
      nextAction: "Call",
      source: "WEBSITE",
      utm: { campaign: "summer" },
      now,
    });
    const createdEvent = event(lead, "LEAD_CREATED", now, { stage: "NEW" });
    const secondLead = createLead({
      id: randomUUID(),
      organizationId,
      ownerId,
      nextAction: "Email",
      source: "REFERRAL",
      now: new Date("2026-08-04T12:02:00.000Z"),
    });
    try {
      await prisma.$connect();
      await cleanupDatabase(prisma, TEST_TABLES);
      await prisma.organization.createMany({
        data: [
          { id: organizationId, name: "Org One" },
          { id: otherOrganizationId, name: "Org Two" },
        ],
      });
      await prisma.user.createMany({
        data: [
          { id: ownerId, accountIdentifier: `${ownerId}@test.invalid` },
          {
            id: otherOwnerId,
            accountIdentifier: `${otherOwnerId}@test.invalid`,
          },
        ],
      });
      await prisma.membership.createMany({
        data: [
          { organizationId, userId: ownerId, role: "BROKER", status: "ACTIVE" },
          {
            organizationId: otherOrganizationId,
            userId: otherOwnerId,
            role: "BROKER",
            status: "ACTIVE",
          },
        ],
      });

      const first = await repository.createLead({
        lead,
        idempotencyKey: "create-1",
        timelineEvents: [createdEvent],
      });
      assert.equal(first.kind, "ok");
      const second = await repository.createLead({
        lead: secondLead,
        idempotencyKey: "create-2",
        timelineEvents: [
          event(secondLead, "LEAD_CREATED", secondLead.createdAt, {
            stage: "NEW",
          }),
        ],
      });
      assert.equal(second.kind, "ok");
      const firstPage = await repository.listLeads(organizationId, {
        stage: "NEW",
        limit: 1,
      });
      assert.equal(firstPage.items.length, 1);
      assert.ok(firstPage.nextCursor);
      const secondPage = await repository.listLeads(organizationId, {
        stage: "NEW",
        cursor: firstPage.nextCursor,
        limit: 1,
      });
      assert.equal(secondPage.items.length, 1);
      assert.equal(secondPage.nextCursor, null);
      assert.deepEqual(
        (await repository.listLeads(otherOrganizationId, {})).items,
        [],
      );
      assert.deepEqual(
        (await repository.listLeads(organizationId, { stage: "QUALIFIED" }))
          .items,
        [],
      );
      const replay = await repository.createLead({
        lead,
        idempotencyKey: "create-1",
        timelineEvents: [createdEvent],
      });
      assert.equal(replay.kind, "idempotent-replay");
      assert.equal(
        await prisma.leadTimelineEvent.count({ where: { leadId } }),
        1,
      );
      assert.deepEqual(
        await repository.createLead({
          lead: { ...lead, source: "REFERRAL" },
          idempotencyKey: "create-1",
          timelineEvents: [createdEvent],
        }),
        { kind: "idempotency-conflict", idempotencyKey: "create-1" },
      );

      const changed = {
        ...lead,
        nextAction: "Email",
        version: 2,
        updatedAt: new Date("2026-08-04T12:01:00.000Z"),
      };
      const updated = await repository.updateLead({
        organizationId,
        leadId,
        expectedVersion: 1,
        idempotencyKey: "update-1",
        lead: changed,
        timelineEvents: [
          event(changed, "LEAD_NEXT_ACTION_CHANGED", changed.updatedAt, {
            to: "Email",
          }),
        ],
      });
      assert.equal(updated.kind, "ok");
      assert.deepEqual(
        await repository.updateLead({
          organizationId,
          leadId,
          expectedVersion: 1,
          idempotencyKey: "update-stale",
          lead: { ...changed, nextAction: "Other" },
          timelineEvents: [],
        }),
        {
          kind: "stale-version-conflict",
          expectedVersion: 1,
          actualVersion: 2,
        },
      );
      assert.deepEqual(
        await repository.findLead(organizationId, leadId),
        changed,
      );
      assert.equal(
        await repository.findLead(otherOrganizationId, leadId),
        null,
      );

      await repository.appendTimelineEvents([
        event(changed, "LEAD_ASSIGNED", now, { toOwnerId: ownerId }),
      ]);
      const detail = await repository.findLeadDetail(organizationId, leadId, {
        limit: 2,
      });
      assert.equal(detail.lead.id, leadId);
      assert.equal(detail.timeline.items.length, 2);
      assert.ok(detail.timeline.nextCursor);
      assert.equal("idempotencyId" in detail.timeline.items[0], false);
      assert.equal(
        await prisma.leadTimelineEvent.count({ where: { leadId } }),
        3,
      );
      assert.equal("deleteTimelineEvents" in repository, false);
    } finally {
      await cleanupDatabase(prisma, TEST_TABLES);
      await assertTablesAreEmpty(prisma, TEST_TABLES);
      await prisma.$disconnect();
    }
  },
);

test(
  "Prisma CRM-04 repository persists scoped note/task commands atomically with replay and task transitions",
  { skip: !hasGuardedTestTarget() },
  async () => {
    const prisma = new PrismaClient();
    const repository = new PrismaLeadRepository(prisma);
    const organizationId = randomUUID();
    const otherOrganizationId = randomUUID();
    const ownerId = randomUUID();
    const otherOwnerId = randomUUID();
    const leadId = randomUUID();
    const now = new Date("2026-08-04T12:00:00.000Z");
    const lead = createLead({
      id: leadId,
      organizationId,
      ownerId,
      nextAction: "Call",
      source: "WEB",
      now,
    });
    const otherLead = createLead({
      id: randomUUID(),
      organizationId: otherOrganizationId,
      ownerId: otherOwnerId,
      nextAction: "Call",
      source: "WEB",
      now,
    });
    try {
      await prisma.$connect();
      await cleanupDatabase(prisma, TEST_TABLES);
      await prisma.organization.createMany({
        data: [
          { id: organizationId, name: "Org One" },
          { id: otherOrganizationId, name: "Org Two" },
        ],
      });
      await prisma.user.createMany({
        data: [
          { id: ownerId, accountIdentifier: `${ownerId}@test.invalid` },
          {
            id: otherOwnerId,
            accountIdentifier: `${otherOwnerId}@test.invalid`,
          },
        ],
      });
      await prisma.membership.createMany({
        data: [
          { organizationId, userId: ownerId, role: "BROKER", status: "ACTIVE" },
          {
            organizationId: otherOrganizationId,
            userId: otherOwnerId,
            role: "BROKER",
            status: "ACTIVE",
          },
        ],
      });
      await repository.createLead({
        lead,
        idempotencyKey: "lead-1",
        timelineEvents: [event(lead, "LEAD_CREATED", now, { stage: "NEW" })],
      });
      await repository.createLead({
        lead: otherLead,
        idempotencyKey: "lead-2",
        timelineEvents: [
          event(otherLead, "LEAD_CREATED", now, { stage: "NEW" }),
        ],
      });

      const note = {
        id: randomUUID(),
        organizationId,
        leadId,
        body: "Important note",
        createdByUserId: ownerId,
        createdAt: now,
      };
      const noteEvent = event(lead, "LEAD_NOTE_ADDED", now, {
        noteId: note.id,
      });
      const noteCommand = {
        organizationId,
        leadId,
        createdByUserId: ownerId,
        idempotencyKey: "note-1",
        note,
        timelineEvent: noteEvent,
      };
      assert.equal((await repository.createLeadNote(noteCommand)).kind, "ok");
      assert.equal(
        (await repository.createLeadNote(noteCommand)).kind,
        "idempotent-replay",
      );
      assert.deepEqual(
        await repository.createLeadNote({
          ...noteCommand,
          note: { ...note, body: "Changed" },
        }),
        { kind: "idempotency-conflict", idempotencyKey: "note-1" },
      );
      assert.equal(
        await prisma.leadNote.count({ where: { organizationId, leadId } }),
        1,
      );
      assert.equal(
        await prisma.leadTimelineEvent.count({
          where: { organizationId, leadId, type: "LEAD_NOTE_ADDED" },
        }),
        1,
      );

      const task = {
        id: randomUUID(),
        organizationId,
        leadId,
        title: "Call owner",
        dueAt: new Date("2026-08-05T12:00:00.000Z"),
        status: "OPEN",
        createdByUserId: ownerId,
        createdAt: now,
        completedAt: null,
        version: 1,
      };
      const taskCommand = {
        organizationId,
        leadId,
        createdByUserId: ownerId,
        idempotencyKey: "task-1",
        task,
        timelineEvent: event(lead, "LEAD_TASK_CREATED", now, {
          taskId: task.id,
          dueAt: task.dueAt.toISOString(),
        }),
      };
      assert.equal((await repository.createLeadTask(taskCommand)).kind, "ok");
      assert.equal(
        (await repository.createLeadTask(taskCommand)).kind,
        "idempotent-replay",
      );
      assert.deepEqual(
        await repository.findLeadTask(otherOrganizationId, leadId, task.id),
        null,
      );
      assert.deepEqual(
        await repository.completeLeadTask({
          ...taskCommand,
          expectedVersion: 9,
        }),
        {
          kind: "stale-version-conflict",
          expectedVersion: 9,
          actualVersion: 1,
        },
      );
      const rescheduledTask = {
        ...task,
        dueAt: new Date("2026-08-06T12:00:00.000Z"),
        version: 2,
      };
      const rescheduleCommand = {
        ...taskCommand,
        idempotencyKey: "reschedule-1",
        expectedVersion: 1,
        task: rescheduledTask,
        timelineEvent: event(
          lead,
          "LEAD_TASK_RESCHEDULED",
          new Date("2026-08-04T12:30:00.000Z"),
          {
            taskId: task.id,
            fromDueAt: task.dueAt.toISOString(),
            toDueAt: rescheduledTask.dueAt.toISOString(),
          },
        ),
      };
      assert.equal(
        (await repository.rescheduleLeadTask(rescheduleCommand)).kind,
        "ok",
      );
      assert.equal(
        (await repository.rescheduleLeadTask(rescheduleCommand)).kind,
        "idempotent-replay",
      );
      const completedTask = {
        ...rescheduledTask,
        status: "COMPLETED",
        completedAt: new Date("2026-08-04T13:00:00.000Z"),
        version: 3,
      };
      const completedCommand = {
        ...taskCommand,
        idempotencyKey: "complete-1",
        expectedVersion: 2,
        task: completedTask,
        timelineEvent: event(
          lead,
          "LEAD_TASK_COMPLETED",
          completedTask.completedAt,
          {
            taskId: task.id,
            completedAt: completedTask.completedAt.toISOString(),
          },
        ),
      };
      assert.equal(
        (await repository.completeLeadTask(completedCommand)).kind,
        "ok",
      );
      assert.deepEqual(
        await repository.rescheduleLeadTask({
          ...completedCommand,
          idempotencyKey: "reschedule-2",
          expectedVersion: 3,
        }),
        { kind: "ownership-conflict" },
      );
      assert.deepEqual(
        await repository.completeLeadTask({
          ...completedCommand,
          idempotencyKey: "complete-2",
          expectedVersion: 2,
        }),
        { kind: "ownership-conflict" },
      );
      const detail = await repository.findLeadDetail(
        organizationId,
        leadId,
        {},
      );
      assert.deepEqual(detail.notes, [
        { id: note.id, body: note.body, createdAt: note.createdAt },
      ]);
      assert.deepEqual(detail.tasks, [
        {
          id: task.id,
          title: rescheduledTask.title,
          dueAt: rescheduledTask.dueAt,
          status: "COMPLETED",
          createdAt: task.createdAt,
          completedAt: completedTask.completedAt,
          version: 3,
        },
      ]);
      assert.deepEqual(
        await repository.findLeadDetail(otherOrganizationId, leadId, {}),
        null,
      );
      assert.equal(
        (await repository.findLeadDetail(organizationId, otherLead.id, {}))
          ?.notes.length ?? 0,
        0,
      );
      assert.equal(
        await prisma.leadTask.count({ where: { organizationId, leadId } }),
        1,
      );
      assert.equal(
        await prisma.leadTimelineEvent.count({
          where: { organizationId, leadId },
        }),
        5,
      );
      const timelineTypes = await prisma.leadTimelineEvent.findMany({
        where: { organizationId, leadId },
        select: { type: true },
        orderBy: { occurredAt: "asc" },
      });
      assert.deepEqual(
        timelineTypes.map(({ type }) => type),
        [
          "LEAD_CREATED",
          "LEAD_NOTE_ADDED",
          "LEAD_TASK_CREATED",
          "LEAD_TASK_RESCHEDULED",
          "LEAD_TASK_COMPLETED",
        ],
      );
    } finally {
      await cleanupDatabase(prisma, TEST_TABLES);
      await assertTablesAreEmpty(prisma, TEST_TABLES);
      await prisma.$disconnect();
    }
  },
);
