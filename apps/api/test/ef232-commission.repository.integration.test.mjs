import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import process from "node:process";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { PrismaClient } from "@prisma/client";
import { PrismaCommissionRepository } from "../dist/features/finance/infrastructure/prisma-commission.repository.js";
import {
  createDefaultCommissionPlanVersion,
  createCommissionableValue,
  createExpectedAccrual,
} from "../dist/features/finance/domain/commission.js";
import {
  assertTablesAreEmpty,
  cleanupDatabase,
} from "./support/cleanup-database.mjs";

const TABLES = [
  "CommissionAccrualSplit",
  "CommissionAccrual",
  "CommissionableValue",
  "CommissionPlanRecipient",
  "CommissionPlanVersion",
  "DealDomainEvent",
  "Deal",
  "Membership",
  "Organization",
  "User",
];
const guarded =
  process.env.ALLOW_DESTRUCTIVE_TESTS === "1" &&
  process.env.DATABASE_URL?.includes("estateflow_test");
const now = new Date("2026-08-15T12:00:00.000Z");

function plan(organizationId, id = randomUUID(), version = 1) {
  return createDefaultCommissionPlanVersion({ id, organizationId, version });
}
function value(
  organizationId,
  dealId,
  id = randomUUID(),
  capturedBy = randomUUID(),
) {
  return createCommissionableValue({
    id,
    dealId,
    organizationId,
    amountMinor: 10001n,
    currency: "USD",
    capturedBy,
    capturedAt: now,
  });
}

