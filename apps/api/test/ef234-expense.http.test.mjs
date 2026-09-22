import assert from "node:assert/strict";
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
  MODULE_METADATA,
  PATH_METADATA,
  ROUTE_ARGS_METADATA,
} from "@nestjs/common/constants.js";
import { AppModule } from "../dist/app.module.js";
import { BrowserSessionGuard } from "../dist/features/auth/http/browser-session.guard.js";
import { CsrfGuard } from "../dist/features/auth/http/csrf.guard.js";
import { RequireCanonicalOriginGuard } from "../dist/features/auth/http/origin.guard.js";
import { FinanceModule } from "../dist/features/finance/finance.module.js";
import { ExpenseController } from "../dist/features/finance/http/expense.controller.js";
import {
  AttachExpenseEvidenceDto,
  CreateExpenseDto,
  DecideExpenseDto,
  SetExpenseApprovalPolicyDto,
} from "../dist/features/finance/http/expense.dto.js";

const unsafe = [RequireCanonicalOriginGuard, BrowserSessionGuard, CsrfGuard];
const uuid = "22222222-2222-4222-8222-222222222222";
const route = (method) => [
  Reflect.getMetadata(PATH_METADATA, ExpenseController.prototype[method]),
  Reflect.getMetadata(METHOD_METADATA, ExpenseController.prototype[method]),
];
async function validate(dto, value) {
  return new ValidationPipe({
    transform: true,
    whitelist: true,
    forbidNonWhitelisted: true,
  }).transform(value, { type: "body", metatype: dto });
}

test("AppModule imports FinanceModule with ExpenseController", () => {
  assert.ok(
    Reflect.getMetadata(MODULE_METADATA.IMPORTS, AppModule).includes(
      FinanceModule,
    ),
  );
  assert.ok(
    Reflect.getMetadata(MODULE_METADATA.CONTROLLERS, FinanceModule).includes(
      ExpenseController,
    ),
  );
});

test("expenses expose exactly five guarded POST commands", () => {
  assert.deepEqual(
    [
      "createDraft",
      "attachEvidence",
      "submit",
      "decideApproval",
      "setApprovalPolicy",
    ].map(route),
    [
      ["organizations/:organizationId/finance/expenses", RequestMethod.POST],
      [
        "organizations/:organizationId/finance/expenses/:expenseId/evidence",
        RequestMethod.POST,
      ],
      [
        "organizations/:organizationId/finance/expenses/:expenseId/submit",
        RequestMethod.POST,
      ],
      [
        "organizations/:organizationId/finance/expenses/:expenseId/decision",
        RequestMethod.POST,
      ],
      [
        "organizations/:organizationId/finance/expense-approval-policy",
        RequestMethod.POST,
      ],
    ],
  );
  for (const method of [
    "createDraft",
    "attachEvidence",
    "submit",
    "decideApproval",
    "setApprovalPolicy",
  ])
    assert.deepEqual(
      Reflect.getMetadata(GUARDS_METADATA, ExpenseController.prototype[method]),
      unsafe,
    );
});

test("expense route IDs use ParseUUIDPipe", () => {
  for (const method of [
    "createDraft",
    "attachEvidence",
    "submit",
    "decideApproval",
    "setApprovalPolicy",
  ]) {
    const argumentsMetadata = Reflect.getMetadata(
      ROUTE_ARGS_METADATA,
      ExpenseController,
      method,
    );
    assert.ok(argumentsMetadata, method);
    assert.ok(
      Object.values(argumentsMetadata).some(({ pipes }) =>
        pipes.some((pipe) => pipe instanceof ParseUUIDPipe),
      ),
      method,
    );
  }
});

