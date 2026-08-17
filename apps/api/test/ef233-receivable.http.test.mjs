import assert from "node:assert/strict";
import test from "node:test";
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
  ParseUUIDPipe,
  RequestMethod,
  ValidationPipe,
} from "@nestjs/common";
import {
  GUARDS_METADATA,
  METHOD_METADATA,
  MODULE_METADATA,
  PATH_METADATA,
  ROUTE_ARGS_METADATA,
} from "@nestjs/common/constants.js";
import { AppModule } from "../dist/app.module.js";
import { BrowserSessionGuard } from "../dist/features/auth/http/browser-session.guard.js";
import { CsrfGuard } from "../dist/features/auth/http/csrf.guard.js";
import { RequireCanonicalOriginGuard } from "../dist/features/auth/http/origin.guard.js";
import { FinanceModule } from "../dist/features/finance/finance.module.js";
import { ReceivableController } from "../dist/features/finance/http/receivable.controller.js";
import {
  CancelInvoiceDto,
  CreateInvoiceDraftDto,
  IssueInvoiceDto,
  ReceivableAgingQueryDto,
  RecordPaymentDto,
} from "../dist/features/finance/http/receivable.dto.js";

const unsafe = [RequireCanonicalOriginGuard, BrowserSessionGuard, CsrfGuard];
const uuid = "22222222-2222-4222-8222-222222222222";
const route = (method) => [
  Reflect.getMetadata(PATH_METADATA, ReceivableController.prototype[method]),
  Reflect.getMetadata(METHOD_METADATA, ReceivableController.prototype[method]),
];
async function validate(dto, value) {
  return new ValidationPipe({
    transform: true,
    whitelist: true,
    forbidNonWhitelisted: true,
  }).transform(value, { type: "body", metatype: dto });
}

test("AppModule imports FinanceModule with ReceivableController", () => {
  assert.ok(
    Reflect.getMetadata(MODULE_METADATA.IMPORTS, AppModule).includes(
      FinanceModule,
    ),
  );
  assert.ok(
    Reflect.getMetadata(MODULE_METADATA.CONTROLLERS, FinanceModule).includes(
      ReceivableController,
    ),
  );
});

test("receivable exposes four guarded POST commands and one guarded aging GET", () => {
  assert.deepEqual(
    ["createDraft", "issue", "recordPayment", "cancel"].map(route),
    [
      [
        "organizations/:organizationId/finance/deals/:dealId/invoices",
        RequestMethod.POST,
      ],
      [
        "organizations/:organizationId/finance/invoices/:invoiceId/issue",
        RequestMethod.POST,
      ],
      [
        "organizations/:organizationId/finance/receivables/:receivableId/payments",
        RequestMethod.POST,
      ],
      [
        "organizations/:organizationId/finance/invoices/:invoiceId/cancel",
        RequestMethod.POST,
      ],
    ],
  );
  assert.deepEqual(route("aging"), [
    "organizations/:organizationId/finance/receivables/aging",
    RequestMethod.GET,
  ]);
  for (const method of ["createDraft", "issue", "recordPayment", "cancel"])
    assert.deepEqual(
      Reflect.getMetadata(
        GUARDS_METADATA,
        ReceivableController.prototype[method],
      ),
      unsafe,
    );
  assert.deepEqual(
    Reflect.getMetadata(GUARDS_METADATA, ReceivableController.prototype.aging),
    [BrowserSessionGuard],
  );
});

test("receivable route IDs use ParseUUIDPipe", () => {
  for (const method of [
    "createDraft",
    "issue",
    "recordPayment",
    "cancel",
    "aging",
  ]) {
    const argumentsMetadata = Reflect.getMetadata(
      ROUTE_ARGS_METADATA,
      ReceivableController,
      method,
    );
    assert.ok(
      Object.values(argumentsMetadata).some(({ pipes }) =>
        pipes.some((pipe) => pipe instanceof ParseUUIDPipe),
      ),
      method,
    );
  }
});

test("receivable DTOs accept only canonical string money and strict UTC instants", async () => {
  const draft = await validate(CreateInvoiceDraftDto, {
    amountMinor: "100",
    currency: "USD",
  });
  assert.equal(draft.amountMinor, 100n);
  assert.equal(draft.currency, "USD");
  const issue = await validate(IssueInvoiceDto, {
    receivableId: uuid,
    issuedAt: "2026-08-17T10:00:00.000Z",
    dueAt: "2026-08-18T10:00:00.000Z",
  });
  assert.equal(issue.receivableId, uuid);
  const payment = await validate(RecordPaymentDto, {
    amountMinor: "50",
    currency: "USD",
    recordedAt: "2026-08-17T10:00:00.000Z",
  });
  assert.equal(payment.amountMinor, 50n);
  for (const amountMinor of [50, "0", "01", "+1", "1.0", "1e2", " 1"]) {
    await assert.rejects(
      () => validate(CreateInvoiceDraftDto, { amountMinor, currency: "USD" }),
      BadRequestException,
    );
  }
  await assert.rejects(
    () =>
      validate(RecordPaymentDto, {
        amountMinor: "1",
        currency: "usd",
        recordedAt: "2026-08-17T10:00:00+00:00",
      }),
    BadRequestException,
  );
  const cancellation = await validate(CancelInvoiceDto, {
    reason: " request ",
  });
  assert.equal(cancellation.reason, "request");
  await assert.rejects(
    () => validate(CancelInvoiceDto, { reason: "   " }),
    BadRequestException,
  );
  const agingQuery = await validate(ReceivableAgingQueryDto, { limit: "50" });
  assert.equal(agingQuery.limit, 50);
  for (const limit of ["0", "01", "+1", "1.0", " 1", "101"]) {
    await assert.rejects(
      () => validate(ReceivableAgingQueryDto, { limit }),
      BadRequestException,
    );
  }
  await assert.rejects(
    () =>
      validate(IssueInvoiceDto, {
        receivableId: uuid,
        issuedAt: "2026-08-17T10:00:00.000Z",
        dueAt: "2026-08-18T10:00:00.000Z",
        forged: true,
      }),
    BadRequestException,
  );
});

