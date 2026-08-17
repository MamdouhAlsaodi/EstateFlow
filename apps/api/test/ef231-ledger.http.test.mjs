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
import { LedgerController } from "../dist/features/finance/http/ledger.controller.js";
import {
  CreateAccountDto,
  CreateAccountingPeriodDto,
  CreateJournalDraftDto,
  PostJournalEntryDto,
} from "../dist/features/finance/http/ledger.dto.js";

const unsafe = [RequireCanonicalOriginGuard, BrowserSessionGuard, CsrfGuard];
const uuid = "22222222-2222-4222-8222-222222222222";
const route = (method) => [
  Reflect.getMetadata(PATH_METADATA, LedgerController.prototype[method]),
  Reflect.getMetadata(METHOD_METADATA, LedgerController.prototype[method]),
];
async function validate(dto, value) {
  return new ValidationPipe({
    transform: true,
    whitelist: true,
    forbidNonWhitelisted: true,
  }).transform(value, { type: "body", metatype: dto });
}

test("AppModule imports the guarded FinanceModule", () => {
  assert.ok(
    Reflect.getMetadata(MODULE_METADATA.IMPORTS, AppModule).includes(
      FinanceModule,
    ),
  );
});

test("ledger exposes exactly the five guarded POST commands", () => {
  assert.deepEqual(
    [
      "createAccount",
      "createAccountingPeriod",
      "createDraft",
      "post",
      "reverse",
    ].map(route),
    [
      ["organizations/:organizationId/finance/accounts", RequestMethod.POST],
      [
        "organizations/:organizationId/finance/accounting-periods",
        RequestMethod.POST,
      ],
      [
        "organizations/:organizationId/finance/journal-drafts",
        RequestMethod.POST,
      ],
      [
        "organizations/:organizationId/finance/journal-entries/:entryId/post",
        RequestMethod.POST,
      ],
      [
        "organizations/:organizationId/finance/journal-entries/:entryId/reverse",
        RequestMethod.POST,
      ],
    ],
  );
  for (const method of [
    "createAccount",
    "createAccountingPeriod",
    "createDraft",
    "post",
    "reverse",
  ]) {
    assert.deepEqual(
      Reflect.getMetadata(GUARDS_METADATA, LedgerController.prototype[method]),
      unsafe,
    );
  }
});

test("ledger route IDs use ParseUUIDPipe", () => {
  for (const method of [
    "createAccount",
    "createAccountingPeriod",
    "createDraft",
    "post",
    "reverse",
  ]) {
    const routeArguments = Reflect.getMetadata(
      ROUTE_ARGS_METADATA,
      LedgerController,
      method,
    );
    assert.ok(
      Object.values(routeArguments).some(({ pipes }) =>
        pipes.some((pipe) => pipe instanceof ParseUUIDPipe),
      ),
      method,
    );
  }
});

test("ledger DTOs reject extra fields, JSON money numbers, and non-canonical amounts", async () => {
  const account = await validate(CreateAccountDto, {
    code: "1000",
    name: "Cash",
    type: "ASSET",
  });
  assert.equal(account.name, "Cash");
  const period = await validate(CreateAccountingPeriodDto, {
    startsAt: "2026-08-14T00:00:00.000Z",
    endsAt: "2026-08-15T00:00:00.000Z",
  });
  assert.equal(period.startsAt, "2026-08-14T00:00:00.000Z");
  const draft = await validate(CreateJournalDraftDto, {
    reference: "Sale",
    reason: "Receipt",
    lines: [
      { accountId: uuid, side: "DEBIT", amountMinor: "100", currency: "USD" },
      { accountId: uuid, side: "CREDIT", amountMinor: "100", currency: "USD" },
    ],
  });
  assert.equal(draft.lines[0].amountMinor, 100n);
  await validate(PostJournalEntryDto, {
    periodId: uuid,
    postedAt: "2026-08-14T12:00:00.000Z",
  });
  for (const amountMinor of [100, "0", "01", "+1", "1.0", "1e2", " 1", "1"]) {
    const input = {
      reference: "Sale",
      reason: "Receipt",
      lines: [
        { accountId: uuid, side: "DEBIT", amountMinor, currency: "USD" },
        { accountId: uuid, side: "CREDIT", amountMinor, currency: "USD" },
      ],
    };
    if (amountMinor === "1") continue;
    await assert.rejects(
      () => validate(CreateJournalDraftDto, input),
      BadRequestException,
    );
  }
  await assert.rejects(
    () =>
      validate(CreateAccountDto, {
        code: "1000",
        name: "Cash",
        type: "ASSET",
        extra: true,
      }),
    BadRequestException,
  );
  await assert.rejects(
    () =>
      validate(CreateJournalDraftDto, {
        reference: " ",
        reason: "Receipt",
        lines: [],
      }),
    BadRequestException,
  );
  await assert.rejects(
    () =>
      validate(CreateAccountingPeriodDto, {
        startsAt: "2026-08-14T00:00:00+00:00",
        endsAt: "2026-08-15T00:00:00.000Z",
      }),
    BadRequestException,
  );
});
