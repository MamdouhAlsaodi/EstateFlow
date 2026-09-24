import assert from "node:assert/strict";
import process from "node:process";
import { URL } from "node:url";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { PrismaClient } from "@prisma/client";
import { PrismaViewingRepository } from "../dist/features/viewings/infrastructure/prisma-viewing.repository.js";
import { ViewingAutomationKind } from "../dist/features/automation/domain/viewing-automation.js";
import {
  cleanupDatabase,
  assertTablesAreEmpty,
} from "./support/cleanup-database.mjs";

const expectedPort = process.env.ESTATEFLOW_TEST_DB_PORT ?? "55433";
const guarded =
  process.env.ALLOW_DESTRUCTIVE_TESTS === "1" &&
  (() => {
    if (!process.env.DATABASE_URL) return false;
    const url = new URL(process.env.DATABASE_URL);
    return (
      ["postgres:", "postgresql:"].includes(url.protocol) &&
      ["127.0.0.1", "localhost", "::1"].includes(url.hostname) &&
      url.port === expectedPort &&
      url.username === "estateflow_test" &&
      url.pathname === "/estateflow_test"
    );
  })();
const TABLES = [
  "ViewingAutomationOccurrence",
  "ViewingTransition",
  "Viewing",
  "BrokerAvailabilityException",
  "BrokerAvailabilityRule",
  "LeadTimelineEvent",
  "LeadIdempotencyRecord",
  "Property",
  "Lead",
  "Membership",
  "Organization",
  "User",
];
const id = () => randomUUID();

test(
  "EF-502 repository voids old reminder occurrences and creates reset occurrences",
  { skip: !guarded },
  async () => {
    const prisma = new PrismaClient();
    const repository = new PrismaViewingRepository(prisma);
    const ids = {
      organizationId: id(),
      ownerId: id(),
      brokerId: id(),
      leadId: id(),
      propertyId: id(),
      viewingId: id(),
    };
    const createdAt = new Date("2026-10-05T09:00:00.000Z");
    try {
      await cleanupDatabase(prisma, TABLES);
      await prisma.user.createMany({
        data: [
          {
            id: ids.ownerId,
            accountIdentifier: `${ids.ownerId}@ef502.test.invalid`,
            verifiedAt: createdAt,
          },
          {
            id: ids.brokerId,
            accountIdentifier: `${ids.brokerId}@ef502.test.invalid`,
            verifiedAt: createdAt,
          },
        ],
      });
      await prisma.organization.create({
        data: { id: ids.organizationId, name: "EF502 synthetic" },
      });
      await prisma.membership.createMany({
        data: [
          {
            organizationId: ids.organizationId,
            userId: ids.ownerId,
            role: "OWNER",
            status: "ACTIVE",
          },
          {
            organizationId: ids.organizationId,
            userId: ids.brokerId,
            role: "BROKER",
            status: "ACTIVE",
          },
        ],
      });
      await prisma.lead.create({
        data: {
          id: ids.leadId,
          organizationId: ids.organizationId,
          ownerId: ids.ownerId,
          nextAction: "viewing",
          source: "EF502",
        },
      });
      await prisma.property.create({
        data: {
          id: ids.propertyId,
          organizationId: ids.organizationId,
          title: "EF502 home",
          propertyType: "HOME",
          addressText: "Synthetic",
          status: "ACTIVE",
        },
      });
      await prisma.brokerAvailabilityRule.createMany({
        data: [2, 3].map((weekday) => ({
          organizationId: ids.organizationId,
          brokerId: ids.brokerId,
          weekday,
          startMinute: 0,
          endMinute: 1440,
          timezone: "UTC",
          createdBy: ids.ownerId,
        })),
      });
      const firstStart = new Date("2026-10-06T10:00:00.000Z");
      const created = await repository.createViewing({
        id: ids.viewingId,
        organizationId: ids.organizationId,
        leadId: ids.leadId,
        propertyId: ids.propertyId,
        brokerId: ids.brokerId,
        requestedByUserId: ids.ownerId,
        startAt: firstStart,
        endAt: new Date("2026-10-06T11:00:00.000Z"),
        createdAt,
      });
      assert.equal(created.viewing.status, "REQUESTED");
      await repository.confirmViewing({
        organizationId: ids.organizationId,
        viewingId: ids.viewingId,
        actorId: ids.ownerId,
        at: createdAt,
      });
      const first = await prisma.$queryRaw`
        SELECT "id", "kind", "status" FROM "ViewingAutomationOccurrence"
        WHERE "organizationId" = ${ids.organizationId}::uuid AND "viewingId" = ${ids.viewingId}::uuid
        ORDER BY "kind" ASC`;
      assert.deepEqual(
        first.map((row) => [row.kind, row.status]),
        [
          [ViewingAutomationKind.REMINDER_1H, "PENDING"],
          [ViewingAutomationKind.REMINDER_24H, "PENDING"],
        ],
      );
      const firstIds = new Set(first.map((row) => row.id));

      await repository.rescheduleViewing({
        organizationId: ids.organizationId,
        viewingId: ids.viewingId,
        startAt: new Date("2026-10-07T10:00:00.000Z"),
        endAt: new Date("2026-10-07T11:00:00.000Z"),
        actorId: ids.ownerId,
        at: new Date("2026-10-05T10:00:00.000Z"),
      });
      const reset = await prisma.$queryRaw`
        SELECT "id", "kind", "status" FROM "ViewingAutomationOccurrence"
        WHERE "organizationId" = ${ids.organizationId}::uuid AND "viewingId" = ${ids.viewingId}::uuid
        ORDER BY "occurrenceKey" ASC, "kind" ASC`;
      assert.equal(reset.filter((row) => row.status === "VOIDED").length, 2);
      const pending = reset.filter((row) => row.status === "PENDING");
      assert.equal(pending.length, 2);
      assert.equal(
        pending.every((row) => !firstIds.has(row.id)),
        true,
      );

      const cancelled = await repository.transitionViewing({
        organizationId: ids.organizationId,
        viewingId: ids.viewingId,
        action: "CANCELLED",
        actorId: ids.ownerId,
        at: new Date("2026-10-05T11:00:00.000Z"),
      });
      assert.equal(cancelled.viewing.status, "CANCELLED");
      const pendingCount = await prisma.$queryRaw`
        SELECT COUNT(*)::int AS count FROM "ViewingAutomationOccurrence"
        WHERE "organizationId" = ${ids.organizationId}::uuid AND "viewingId" = ${ids.viewingId}::uuid AND "status" = 'PENDING'`;
      assert.equal(pendingCount[0].count, 0);
    } finally {
      await cleanupDatabase(prisma, TABLES);
      await assertTablesAreEmpty(prisma, TABLES);
      await prisma.$disconnect();
    }
  },
);
