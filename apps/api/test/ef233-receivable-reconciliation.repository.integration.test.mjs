import assert from "node:assert/strict";
import process from "node:process";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { PrismaClient } from "@prisma/client";
import { PrismaReceivableRepository } from "../dist/features/finance/infrastructure/prisma-receivable.repository.js";
import {
  createInvoiceDraft,
  issueInvoice,
  recordPayment,
} from "../dist/features/finance/domain/receivable.js";
import {
  cleanupDatabase,
  assertTablesAreEmpty,
} from "./support/cleanup-database.mjs";

const guarded =
  process.env.ALLOW_DESTRUCTIVE_TESTS === "1" &&
  process.env.DATABASE_URL?.includes("estateflow_test");
const tables = [
  "PaymentRecord",
  "Receivable",
  "Invoice",
  "DealDomainEvent",
  "Deal",
  "Property",
  "Lead",
  "Membership",
  "Organization",
  "User",
];
const uuid = () => randomUUID();
const now = new Date("2026-08-16T12:00:00.000Z");

async function seed(prisma) {
  const organizationId = uuid();
  const otherOrganizationId = uuid();
  const userId = uuid();
  const leadId = uuid();
  const propertyId = uuid();
  const dealId = uuid();
  const otherLeadId = uuid();
  const otherPropertyId = uuid();
  const otherDealId = uuid();
  await prisma.organization.createMany({
    data: [
      { id: organizationId, name: "A" },
      { id: otherOrganizationId, name: "B" },
    ],
  });
  await prisma.user.create({
    data: { id: userId, accountIdentifier: `${userId}@test.invalid` },
  });
  await prisma.membership.createMany({
    data: [
      { organizationId, userId, role: "OWNER", status: "ACTIVE" },
      {
        organizationId: otherOrganizationId,
        userId,
        role: "OWNER",
        status: "ACTIVE",
      },
    ],
  });
  await prisma.property.createMany({
    data: [
      {
        id: propertyId,
        organizationId,
        title: "P",
        propertyType: "HOUSE",
        addressText: "A",
        status: "ACTIVE",
      },
      {
        id: otherPropertyId,
        organizationId: otherOrganizationId,
        title: "Other P",
        propertyType: "HOUSE",
        addressText: "B",
        status: "ACTIVE",
      },
    ],
  });
  await prisma.$executeRaw`INSERT INTO "Lead" ("id", "organizationId", "ownerId", "stage", "nextAction", "source", "version", "createdAt", "updatedAt") VALUES (${leadId}::uuid, ${organizationId}::uuid, ${userId}::uuid, 'QUALIFIED', 'x', 'x', 1, ${now}, ${now})`;
  await prisma.$executeRaw`INSERT INTO "Lead" ("id", "organizationId", "ownerId", "stage", "nextAction", "source", "version", "createdAt", "updatedAt") VALUES (${otherLeadId}::uuid, ${otherOrganizationId}::uuid, ${userId}::uuid, 'QUALIFIED', 'x', 'x', 1, ${now}, ${now})`;
  await prisma.deal.createMany({
    data: [
      { id: dealId, organizationId, leadId, propertyId, brokerId: userId },
      {
        id: otherDealId,
        organizationId: otherOrganizationId,
        leadId: otherLeadId,
        propertyId: otherPropertyId,
        brokerId: userId,
      },
    ],
  });
  return { organizationId, otherOrganizationId, userId, dealId, otherDealId };
}

async function createIssued(
  repository,
  ids,
  dueAt = new Date(now.getTime() + 86400000),
) {
  const invoice = createInvoiceDraft({
    id: uuid(),
    organizationId: ids.organizationId,
    dealId: ids.dealId,
    amountMinor: 100n,
    currency: "USD",
    createdBy: ids.userId,
    createdAt: now,
  });
  assert.equal(
    (await repository.createInvoiceDraft({ invoice })).kind,
    "created",
  );
  const issued = issueInvoice(invoice, {
    issuedBy: ids.userId,
    issuedAt: now,
    dueAt,
    receivableId: uuid(),
  });
  assert.equal((await repository.issueInvoice(issued)).kind, "issued");
  return { invoice: issued.invoice, receivable: issued.receivable };
}

