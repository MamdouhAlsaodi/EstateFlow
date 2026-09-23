import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import test from "node:test";
import {
  ReportApplication,
  decodeReportCursor,
  encodeReportCursor,
  prepareReportPage,
} from "../dist/features/finance/application/report-application.js";
import { ReceivableValidationError } from "../dist/features/finance/domain/receivable.js";

const owner = (id = "user-owner") => ({
  actor: { verified: true },
  userId: id,
  organizationId: "org-1",
});

function fakeMembership(membership) {
  return { findMembership: async () => membership };
}

function fakeRepository(overrides = {}) {
  return {
    getCashFlowSummary: async () => ({ cashIn: [], cashOut: [], netCash: [] }),
    listPaymentRows: async () => [],
    listExpenseRows: async () => [],
    getAgingSummary: async () => [],
    listAgingItemRows: async () => [],
    getCommissionSummary: async () => [],
    listCommissionItemRows: async () => [],
    getDealPerformance: async () => [],
    getPropertyPerformance: async () => [],
    ...overrides,
  };
}

test("EF-235 reporting is Owner-only across every surface", async () => {
  const roles = [
    ["BROKER", "ACTIVE"],
    ["MANAGER", "ACTIVE"],
    ["CLIENT", "ACTIVE"],
    ["OWNER", "PENDING"],
    ["OWNER", "SUSPENDED"],
    ["OWNER", "REVOKED"],
  ];
  for (const [role, status] of roles) {
    const application = new ReportApplication(
      fakeRepository(),
      fakeMembership({ organizationId: "org-1", role, status }),
    );
    for (const operation of [
      (input) => application.getCashFlow(input),
      (input) => application.listCashInflowItems(input),
      (input) => application.listCashOutflowItems(input),
      (input) => application.getAgingSummary(input),
      (input) => application.listAgingItems({ ...input, bucket: "CURRENT" }),
      (input) => application.getCommissionSummary(input),
      (input) => application.listCommissionItems({ ...input, status: "DUE" }),
      (input) => application.getPerformance(input),
    ]) {
      const result = await operation({ ...owner(), window: {} });
      assert.deepEqual(result, { kind: "access-denied" }, `${role}/${status}`);
    }
  }
  const outsider = new ReportApplication(
    fakeRepository(),
    fakeMembership(null),
  );
  assert.deepEqual(await outsider.getCashFlow({ ...owner(), window: {} }), {
    kind: "access-denied",
  });
  const unverified = new ReportApplication(
    fakeRepository(),
    fakeMembership({
      organizationId: "org-1",
      role: "OWNER",
      status: "ACTIVE",
    }),
  );
  assert.deepEqual(
    await unverified.getCashFlow({
      ...owner(),
      actor: { verified: false },
      window: {},
    }),
    { kind: "access-denied" },
  );
});

test("EF-235 cash flow merges net per currency with signed minors", async () => {
  const application = new ReportApplication(
    fakeRepository({
      getCashFlowSummary: async () => ({
        cashIn: [
          { currency: "USD", count: 2, amountMinor: 300n },
          { currency: "SAR", count: 1, amountMinor: 1000n },
        ],
        cashOut: [{ currency: "USD", count: 1, amountMinor: 500n }],
        netCash: [],
      }),
    }),
    fakeMembership({
      organizationId: "org-1",
      role: "OWNER",
      status: "ACTIVE",
    }),
  );
  const result = await application.getCashFlow({ ...owner(), window: {} });
  assert.equal(result.kind, undefined);
  assert.equal(result.asOf instanceof Date, true);
  assert.deepEqual(
    result.cashIn.map((row) => row.currency),
    ["SAR", "USD"],
  );
  assert.deepEqual(result.netCash, [
    { currency: "SAR", amountMinor: 1000n },
    { currency: "USD", amountMinor: -200n },
  ]);
});

test("EF-235 report window and page bounds are validated", async () => {
  const application = new ReportApplication(
    fakeRepository(),
    fakeMembership({
      organizationId: "org-1",
      role: "OWNER",
      status: "ACTIVE",
    }),
  );
  await assert.rejects(
    () =>
      application.getCashFlow({
        ...owner(),
        window: {
          from: new Date("2026-02-01T00:00:00.000Z"),
          to: new Date("2026-01-01T00:00:00.000Z"),
        },
      }),
    ReceivableValidationError,
  );
  await assert.rejects(
    () =>
      application.getCashFlow({
        ...owner(),
        window: { from: new Date("not-a-date") },
      }),
    ReceivableValidationError,
  );
  for (const limit of [0, -1, 101, 1.5]) {
    await assert.rejects(
      () => application.listCashInflowItems({ ...owner(), window: {}, limit }),
      ReceivableValidationError,
    );
  }
  await assert.rejects(
    () =>
      application.listCashInflowItems({
        ...owner(),
        window: {},
        dimension: { dealId: "d", propertyId: "p" },
      }),
    ReceivableValidationError,
  );
});

