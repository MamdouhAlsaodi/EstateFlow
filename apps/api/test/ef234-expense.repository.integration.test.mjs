import assert from "node:assert/strict";
import process from "node:process";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { PrismaClient } from "@prisma/client";
import { PrismaExpenseRepository } from "../dist/features/finance/infrastructure/prisma-expense.repository.js";
import {
  createExpenseApprovalPolicy,
  createExpenseDraft,
  createExpenseEvidenceMetadata,
  decideExpense,
  submitExpenseWithPolicy,
} from "../dist/features/finance/domain/expense.js";
import {
  cleanupDatabase,
  assertTablesAreEmpty,
} from "./support/cleanup-database.mjs";

const TABLES = [
  "ExpenseEvidenceMetadata",
  "ExpenseApprovalPolicy",
  "Expense",
  "Deal",
  "Property",
  "Lead",
  "Membership",
  "Organization",
  "User",
];
const expectedPort = process.env.ESTATEFLOW_TEST_DB_PORT ?? "55433";
const guarded =
  process.env.ALLOW_DESTRUCTIVE_TESTS === "1" &&
  process.env.DATABASE_URL?.includes(`:${expectedPort}/estateflow_test`);
const now = new Date("2026-09-21T12:00:00.000Z");
const uuid = () => randomUUID();

async function seed(prisma) {
  const organizationId = uuid();
  const otherOrganizationId = uuid();
  const userId = uuid();
  const leadId = uuid();
  const propertyId = uuid();
  const dealId = uuid();
  await prisma.organization.createMany({
    data: [
      { id: organizationId, name: "Expense test" },
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
      title: "Expense property",
      propertyType: "HOUSE",
      addressText: "Test",
      status: "ACTIVE",
    },
  });
  await prisma.$executeRaw`INSERT INTO "Lead" ("id", "organizationId", "ownerId", "stage", "nextAction", "source", "version", "createdAt", "updatedAt") VALUES (${leadId}::uuid, ${organizationId}::uuid, ${userId}::uuid, 'QUALIFIED', 'x', 'x', 1, ${now}, ${now})`;
  await prisma.deal.create({
    data: { id: dealId, organizationId, leadId, propertyId, brokerId: userId },
  });
  return { organizationId, otherOrganizationId, userId, propertyId, dealId };
}

