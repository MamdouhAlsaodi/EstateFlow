import assert from "node:assert/strict";
import process from "node:process";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { PrismaClient } from "@prisma/client";
import { PrismaReportRepository } from "../dist/features/finance/infrastructure/prisma-report.repository.js";
import { ReportApplication } from "../dist/features/finance/application/report-application.js";
import { classifyReceivableAging } from "../dist/features/finance/domain/receivable.js";
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
  "CommissionAccrualSplit",
  "CommissionAccrual",
  "CommissionableValue",
  "CommissionPlanRecipient",
  "CommissionPlanVersion",
  "DealDomainEvent",
  "Expense",
  "Deal",
  "Property",
  "Lead",
  "Membership",
  "Organization",
  "User",
];
const uuid = () => randomUUID();
const DAY = 86_400_000;
const BUCKET_ORDER = [
  "CURRENT",
  "DAYS_1_30",
  "DAYS_31_60",
  "DAYS_61_90",
  "DAYS_91_PLUS",
];

/** Independent expectation: group source rows per currency, sorted, non-empty. */
function expectedTotals(rows, pick) {
  const currencies = [...new Set(rows.map((row) => row.currency))].sort();
  return currencies.map((currency) => {
    let total = 0n;
    let count = 0;
    for (const row of rows) {
      if (row.currency !== currency) continue;
      total += pick(row);
      count += 1;
    }
    return { currency, count, amountMinor: total };
  });
}

async function drain(fetchPage, cursorOf) {
  const pages = [];
  let cursor;
  for (;;) {
    const page = await fetchPage(cursor);
    pages.push(page);
    cursor = cursorOf(page);
    if (!cursor) break;
  }
  return pages;
}

function domainReceivable(row) {
  return {
    id: row.id,
    organizationId: row.organizationId,
    invoiceId: row.invoiceId,
    dealId: row.dealId,
    originalMoney: {
      amountMinor: row.originalAmountMinor,
      currency: row.currency,
    },
    outstandingMinor: row.outstandingMinor,
    status: row.status,
    issuedAt: row.issuedAt,
    dueAt: row.dueAt,
  };
}

async function paymentsForDeals(prisma, organizationId, dealIds) {
  if (dealIds.length === 0) return [];
  return prisma.paymentRecord.findMany({
    where: { organizationId, receivable: { dealId: { in: dealIds } } },
  });
}

function expectedPerformanceRows(payments, expenses, keyId) {
  const byCurrency = new Map();
  const rowFor = (currency) => {
    const existing = byCurrency.get(currency);
    if (existing) return existing;
    const row = {
      keyId,
      currency,
      revenueMinor: 0n,
      costsMinor: 0n,
      paymentCount: 0,
      expenseCount: 0,
    };
    byCurrency.set(currency, row);
    return row;
  };
  for (const payment of payments) {
    const row = rowFor(payment.currency);
    row.revenueMinor += payment.amountMinor;
    row.paymentCount += 1;
  }
  for (const expense of expenses) {
    const row = rowFor(expense.currency);
    row.costsMinor += expense.amountMinor;
    row.expenseCount += 1;
  }
  return [...byCurrency.values()]
    .map((row) => ({ ...row, marginMinor: row.revenueMinor - row.costsMinor }))
    .sort((left, right) => left.currency.localeCompare(right.currency));
}