test("EF-235 page preparation fetches one sentinel row and validates cursors", () => {
  assert.deepEqual(prepareReportPage({}), { limit: 51 });
  const cursor = { at: new Date("2026-09-01T10:00:00.000Z"), id: randomUuid() };
  const encoded = encodeReportCursor(cursor);
  assert.deepEqual(prepareReportPage({ cursor: encoded, limit: 3 }), {
    after: cursor,
    limit: 4,
  });
  assert.deepEqual(decodeReportCursor(encoded), cursor);
  for (const bad of [
    "",
    "!!!!",
    Buffer.from(
      '{"v":2,"at":"2026-09-01T10:00:00.000Z","id":"' + randomUuid() + '"}',
    ).toString("base64url"),
    Buffer.from(
      '{"v":1,"at":"2026-09-01T10:00:00Z","id":"' + randomUuid() + '"}',
    ).toString("base64url"),
    Buffer.from(
      '{"v":1,"at":"2026-09-01T10:00:00.000Z","id":"not-a-uuid"}',
    ).toString("base64url"),
    Buffer.from("not json").toString("base64url"),
  ]) {
    assert.throws(() => decodeReportCursor(bad), ReceivableValidationError);
  }
});

test("EF-235 pagination emits the EF-233 style cursor from the last returned row", async () => {
  const rows = Array.from({ length: 4 }, (_, index) => ({
    paymentId: `payment-${index}`,
    receivableId: "r",
    invoiceId: "i",
    dealId: "d",
    propertyId: "p",
    currency: "USD",
    amountMinor: 10n,
    recordedAt: new Date(Date.parse("2026-09-01T00:00:00.000Z") + index * 1000),
  }));
  const application = new ReportApplication(
    fakeRepository({ listPaymentRows: async () => rows }),
    fakeMembership({
      organizationId: "org-1",
      role: "OWNER",
      status: "ACTIVE",
    }),
  );
  const page = await application.listCashInflowItems({
    ...owner(),
    window: {},
    limit: 3,
  });
  assert.equal(page.items.length, 3);
  assert.deepEqual(
    page.nextCursor,
    encodeReportCursor({
      at: rows[2].recordedAt,
      id: rows[2].paymentId,
    }),
  );
  const exact = await application.listCashInflowItems({
    ...owner(),
    window: {},
    limit: 4,
  });
  assert.equal(exact.nextCursor, undefined);
});

test("EF-235 aging and commission summaries are ordered and stable", async () => {
  const application = new ReportApplication(
    fakeRepository({
      getAgingSummary: async () => [
        {
          bucket: "DAYS_91_PLUS",
          currency: "USD",
          count: 1,
          outstandingMinor: 5n,
        },
        { bucket: "CURRENT", currency: "USD", count: 2, outstandingMinor: 7n },
        { bucket: "CURRENT", currency: "SAR", count: 1, outstandingMinor: 3n },
      ],
      getCommissionSummary: async () => [
        { status: "PAID", currency: "USD", count: 1, amountMinor: 11n },
        { status: "DUE", currency: "USD", count: 2, amountMinor: 22n },
      ],
    }),
    fakeMembership({
      organizationId: "org-1",
      role: "OWNER",
      status: "ACTIVE",
    }),
  );
  const aging = await application.getAgingSummary(owner());
  assert.deepEqual(
    aging.buckets.map((row) => row.bucket),
    ["CURRENT", "CURRENT", "DAYS_91_PLUS"],
  );
  const commissions = await application.getCommissionSummary(owner());
  assert.equal(commissions.due.length, 1);
  assert.equal(commissions.paid.length, 1);
  assert.equal(commissions.due[0].amountMinor, 22n);
});

test("EF-235 performance rows are returned with merged margins", async () => {
  const application = new ReportApplication(
    fakeRepository({
      getDealPerformance: async () => [
        {
          keyId: "deal-1",
          currency: "USD",
          revenueMinor: 900n,
          costsMinor: 400n,
          paymentCount: 2,
          expenseCount: 1,
        },
      ],
      getPropertyPerformance: async () => [
        {
          keyId: "property-1",
          currency: "USD",
          revenueMinor: 0n,
          costsMinor: 250n,
          paymentCount: 0,
          expenseCount: 1,
        },
      ],
    }),
    fakeMembership({
      organizationId: "org-1",
      role: "OWNER",
      status: "ACTIVE",
    }),
  );
  const performance = await application.getPerformance({
    ...owner(),
    window: {},
  });
  assert.deepEqual(performance.deals[0].marginMinor, 500n);
  assert.deepEqual(performance.properties[0].marginMinor, -250n);
});

test("EF-235 commission summary separates expected/due/paid; drill-down rejects unknown statuses", async () => {
  const application = new ReportApplication(
    fakeRepository({
      getCommissionSummary: async () => [
        { status: "EXPECTED", currency: "USD", count: 3, amountMinor: 30n },
        { status: "DUE", currency: "USD", count: 2, amountMinor: 22n },
        { status: "PAID", currency: "USD", count: 1, amountMinor: 11n },
      ],
    }),
    fakeMembership({
      organizationId: "org-1",
      role: "OWNER",
      status: "ACTIVE",
    }),
  );
  const summary = await application.getCommissionSummary(owner());
  assert.deepEqual(summary.expected, [
    { currency: "USD", count: 3, amountMinor: 30n },
  ]);
  assert.deepEqual(summary.due, [
    { currency: "USD", count: 2, amountMinor: 22n },
  ]);
  assert.deepEqual(summary.paid, [
    { currency: "USD", count: 1, amountMinor: 11n },
  ]);
  for (const status of ["FOO", ""]) {
    await assert.rejects(
      () =>
        application.listCommissionItems({
          ...owner(),
          status,
        }),
      ReceivableValidationError,
    );
  }
});

function randomUuid() {
  return "123e4567-e89b-42d3-a456-426614174000";
}
