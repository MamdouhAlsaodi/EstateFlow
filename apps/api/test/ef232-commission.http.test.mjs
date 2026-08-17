import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  BadRequestException,
  ParseUUIDPipe,
  RequestMethod,
  ValidationPipe,
} from "@nestjs/common";
import {
  GUARDS_METADATA,
  METHOD_METADATA,
  PATH_METADATA,
  ROUTE_ARGS_METADATA,
} from "@nestjs/common/constants.js";
import { CommissionController } from "../dist/features/finance/http/commission.controller.js";
import { CsrfGuard } from "../dist/features/auth/http/csrf.guard.js";
import { BrowserSessionGuard } from "../dist/features/auth/http/browser-session.guard.js";
import { RequireCanonicalOriginGuard } from "../dist/features/auth/http/origin.guard.js";
import {
  CreateCommissionPlanVersionDto,
  CaptureCommissionableValueDto,
  CreateExpectedAccrualDto,
} from "../dist/features/finance/http/commission.dto.js";

const guards = [RequireCanonicalOriginGuard, BrowserSessionGuard, CsrfGuard];
const uuid = "22222222-2222-4222-8222-222222222222";
const routes = (method) => [
  Reflect.getMetadata(PATH_METADATA, CommissionController.prototype[method]),
  Reflect.getMetadata(METHOD_METADATA, CommissionController.prototype[method]),
];
async function validate(dto, value) {
  return new ValidationPipe({
    transform: true,
    whitelist: true,
    forbidNonWhitelisted: true,
  }).transform(value, { type: "body", metatype: dto });
}

test("commission exposes exactly three guarded POST commands", () => {
  assert.deepEqual(
    [
      "createPlanVersion",
      "captureCommissionableValue",
      "createExpectedAccrual",
    ].map(routes),
    [
      [
        "organizations/:organizationId/finance/commission-plan-versions",
        RequestMethod.POST,
      ],
      [
        "organizations/:organizationId/finance/deals/:dealId/commissionable-values",
        RequestMethod.POST,
      ],
      [
        "organizations/:organizationId/finance/deals/:dealId/expected-commissions",
        RequestMethod.POST,
      ],
    ],
  );
  for (const method of [
    "createPlanVersion",
    "captureCommissionableValue",
    "createExpectedAccrual",
  ])
    assert.deepEqual(
      Reflect.getMetadata(
        GUARDS_METADATA,
        CommissionController.prototype[method],
      ),
      guards,
    );
});

test("commission route IDs use ParseUUIDPipe", () => {
  for (const method of [
    "createPlanVersion",
    "captureCommissionableValue",
    "createExpectedAccrual",
  ]) {
    const metadata = Reflect.getMetadata(
      ROUTE_ARGS_METADATA,
      CommissionController,
      method,
    );
    assert.ok(
      Object.values(metadata).some(({ pipes }) =>
        pipes.some((pipe) => pipe instanceof ParseUUIDPipe),
      ),
      method,
    );
  }
});

