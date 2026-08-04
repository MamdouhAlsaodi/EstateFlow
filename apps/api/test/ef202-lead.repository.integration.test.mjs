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
      const second = await repository.createLead({ lead: secondLead, idempotencyKey: "create-2", timelineEvents: [event(secondLead, "LEAD_CREATED", secondLead.createdAt, { stage: "NEW" })] });
      assert.equal(second.kind, "ok");
      const firstPage = await repository.listLeads(organizationId, { stage: "NEW", limit: 1 });
      assert.equal(firstPage.items.length, 1);
      assert.ok(firstPage.nextCursor);
      const secondPage = await repository.listLeads(organizationId, { stage: "NEW", cursor: firstPage.nextCursor, limit: 1 });
      assert.equal(secondPage.items.length, 1);
      assert.equal(secondPage.nextCursor, null);
      assert.deepEqual((await repository.listLeads(otherOrganizationId, {})).items, []);
      assert.deepEqual((await repository.listLeads(organizationId, { stage: "QUALIFIED" })).items, []);
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