function cancellation(invoice, receivable, ids, reason = "customer request") {
  return {
    invoice: {
      ...invoice,
      cancelledBy: ids.userId,
      cancelledAt: new Date("2026-08-17T12:00:00.000Z"),
      cancellationReason: reason,
    },
    receivable,
  };
}

test(
  "EF-233 guarded cancellation persistence, tenant isolation, and aging cursor",
  { skip: !guarded },
  async () => {
    const prisma = new PrismaClient();
    try {
      await prisma.$connect();
      await cleanupDatabase(prisma, tables);
      const ids = await seed(prisma);
      const repository = new PrismaReceivableRepository(prisma);
      const first = await createIssued(repository, ids);
      const cancelled = await repository.cancelInvoice(
        cancellation(first.invoice, first.receivable, ids),
      );
      assert.equal(cancelled.kind, "cancelled");
      assert.equal(cancelled.invoice.status, "CANCELLED");
      assert.equal(cancelled.receivable.status, "CANCELLED");
      assert.equal(cancelled.receivable.outstandingMinor, 100n);
      assert.equal(
        (
          await repository.cancelInvoice(
            cancellation(first.invoice, first.receivable, ids),
          )
        ).kind,
        "replayed",
      );
      assert.deepEqual(
        await repository.cancelInvoice(
          cancellation(first.invoice, first.receivable, ids, "changed"),
        ),
        { kind: "conflict", reason: "cancellation-replay-conflict" },
      );
      assert.equal(
        await repository.hasPayments(
          ids.otherOrganizationId,
          first.receivable.id,
        ),
        false,
      );
      assert.equal(
        await repository.findInvoice(ids.otherOrganizationId, first.invoice.id),
        null,
      );

      const aging = [];
      for (const days of [3, 1, 1])
        aging.push(
          await createIssued(
            repository,
            ids,
            new Date(now.getTime() + days * 86400000),
          ),
        );
      const otherOrganizationReceivable = await createIssued(repository, {
        ...ids,
        organizationId: ids.otherOrganizationId,
        dealId: ids.otherDealId,
      });
      const rows = await repository.listOutstandingReceivables({
        organizationId: ids.organizationId,
        limit: 101,
      });
      assert.ok(
        rows.every(
          (row) => row.id !== otherOrganizationReceivable.receivable.id,
        ),
      );
      const sameDueIds = [
        aging[1].receivable.id,
        aging[2].receivable.id,
      ].sort();
      assert.deepEqual(
        rows.map((row) => row.id),
        [...sameDueIds, aging[0].receivable.id],
      );
      const page = await repository.listOutstandingReceivables({
        organizationId: ids.organizationId,
        limit: 1,
      });
      const next = await repository.listOutstandingReceivables({
        organizationId: ids.organizationId,
        after: { dueAt: page[0].dueAt, receivableId: page[0].id },
        limit: 101,
      });
      assert.equal(next.length, 2);
      assert.ok(next.every((row) => row.status === "OPEN"));

      const partiallyPaid = await createIssued(repository, ids);
      const partialPayment = recordPayment(partiallyPaid.receivable, {
        id: uuid(),
        amountMinor: 40n,
        currency: "USD",
        recordedAt: now,
        recordedBy: ids.userId,
        idempotencyKey: "aging-partial",
        commandPayloadHash: "aging-partial-h",
      });
      await repository.recordPayment({
        scope: "RECEIVABLE_PAYMENT_RECORD",
        payment: partialPayment.payment,
        receivable: partialPayment.receivable,
        commandPayloadHash: "aging-partial-h",
      });
      const fullyPaid = await createIssued(repository, ids);
      const fullPayment = recordPayment(fullyPaid.receivable, {
        id: uuid(),
        amountMinor: 100n,
        currency: "USD",
        recordedAt: now,
        recordedBy: ids.userId,
        idempotencyKey: "aging-full",
        commandPayloadHash: "aging-full-h",
      });
      await repository.recordPayment({
        scope: "RECEIVABLE_PAYMENT_RECORD",
        payment: fullPayment.payment,
        receivable: fullPayment.receivable,
        commandPayloadHash: "aging-full-h",
      });
      const agingAfterPayments = await repository.listOutstandingReceivables({
        organizationId: ids.organizationId,
        limit: 101,
      });
      const partialRow = agingAfterPayments.find(
        (row) => row.id === partiallyPaid.receivable.id,
      );
      assert.equal(partialRow?.status, "PARTIALLY_PAID");
      assert.equal(partialRow?.outstandingMinor, 60n);
      assert.equal(
        agingAfterPayments.some((row) => row.id === fullyPaid.receivable.id),
        false,
      );

      await assert.rejects(() =>
        repository.listOutstandingReceivables({
          organizationId: ids.organizationId,
          limit: 0,
        }),
      );
      await assert.rejects(() =>
        repository.listOutstandingReceivables({
          organizationId: ids.organizationId,
          limit: 1,
          after: { dueAt: new Date("invalid"), receivableId: uuid() },
        }),
      );

      const paid = await createIssued(repository, ids);
      const payment = recordPayment(paid.receivable, {
        id: uuid(),
        amountMinor: 20n,
        currency: "USD",
        recordedAt: now,
        recordedBy: ids.userId,
        idempotencyKey: "p1",
        commandPayloadHash: "h1",
      });
      await repository.recordPayment({
        scope: "RECEIVABLE_PAYMENT_RECORD",
        payment: payment.payment,
        receivable: payment.receivable,
        commandPayloadHash: "h1",
      });
      assert.deepEqual(
        (
          await repository.cancelInvoice(
            cancellation(paid.invoice, paid.receivable, ids),
          )
        ).reason,
        "payments-exist",
      );
      assert.equal(
        await prisma.paymentRecord.count({
          where: { receivableId: paid.receivable.id },
        }),
        1,
      );

      for (let raceIteration = 0; raceIteration < 8; raceIteration += 1) {
        const raced = await createIssued(repository, ids);
        const cancelCommand = cancellation(
          raced.invoice,
          raced.receivable,
          ids,
        );
        const paymentResult = recordPayment(raced.receivable, {
          id: uuid(),
          amountMinor: 20n,
          currency: "USD",
          recordedAt: now,
          recordedBy: ids.userId,
          idempotencyKey: `race-${raceIteration}`,
          commandPayloadHash: `race-h-${raceIteration}`,
        });
        const results = await Promise.all([
          repository.cancelInvoice(cancelCommand),
          repository.recordPayment({
            scope: "RECEIVABLE_PAYMENT_RECORD",
            payment: paymentResult.payment,
            receivable: paymentResult.receivable,
            commandPayloadHash: `race-h-${raceIteration}`,
          }),
        ]);
        assert.equal(
          results.filter((result) => result.kind === "cancelled").length +
            results.filter((result) => result.kind === "recorded").length,
          1,
        );
        const final = await repository.findReceivable(
          ids.organizationId,
          raced.receivable.id,
        );
        assert.ok(
          final?.status === "CANCELLED" || final?.status === "PARTIALLY_PAID",
        );
        if (final.status === "CANCELLED")
          assert.equal(
            await prisma.paymentRecord.count({
              where: { receivableId: final.id },
            }),
            0,
          );
      }
    } finally {
      await cleanupDatabase(prisma, tables);
      await assertTablesAreEmpty(prisma, tables);
      await prisma.$disconnect();
    }
  },
);

