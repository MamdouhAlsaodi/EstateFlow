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
  Res,
  UseGuards,
} from "@nestjs/common";
import { randomUUID } from "node:crypto";
import {
  ApiBody,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from "@nestjs/swagger";
import type { AuthenticatedRequest } from "../../auth/http/auth-request.js";
import { BrowserSessionGuard } from "../../auth/http/browser-session.guard.js";
import { CsrfGuard } from "../../auth/http/csrf.guard.js";
import { RequireCanonicalOriginGuard } from "../../auth/http/origin.guard.js";
import { ExpenseApplication } from "../application/expense-application.js";
import {
  ExpenseStateError,
  ExpenseValidationError,
} from "../domain/expense.js";
import type {
  ExpenseCategory,
  ExpenseDecision,
  ExpenseEvidenceMediaType,
} from "../domain/expense.js";
import {
  AttachExpenseEvidenceDto,
  CreateExpenseDto,
  DecideExpenseDto,
  SetExpenseApprovalPolicyDto,
  expenseResponse,
} from "./expense.dto.js";
import {
  createExpenseBody,
  decisionBody,
  evidenceBody,
  policyBody,
  uuidParameter,
} from "./expense.openapi.js";

const unsafeMutationGuards = [
  RequireCanonicalOriginGuard,
  BrowserSessionGuard,
  CsrfGuard,
];
type MutableHttpResponse = { statusCode: number };

@ApiTags("Expenses")
@Controller()
export class ExpenseController {
  constructor(private readonly expenses: ExpenseApplication) {}

  @Post("organizations/:organizationId/finance/expenses")
  @ApiOperation({ operationId: "ExpenseController_createDraft" })
  @ApiParam({ name: "organizationId", required: true, schema: uuidParameter })
  @ApiBody({ schema: createExpenseBody })
  @ApiResponse({ status: HttpStatus.CREATED })
  @ApiResponse({ status: HttpStatus.BAD_REQUEST })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED })
  @ApiResponse({ status: HttpStatus.FORBIDDEN })
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(...unsafeMutationGuards)
  async createDraft(
    @Param("organizationId", new ParseUUIDPipe()) organizationId: string,
    @Body() input: CreateExpenseDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.execute(() =>
      this.expenses.createExpenseDraft({
        actor: request.auth,
        userId: request.auth.userId,
        organizationId,
        id: randomUUID(),
        category: input.category as ExpenseCategory,
        vendorReference: input.vendorReference,
        amountMinor: input.amountMinor,
        currency: input.currency,
        dimensions: {
          ...(input.campaignReference === undefined
            ? {}
            : { campaignReference: input.campaignReference }),
          ...(input.propertyId === undefined
            ? {}
            : { propertyId: input.propertyId }),
          ...(input.dealId === undefined ? {} : { dealId: input.dealId }),
        },
        createdAt: new Date(),
      }),
    );
  }

  @Post("organizations/:organizationId/finance/expenses/:expenseId/evidence")
  @ApiOperation({ operationId: "ExpenseController_attachEvidence" })
  @ApiParam({ name: "organizationId", required: true, schema: uuidParameter })
  @ApiParam({ name: "expenseId", required: true, schema: uuidParameter })
  @ApiBody({ schema: evidenceBody })
  @ApiResponse({ status: HttpStatus.CREATED })
  @ApiResponse({
    status: HttpStatus.OK,
    description: "Replayed evidence attach",
  })
  @ApiResponse({ status: HttpStatus.BAD_REQUEST })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED })
  @ApiResponse({ status: HttpStatus.FORBIDDEN })
  @ApiResponse({ status: HttpStatus.NOT_FOUND })
  @ApiResponse({ status: HttpStatus.CONFLICT })
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(...unsafeMutationGuards)
  async attachEvidence(
    @Param("organizationId", new ParseUUIDPipe()) organizationId: string,
    @Param("expenseId", new ParseUUIDPipe()) expenseId: string,
    @Body() input: AttachExpenseEvidenceDto,
    @Req() request: AuthenticatedRequest,
    @Res({ passthrough: true }) response: MutableHttpResponse,
  ) {
    return this.execute(() =>
      this.expenses
        .attachExpenseEvidence({
          actor: request.auth,
          userId: request.auth.userId,
          organizationId,
          expenseId,
          evidenceId: input.evidenceId,
          mediaType: input.mediaType as ExpenseEvidenceMediaType,
          byteSize: input.byteSize,
          ...(input.note === undefined ? {} : { note: input.note }),
          attachedAt: new Date(input.attachedAt),
        })
        .then((result) =>
          result.kind === "replayed"
            ? ((response.statusCode = HttpStatus.OK), result)
            : result,
        ),
    );
  }

  @Post("organizations/:organizationId/finance/expenses/:expenseId/submit")
  @ApiOperation({ operationId: "ExpenseController_submit" })
  @ApiParam({ name: "organizationId", required: true, schema: uuidParameter })
  @ApiParam({ name: "expenseId", required: true, schema: uuidParameter })
  @ApiResponse({ status: HttpStatus.OK })
  @ApiResponse({ status: HttpStatus.BAD_REQUEST })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED })
  @ApiResponse({ status: HttpStatus.FORBIDDEN })
  @ApiResponse({ status: HttpStatus.NOT_FOUND })
  @ApiResponse({ status: HttpStatus.CONFLICT })
  @HttpCode(HttpStatus.OK)
  @UseGuards(...unsafeMutationGuards)
  async submit(
    @Param("organizationId", new ParseUUIDPipe()) organizationId: string,
    @Param("expenseId", new ParseUUIDPipe()) expenseId: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.execute(() =>
      this.expenses.submitExpenseForApproval({
        actor: request.auth,
        userId: request.auth.userId,
        organizationId,
        expenseId,
        submittedAt: new Date(),
      }),
    );
  }

  @Post("organizations/:organizationId/finance/expenses/:expenseId/decision")
  @ApiOperation({ operationId: "ExpenseController_decideApproval" })
  @ApiParam({ name: "organizationId", required: true, schema: uuidParameter })
  @ApiParam({ name: "expenseId", required: true, schema: uuidParameter })
  @ApiBody({ schema: decisionBody })
  @ApiResponse({
    status: HttpStatus.OK,
    description: "Decision or exact replay",
  })
  @ApiResponse({ status: HttpStatus.BAD_REQUEST })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED })
  @ApiResponse({ status: HttpStatus.FORBIDDEN })
  @ApiResponse({ status: HttpStatus.NOT_FOUND })
  @ApiResponse({ status: HttpStatus.CONFLICT })
  @HttpCode(HttpStatus.OK)
  @UseGuards(...unsafeMutationGuards)
  async decideApproval(
    @Param("organizationId", new ParseUUIDPipe()) organizationId: string,
    @Param("expenseId", new ParseUUIDPipe()) expenseId: string,
    @Body() input: DecideExpenseDto,
    @Req() request: AuthenticatedRequest,
    @Res({ passthrough: true }) response: MutableHttpResponse,
  ) {
    return this.execute(() =>
      this.expenses
        .decideExpenseApproval({
          actor: request.auth,
          userId: request.auth.userId,
          organizationId,
          expenseId,
          decision: input.decision as ExpenseDecision,
          ...(input.reason === undefined ? {} : { reason: input.reason }),
          decidedAt: new Date(),
        })
        .then((result) =>
          result.kind === "replayed"
            ? ((response.statusCode = HttpStatus.OK), result)
            : result,
        ),
    );
  }

  @Post("organizations/:organizationId/finance/expense-approval-policy")
  @ApiOperation({ operationId: "ExpenseController_setApprovalPolicy" })
  @ApiParam({ name: "organizationId", required: true, schema: uuidParameter })
  @ApiBody({ schema: policyBody })
  @ApiResponse({ status: HttpStatus.CREATED })
  @ApiResponse({ status: HttpStatus.OK, description: "Replayed policy upsert" })
  @ApiResponse({ status: HttpStatus.BAD_REQUEST })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED })
  @ApiResponse({ status: HttpStatus.FORBIDDEN })
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(...unsafeMutationGuards)
  async setApprovalPolicy(
    @Param("organizationId", new ParseUUIDPipe()) organizationId: string,
    @Body() input: SetExpenseApprovalPolicyDto,
    @Req() request: AuthenticatedRequest,
    @Res({ passthrough: true }) response: MutableHttpResponse,
  ) {
    return this.execute(() =>
      this.expenses
        .setExpenseApprovalPolicy({
          actor: request.auth,
          userId: request.auth.userId,
          organizationId,
          thresholdMinor: input.thresholdMinor ?? null,
          currency: input.currency,
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
      return mapExpenseResult(await operation());
    } catch (error) {
      if (
        error instanceof ExpenseValidationError ||
        error instanceof ExpenseStateError ||
        error instanceof RangeError
      )
        throw new BadRequestException();
      throw error;
    }
  }
}

function mapExpenseResult(result: unknown): unknown {
  if (hasResultKind(result, "access-denied")) throw new ForbiddenException();
  if (hasResultKind(result, "not-found")) throw new NotFoundException();
  if (hasResultKind(result, "conflict")) throw new ConflictException();
  return expenseResponse(result);
}
function hasResultKind(value: unknown, kind: string): boolean {
  return (
    typeof value === "object" &&
    value !== null &&
    "kind" in value &&
    value.kind === kind
  );
}