test("create expense DTO accepts canonical money and rejects drift", async () => {
  const valid = await validate(CreateExpenseDto, {
    category: "OFFICE",
    vendorReference: "  Stationery house  ",
    amountMinor: "1250",
    currency: "SAR",
  });
  assert.equal(valid.vendorReference, "Stationery house");
  assert.equal(valid.amountMinor, 1250n);
  const full = await validate(CreateExpenseDto, {
    category: "CAMPAIGN",
    vendorReference: "Ads",
    amountMinor: "1250",
    currency: "SAR",
    campaignReference: "spring",
    propertyId: uuid,
    dealId: uuid,
  });
  assert.equal(full.category, "CAMPAIGN");
  assert.equal(full.campaignReference, "spring");
  assert.equal(full.propertyId, uuid);
  assert.equal(full.dealId, uuid);
  await assert.rejects(
    validate(CreateExpenseDto, {
      category: "TRAVEL",
      vendorReference: "x",
      amountMinor: "1250",
      currency: "SAR",
    }),
    BadRequestException,
  );
  await assert.rejects(
    validate(CreateExpenseDto, {
      category: "OFFICE",
      vendorReference: "x",
      amountMinor: "12.50",
      currency: "SAR",
    }),
    BadRequestException,
  );
  await assert.rejects(
    validate(CreateExpenseDto, {
      category: "OFFICE",
      vendorReference: "x",
      amountMinor: "1250",
      currency: "SAR",
      extra: true,
    }),
    BadRequestException,
  );
  await assert.rejects(
    validate(CreateExpenseDto, {
      category: "OFFICE",
      vendorReference: "x",
      amountMinor: "0",
      currency: "SAR",
    }),
    BadRequestException,
  );
});

test("evidence DTO enforces uuid identity, metadata bounds, and UTC instants", async () => {
  const valid = await validate(AttachExpenseEvidenceDto, {
    evidenceId: uuid,
    mediaType: "PDF",
    byteSize: 2048,
    attachedAt: "2026-09-21T10:00:00.000Z",
  });
  assert.equal(valid.byteSize, 2048);
  await assert.rejects(
    validate(AttachExpenseEvidenceDto, {
      evidenceId: "nope",
      mediaType: "PDF",
      byteSize: 1,
      attachedAt: "2026-09-21T10:00:00.000Z",
    }),
    BadRequestException,
  );
  await assert.rejects(
    validate(AttachExpenseEvidenceDto, {
      evidenceId: uuid,
      mediaType: "DOCX",
      byteSize: 1,
      attachedAt: "2026-09-21T10:00:00.000Z",
    }),
    BadRequestException,
  );
  await assert.rejects(
    validate(AttachExpenseEvidenceDto, {
      evidenceId: uuid,
      mediaType: "PDF",
      byteSize: 100_000_001,
      attachedAt: "2026-09-21T10:00:00.000Z",
    }),
    BadRequestException,
  );
  await assert.rejects(
    validate(AttachExpenseEvidenceDto, {
      evidenceId: uuid,
      mediaType: "PDF",
      byteSize: 1,
      attachedAt: "2026-09-21T12:00:00+03:00",
    }),
    BadRequestException,
  );
});

test("decision and policy DTOs are strict and bigint-safe", async () => {
  const approved = await validate(DecideExpenseDto, { decision: "APPROVED" });
  assert.equal(approved.decision, "APPROVED");
  assert.equal(approved.reason, undefined);
  const rejection = await validate(DecideExpenseDto, {
    decision: "REJECTED",
    reason: "  Duplicate invoice  ",
  });
  assert.equal(rejection.reason, "Duplicate invoice");
  await assert.rejects(
    validate(DecideExpenseDto, { decision: "MAYBE" }),
    BadRequestException,
  );
  await assert.rejects(
    validate(DecideExpenseDto, {}),
    BadRequestException,
  );
  const policy = await validate(SetExpenseApprovalPolicyDto, {
    thresholdMinor: "1000000",
    currency: "SAR",
  });
  assert.equal(policy.thresholdMinor, 1000000n);
  const absent = await validate(SetExpenseApprovalPolicyDto, {
    thresholdMinor: null,
    currency: "SAR",
  });
  assert.equal(absent.thresholdMinor, undefined);
  await assert.rejects(
    validate(SetExpenseApprovalPolicyDto, {
      thresholdMinor: "0",
      currency: "SAR",
    }),
    BadRequestException,
  );
  await assert.rejects(
    validate(SetExpenseApprovalPolicyDto, { currency: "SARR" }),
    BadRequestException,
  );
});