test(
  "EF-232 repository validates persisted kinds and recovers concurrent accruals",
  { skip: !guarded },
  async () => {
    const source = await readFile(
      new URL(
        "../src/features/finance/infrastructure/prisma-commission.repository.ts",
        import.meta.url,
      ),
      "utf8",
    );
    assert.equal(source.includes('as "BROKER" | "OFFICE"'), false);
    assert.match(source, /commissionAccrual\.findUnique[\s\S]*replayed/);
    const prisma = new PrismaClient();
    const repository = new PrismaCommissionRepository(prisma);
    const organizationId = randomUUID();
    const otherOrganizationId = randomUUID();
    const dealId = randomUUID();
    const eventId = randomUUID();
    const planId = randomUUID();
    const valueId = randomUUID();
    const accrualId = randomUUID();
    try {
      await prisma.$connect();
      await cleanupDatabase(prisma, TABLES);
      await prisma.organization.createMany({
        data: [
          { id: organizationId, name: "Commission test" },
          { id: otherOrganizationId, name: "Other" },
        ],
      });
      const userId = randomUUID();
      const leadId = randomUUID();
      const propertyId = randomUUID();
      await prisma.user.create({
        data: { id: userId, accountIdentifier: `${userId}@test.invalid` },
      });
      await prisma.membership.create({
        data: { organizationId, userId, role: "BROKER", status: "ACTIVE" },
      });
      await prisma.property.create({
        data: {
          id: propertyId,
          organizationId,
          title: "Test",
          propertyType: "HOUSE",
          addressText: "Test",
          status: "ACTIVE",
        },
      });
      await prisma.$executeRaw`INSERT INTO "Lead" ("id", "organizationId", "ownerId", "stage", "nextAction", "source", "version", "createdAt", "updatedAt") VALUES (${leadId}::uuid, ${organizationId}::uuid, ${userId}::uuid, 'QUALIFIED', 'x', 'x', 1, ${now}, ${now})`;
      await prisma.deal.create({
        data: {
          id: dealId,
          organizationId,
          leadId,
          propertyId,
          brokerId: userId,
        },
      });
      const deal = await prisma.deal.findUniqueOrThrow({
        where: { organizationId_id: { organizationId, id: dealId } },
      });
      const event = await prisma.dealDomainEvent.create({
        data: {
          id: eventId,
          organizationId,
          dealId: deal.id,
          type: "DEAL_CLOSED_WON",
          schemaVersion: 1,
          occurredAt: now,
          data: {},
        },
      });
      const storedPlan = plan(organizationId, planId);
      assert.deepEqual(
        await repository.createPlanVersion({ plan: storedPlan }),
        { kind: "created-plan", plan: storedPlan },
      );
      assert.deepEqual(
        await repository.findPlanVersion(otherOrganizationId, planId),
        null,
      );
      const storedValue = value(organizationId, deal.id, valueId, userId);
      assert.deepEqual(
        await repository.captureCommissionableValue({ value: storedValue }),
        { kind: "captured", value: storedValue },
      );
      const authority = {
        deal: { id: deal.id, organizationId },
        event: {
          id: event.id,
          organizationId,
          dealId: deal.id,
          type: "DEAL_CLOSED_WON",
          schemaVersion: 1,
        },
        value: storedValue,
        plan: storedPlan,
      };
      const expected = createExpectedAccrual({
        id: accrualId,
        ...authority,
        createdAt: now,
      });
      const schemaV2EventId = randomUUID();
      await prisma.dealDomainEvent.create({
        data: {
          id: schemaV2EventId,
          organizationId,
          dealId: deal.id,
          type: "DEAL_CLOSED_WON",
          schemaVersion: 2,
          occurredAt: now,
          data: {},
        },
      });
      const beforeSchemaV2 = {
        accruals: await prisma.commissionAccrual.count({
          where: { organizationId },
        }),
        splits: await prisma.commissionAccrualSplit.count({
          where: { organizationId },
        }),
      };
      const schemaV2Result = await repository.createExpectedAccrual({
        accrual: {
          ...expected,
          id: randomUUID(),
          dealClosedWonEventId: schemaV2EventId,
        },
      });
      assert.deepEqual(schemaV2Result, {
        kind: "conflict",
        reason: "accrual-ownership-or-event-conflict",
      });
      assert.deepEqual(
        {
          accruals: await prisma.commissionAccrual.count({
            where: { organizationId },
          }),
          splits: await prisma.commissionAccrualSplit.count({
            where: { organizationId },
          }),
        },
        beforeSchemaV2,
      );
      const concurrent = await Promise.all(
        Array.from({ length: 4 }, (_, index) =>
          repository.createExpectedAccrual({
            accrual: {
              ...expected,
              id: index === 0 ? expected.id : randomUUID(),
            },
          }),
        ),
      );
      assert.equal(
        concurrent.filter((result) => result.kind === "created").length,
        1,
      );
      assert.equal(
        concurrent.filter((result) => result.kind === "replayed").length,
        3,
      );
      assert.equal(
        concurrent.some((result) => result.kind === "conflict"),
        false,
      );
      const replay = await repository.createExpectedAccrual({
        accrual: {
          ...expected,
          id: randomUUID(),
          createdAt: new Date(now.getTime() + 1000),
        },
      });
      assert.equal(replay.kind, "replayed");
      assert.equal(
        await prisma.commissionAccrual.count({ where: { organizationId } }),
        1,
      );
      assert.equal(
        await prisma.commissionAccrualSplit.count({
          where: { organizationId },
        }),
        2,
      );

      const secondDealId = randomUUID();
      const secondLeadId = randomUUID();
      const secondPropertyId = randomUUID();
      const secondEventId = randomUUID();
      const secondValueId = randomUUID();
      await prisma.property.create({
        data: {
          id: secondPropertyId,
          organizationId,
          title: "Second",
          propertyType: "HOUSE",
          addressText: "Second",
          status: "ACTIVE",
        },
      });
      await prisma.$executeRaw`INSERT INTO "Lead" ("id", "organizationId", "ownerId", "stage", "nextAction", "source", "version", "createdAt", "updatedAt") VALUES (${secondLeadId}::uuid, ${organizationId}::uuid, ${userId}::uuid, 'QUALIFIED', 'x', 'x', 1, ${now}, ${now})`;
      await prisma.deal.create({
        data: {
          id: secondDealId,
          organizationId,
          leadId: secondLeadId,
          propertyId: secondPropertyId,
          brokerId: userId,
        },
      });
      await prisma.dealDomainEvent.create({
        data: {
          id: secondEventId,
          organizationId,
          dealId: secondDealId,
          type: "DEAL_CLOSED_WON",
          schemaVersion: 1,
          occurredAt: now,
          data: {},
        },
      });
      const twentyValue = createCommissionableValue({
        id: secondValueId,
        dealId: secondDealId,
        organizationId,
        amountMinor: 20n,
        currency: "USD",
        capturedBy: userId,
        capturedAt: now,
      });
      assert.equal(
        (await repository.captureCommissionableValue({ value: twentyValue }))
          .kind,
        "captured",
      );
      const twentyExpected = createExpectedAccrual({
        id: randomUUID(),
        deal: { id: secondDealId, organizationId },
        event: {
          id: secondEventId,
          organizationId,
          dealId: secondDealId,
          type: "DEAL_CLOSED_WON",
          schemaVersion: 1,
        },
        value: twentyValue,
        plan: storedPlan,
        createdAt: now,
      });
      const twentyResult = await repository.createExpectedAccrual({
        accrual: twentyExpected,
      });
      assert.equal(twentyResult.kind, "created");
      assert.equal(twentyResult.accrual.totalMoney.amountMinor, 1n);
      assert.deepEqual(
        twentyResult.accrual.splits.map((split) => split.money.amountMinor),
        [0n, 1n],
      );
      assert.equal(
        twentyResult.accrual.splits.reduce(
          (sum, split) => sum + split.money.amountMinor,
          0n,
        ),
        twentyResult.accrual.totalMoney.amountMinor,
      );

      const beforeCrossDealAuthorityFailures = {
        accruals: await prisma.commissionAccrual.count({
          where: { organizationId },
        }),
        splits: await prisma.commissionAccrualSplit.count({
          where: { organizationId },
        }),
      };
      const originalDealWithSecondEvent =
        await repository.createExpectedAccrual({
          accrual: {
            ...expected,
            id: randomUUID(),
            dealClosedWonEventId: secondEventId,
          },
        });
      assert.deepEqual(originalDealWithSecondEvent, {
        kind: "conflict",
        reason: "accrual-ownership-or-event-conflict",
      });
      const originalDealWithSecondValue =
        await repository.createExpectedAccrual({
          accrual: {
            ...expected,
            id: randomUUID(),
            value: { ...expected.value, id: twentyValue.id },
          },
        });
      assert.deepEqual(originalDealWithSecondValue, {
        kind: "conflict",
        reason: "accrual-ownership-or-event-conflict",
      });
      assert.deepEqual(
        {
          accruals: await prisma.commissionAccrual.count({
            where: { organizationId },
          }),
          splits: await prisma.commissionAccrualSplit.count({
            where: { organizationId },
          }),
        },
        beforeCrossDealAuthorityFailures,
      );

      const beforeAuthorityFailures = await prisma.commissionAccrual.count({
        where: { organizationId },
      });
      const fakeDealId = randomUUID();
      const fakeEventId = randomUUID();
      const fakeValue = createCommissionableValue({
        id: randomUUID(),
        dealId: fakeDealId,
        organizationId,
        amountMinor: 100n,
        currency: "USD",
        capturedBy: userId,
        capturedAt: now,
      });
      const missingAuthority = createExpectedAccrual({
        id: randomUUID(),
        deal: { id: fakeDealId, organizationId },
        event: {
          id: fakeEventId,
          organizationId,
          dealId: fakeDealId,
          type: "DEAL_CLOSED_WON",
          schemaVersion: 1,
        },
        value: fakeValue,
        plan: storedPlan,
        createdAt: now,
      });
      for (const ids of [
        { dealId: fakeDealId, eventId, valueId: valueId, planId },
        { dealId, eventId: fakeEventId, valueId, planId },
        { dealId, eventId, valueId: fakeValue.id, planId },
        { dealId, eventId: fakeEventId, valueId, planId: randomUUID() },
      ]) {
        const result = await repository.createExpectedAccrual({
          accrual: {
            ...missingAuthority,
            dealId: ids.dealId,
            dealClosedWonEventId: ids.eventId,
            value: { ...missingAuthority.value, id: ids.valueId },
            plan: { ...missingAuthority.plan, id: ids.planId },
          },
        });
        assert.equal(
          result.kind,
          "conflict",
          `authority case ${JSON.stringify(ids)}`,
        );
      }
      await prisma.dealDomainEvent.create({
        data: {
          id: fakeEventId,
          organizationId,
          dealId,
          type: "DEAL_CLOSED",
          schemaVersion: 1,
          occurredAt: now,
          data: {},
        },
      });
      const wrongType = await repository.createExpectedAccrual({
        accrual: {
          ...expected,
          id: randomUUID(),
          dealClosedWonEventId: fakeEventId,
        },
      });
      assert.equal(wrongType.kind, "conflict");
      assert.equal(
        await prisma.commissionAccrual.count({ where: { organizationId } }),
        beforeAuthorityFailures,
      );

      const storedAccrual = await prisma.commissionAccrual.findFirstOrThrow({
        where: { organizationId, dealId },
      });
      const invalidPlanId = randomUUID();
      await assert.rejects(
        () =>
          prisma.$executeRaw`INSERT INTO "CommissionPlanVersion" ("id", "organizationId", "version", "rateBps") VALUES (${invalidPlanId}::uuid, ${organizationId}::uuid, 99, 0)`,
      );
      await assert.rejects(
        () =>
          prisma.$executeRaw`INSERT INTO "CommissionPlanRecipient" ("id", "organizationId", "planVersionId", "order", "kind", "splitBps") VALUES (${randomUUID()}::uuid, ${organizationId}::uuid, ${planId}::uuid, 0, 'BROKER', 10000)`,
      );
      await assert.rejects(
        () =>
          prisma.$executeRaw`INSERT INTO "CommissionPlanRecipient" ("id", "organizationId", "planVersionId", "order", "kind", "splitBps") VALUES (${randomUUID()}::uuid, ${organizationId}::uuid, ${planId}::uuid, 9, 'INVALID', 10000)`,
      );
      await assert.rejects(
        () =>
          prisma.$executeRaw`INSERT INTO "CommissionableValue" ("id", "organizationId", "dealId", "amountMinor", "currency", "capturedBy", "capturedAt") VALUES (${randomUUID()}::uuid, ${organizationId}::uuid, ${dealId}::uuid, 0, 'US', ${userId}::uuid, ${now})`,
      );
      await assert.rejects(
        () =>
          prisma.$executeRaw`INSERT INTO "CommissionableValue" ("id", "organizationId", "dealId", "amountMinor", "currency", "capturedBy", "capturedAt") VALUES (${randomUUID()}::uuid, ${otherOrganizationId}::uuid, ${dealId}::uuid, 1, 'USD', ${userId}::uuid, ${now})`,
      );
      await assert.rejects(
        () =>
          prisma.$executeRaw`UPDATE "CommissionPlanRecipient" SET "splitBps" = 0 WHERE "planVersionId" = ${planId}::uuid AND "order" = 1`,
      );
      await assert.rejects(
        () =>
          prisma.$executeRaw`UPDATE "CommissionAccrual" SET "status" = 'BAD' WHERE "id" = ${storedAccrual.id}::uuid`,
      );
      await assert.rejects(
        () =>
          prisma.$executeRaw`UPDATE "CommissionAccrual" SET "totalAmountMinor" = -1 WHERE "id" = ${storedAccrual.id}::uuid`,
      );
      await assert.rejects(
        () =>
          prisma.$executeRaw`UPDATE "CommissionAccrual" SET "currency" = 'US' WHERE "id" = ${storedAccrual.id}::uuid`,
      );
      await assert.rejects(
        () =>
          prisma.$executeRaw`UPDATE "CommissionAccrualSplit" SET "order" = 0 WHERE "accrualId" = ${storedAccrual.id}::uuid AND "order" = 1`,
      );
      await assert.rejects(
        () =>
          prisma.$executeRaw`UPDATE "CommissionAccrualSplit" SET "amountMinor" = -1 WHERE "accrualId" = ${storedAccrual.id}::uuid AND "order" = 1`,
      );
      await assert.rejects(
        () =>
          prisma.$executeRaw`UPDATE "CommissionAccrualSplit" SET "currency" = 'US' WHERE "accrualId" = ${storedAccrual.id}::uuid AND "order" = 1`,
      );

      assert.equal(
        (await repository.findDealClosedWonEvent(organizationId, event.id))
          ?.type,
        "DEAL_CLOSED_WON",
      );
      assert.equal(
        await repository.findDealClosedWonEvent(otherOrganizationId, event.id),
        null,
      );
    } finally {
      await cleanupDatabase(prisma, TABLES);
      await assertTablesAreEmpty(prisma, TABLES);
      await prisma.$disconnect();
    }
  },
);
