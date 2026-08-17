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

const TABLES = [
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
const guarded =
  process.env.ALLOW_DESTRUCTIVE_TESTS === "1" &&
  process.env.DATABASE_URL?.includes("estateflow_test");
const now = new Date("2026-08-16T12:00:00.000Z");
const uuid = () => randomUUID();

async function seed(prisma) {
  const organizationId = uuid();
  const otherOrganizationId = uuid();
  const userId = uuid();
  const leadId = uuid();
  const propertyId = uuid();
  const dealId = uuid();
  const alternateLeadId = uuid();
  const alternatePropertyId = uuid();
  const alternateDealId = uuid();
  await prisma.organization.createMany({
    data: [
      { id: organizationId, name: "Receivable test" },
      { id: otherOrganizationId, name: "Other" },
    ],
  });
  await prisma.user.create({
    data: { id: userId, accountIdentifier: `${userId}@test.invalid` },
  });
  await prisma.membership.create({
    data: { organizationId, userId, role: "OWNER", status: "ACTIVE" },
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
    data: { id: dealId, organizationId, leadId, propertyId, brokerId: userId },
  });
  await prisma.$executeRaw`INSERT INTO "Lead" ("id", "organizationId", "ownerId", "stage", "nextAction", "source", "version", "createdAt", "updatedAt") VALUES (${alternateLeadId}::uuid, ${organizationId}::uuid, ${userId}::uuid, 'QUALIFIED', 'x', 'x', 1, ${now}, ${now})`;
  await prisma.property.create({
    data: {
      id: alternatePropertyId,
      organizationId,
      title: "Alternate",
      propertyType: "HOUSE",
      addressText: "Alternate",
      status: "ACTIVE",
    },
  });
  await prisma.deal.create({
    data: {
      id: alternateDealId,
      organizationId,
      leadId: alternateLeadId,
      propertyId: alternatePropertyId,
      brokerId: userId,
    },
  });
  return {
    organizationId,
    otherOrganizationId,
    userId,
    dealId,
    alternateDealId,
  };
}

function draft(ids, amountMinor = 100n) {
  return createInvoiceDraft({
    id: uuid(),
    organizationId: ids.organizationId,
    dealId: ids.dealId,
    amountMinor,
    currency: "USD",
    createdBy: ids.userId,
    createdAt: now,
  });
}

test(
  "EF-233 guarded durable receivable persistence",
  { skip: !guarded },
  async () => {
    const prisma = new PrismaClient();
    try {
      await prisma.$connect();
      await cleanupDatabase(prisma, TABLES);
      const ids = await seed(prisma);
      const repository = new PrismaReceivableRepository(prisma);
      assert.equal(
        await repository.findDeal(ids.otherOrganizationId, ids.dealId),
        null,
      );
      const invoice = draft(ids);
      assert.deepEqual(await repository.createInvoiceDraft({ invoice }), {
        kind: "created",
        invoice,
      });
      const issue = issueInvoice(invoice, {
        issuedBy: ids.userId,
        issuedAt: now,
        dueAt: new Date(now.getTime() + 86400000),
        receivableId: uuid(),
      });
      assert.equal((await repository.issueInvoice(issue)).kind, "issued");
      const issuedSnapshot = await prisma.invoice.findUnique({
        where: { id: invoice.id },
      });
      const receivableSnapshot = await prisma.receivable.findFirst({
        where: { invoiceId: invoice.id },
      });
      assert.ok(issuedSnapshot);
      assert.ok(receivableSnapshot);
      await assert.rejects(
        () =>
          prisma.$executeRaw`UPDATE "Invoice" SET "amountMinor" = 999 WHERE "id" = ${invoice.id}::uuid`,
      );
      await assert.rejects(
        () =>
          prisma.$executeRaw`UPDATE "Invoice" SET "currency" = 'EUR' WHERE "id" = ${invoice.id}::uuid`,
      );
      await assert.rejects(
        () =>
          prisma.$executeRaw`UPDATE "Invoice" SET "dealId" = ${ids.alternateDealId}::uuid WHERE "id" = ${invoice.id}::uuid`,
      );
      await assert.rejects(
        () =>
          prisma.$executeRaw`UPDATE "Invoice" SET "dueAt" = ${new Date(now.getTime() + 172800000)} WHERE "id" = ${invoice.id}::uuid`,
      );
      await assert.rejects(
        () =>
          prisma.$executeRaw`UPDATE "Invoice" SET "status" = 'CANCELLED' WHERE "id" = ${invoice.id}::uuid`,
      );
      assert.deepEqual(
        await prisma.invoice.findUnique({ where: { id: invoice.id } }),
        issuedSnapshot,
      );
      assert.deepEqual(
        await prisma.receivable.findFirst({ where: { invoiceId: invoice.id } }),
        receivableSnapshot,
      );
      assert.equal(
        await prisma.invoice.count({
          where: { organizationId: ids.organizationId },
        }),
        1,
      );
      assert.equal(
        await prisma.receivable.count({
          where: { organizationId: ids.organizationId },
        }),
        1,
      );
      assert.equal((await repository.issueInvoice(issue)).kind, "replayed");

      const receivable = await repository.findReceivableByInvoice(
        ids.organizationId,
        invoice.id,
      );
      assert.ok(receivable);
      const paymentInput = {
        id: uuid(),
        amountMinor: 30n,
        currency: "USD",
        recordedAt: now,
        recordedBy: ids.userId,
        idempotencyKey: " payment-1 ",
        commandPayloadHash: "hash-1",
      };
      const payment = recordPayment(receivable, paymentInput);
      const command = {
        scope: "RECEIVABLE_PAYMENT_RECORD",
        payment: payment.payment,
        receivable: payment.receivable,
        commandPayloadHash: "hash-1",
      };
      assert.deepEqual(await repository.recordPayment(command), {
        kind: "recorded",
        payment: payment.payment,
        receivable: payment.receivable,
      });
      assert.equal((await repository.recordPayment(command)).kind, "replayed");
      assert.deepEqual(
        await repository
          .resolvePaymentIdempotency({
            scope: "RECEIVABLE_PAYMENT_RECORD",
            organizationId: ids.organizationId,
            receivableId: receivable.id,
            idempotencyKey: "payment-1",
            commandPayloadHash: "hash-1",
          })
          .then((r) => r.kind),
        "replayed",
      );
      assert.deepEqual(
        await repository.recordPayment({
          ...command,
          commandPayloadHash: "different",
        }),
        { kind: "conflict", reason: "idempotency-payload-conflict" },
      );
      const current = await repository.findReceivable(
        ids.organizationId,
        receivable.id,
      );
      assert.equal(current?.outstandingMinor, 70n);

      const secondPayment = recordPayment(current, {
        ...paymentInput,
        id: uuid(),
        amountMinor: 70n,
        idempotencyKey: "payment-2",
        commandPayloadHash: "hash-2",
      });
      assert.equal(
        (
          await repository.recordPayment({
            scope: "RECEIVABLE_PAYMENT_RECORD",
            payment: secondPayment.payment,
            receivable: secondPayment.receivable,
            commandPayloadHash: "hash-2",
          })
        ).kind,
        "recorded",
      );
      assert.equal(
        (await repository.findReceivable(ids.organizationId, receivable.id))
          ?.outstandingMinor,
        0n,
      );
      await assert.rejects(
        () =>
          prisma.$executeRaw`UPDATE "Receivable" SET "outstandingMinor" = -1 WHERE "id" = ${receivable.id}::uuid`,
      );
      await assert.rejects(
        () =>
          prisma.$executeRaw`INSERT INTO "Invoice" ("id", "organizationId", "dealId", "amountMinor", "currency", "status", "draftCreatedBy", "draftCreatedAt") VALUES (${uuid()}::uuid, ${ids.organizationId}::uuid, ${ids.dealId}::uuid, 0, 'USD', 'DRAFT', ${ids.userId}::uuid, ${now})`,
      );
      await assert.rejects(
        () =>
          prisma.$executeRaw`INSERT INTO "Invoice" ("id", "organizationId", "dealId", "amountMinor", "currency", "status", "draftCreatedBy", "draftCreatedAt") VALUES (${uuid()}::uuid, ${ids.organizationId}::uuid, ${ids.dealId}::uuid, -1, 'USD', 'DRAFT', ${ids.userId}::uuid, ${now})`,
      );
      await assert.rejects(
        () =>
          prisma.$executeRaw`INSERT INTO "Invoice" ("id", "organizationId", "dealId", "amountMinor", "currency", "status", "draftCreatedBy", "draftCreatedAt") VALUES (${uuid()}::uuid, ${ids.organizationId}::uuid, ${ids.dealId}::uuid, 1, 'US', 'DRAFT', ${ids.userId}::uuid, ${now})`,
      );
      await assert.rejects(
        () =>
          prisma.$executeRaw`INSERT INTO "Invoice" ("id", "organizationId", "dealId", "amountMinor", "currency", "status", "draftCreatedBy", "draftCreatedAt") VALUES (${uuid()}::uuid, ${ids.otherOrganizationId}::uuid, ${ids.dealId}::uuid, 1, 'USD', 'DRAFT', ${ids.userId}::uuid, ${now})`,
      );
      await assert.rejects(
        () =>
          prisma.$executeRaw`INSERT INTO "Receivable" ("id", "organizationId", "invoiceId", "dealId", "originalAmountMinor", "outstandingMinor", "currency", "status", "issuedAt", "dueAt") VALUES (${uuid()}::uuid, ${ids.organizationId}::uuid, ${invoice.id}::uuid, ${ids.dealId}::uuid, 100, 100, 'USD', 'OPEN', ${now}, ${now})`,
      );
      await assert.rejects(
        () =>
          prisma.$executeRaw`INSERT INTO "PaymentRecord" ("id", "organizationId", "receivableId", "amountMinor", "currency", "recordedAt", "recordedBy", "commandScope", "idempotencyKey", "commandPayloadHash") VALUES (${uuid()}::uuid, ${ids.organizationId}::uuid, ${receivable.id}::uuid, 1, 'USD', ${now}, ${ids.userId}::uuid, 'RECEIVABLE_PAYMENT_RECORD', 'payment-1', 'hash-1')`,
      );

      const secondInvoice = draft(ids);
      assert.equal(
        (await repository.createInvoiceDraft({ invoice: secondInvoice })).kind,
        "created",
      );
      const secondIssue = issueInvoice(secondInvoice, {
        issuedBy: ids.userId,
        issuedAt: now,
        dueAt: new Date(now.getTime() + 86400000),
        receivableId: uuid(),
      });
      assert.equal((await repository.issueInvoice(secondIssue)).kind, "issued");
      const secondReceivable = await repository.findReceivableByInvoice(
        ids.organizationId,
        secondInvoice.id,
      );
      assert.ok(secondReceivable);
      const concurrentCommands = [70n, 70n].map((amountMinor, index) => {
        const result = recordPayment(secondReceivable, {
          id: uuid(),
          amountMinor,
          currency: "USD",
          recordedAt: now,
          recordedBy: ids.userId,
          idempotencyKey: `concurrent-${index}`,
          commandPayloadHash: `concurrent-hash-${index}`,
        });
        return {
          scope: "RECEIVABLE_PAYMENT_RECORD",
          payment: result.payment,
          receivable: result.receivable,
          commandPayloadHash: result.payment.commandPayloadHash,
        };
      });
      const concurrentResults = await Promise.allSettled(
        concurrentCommands.map((candidate) =>
          repository.recordPayment(candidate),
        ),
      );
      assert.equal(
        concurrentResults.filter(
          (result) =>
            result.status === "fulfilled" && result.value.kind === "recorded",
        ).length,
        1,
      );
      assert.equal(
        concurrentResults.filter(
          (result) =>
            result.status === "fulfilled" &&
            result.value.kind === "conflict" &&
            result.value.reason === "receivable-ownership-or-id-conflict",
        ).length,
        1,
      );
      assert.equal(
        concurrentResults.filter((result) => result.status === "rejected")
          .length,
        0,
      );
      assert.equal(
        await prisma.paymentRecord.count({
          where: { receivableId: secondReceivable.id },
        }),
        1,
      );
      assert.equal(
        (
          await repository.findReceivable(
            ids.organizationId,
            secondReceivable.id,
          )
        )?.outstandingMinor,
        30n,
      );
      assert.equal(
        (
          await repository.findReceivable(
            ids.organizationId,
            secondReceivable.id,
          )
        )?.status,
        "PARTIALLY_PAID",
      );
      const concurrentReceivable = await repository.findReceivable(
        ids.organizationId,
        receivable.id,
      );
      assert.equal(concurrentReceivable?.status, "PAID");
      const replayResults = await Promise.all(
        [1, 2, 3].map(() => repository.recordPayment(command)),
      );
      assert.equal(
        replayResults.filter((r) => r.kind === "replayed").length,
        3,
      );
      assert.equal(
        await prisma.paymentRecord.count({
          where: { organizationId: ids.organizationId },
        }),
        3,
      );
    } finally {
      await cleanupDatabase(prisma, TABLES);
      await assertTablesAreEmpty(prisma, TABLES);
      await prisma.$disconnect();
    }
  },
);

test(
  "EF-233 fresh same-key concurrent payments record once and replay",
  { skip: !guarded },
  async () => {
    const prisma = new PrismaClient();
    try {
      await prisma.$connect();
      await cleanupDatabase(prisma, TABLES);
      const ids = await seed(prisma);
      const repository = new PrismaReceivableRepository(prisma);
      const invoice = draft(ids);
      assert.equal(
        (await repository.createInvoiceDraft({ invoice })).kind,
        "created",
      );
      const issue = issueInvoice(invoice, {
        issuedBy: ids.userId,
        issuedAt: now,
        dueAt: new Date(now.getTime() + 86400000),
        receivableId: uuid(),
      });
      assert.equal((await repository.issueInvoice(issue)).kind, "issued");
      const receivable = await repository.findReceivableByInvoice(
        ids.organizationId,
        invoice.id,
      );
      assert.ok(receivable);
      const payment = recordPayment(receivable, {
        id: uuid(),
        amountMinor: 30n,
        currency: "USD",
        recordedAt: now,
        recordedBy: ids.userId,
        idempotencyKey: "fresh-concurrent-payment",
        commandPayloadHash: "fresh-concurrent-hash",
      });
      const command = {
        scope: "RECEIVABLE_PAYMENT_RECORD",
        payment: payment.payment,
        receivable: payment.receivable,
        commandPayloadHash: "fresh-concurrent-hash",
      };
      assert.equal(
        await prisma.paymentRecord.count({
          where: { receivableId: receivable.id },
        }),
        0,
      );
      const results = await Promise.all([
        repository.recordPayment(command),
        repository.recordPayment(command),
        repository.recordPayment(command),
      ]);
      assert.equal(
        results.filter((result) => result.kind === "recorded").length,
        1,
      );
      assert.equal(
        results.filter((result) => result.kind === "replayed").length,
        2,
      );
      assert.equal(
        await prisma.paymentRecord.count({
          where: { receivableId: receivable.id },
        }),
        1,
      );
      const current = await repository.findReceivable(
        ids.organizationId,
        receivable.id,
      );
      assert.equal(current?.outstandingMinor, 70n);
      assert.equal(current?.status, "PARTIALLY_PAID");
    } finally {
      await cleanupDatabase(prisma, TABLES);
      await assertTablesAreEmpty(prisma, TABLES);
      await prisma.$disconnect();
    }
  },
);
