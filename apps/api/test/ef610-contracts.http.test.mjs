import assert from "node:assert/strict";
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
  RequestMethod,
  ValidationPipe,
} from "@nestjs/common";
import {
  GUARDS_METADATA,
  METHOD_METADATA,
  PATH_METADATA,
} from "@nestjs/common/constants.js";
import test from "node:test";
import { BrowserSessionGuard } from "../dist/features/auth/http/browser-session.guard.js";
import { CsrfGuard } from "../dist/features/auth/http/csrf.guard.js";
import { RequireCanonicalOriginGuard } from "../dist/features/auth/http/origin.guard.js";
import { ContractController } from "../dist/features/contracts/http/contract.controller.js";
import {
  AmendContractDto,
  CreateContractTemplateDto,
  GenerateContractDto,
  VoidContractDto,
} from "../dist/features/contracts/http/contract.dto.js";
import {
  ContractAccessDeniedError,
  ContractNotFoundError,
} from "../dist/features/contracts/application/contract-application.js";
import {
  ContractStateError,
  ContractValidationError,
} from "../dist/features/contracts/domain/contract.js";

const routes = (method) => [
  Reflect.getMetadata(PATH_METADATA, ContractController.prototype[method]),
  Reflect.getMetadata(METHOD_METADATA, ContractController.prototype[method]),
];

const guards = (method) =>
  Reflect.getMetadata(GUARDS_METADATA, ContractController.prototype[method]);

async function validateBody(value, metatype) {
  return new ValidationPipe({
    transform: true,
    whitelist: true,
    forbidNonWhitelisted: true,
  }).transform(value, { type: "body", metatype });
}

test("EF-610 contract routes exist with the right methods and browser guards", () => {
  assert.deepEqual(routes("createTemplate"), [
    "organizations/:organizationId/contract-templates",
    RequestMethod.POST,
  ]);
  assert.deepEqual(routes("approveTemplate"), [
    "organizations/:organizationId/contract-templates/:templateId/approve",
    RequestMethod.POST,
  ]);
  assert.deepEqual(routes("listTemplates"), [
    "organizations/:organizationId/contract-templates",
    RequestMethod.GET,
  ]);
  assert.deepEqual(routes("generate"), [
    "organizations/:organizationId/contracts/generate",
    RequestMethod.POST,
  ]);
  assert.deepEqual(routes("list"), [
    "organizations/:organizationId/contracts",
    RequestMethod.GET,
  ]);
  assert.deepEqual(routes("find"), [
    "organizations/:organizationId/contracts/:contractId",
    RequestMethod.GET,
  ]);
  assert.deepEqual(routes("pdf"), [
    "organizations/:organizationId/contracts/:contractId/pdf",
    RequestMethod.GET,
  ]);
  assert.deepEqual(routes("sign"), [
    "organizations/:organizationId/contracts/:contractId/signatures",
    RequestMethod.POST,
  ]);
  assert.deepEqual(routes("requestAmendment"), [
    "organizations/:organizationId/contracts/:contractId/amend-requests",
    RequestMethod.POST,
  ]);
  assert.deepEqual(routes("void"), [
    "organizations/:organizationId/contracts/:contractId/void",
    RequestMethod.POST,
  ]);

  const UNSAFE = [RequireCanonicalOriginGuard, BrowserSessionGuard, CsrfGuard];
  for (const method of [
    "createTemplate",
    "approveTemplate",
    "generate",
    "sign",
    "requestAmendment",
    "void",
  ]) {
    assert.deepEqual(guards(method), UNSAFE, method);
  }
  for (const method of ["listTemplates", "list", "find", "pdf"]) {
    assert.deepEqual(guards(method), [BrowserSessionGuard], method);
  }
});

test("EF-610 controller is excluded from the closed-world OpenAPI document", () => {
  const exclude = Reflect.getMetadata(
    "swagger/apiExcludeController",
    ContractController,
  );
  assert.deepEqual(exclude, [true]);
});

test("EF-610 DTOs are strict allowlists", async () => {
  const template = await validateBody(
    {
      templateKey: "sale-agreement",
      titlePattern: "عقد {PROPERTY_TITLE}",
      bodyPattern: "الجهة: {ORGANIZATION_NAME}",
    },
    CreateContractTemplateDto,
  );
  assert.equal(template.templateKey, "sale-agreement");
  await assert.rejects(() =>
    validateBody(
      {
        templateKey: "sale-agreement",
        titlePattern: "t",
        bodyPattern: "b",
        extra: "field",
      },
      CreateContractTemplateDto,
    ),
  );
  await assert.rejects(() =>
    validateBody(
      { templateKey: "Bad Key", titlePattern: "t", bodyPattern: "b" },
      CreateContractTemplateDto,
    ),
  );

  const generate = await validateBody(
    {
      dealId: "33333333-3333-4333-8333-333333333333",
      templateId: "99999999-9999-4999-8999-999999999991",
    },
    GenerateContractDto,
  );
  assert.equal(generate.templateVersion, undefined);
  await assert.rejects(() =>
    validateBody(
      { dealId: "not-a-uuid", templateId: "x" },
      GenerateContractDto,
    ),
  );
  await assert.rejects(() =>
    validateBody(
      {
        dealId: "33333333-3333-4333-8333-333333333333",
        templateId: "99999999-9999-4999-8999-999999999991",
        templateVersion: 0,
      },
      GenerateContractDto,
    ),
  );

  const voidBody = await validateBody({ reason: "سبب" }, VoidContractDto);
  assert.equal(voidBody.reason, "سبب");
  await assert.rejects(() => validateBody({ reason: "" }, VoidContractDto));
  await assert.rejects(() =>
    validateBody({ reason: "x".repeat(501) }, VoidContractDto),
  );
  await assert.rejects(() => validateBody({}, AmendContractDto));
});

test("EF-610 typed errors map to tenant-safe HTTP statuses", async () => {
  const controller = new ContractController(
    { listSlots: () => [] },
    { findMembership: async () => null },
  );
  const execute = controller.execute.bind(controller);
  await assert.rejects(
    () =>
      execute(async () => {
        throw new ContractNotFoundError();
      }),
    NotFoundException,
  );
  await assert.rejects(
    () =>
      execute(async () => {
        throw new ContractAccessDeniedError();
      }),
    ForbiddenException,
  );
  await assert.rejects(
    () =>
      execute(async () => {
        throw new ContractStateError("SIGNATURE_OUT_OF_ORDER");
      }),
    (error) =>
      error instanceof ConflictException &&
      error.message === "SIGNATURE_OUT_OF_ORDER",
  );
  await assert.rejects(
    () =>
      execute(async () => {
        throw new ContractValidationError("CONTRACT_VALIDATION_ERROR");
      }),
    (error) =>
      error instanceof BadRequestException &&
      error.message === "CONTRACT_VALIDATION_ERROR",
  );
});
