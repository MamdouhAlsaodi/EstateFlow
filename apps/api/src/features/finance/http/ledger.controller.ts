import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  ForbiddenException,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";
import {
  ApiBody,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from "@nestjs/swagger";
import { randomUUID } from "node:crypto";
import { LedgerApplication } from "../application/ledger-application.js";
import { LedgerStateError, LedgerValidationError } from "../domain/ledger.js";
import type { AuthenticatedRequest } from "../../auth/http/auth-request.js";
import { BrowserSessionGuard } from "../../auth/http/browser-session.guard.js";
import { CsrfGuard } from "../../auth/http/csrf.guard.js";
import { RequireCanonicalOriginGuard } from "../../auth/http/origin.guard.js";
import {
  CreateAccountDto,
  CreateAccountingPeriodDto,
  CreateJournalDraftDto,
  ledgerResponse,
  PostJournalEntryDto,
} from "./ledger.dto.js";

const GUARDED_POST_GUARDS = [
  RequireCanonicalOriginGuard,
  BrowserSessionGuard,
  CsrfGuard,
];

const uuidParameter = { type: "string", format: "uuid" };
const accountBody = {
  type: "object",
  required: ["code", "name", "type"],
  additionalProperties: false,
  properties: {
    code: { type: "string", minLength: 1, maxLength: 64 },
    name: { type: "string", minLength: 1, maxLength: 200 },
    type: {
      type: "string",
      enum: ["ASSET", "LIABILITY", "EQUITY", "REVENUE", "EXPENSE"],
    },
  },
};
const periodBody = {
  type: "object",
  required: ["startsAt", "endsAt"],
  additionalProperties: false,
  properties: {
    startsAt: { type: "string", format: "date-time" },
    endsAt: { type: "string", format: "date-time" },
  },
};
const lineBody = {
  type: "object",
  required: ["accountId", "side", "currency", "amountMinor"],
  additionalProperties: false,
  properties: {
    accountId: uuidParameter,
    side: { type: "string", enum: ["DEBIT", "CREDIT"] },
    currency: { type: "string", minLength: 3, maxLength: 3 },
    amountMinor: { type: "string", pattern: "^[1-9]\\d*$" },
  },
};
const draftBody = {
  type: "object",
  required: ["reference", "reason", "lines"],
  additionalProperties: false,
  properties: {
    reference: {
      type: "string",
      minLength: 1,
      maxLength: 200,
      pattern: "\\S",
    },
    reason: { type: "string", minLength: 1, maxLength: 200, pattern: "\\S" },
    lines: { type: "array", minItems: 2, maxItems: 50, items: lineBody },
  },
};
const postBody = {
  type: "object",
  required: ["periodId", "postedAt"],
  additionalProperties: false,
  properties: {
    periodId: uuidParameter,
    postedAt: { type: "string", format: "date-time" },
  },
};

@ApiTags("Ledger")
@Controller()
export class LedgerController {
  constructor(private readonly ledger: LedgerApplication) {}

  @Post("organizations/:organizationId/finance/accounts")
  @ApiOperation({ operationId: "LedgerController_createAccount" })
  @ApiParam({ name: "organizationId", required: true, schema: uuidParameter })
  @ApiBody({ schema: accountBody })
  @ApiResponse({ status: HttpStatus.CREATED })
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(...GUARDED_POST_GUARDS)
  async createAccount(
    @Param("organizationId", new ParseUUIDPipe()) organizationId: string,
    @Body() input: CreateAccountDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.execute(() =>
      this.ledger
        .createAccount({
          actor: request.auth,
          userId: request.auth.userId,
          organizationId,
          id: randomUUID(),
          ...input,
        })
        .then(ledgerResponse),
    );
  }

  @Post("organizations/:organizationId/finance/accounting-periods")
  @ApiOperation({ operationId: "LedgerController_createAccountingPeriod" })
  @ApiParam({ name: "organizationId", required: true, schema: uuidParameter })
  @ApiBody({ schema: periodBody })
  @ApiResponse({ status: HttpStatus.CREATED })
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(...GUARDED_POST_GUARDS)
  async createAccountingPeriod(
    @Param("organizationId", new ParseUUIDPipe()) organizationId: string,
    @Body() input: CreateAccountingPeriodDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.execute(() =>
      this.ledger
        .createAccountingPeriod({
          actor: request.auth,
          userId: request.auth.userId,
          organizationId,
          period: {
            id: randomUUID(),
            organizationId,
            startsAt: new Date(input.startsAt),
            endsAt: new Date(input.endsAt),
          },
        })
        .then(ledgerResponse),
    );
  }

  @Post("organizations/:organizationId/finance/journal-drafts")
  @ApiOperation({ operationId: "LedgerController_createDraft" })
  @ApiParam({ name: "organizationId", required: true, schema: uuidParameter })
  @ApiBody({ schema: draftBody })
  @ApiResponse({ status: HttpStatus.CREATED })
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(...GUARDED_POST_GUARDS)
  async createDraft(
    @Param("organizationId", new ParseUUIDPipe()) organizationId: string,
    @Body() input: CreateJournalDraftDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.execute(() =>
      this.ledger
        .createDraft({
          actor: request.auth,
          userId: request.auth.userId,
          organizationId,
          entryId: randomUUID(),
          reference: input.reference,
          reason: input.reason,
          createdAt: new Date(),
          lines: input.lines,
        })
        .then(ledgerResponse),
    );
  }

  @Post("organizations/:organizationId/finance/journal-entries/:entryId/post")
  @ApiOperation({ operationId: "LedgerController_post" })
  @ApiParam({ name: "organizationId", required: true, schema: uuidParameter })
  @ApiParam({ name: "entryId", required: true, schema: uuidParameter })
  @ApiBody({ schema: postBody })
  @ApiResponse({ status: HttpStatus.OK })
  @HttpCode(HttpStatus.OK)
  @UseGuards(...GUARDED_POST_GUARDS)
  async post(
    @Param("organizationId", new ParseUUIDPipe()) organizationId: string,
    @Param("entryId", new ParseUUIDPipe()) entryId: string,
    @Body() input: PostJournalEntryDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.execute(() =>
      this.ledger
        .post({
          actor: request.auth,
          userId: request.auth.userId,
          organizationId,
          entryId,
          periodId: input.periodId,
          postedAt: new Date(input.postedAt),
        })
        .then(ledgerResponse),
    );
  }

  @Post(
    "organizations/:organizationId/finance/journal-entries/:entryId/reverse",
  )
  @ApiOperation({ operationId: "LedgerController_reverse" })
  @ApiParam({ name: "organizationId", required: true, schema: uuidParameter })
  @ApiParam({ name: "entryId", required: true, schema: uuidParameter })
  @ApiResponse({ status: HttpStatus.CREATED })
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(...GUARDED_POST_GUARDS)
  async reverse(
    @Param("organizationId", new ParseUUIDPipe()) organizationId: string,
    @Param("entryId", new ParseUUIDPipe()) entryId: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.execute(() =>
      this.ledger
        .reverse({
          actor: request.auth,
          userId: request.auth.userId,
          organizationId,
          entryId,
        })
        .then(ledgerResponse),
    );
  }

  private async execute<T>(operation: () => Promise<T>): Promise<T> {
    try {
      const operationResult = await operation();
      return mapLedgerResult(operationResult);
    } catch (error) {
      if (
        error instanceof LedgerValidationError ||
        error instanceof LedgerStateError
      )
        throw new BadRequestException();
      throw error;
    }
  }
}

function mapLedgerResult<T>(result: T): T {
  if (isAccessDenied(result)) throw new ForbiddenException();
  if (isNotFound(result)) throw new NotFoundException();
  if (isConflict(result)) throw new ConflictException();
  return result;
}

function isAccessDenied(value: unknown): value is { kind: "access-denied" } {
  return isKind(value, "access-denied");
}

function isNotFound(value: unknown): value is { kind: "not-found" } {
  return isKind(value, "not-found");
}

function isConflict(value: unknown): value is { kind: "conflict" } {
  return isKind(value, "conflict");
}

function isKind(value: unknown, kind: string): boolean {
  return (
    typeof value === "object" &&
    value !== null &&
    "kind" in value &&
    value.kind === kind
  );
}