test(
  "EF-234 expense persistence is guarded, tenant-scoped, and audit-immutable",
  { skip: !guarded },
  async () => {
    const prisma = new PrismaClient();
    const repository = new PrismaExpenseRepository(prisma);
    try {
      await cleanupDatabase(prisma, TABLES);
      const {
        organizationId,
        otherOrganizationId,
        userId,
        propertyId,
        dealId,
      } = await seed(prisma);

      assert.deepEqual(
        await repository.createExpenseDraft({
          expense: createExpenseDraft({
            id: uuid(),
            organizationId: otherOrganizationId,
            category: "OFFICE",
            vendorReference: "Foreign vendor",
            amountMinor: 100n,
            currency: "SAR",
            dimensions: { propertyId },
            createdBy: userId,
            createdAt: now,
          }),
        }),
        { kind: "conflict", reason: "expense-ownership-or-id-conflict" },
      );
      // The same shape without foreign dimensions is a valid row of the other
      // organization at the database level; tenant safety is enforced by the
      // application's organization-scoped lookups, proven further below.
      const foreignCreated = await repository.createExpenseDraft({
        expense: createExpenseDraft({
          id: uuid(),
          organizationId: otherOrganizationId,
          category: "OFFICE",
          vendorReference: "Foreign vendor",
          amountMinor: 100n,
          currency: "SAR",
          dimensions: {},
          createdBy: userId,
          createdAt: now,
        }),
      });
      assert.equal(foreignCreated.kind, "created");
      assert.equal(
        await repository.findExpense(organizationId, foreignCreated.expense.id),
        null,
      );

      const expense = createExpenseDraft({
        id: uuid(),
        organizationId,
        category: "CAMPAIGN",
        vendorReference: "Ads agency",
        amountMinor: 250000n,
        currency: "SAR",
        dimensions: {
          propertyId,
          dealId,
          campaignReference: "ramadan-2026",
        },
        createdBy: userId,
        createdAt: now,
      });
      const created = await repository.createExpenseDraft({ expense });
      assert.deepEqual(created, { kind: "created", expense });

      assert.deepEqual(
        await repository.findExpense(organizationId, expense.id),
        expense,
      );
      assert.equal(
        await repository.findExpense(otherOrganizationId, expense.id),
        null,
      );
      assert.deepEqual(
        await repository.findProperty(organizationId, propertyId),
        {
          id: propertyId,
          organizationId,
        },
      );
      assert.deepEqual(await repository.findDeal(organizationId, dealId), {
        id: dealId,
        organizationId,
      });
      assert.equal(
        await repository.findProperty(otherOrganizationId, propertyId),
        null,
      );

      const hash = "b".repeat(64);
      const evidence = createExpenseEvidenceMetadata({
        id: uuid(),
        organizationId,
        expenseId: expense.id,
        mediaType: "PDF",
        byteSize: 4096,
        note: "Agency invoice",
        attachedBy: userId,
        attachedAt: now,
        commandPayloadHash: hash,
      });
      assert.deepEqual(await repository.attachExpenseEvidence({ evidence }), {
        kind: "attached",
        evidence,
      });
      assert.deepEqual(await repository.attachExpenseEvidence({ evidence }), {
        kind: "replayed",
        evidence,
      });
      const reused = createExpenseEvidenceMetadata({
        ...evidence,
        byteSize: 8192,
        commandPayloadHash: "c".repeat(64),
      });
      assert.deepEqual(
        await repository.attachExpenseEvidence({ evidence: reused }),
        {
          kind: "conflict",
          reason: "evidence-idempotency-payload-conflict",
        },
      );

      const policy = createExpenseApprovalPolicy({
        organizationId,
        thresholdMinor: 1000n,
        currency: "SAR",
      });
      assert.deepEqual(
        await repository.saveApprovalPolicy({ policy, updatedBy: userId }),
        {
          kind: "saved",
          policy,
        },
      );
      assert.deepEqual(
        await repository.saveApprovalPolicy({ policy, updatedBy: userId }),
        {
          kind: "replayed",
          policy,
        },
      );
      assert.deepEqual(
        await repository.findApprovalPolicy(organizationId),
        policy,
      );

      const submitted = submitExpenseWithPolicy(expense, policy, {
        submittedBy: userId,
        submittedAt: now,
      });
      assert.equal(submitted.status, "SUBMITTED");
      assert.deepEqual(
        await repository.submitExpense({
          expense: submitted,
          policy,
          submittedBy: userId,
          submittedAt: now,
        }),
        { kind: "submitted", expense: submitted },
      );
      assert.deepEqual(
        await repository.submitExpense({
          expense: submitted,
          policy,
          submittedBy: userId,
          submittedAt: now,
        }),
        { kind: "conflict", reason: "expense-state-conflict" },
      );

      const approver = uuid();
      await prisma.user.create({
        data: { id: approver, accountIdentifier: `${approver}@test.invalid` },
      });
      await prisma.membership.create({
        data: {
          organizationId,
          userId: approver,
          role: "MANAGER",
          status: "ACTIVE",
        },
      });
      const decided = decideExpense(submitted, {
        decidedBy: approver,
        decidedAt: new Date(now.getTime() + 1000),
        decision: "APPROVED",
        reason: "Campaign receipt verified",
      });
      assert.deepEqual(
        await repository.decideExpense({
          expense: decided,
          decidedBy: approver,
          decidedAt: decided.decidedAt,
          decision: "APPROVED",
          reason: "Campaign receipt verified",
        }),
        { kind: "decided", expense: decided },
      );
      assert.deepEqual(
        await repository.decideExpense({
          expense: decided,
          decidedBy: approver,
          decidedAt: decided.decidedAt,
          decision: "APPROVED",
          reason: "Campaign receipt verified",
        }),
        { kind: "replayed", expense: decided },
      );

      const persisted = await repository.findExpense(
        organizationId,
        expense.id,
      );
      assert.equal(persisted.status, "APPROVED");
      assert.equal(persisted.decidedBy, approver);
      assert.equal(persisted.decisionReason, "Campaign receipt verified");

      const tamper = prisma.$executeRaw`UPDATE "Expense" SET "decisionReason" = 'tampered' WHERE "organizationId" = ${organizationId}::uuid AND "id" = ${expense.id}::uuid`;
      await assert.rejects(tamper, /approval audit trail is immutable/);
      await assert.rejects(
        prisma.$executeRaw`UPDATE "Expense" SET "amountMinor" = 1 WHERE "organizationId" = ${organizationId}::uuid AND "id" = ${expense.id}::uuid`,
        /submitted expense snapshot is immutable/,
      );
      await assert.rejects(
        prisma.$executeRaw`UPDATE "Expense" SET "decidedBy" = '11111111-1111-4111-8111-111111111111'::uuid WHERE "organizationId" = ${organizationId}::uuid AND "id" = ${expense.id}::uuid`,
        /approval audit trail is immutable/,
      );
      await assert.rejects(
        prisma.$executeRaw`INSERT INTO "Expense" ("id", "organizationId", "category", "vendorReference", "amountMinor", "currency", "status", "draftCreatedBy", "draftCreatedAt", "submittedBy", "submittedAt", "decidedBy", "decidedAt", "decision") VALUES (gen_random_uuid(), ${organizationId}::uuid, 'OFFICE', 'Self', 100, 'SAR', 'APPROVED', '11111111-1111-4111-8111-111111111111'::uuid, ${now}, '22222222-2222-4222-8222-222222222222'::uuid, ${now}, '11111111-1111-4111-8111-111111111111'::uuid, ${now}, 'APPROVED')`,
        /Expense_maker_checker_check/,
      );

      await cleanupDatabase(prisma, TABLES);
      await assertTablesAreEmpty(prisma, TABLES);
    } finally {
      await prisma.$disconnect();
    }
  },
);
