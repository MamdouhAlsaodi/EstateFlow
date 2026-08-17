import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  ForbiddenException,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from "@nestjs/common";
import { createHash, randomUUID } from "node:crypto";
import {
  ApiBody,
  ApiHeader,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from "@nestjs/swagger";
import type { AuthenticatedRequest } from "../../auth/http/auth-request.js";
import { BrowserSessionGuard } from "../../auth/http/browser-session.guard.js";
import { CsrfGuard } from "../../auth/http/csrf.guard.js";
import { RequireCanonicalOriginGuard } from "../../auth/http/origin.guard.js";
import { ReceivableApplication } from "../application/receivable-application.js";
import {
  ReceivableStateError,
  ReceivableValidationError,
} from "../domain/receivable.js";
import {
  CancelInvoiceDto,
  CreateInvoiceDraftDto,
  IssueInvoiceDto,
  ReceivableAgingQueryDto,
  RecordPaymentDto,
  receivableResponse,
} from "./receivable.dto.js";
import {
  agingResponse,
  cancellationBody,
  draftBody,
  issueBody,
  paymentBody,
  uuidParameter,
} from "./receivable.openapi.js";

const unsafeMutationGuards = [
  RequireCanonicalOriginGuard,
  BrowserSessionGuard,
  CsrfGuard,
];
type MutableHttpResponse = { statusCode: number };

@ApiTags("Receivables")
@Controller()
export class ReceivableController {
  constructor(private readonly receivables: ReceivableApplication) {}

  @Post("organizations/:organizationId/finance/deals/:dealId/invoices")
  @ApiOperation({ operationId: "ReceivableController_createDraft" })
  @ApiParam({ name: "organizationId", required: true, schema: uuidParameter })
  @ApiParam({ name: "dealId", required: true, schema: uuidParameter })
  @ApiBody({ schema: draftBody })
  @ApiResponse({ status: HttpStatus.CREATED })
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(...unsafeMutationGuards)
  async createDraft(
    @Param("organizationId", new ParseUUIDPipe()) organizationId: string,
    @Param("dealId", new ParseUUIDPipe()) dealId: string,
    @Body() input: CreateInvoiceDraftDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.execute(() =>
      this.receivables.createInvoiceDraft({
        actor: request.auth,
        userId: request.auth.userId,
        organizationId,
        dealId,
        invoiceId: randomUUID(),
        amountMinor: input.amountMinor,
        currency: input.currency,
        createdAt: new Date(),
      }),
    );
  }

  @Post("organizations/:organizationId/finance/invoices/:invoiceId/issue")
  @ApiOperation({ operationId: "ReceivableController_issue" })
  @ApiParam({ name: "organizationId", required: true, schema: uuidParameter })
  @ApiParam({ name: "invoiceId", required: true, schema: uuidParameter })
  @ApiBody({ schema: issueBody })
  @ApiResponse({ status: HttpStatus.CREATED })
  @ApiResponse({ status: HttpStatus.OK, description: "Replayed invoice issue" })
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(...unsafeMutationGuards)
  async issue(
    @Param("organizationId", new ParseUUIDPipe()) organizationId: string,
    @Param("invoiceId", new ParseUUIDPipe()) invoiceId: string,
    @Body() input: IssueInvoiceDto,
    @Req() request: AuthenticatedRequest,
    @Res({ passthrough: true }) response: MutableHttpResponse,
  ) {
    return this.execute(() =>
      this.receivables
        .issueInvoice({
          actor: request.auth,
          userId: request.auth.userId,
          organizationId,
          invoiceId,
          receivableId: input.receivableId,
          issuedAt: new Date(input.issuedAt),
          dueAt: new Date(input.dueAt),
        })
        .then((result) =>
          result.kind === "replayed"
            ? ((response.statusCode = HttpStatus.OK), result)
            : result,
        ),
    );
  }

  @Post("organizations/:organizationId/finance/invoices/:invoiceId/cancel")
  @ApiOperation({ operationId: "ReceivableController_cancel" })
  @ApiParam({ name: "organizationId", required: true, schema: uuidParameter })
  @ApiParam({ name: "invoiceId", required: true, schema: uuidParameter })
  @ApiBody({ schema: cancellationBody })
  @ApiResponse({ status: HttpStatus.OK })
  @ApiResponse({ status: HttpStatus.BAD_REQUEST })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED })
  @ApiResponse({ status: HttpStatus.FORBIDDEN })
  @ApiResponse({ status: HttpStatus.NOT_FOUND })
  @ApiResponse({ status: HttpStatus.CONFLICT })
  @HttpCode(HttpStatus.OK)
  @UseGuards(...unsafeMutationGuards)
  async cancel(
    @Param("organizationId", new ParseUUIDPipe()) organizationId: string,
    @Param("invoiceId", new ParseUUIDPipe()) invoiceId: string,
    @Body() input: CancelInvoiceDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.execute(() =>
      this.receivables.cancelInvoice({
        actor: request.auth,
        userId: request.auth.userId,
        organizationId,
        invoiceId,
        cancelledAt: new Date(),
        reason: input.reason,
      }),
    );
  }

  @Get("organizations/:organizationId/finance/receivables/aging")
  @ApiOperation({ operationId: "ReceivableController_getAging" })
  @ApiParam({ name: "organizationId", required: true, schema: uuidParameter })
  @ApiQuery({
    name: "cursor",
    required: false,
    schema: {
      type: "string",
      minLength: 1,
      maxLength: 512,
      pattern: "^[A-Za-z0-9_-]+$",
    },
  })
  @ApiQuery({
    name: "limit",
    required: false,
    schema: { type: "integer", minimum: 1, maximum: 100, default: 50 },
  })
  @ApiResponse({
    status: HttpStatus.OK,
    content: { "application/json": { schema: agingResponse } },
  })
  @ApiResponse({ status: HttpStatus.BAD_REQUEST })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED })
  @ApiResponse({ status: HttpStatus.FORBIDDEN })
  @UseGuards(BrowserSessionGuard)
  async aging(
    @Param("organizationId", new ParseUUIDPipe()) organizationId: string,
    @Query() query: ReceivableAgingQueryDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.execute(() =>
      this.receivables.getReceivableAging({
        actor: request.auth,
        userId: request.auth.userId,
        organizationId,
        cursor: query.cursor,
        limit: query.limit,
        asOf: new Date(),
      }),
    );
  }

  @Post(
    "organizations/:organizationId/finance/receivables/:receivableId/payments",
  )
  @ApiOperation({ operationId: "ReceivableController_recordPayment" })
  @ApiParam({ name: "organizationId", required: true, schema: uuidParameter })
  @ApiParam({ name: "receivableId", required: true, schema: uuidParameter })
  @ApiHeader({
    name: "Idempotency-Key",
    required: true,
    schema: { type: "string", minLength: 1, maxLength: 200, pattern: "\\S" },
  })
  @ApiBody({ schema: paymentBody })
  @ApiResponse({ status: HttpStatus.CREATED })
  @ApiResponse({ status: HttpStatus.OK, description: "Replayed payment" })
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(...unsafeMutationGuards)
  async recordPayment(
    @Param("organizationId", new ParseUUIDPipe()) organizationId: string,
    @Param("receivableId", new ParseUUIDPipe()) receivableId: string,
    @Body() input: RecordPaymentDto,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Req() request: AuthenticatedRequest,
    @Res({ passthrough: true }) response: MutableHttpResponse,
  ) {
    const canonicalIdempotencyKey = idempotencyKey?.trim() ?? "";
    return this.execute(() =>
      this.receivables
        .recordPayment({
          actor: request.auth,
          userId: request.auth.userId,
          organizationId,
          receivableId,
          paymentId: deterministicPaymentId(
            organizationId,
            receivableId,
            canonicalIdempotencyKey,
          ),
          amountMinor: input.amountMinor,
          currency: input.currency,
          recordedAt: new Date(input.recordedAt),
          idempotencyKey: canonicalIdempotencyKey,
        })
        .then((result) =>
          result.kind === "replayed"
            ? ((response.statusCode = HttpStatus.OK), result)
            : result,
        ),
    );
  }

  private async execute(operation: () => Promise<unknown>): Promise<unknown> {
    try {
      return mapReceivableResult(await operation());
    } catch (error) {
      if (
        error instanceof ReceivableValidationError ||
        error instanceof ReceivableStateError ||
        error instanceof RangeError
      )
        throw new BadRequestException();
      throw error;
    }
  }
}

const PAYMENT_ID_NAMESPACE = Buffer.from(
  "6ba7b8109dad11d180b400c04fd430c8",
  "hex",
);
function deterministicPaymentId(
  organizationId: string,
  receivableId: string,
  idempotencyKey: string,
): string {
  const bytes = createHash("sha1")
    .update(PAYMENT_ID_NAMESPACE)
    .update(
      `${organizationId}\u0000${receivableId}\u0000${idempotencyKey}`,
      "utf8",
    )
    .digest()
    .subarray(0, 16);
  bytes[6] = (bytes[6]! & 0x0f) | 0x50;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function mapReceivableResult(result: unknown): unknown {
  if (hasResultKind(result, "access-denied")) throw new ForbiddenException();
  if (hasResultKind(result, "not-found")) throw new NotFoundException();
  if (hasResultKind(result, "conflict")) throw new ConflictException();
  return receivableResponse(result);
}
function hasResultKind(value: unknown, kind: string): boolean {
  return (
    typeof value === "object" &&
    value !== null &&
    "kind" in value &&
    value.kind === kind
  );
}