test("commission DTOs enforce strict policy, UUIDs, canonical money, and UTC", async () => {
  const plan = await validate(CreateCommissionPlanVersionDto, { version: 1 });
  assert.equal(plan.version, 1);
  await validate(CreateCommissionPlanVersionDto, {
    version: 2,
    rateBps: 750,
    recipients: [
      { order: 1, kind: "BROKER", splitBps: 6000 },
      { order: 2, kind: "OFFICE", splitBps: 4000 },
    ],
  });
  for (const value of [
    { version: 1, rateBps: 750 },
    { version: 1, recipients: [{ order: 1, kind: "BROKER", splitBps: 10000 }] },
    { version: 1, extra: true },
    { version: 1, id: uuid },
    { version: 0 },
  ])
    await assert.rejects(
      () => validate(CreateCommissionPlanVersionDto, value),
      BadRequestException,
    );
  const captured = await validate(CaptureCommissionableValueDto, {
    valueId: uuid,
    amountMinor: "100",
    currency: "USD",
    capturedAt: "2026-08-14T12:00:00.000Z",
  });
  assert.equal(captured.amountMinor, "100");
  for (const amountMinor of [100, "0", "01", "+1", "1.0", "1e2", " 1"])
    await assert.rejects(
      () =>
        validate(CaptureCommissionableValueDto, {
          valueId: uuid,
          amountMinor,
          currency: "USD",
          capturedAt: "2026-08-14T12:00:00.000Z",
        }),
      BadRequestException,
    );
  await assert.rejects(
    () =>
      validate(CaptureCommissionableValueDto, {
        valueId: uuid,
        amountMinor: "1",
        currency: "US",
        capturedAt: "2026-08-14T12:00:00.000Z",
      }),
    BadRequestException,
  );
  await validate(CreateExpectedAccrualDto, {
    accrualId: uuid,
    commissionableValueId: uuid,
    commissionPlanVersionId: uuid,
    dealClosedWonEventId: uuid,
  });
});

test("commission controller narrows explicit recipient policy without assertion workarounds", async () => {
  const source = readFileSync(
    new URL(
      "../src/features/finance/http/commission.controller.ts",
      import.meta.url,
    ),
    "utf8",
  );
  assert.doesNotMatch(source, /recipients!/);
  assert.doesNotMatch(source, /as unknown as/);
  assert.doesNotMatch(source, /commissionResponse\(result\)\s+as\s+T/);
  assert.doesNotMatch(source, /\bas\s+[A-Z_$][\w$]*(?:<[^>]+>)?\b/);
  assert.doesNotMatch(source, /\b[A-Za-z_$][\w$]*!\b/);
  let received;
  const application = {
    createPlanVersion: async (command) => {
      received = command;
      return { kind: "created-plan", plan: { rateBps: 500n } };
    },
  };
  const controller = new CommissionController(application);
  const request = { auth: { verified: true, userId: uuid } };
  const recipients = [
    { order: 1, kind: "BROKER", splitBps: 6000 },
    { order: 2, kind: "OFFICE", splitBps: 4000 },
  ];
  assert.deepEqual(
    await controller.createPlanVersion(
      uuid,
      { version: 1, rateBps: 500, recipients },
      request,
    ),
    { plan: { rateBps: "500" } },
  );
  assert.deepEqual(received.recipients, recipients);
  await assert.rejects(
    () =>
      controller.createPlanVersion(uuid, { version: 1, rateBps: 500 }, request),
    BadRequestException,
  );
});

test("commission controller serializes bigint and maps opaque result kinds", async () => {
  const application = {
    createPlanVersion: async () => ({
      kind: "created-plan",
      plan: { rateBps: 500n },
    }),
    captureCommissionableValue: async () => ({
      kind: "captured",
      value: { money: { amountMinor: 100n } },
    }),
    createExpectedAccrual: async () => ({
      kind: "replayed",
      accrual: { totalMoney: { amountMinor: 5n } },
    }),
  };
  const controller = new CommissionController(application);
  const request = { auth: { verified: true, userId: uuid } };
  assert.deepEqual(
    await controller.createPlanVersion(uuid, { id: uuid, version: 1 }, request),
    { plan: { rateBps: "500" } },
  );
  assert.deepEqual(
    await controller.captureCommissionableValue(
      uuid,
      uuid,
      {
        valueId: uuid,
        amountMinor: "100",
        currency: "USD",
        capturedAt: "2026-08-14T12:00:00.000Z",
      },
      request,
    ),
    { value: { money: { amountMinor: "100" } } },
  );
  assert.deepEqual(
    await controller.createExpectedAccrual(
      uuid,
      uuid,
      {
        accrualId: uuid,
        commissionableValueId: uuid,
        commissionPlanVersionId: uuid,
        dealClosedWonEventId: uuid,
      },
      request,
      { statusCode: 201 },
    ),
    { accrual: { totalMoney: { amountMinor: "5" } } },
  );
});
