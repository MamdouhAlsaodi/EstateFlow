import assert from "node:assert/strict";
import process from "node:process";
import { URL } from "node:url";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { PrismaClient } from "@prisma/client";
import { PrismaViewingRepository } from "../dist/features/viewings/infrastructure/prisma-viewing.repository.js";
import { ViewingConflictError } from "../dist/features/viewings/domain/viewing.js";
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

function id() {
  return randomUUID();
}

test(
  "EF-501 PostgreSQL exclusion constraint lets exactly one parallel confirmation win and preserves UTC/DST behavior",
  { skip: !guarded },
  async () => {
    const prisma = new PrismaClient();
    const repository = new PrismaViewingRepository(prisma);
    const org = id();
    const user = id();
    const broker = id();
    const lead = id();
    const property = id();
    const now = new Date("2026-11-01T00:00:00.000Z");
    try {
      await cleanupDatabase(prisma, TABLES);
      await prisma.user.createMany({
        data: [
          {
            id: user,
            accountIdentifier: `${user}@test.invalid`,
            verifiedAt: now,
          },
          {
            id: broker,
            accountIdentifier: `${broker}@test.invalid`,
            verifiedAt: now,
          },
        ],
      });
      await prisma.organization.create({
        data: { id: org, name: "EF501 test" },
      });
      await prisma.membership.createMany({
        data: [
          {
            organizationId: org,
            userId: user,
            role: "OWNER",
            status: "ACTIVE",
          },
          {
            organizationId: org,
            userId: broker,
            role: "BROKER",
            status: "ACTIVE",
          },
        ],
      });
      await prisma.lead.create({
        data: {
          id: lead,
          organizationId: org,
          ownerId: user,
          nextAction: "viewing",
          source: "test",
        },
      });
      await prisma.property.create({
        data: {
          id: property,
          organizationId: org,
          title: "DST home",
          propertyType: "HOME",
          addressText: "Synthetic",
          status: "ACTIVE",
        },
      });
      await prisma.brokerAvailabilityRule.create({
        data: {
          organizationId: org,
          brokerId: broker,
          weekday: 0,
          startMinute: 0,
          endMinute: 1440,
          timezone: "America/New_York",
          createdBy: user,
        },
      });
      const start = new Date("2026-11-01T05:30:00.000Z");
      const end = new Date("2026-11-01T06:30:00.000Z");
      const first = await repository.createViewing({
        id: id(),
        organizationId: org,
        leadId: lead,
        propertyId: property,
        brokerId: broker,
        requestedByUserId: user,
        startAt: start,
        endAt: end,
        createdAt: now,
      });
      const second = await repository.createViewing({
        id: id(),
        organizationId: org,
        leadId: lead,
        propertyId: property,
        brokerId: broker,
        requestedByUserId: user,
        startAt: start,
        endAt: end,
        createdAt: now,
      });
      assert.equal(first.viewing.status, "REQUESTED");
      assert.equal(second.viewing.status, "REQUESTED");
      const results = await Promise.allSettled([
        repository.confirmViewing({
          organizationId: org,
          viewingId: first.viewing.id,
          actorId: user,
          at: now,
        }),
        repository.confirmViewing({
          organizationId: org,
          viewingId: second.viewing.id,
          actorId: user,
          at: now,
        }),
      ]);
      const wins = results.filter(
        (result) =>
          result.status === "fulfilled" &&
          result.value.viewing?.status === "CONFIRMED",
      );
      const conflicts = results.filter(
        (result) =>
          result.status === "rejected" &&
          result.reason instanceof ViewingConflictError,
      );
      assert.equal(wins.length, 1);
      assert.equal(conflicts.length, 1);
      assert.equal(
        await prisma.viewing.count({
          where: { organizationId: org, status: "CONFIRMED" },
        }),
        1,
      );
      const timeline = await prisma.leadTimelineEvent.findMany({
        where: { organizationId: org, leadId: lead },
        orderBy: { occurredAt: "asc" },
      });
      assert.ok(timeline.some((event) => event.type === "VIEWING_REQUESTED"));
      assert.ok(timeline.some((event) => event.type === "VIEWING_CONFIRMED"));
      assert.equal(
        await repository.findViewing(id(), first.viewing.id),
        null,
        "foreign id lookup remains tenant-safe",
      );
    } finally {
      await cleanupDatabase(prisma, TABLES);
      await assertTablesAreEmpty(prisma, TABLES);
      await prisma.$disconnect();
    }
  },
);