async function seedScenario(prisma) {
  const now = new Date();
  const organizationId = uuid();
  const otherOrganizationId = uuid();
  const ownerId = uuid();
  const brokerId = uuid();
  await prisma.user.createMany({
    data: [ownerId, brokerId].map((id) => ({
      id,
      accountIdentifier: `${id}@test.invalid`,
      verifiedAt: now,
    })),
  });
  await prisma.organization.createMany({
    data: [
      { id: organizationId, name: "Report A" },
      { id: otherOrganizationId, name: "Report B" },
    ],
  });
  await prisma.membership.createMany({
    data: [
      { organizationId, userId: ownerId, role: "OWNER", status: "ACTIVE" },
      { organizationId, userId: brokerId, role: "BROKER", status: "ACTIVE" },
      {
        organizationId: otherOrganizationId,
        userId: ownerId,
        role: "OWNER",
        status: "ACTIVE",
      },
    ],
  });
  const property = async (organizationIdValue, title) =>
    (
      await prisma.property.create({
        data: {
          id: uuid(),
          organizationId: organizationIdValue,
          title,
          propertyType: "HOUSE",
          addressText: title,
          status: "ACTIVE",
        },
      })
    ).id;
  const p1 = await property(organizationId, "P1");
  const p2 = await property(organizationId, "P2");
  const deal = async (propertyId) => {
    const leadId = uuid();
    await prisma.$executeRaw`INSERT INTO "Lead" ("id", "organizationId", "ownerId", "stage", "nextAction", "source", "version", "createdAt", "updatedAt") VALUES (${leadId}::uuid, ${organizationId}::uuid, ${ownerId}::uuid, 'QUALIFIED', 'x', 'x', 1, ${now}, ${now})`;
    const dealId = uuid();
    await prisma.deal.create({
      data: {
        id: dealId,
        organizationId,
        leadId,
        propertyId,
        brokerId,
      },
    });
    return dealId;
  };
  const d1 = await deal(p1);
  const d2 = await deal(p2);
  const d3 = await deal(p1);

  const receivable = async (
    dealId,
    amountMinor,
    currency,
    dueAt,
    status = "ISSUED",
  ) => {
    const invoiceId = uuid();
    const receivableId = uuid();
    const issuedAt = new Date(dueAt.getTime() - DAY);
    await prisma.invoice.create({
      data: {
        id: invoiceId,
        organizationId,
        dealId,
        amountMinor,
        currency,
        status,
        draftCreatedBy: ownerId,
        draftCreatedAt: issuedAt,
        issuedBy: ownerId,
        issuedAt,
        dueAt,
      },
    });
    await prisma.receivable.create({
      data: {
        id: receivableId,
        organizationId,
        invoiceId,
        dealId,
        originalAmountMinor: amountMinor,
        outstandingMinor: amountMinor,
        currency,
        status: "OPEN",
        issuedAt,
        dueAt,
      },
    });
    return { invoiceId, receivableId };
  };
  const payment = async (receivableId, amountMinor, currency, recordedAt) =>
    prisma.paymentRecord.create({
      data: {
        id: uuid(),
        organizationId,
        receivableId,
        amountMinor,
        currency,
        recordedAt,
        recordedBy: ownerId,
        commandScope: "RECEIVABLE_PAYMENT_RECORD",
        idempotencyKey: uuid(),
        commandPayloadHash: "a".repeat(64),
      },
    });
  const expense = async (data) =>
    prisma.expense.create({
      data: {
        id: uuid(),
        organizationId,
        vendorReference: "vendor",
        draftCreatedBy: ownerId,
        draftCreatedAt: now,
        ...data,
      },
    });

  // Receivables across every aging bucket (mid-bucket placements).
  const i1 = await receivable(
    d1,
    100_000n,
    "USD",
    new Date(now.getTime() + 10 * DAY),
  );
  await payment(
    i1.receivableId,
    40_000n,
    "USD",
    new Date(now.getTime() - 2 * DAY),
  );
  await prisma.receivable.update({
    where: { id: i1.receivableId },
    data: { outstandingMinor: 60_000n, status: "PARTIALLY_PAID" },
  });
  await receivable(d2, 200_000n, "USD", new Date(now.getTime() - 5 * DAY));
  const i3 = await receivable(
    d3,
    50_000n,
    "USD",
    new Date(now.getTime() - 45 * DAY),
  );
  await payment(
    i3.receivableId,
    50_000n,
    "USD",
    new Date(now.getTime() - 30 * DAY),
  );
  await prisma.receivable.update({
    where: { id: i3.receivableId },
    data: { outstandingMinor: 0n, status: "PAID" },
  });
  await receivable(d1, 70_000n, "USD", new Date(now.getTime() - 200 * DAY));
  const i6 = await receivable(
    d3,
    60_000n,
    "USD",
    new Date(now.getTime() - 75 * DAY),
  );
  await payment(i6.receivableId, 10_000n, "USD", now);
  await prisma.receivable.update({
    where: { id: i6.receivableId },
    data: { outstandingMinor: 50_000n, status: "PARTIALLY_PAID" },
  });
  const i7 = await receivable(
    d3,
    20_000n,
    "SAR",
    new Date(now.getTime() + 3 * DAY),
  );
  await payment(i7.receivableId, 5_000n, "SAR", now);
  await prisma.receivable.update({
    where: { id: i7.receivableId },
    data: { outstandingMinor: 15_000n, status: "PARTIALLY_PAID" },
  });
  // Cancellation/reversal period: issued then cancelled, no payments.
  const i5 = await receivable(
    d2,
    80_000n,
    "USD",
    new Date(now.getTime() - 1 * DAY),
  );
  await prisma.invoice.update({
    where: { id: i5.invoiceId },
    data: {
      status: "CANCELLED",
      cancelledBy: ownerId,
      cancelledAt: now,
      cancellationReason: "deal fell through",
    },
  });
  await prisma.receivable.update({
    where: { id: i5.receivableId },
    data: { status: "CANCELLED" },
  });

  // Commission snapshots across the lifecycle (only DUE/PAID are reported).
  const planId = uuid();
  await prisma.commissionPlanVersion.create({
    data: { id: planId, organizationId, version: 1, rateBps: 500 },
  });
  await prisma.commissionPlanRecipient.createMany({
    data: [
      {
        organizationId,
        planVersionId: planId,
        order: 1,
        kind: "BROKER",
        splitBps: 6000,
      },
      {
        organizationId,
        planVersionId: planId,
        order: 2,
        kind: "OFFICE",
        splitBps: 4000,
      },
    ],
  });
  // Commission snapshots as they persist today (EF-232's durable boundary
  // only persists EXPECTED accruals; the DUE/PAID lifecycle is typed but not
  // yet durably persisted). The report reads whatever statuses exist.
  const accrual = async (dealId, totalMinor) => {
    const eventId = uuid();
    const valueId = uuid();
    const accrualId = uuid();
    await prisma.dealDomainEvent.create({
      data: {
        id: eventId,
        organizationId,
        dealId,
        type: "DEAL_CLOSED_WON",
        schemaVersion: 1,
        occurredAt: now,
        data: {},
      },
    });
    await prisma.commissionableValue.create({
      data: {
        id: valueId,
        organizationId,
        dealId,
        amountMinor: (totalMinor * 10_000n) / 500n,
        currency: "USD",
        capturedBy: ownerId,
        capturedAt: now,
      },
    });
    await prisma.commissionAccrual.create({
      data: {
        id: accrualId,
        organizationId,
        dealId,
        dealClosedWonEventId: eventId,
        commissionableValueId: valueId,
        commissionPlanVersionId: planId,
        totalAmountMinor: totalMinor,
        currency: "USD",
        status: "EXPECTED",
        createdAt: now,
      },
    });
    await prisma.commissionAccrualSplit.createMany({
      data: [
        {
          organizationId,
          accrualId,
          order: 1,
          kind: "BROKER",
          amountMinor: (totalMinor * 6000n) / 10000n,
          currency: "USD",
        },
        {
          organizationId,
          accrualId,
          order: 2,
          kind: "OFFICE",
          amountMinor: totalMinor - (totalMinor * 6000n) / 10000n,
          currency: "USD",
        },
      ],
    });
    return accrualId;
  };
  await accrual(d1, 50_000n);
  await accrual(d2, 25_000n);
  await accrual(d3, 30_000n);

  // Expenses across statuses and dimensions. Approval state constraints
  // require submitter/decision fields, and maker-checker requires a decider
  // other than the draft creator.
  const decide = (decidedAt) => ({
    submittedBy: brokerId,
    submittedAt: new Date(decidedAt.getTime() - 60_000),
    decidedBy: brokerId,
  });
  await expense({
    category: "PROPERTY",
    amountMinor: 30_000n,
    currency: "USD",
    status: "APPROVED",
    dealId: d1,
    ...decide(new Date(now.getTime() - 3 * DAY)),
    decidedAt: new Date(now.getTime() - 3 * DAY),
    decision: "APPROVED",
  });
  await expense({
    category: "PROPERTY",
    amountMinor: 15_000n,
    currency: "USD",
    status: "APPROVED",
    propertyId: p2,
    ...decide(new Date(now.getTime() - 4 * DAY)),
    decidedAt: new Date(now.getTime() - 4 * DAY),
    decision: "APPROVED",
  });
  await expense({
    category: "CAMPAIGN",
    vendorReference: "ads",
    amountMinor: 12_000n,
    currency: "USD",
    status: "APPROVED",
    campaignReference: "ramadan",
    ...decide(new Date(now.getTime() - 5 * DAY)),
    decidedAt: new Date(now.getTime() - 5 * DAY),
    decision: "APPROVED",
  });
  await expense({
    category: "OFFICE",
    amountMinor: 25_000n,
    currency: "SAR",
    status: "APPROVED",
    dealId: d2,
    ...decide(new Date(now.getTime() - 6 * DAY)),
    decidedAt: new Date(now.getTime() - 6 * DAY),
    decision: "APPROVED",
  });
  const submittedExpenseId = (
    await expense({
      category: "OFFICE",
      amountMinor: 99_000n,
      currency: "USD",
      status: "SUBMITTED",
      submittedBy: brokerId,
      submittedAt: now,
    })
  ).id;
  const rejectedExpenseId = (
    await expense({
      category: "OTHER",
      amountMinor: 88_888n,
      currency: "USD",
      status: "REJECTED",
      submittedBy: brokerId,
      submittedAt: new Date(now.getTime() - 60_000),
      decidedBy: brokerId,
      decidedAt: now,
      decision: "REJECTED",
      decisionReason: "not needed",
    })
  ).id;
  const draftExpenseId = (
    await expense({
      category: "OTHER",
      amountMinor: 77_777n,
      currency: "USD",
      status: "DRAFT",
    })
  ).id;

  // Foreign organization rows that must never leak into org A reports.
  const foreignLeadId = uuid();
  const foreignPropertyId = uuid();
  const foreignDealId = uuid();
  await prisma.property.create({
    data: {
      id: foreignPropertyId,
      organizationId: otherOrganizationId,
      title: "FP",
      propertyType: "HOUSE",
      addressText: "FP",
      status: "ACTIVE",
    },
  });
  await prisma.$executeRaw`INSERT INTO "Lead" ("id", "organizationId", "ownerId", "stage", "nextAction", "source", "version", "createdAt", "updatedAt") VALUES (${foreignLeadId}::uuid, ${otherOrganizationId}::uuid, ${ownerId}::uuid, 'QUALIFIED', 'x', 'x', 1, ${now}, ${now})`;
  await prisma.deal.create({
    data: {
      id: foreignDealId,
      organizationId: otherOrganizationId,
      leadId: foreignLeadId,
      propertyId: foreignPropertyId,
      brokerId: ownerId,
    },
  });
  const foreignInvoiceId = uuid();
  const foreignReceivableId = uuid();
  await prisma.invoice.create({
    data: {
      id: foreignInvoiceId,
      organizationId: otherOrganizationId,
      dealId: foreignDealId,
      amountMinor: 999_000n,
      currency: "USD",
      status: "ISSUED",
      draftCreatedBy: ownerId,
      draftCreatedAt: now,
      issuedBy: ownerId,
      issuedAt: new Date(now.getTime() - 1 * DAY),
      dueAt: new Date(now.getTime() - 1 * DAY),
    },
  });
  await prisma.receivable.create({
    data: {
      id: foreignReceivableId,
      organizationId: otherOrganizationId,
      invoiceId: foreignInvoiceId,
      dealId: foreignDealId,
      originalAmountMinor: 999_000n,
      outstandingMinor: 999_000n,
      currency: "USD",
      status: "OPEN",
      issuedAt: new Date(now.getTime() - 1 * DAY),
      dueAt: new Date(now.getTime() - 1 * DAY),
    },
  });
  const foreignPaymentId = uuid();
  await prisma.paymentRecord.create({
    data: {
      id: foreignPaymentId,
      organizationId: otherOrganizationId,
      receivableId: foreignReceivableId,
      amountMinor: 111_000n,
      currency: "EUR",
      recordedAt: now,
      recordedBy: ownerId,
      commandScope: "RECEIVABLE_PAYMENT_RECORD",
      idempotencyKey: uuid(),
      commandPayloadHash: "b".repeat(64),
    },
  });

  return {
    now,
    organizationId,
    otherOrganizationId,
    ownerId,
    brokerId,
    properties: { p1, p2 },
    deals: { d1, d2, d3 },
    cancelledReceivableId: i5.receivableId,
    submittedExpenseId,
    rejectedExpenseId,
    draftExpenseId,
    foreignPaymentId,
    foreignCashInMinor: 111_000n,
  };
}