const request = {
  auth: { userId: "user-1", verified: true, csrfHash: "csrf" },
};

test("controller maps exact commands, generated IDs, replay status, and bigint-safe responses", async () => {
  const calls = [];
  const app = {
    async createInvoiceDraft(input) {
      calls.push(["draft", input]);
      return {
        kind: "created",
        invoice: {
          money: { amountMinor: input.amountMinor },
          draftCreatedAt: new Date("2026-08-17T09:00:00.000Z"),
        },
      };
    },
    async issueInvoice(input) {
      calls.push(["issue", input]);
      return {
        kind: "replayed",
        invoice: { money: { amountMinor: 100n } },
        receivable: { outstandingMinor: 100n },
      };
    },
    async recordPayment(input) {
      calls.push(["payment", input]);
      return {
        kind: "replayed",
        payment: { money: { amountMinor: input.amountMinor } },
        receivable: { outstandingMinor: 50n },
      };
    },
  };
  const controller = new ReceivableController(app);
  const draft = await controller.createDraft(
    uuid,
    uuid,
    { amountMinor: 100n, currency: "USD" },
    request,
  );
  const issueResponse = { statusCode: 201 };
  const issue = await controller.issue(
    uuid,
    uuid,
    {
      receivableId: uuid,
      issuedAt: "2026-08-17T10:00:00.000Z",
      dueAt: "2026-08-18T10:00:00.000Z",
    },
    request,
    issueResponse,
  );
  const paymentResponse = { statusCode: 201 };
  const payment = await controller.recordPayment(
    uuid,
    uuid,
    {
      amountMinor: 50n,
      currency: "USD",
      recordedAt: "2026-08-17T11:00:00.000Z",
    },
    " key-1 ",
    request,
    paymentResponse,
  );
  await controller.recordPayment(
    uuid,
    uuid,
    {
      amountMinor: 50n,
      currency: "USD",
      recordedAt: "2026-08-17T11:00:00.000Z",
    },
    "key-1",
    request,
    { statusCode: 201 },
  );
  assert.match(calls[0][1].invoiceId, /^[0-9a-f-]{36}$/i);
  assert.match(calls[2][1].paymentId, /^[0-9a-f-]{36}$/i);
  assert.equal(calls[2][1].paymentId, calls[3][1].paymentId);
  assert.equal(calls[2][1].idempotencyKey, "key-1");
  assert.equal(issueResponse.statusCode, 200);
  assert.equal(paymentResponse.statusCode, 200);
  assert.equal(draft.invoice.money.amountMinor, "100");
  assert.equal(draft.invoice.draftCreatedAt, "2026-08-17T09:00:00.000Z");
  assert.equal(issue.receivable.outstandingMinor, "100");
  assert.equal(payment.payment.money.amountMinor, "50");
});

test("controller owns cancellation actor/time and aging server time", async () => {
  const calls = [];
  const controller = new ReceivableController({
    async cancelInvoice(input) {
      calls.push(["cancel", input]);
      return { kind: "cancelled", invoice: {}, receivable: {} };
    },
    async getReceivableAging(input) {
      calls.push(["aging", input]);
      return {
        asOf: input.asOf,
        items: [
          {
            receivableId: uuid,
            originalAmountMinor: 100n,
            outstandingMinor: 40n,
            dueAt: new Date("2026-08-18T00:00:00.000Z"),
          },
        ],
      };
    },
  });
  const cancellation = await controller.cancel(
    uuid,
    uuid,
    { reason: " customer request " },
    request,
  );
  const aging = await controller.aging(uuid, { limit: 10 }, request);
  assert.equal(calls[0][1].userId, "user-1");
  assert.equal(calls[0][1].reason, " customer request ");
  assert.ok(calls[0][1].cancelledAt instanceof Date);
  assert.ok(calls[1][1].asOf instanceof Date);
  assert.equal(cancellation.invoice.originalAmountMinor, undefined);
  assert.equal(aging.items[0].originalAmountMinor, "100");
  assert.equal(aging.items[0].dueAt, "2026-08-18T00:00:00.000Z");
});

test("controller maps typed application outcomes to safe HTTP exceptions", async () => {
  for (const [result, exception] of [
    [{ kind: "access-denied" }, ForbiddenException],
    [{ kind: "not-found", resource: "deal" }, NotFoundException],
    [
      { kind: "conflict", reason: "idempotency-payload-conflict" },
      ConflictException,
    ],
  ]) {
    const controller = new ReceivableController({
      async createInvoiceDraft() {
        return result;
      },
    });
    await assert.rejects(
      () =>
        controller.createDraft(
          uuid,
          uuid,
          { amountMinor: 1n, currency: "USD" },
          request,
        ),
      exception,
    );
  }
});