test(
  "EF-233 guarded SQL audit and snapshot protections",
  { skip: !guarded },
  async () => {
    const prisma = new PrismaClient();
    try {
      await prisma.$connect();
      await cleanupDatabase(prisma, tables);
      const ids = await seed(prisma);
      const repository = new PrismaReceivableRepository(prisma);
      const draft = createInvoiceDraft({
        id: uuid(),
        organizationId: ids.organizationId,
        dealId: ids.dealId,
        amountMinor: 100n,
        currency: "USD",
        createdBy: ids.userId,
        createdAt: now,
      });
      assert.equal(
        (await repository.createInvoiceDraft({ invoice: draft })).kind,
        "created",
      );
      await assert.rejects(
        () =>
          prisma.$executeRaw`UPDATE "Invoice" SET "status" = 'CANCELLED', "issuedBy" = ${ids.userId}::uuid, "issuedAt" = ${now}, "dueAt" = ${now}, "cancelledBy" = ${ids.userId}::uuid, "cancelledAt" = ${now}, "cancellationReason" = 'forged' WHERE "id" = ${draft.id}::uuid`,
      );
      assert.deepEqual(
        await prisma.invoice.findUnique({ where: { id: draft.id } }),
        {
          id: draft.id,
          organizationId: ids.organizationId,
          dealId: ids.dealId,
          amountMinor: 100n,
          currency: "USD",
          status: "DRAFT",
          draftCreatedBy: ids.userId,
          draftCreatedAt: now,
          issuedBy: null,
          issuedAt: null,
          dueAt: null,
          cancelledBy: null,
          cancelledAt: null,
          cancellationReason: null,
        },
      );

      const issued = await createIssued(repository, ids);
      const cancelledAt = new Date("2026-08-17T12:00:00.000Z");
      const cancellationResult = await repository.cancelInvoice(
        cancellation(issued.invoice, issued.receivable, ids),
      );
      assert.equal(cancellationResult.kind, "cancelled");
      const persistedInvoice = await prisma.invoice.findUnique({
        where: { id: issued.invoice.id },
      });
      const persistedReceivable = await prisma.receivable.findUnique({
        where: { id: issued.receivable.id },
      });
      assert.equal(persistedInvoice?.cancelledBy, ids.userId);
      assert.deepEqual(persistedInvoice?.cancelledAt, cancelledAt);
      assert.equal(persistedInvoice?.cancellationReason, "customer request");
      assert.equal(persistedInvoice?.amountMinor, 100n);
      assert.equal(persistedInvoice?.currency, "USD");
      assert.equal(persistedReceivable?.originalAmountMinor, 100n);
      assert.equal(persistedReceivable?.outstandingMinor, 100n);
      assert.equal(persistedReceivable?.currency, "USD");
      assert.equal(persistedReceivable?.status, "CANCELLED");

      const invoiceSnapshot = persistedInvoice;
      const receivableSnapshot = persistedReceivable;
      for (const update of [
        () =>
          prisma.$executeRaw`UPDATE "Invoice" SET "cancellationReason" = 'changed' WHERE "id" = ${issued.invoice.id}::uuid`,
        () =>
          prisma.$executeRaw`UPDATE "Invoice" SET "status" = 'ISSUED' WHERE "id" = ${issued.invoice.id}::uuid`,
        () =>
          prisma.$executeRaw`UPDATE "Receivable" SET "status" = 'OPEN' WHERE "id" = ${issued.receivable.id}::uuid`,
        () =>
          prisma.$executeRaw`UPDATE "Receivable" SET "outstandingMinor" = 99 WHERE "id" = ${issued.receivable.id}::uuid`,
      ])
        await assert.rejects(update);
      assert.deepEqual(
        await prisma.invoice.findUnique({ where: { id: issued.invoice.id } }),
        invoiceSnapshot,
      );
      assert.deepEqual(
        await prisma.receivable.findUnique({
          where: { id: issued.receivable.id },
        }),
        receivableSnapshot,
      );

      await assert.rejects(
        () =>
          prisma.$executeRaw`UPDATE "Invoice" SET "amountMinor" = 99 WHERE "id" = ${issued.invoice.id}::uuid`,
      );
      await assert.rejects(
        () =>
          prisma.$executeRaw`UPDATE "Invoice" SET "status" = 'CANCELLED', "cancelledBy" = NULL WHERE "id" = ${issued.invoice.id}::uuid`,
      );
      await assert.rejects(
        () =>
          prisma.$executeRaw`UPDATE "Receivable" SET "status" = 'CANCELLED', "outstandingMinor" = 99 WHERE "id" = ${issued.receivable.id}::uuid`,
      );
    } finally {
      await cleanupDatabase(prisma, tables);
      await assertTablesAreEmpty(prisma, tables);
      await prisma.$disconnect();
    }
  },
);