test(
  "EF-235 FIN-05 report-to-ledger reconciliation over a seeded synthetic scenario",
  { skip: !guarded },
  async () => {
    const prisma = new PrismaClient();
    try {
      await prisma.$connect();
      await cleanupDatabase(prisma, tables);
      const seed = await seedScenario(prisma);
      const application = new ReportApplication(
        new PrismaReportRepository(prisma),
        {
          findMembership: async (organizationId, userId) =>
            userId === seed.ownerId &&
            [seed.organizationId, seed.otherOrganizationId].includes(
              organizationId,
            )
              ? { organizationId, role: "OWNER", status: "ACTIVE" }
              : null,
        },
      );
      const owner = {
        actor: { verified: true },
        userId: seed.ownerId,
        organizationId: seed.organizationId,
      };

      // 1. Cash in/out equals the exact sums of payment and approved-expense rows.
      const cashFlow = await application.getCashFlow({ ...owner, window: {} });
      const rawPayments = await prisma.paymentRecord.findMany({
        where: { organizationId: seed.organizationId },
      });
      const rawApprovedExpenses = await prisma.expense.findMany({
        where: { organizationId: seed.organizationId, status: "APPROVED" },
      });
      assert.deepEqual(
        cashFlow.cashIn,
        expectedTotals(rawPayments, (row) => row.amountMinor),
      );
      assert.deepEqual(
        cashFlow.cashOut,
        expectedTotals(rawApprovedExpenses, (row) => row.amountMinor),
      );
      for (const net of cashFlow.netCash) {
        const inflow =
          cashFlow.cashIn.find((row) => row.currency === net.currency)
            ?.amountMinor ?? 0n;
        const outflow =
          cashFlow.cashOut.find((row) => row.currency === net.currency)
            ?.amountMinor ?? 0n;
        assert.equal(net.amountMinor, inflow - outflow);
      }

      // 2. Windowed cash flow equals exactly the in-range source rows.
      const windowFrom = new Date(seed.now.getTime() - 2 * DAY - 60_000);
      const windowed = await application.getCashFlow({
        ...owner,
        window: { from: windowFrom },
      });
      assert.deepEqual(
        windowed.cashIn,
        expectedTotals(
          rawPayments.filter((row) => row.recordedAt >= windowFrom),
          (row) => row.amountMinor,
        ),
      );

      // 3. Payment drill-down equals the cash-in source rows exactly.
      const paymentPages = await drain(
        (cursor) =>
          application.listCashInflowItems({
            ...owner,
            window: {},
            cursor,
            limit: 2,
          }),
        (page) => page.nextCursor,
      );
      const paymentRows = paymentPages.flatMap((page) => page.items);
      assert.equal(paymentRows.length, rawPayments.length);
      assert.deepEqual(
        new Set(paymentRows.map((row) => row.paymentId)),
        new Set(rawPayments.map((row) => row.id)),
      );
      for (const row of paymentRows) {
        const source = rawPayments.find((item) => item.id === row.paymentId);
        assert.equal(row.amountMinor, source.amountMinor);
        assert.equal(row.currency, source.currency);
        const receivable = await prisma.receivable.findUnique({
          where: { id: row.receivableId },
        });
        assert.equal(row.dealId, receivable.dealId);
        assert.equal(row.propertyId.length > 0, true);
      }
      assert.equal(
        paymentRows.some((row) => row.paymentId === seed.foreignPaymentId),
        false,
      );

      // 4. Expense drill-down equals the approved-expense source rows exactly;
      // non-approved expenses never appear.
      const expensePages = await drain(
        (cursor) =>
          application.listCashOutflowItems({
            ...owner,
            window: {},
            cursor,
            limit: 2,
          }),
        (page) => page.nextCursor,
      );
      const expenseRows = expensePages.flatMap((page) => page.items);
      assert.equal(expenseRows.length, rawApprovedExpenses.length);
      assert.deepEqual(
        new Set(expenseRows.map((row) => row.expenseId)),
        new Set(rawApprovedExpenses.map((row) => row.id)),
      );
      assert.equal(
        expenseRows.some((row) => row.expenseId === seed.rejectedExpenseId),
        false,
      );
      assert.equal(
        expenseRows.some((row) => row.expenseId === seed.submittedExpenseId),
        false,
      );
      assert.equal(
        expenseRows.some((row) => row.expenseId === seed.draftExpenseId),
        false,
      );

      // 5. Aging summary equals the per-row EF-233 domain classification.
      const aging = await application.getAgingSummary(owner);
      const rawReceivables = await prisma.receivable.findMany({
        where: { organizationId: seed.organizationId },
      });
      const openReceivables = rawReceivables.filter(
        (row) => row.status === "OPEN" || row.status === "PARTIALLY_PAID",
      );
      const expectedBuckets = new Map();
      for (const receivable of openReceivables) {
        const classification = classifyReceivableAging(
          domainReceivable(receivable),
          aging.asOf,
        );
        assert.notEqual(classification, null);
        const key = `${classification.bucket}|${receivable.currency}`;
        const current = expectedBuckets.get(key) ?? {
          bucket: classification.bucket,
          currency: receivable.currency,
          count: 0,
          outstandingMinor: 0n,
        };
        current.count += 1;
        current.outstandingMinor += receivable.outstandingMinor;
        expectedBuckets.set(key, current);
      }
      assert.deepEqual(
        aging.buckets,
        [...expectedBuckets.values()].sort(
          (left, right) =>
            BUCKET_ORDER.indexOf(left.bucket) -
              BUCKET_ORDER.indexOf(right.bucket) ||
            left.currency.localeCompare(right.currency),
        ),
      );

      // 6. Every bucket drill-down equals its classified source rows, and the
      // cancelled receivable (reversal period) is excluded everywhere.
      assert.equal(
        rawReceivables.some((row) => row.id === seed.cancelledReceivableId),
        true,
      );
      for (const bucket of BUCKET_ORDER) {
        const pages = await drain(
          (cursor) =>
            application.listAgingItems({
              ...owner,
              bucket,
              cursor,
              limit: 2,
            }),
          (page) => page.nextCursor,
        );
        const items = pages.flatMap((page) => page.items);
        const expected = openReceivables
          .map((row) => ({
            row,
            classification: classifyReceivableAging(
              domainReceivable(row),
              aging.asOf,
            ),
          }))
          .filter(({ classification }) => classification.bucket === bucket)
          .sort((left, right) =>
            left.row.dueAt.getTime() === right.row.dueAt.getTime()
              ? left.row.id.localeCompare(right.row.id)
              : left.row.dueAt.getTime() - right.row.dueAt.getTime(),
          );
        assert.equal(items.length, expected.length, bucket);
        assert.equal(
          items.some(
            (item) => item.receivableId === seed.cancelledReceivableId,
          ),
          false,
        );
        let bucketOutstanding = 0n;
        for (const [index, item] of items.entries()) {
          const source = expected[index];
          assert.equal(item.receivableId, source.row.id);
          assert.equal(item.outstandingMinor, source.row.outstandingMinor);
          assert.equal(item.daysPastDue, source.classification.daysPastDue);
          assert.equal(item.status, source.row.status);
          bucketOutstanding += item.outstandingMinor;
        }
        const summaryRows = aging.buckets.filter(
          (row) => row.bucket === bucket,
        );
        assert.equal(
          summaryRows.reduce((sum, row) => sum + row.outstandingMinor, 0n),
          bucketOutstanding,
        );
        assert.equal(
          summaryRows.reduce((sum, row) => sum + row.count, 0),
          items.length,
        );
      }

      // 7. Commission due/paid figures equal the EF-232 snapshot rows.
      const commissions = await application.getCommissionSummary(owner);
      const rawAccruals = await prisma.commissionAccrual.findMany({
        where: { organizationId: seed.organizationId },
      });
      assert.deepEqual(
        commissions.due,
        expectedTotals(
          rawAccruals.filter((row) => row.status === "DUE"),
          (row) => row.totalAmountMinor,
        ),
      );
      assert.deepEqual(
        commissions.paid,
        expectedTotals(
          rawAccruals.filter((row) => row.status === "PAID"),
          (row) => row.totalAmountMinor,
        ),
      );
      const commissionPages = await drain(
        (cursor) =>
          application.listCommissionItems({
            ...owner,
            status: "DUE",
            cursor,
            limit: 2,
          }),
        (page) => page.nextCursor,
      );
      const dueItems = commissionPages.flatMap((page) => page.items);
      const dueSource = rawAccruals.filter((row) => row.status === "DUE");
      assert.deepEqual(
        new Set(dueItems.map((row) => row.accrualId)),
        new Set(dueSource.map((row) => row.id)),
      );
      for (const item of dueItems) {
        const splits = await prisma.commissionAccrualSplit.findMany({
          where: {
            organizationId: seed.organizationId,
            accrualId: item.accrualId,
          },
          orderBy: { order: "asc" },
        });
        assert.deepEqual(
          item.splits.map((split) => `${split.order}:${split.amountMinor}`),
          splits.map((split) => `${split.order}:${split.amountMinor}`),
        );
      }

      // 8. Revenue/margin by deal and by property equal the source rows.
      const performance = await application.getPerformance({
        ...owner,
        window: {},
      });
      const deals = await prisma.deal.findMany({
        where: { organizationId: seed.organizationId },
      });
      for (const deal of deals) {
        const dealPayments = await paymentsForDeals(
          prisma,
          seed.organizationId,
          [deal.id],
        );
        const dealExpenses = await prisma.expense.findMany({
          where: {
            organizationId: seed.organizationId,
            status: "APPROVED",
            dealId: deal.id,
          },
        });
        assert.deepEqual(
          performance.deals.filter((row) => row.keyId === deal.id),
          expectedPerformanceRows(dealPayments, dealExpenses, deal.id),
          `deal ${deal.id}`,
        );
      }
      const properties = await prisma.property.findMany({
        where: { organizationId: seed.organizationId },
      });
      for (const property of properties) {
        const propertyDeals = deals.filter(
          (deal) => deal.propertyId === property.id,
        );
        const propertyPayments = await paymentsForDeals(
          prisma,
          seed.organizationId,
          propertyDeals.map((deal) => deal.id),
        );
        const propertyExpenses = await prisma.expense.findMany({
          where: {
            organizationId: seed.organizationId,
            status: "APPROVED",
            propertyId: property.id,
          },
        });
        assert.deepEqual(
          performance.properties.filter((row) => row.keyId === property.id),
          expectedPerformanceRows(
            propertyPayments,
            propertyExpenses,
            property.id,
          ),
          `property ${property.id}`,
        );
      }

      // 9. Tenant isolation: figures of the other organization stay there.
      const foreignCashFlow = await application.getCashFlow({
        ...owner,
        organizationId: seed.otherOrganizationId,
        window: {},
      });
      assert.deepEqual(foreignCashFlow.cashIn, [
        { currency: "EUR", count: 1, amountMinor: seed.foreignCashInMinor },
      ]);
      assert.equal(
        cashFlow.cashIn.some((row) => row.currency === "EUR"),
        false,
      );
    } finally {
      await cleanupDatabase(prisma, tables);
      await assertTablesAreEmpty(prisma, tables);
      await prisma.$disconnect();
    }
  },
);
