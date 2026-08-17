import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  ForbiddenException,
  HttpCode,
  Res,
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
import { CommissionApplication } from "../application/commission-application.js";
import {
  CommissionStateError,
  CommissionValidationError,
} from "../domain/commission.js";
import type { AuthenticatedRequest } from "../../auth/http/auth-request.js";
import { BrowserSessionGuard } from "../../auth/http/browser-session.guard.js";
import { CsrfGuard } from "../../auth/http/csrf.guard.js";
import { RequireCanonicalOriginGuard } from "../../auth/http/origin.guard.js";
import {
  CaptureCommissionableValueDto,
  commissionResponse,
  CreateCommissionPlanVersionDto,
  CreateExpectedAccrualDto,
} from "./commission.dto.js";

const GUARDED_POST_GUARDS = [
  RequireCanonicalOriginGuard,
  BrowserSessionGuard,
  CsrfGuard,
];
const uuidParameter = { type: "string", format: "uuid" };
const planVersionProperties = {
  version: { type: "integer", minimum: 1 },
  rateBps: { type: "integer", minimum: 1, maximum: 10000 },
  recipients: {
    type: "array",
    minItems: 1,
    items: {
      type: "object",
      required: ["order", "kind", "splitBps"],
      additionalProperties: false,
      properties: {
        order: { type: "integer", minimum: 1 },
        kind: { type: "string", enum: ["BROKER", "OFFICE"] },
        splitBps: { type: "integer", minimum: 1, maximum: 10000 },
      },
    },
  },
};
const planVersionBody = {
  type: "object",
  required: ["version"],
  additionalProperties: false,
  properties: planVersionProperties,
  oneOf: [
    {
      type: "object",
      required: ["version"],
      additionalProperties: false,
      properties: { version: planVersionProperties.version },
    },
    {
      type: "object",
      required: ["version", "rateBps", "recipients"],
      additionalProperties: false,
      properties: planVersionProperties,
    },
  ],
};
const commissionableValueBody = {
  type: "object",
  required: ["valueId", "amountMinor", "currency", "capturedAt"],
  additionalProperties: false,
  properties: {
    valueId: uuidParameter,
    amountMinor: { type: "string", pattern: "^[1-9]\\d*$" },
    currency: { type: "string", pattern: "^[A-Z]{3}$" },
    capturedAt: { type: "string", format: "date-time" },
  },
};
const expectedAccrualBody = {
  type: "object",
  required: [
    "accrualId",
    "commissionableValueId",
    "commissionPlanVersionId",
    "dealClosedWonEventId",
  ],
  additionalProperties: false,
  properties: {
    accrualId: uuidParameter,
    commissionableValueId: uuidParameter,
    commissionPlanVersionId: uuidParameter,
    dealClosedWonEventId: uuidParameter,
  },
};
type CommissionTransportResponse = unknown;

@ApiTags("Commission")
@Controller()
export class CommissionController {
  constructor(private readonly commission: CommissionApplication) {}

  @Post("organizations/:organizationId/finance/commission-plan-versions")
  @ApiOperation({ operationId: "CommissionController_createPlanVersion" })
  @ApiParam({ name: "organizationId", required: true, schema: uuidParameter })
  @ApiBody({ schema: planVersionBody })
  @ApiResponse({ status: HttpStatus.CREATED })
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(...GUARDED_POST_GUARDS)
  async createPlanVersion(
    @Param("organizationId", new ParseUUIDPipe()) organizationId: string,
    @Body() input: CreateCommissionPlanVersionDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.execute(() => {
      const command = {
        actor: request.auth,
        userId: request.auth.userId,
        organizationId,
        id: randomUUID(),
        version: input.version,
      };
      if (input.rateBps === undefined)
        return this.commission
          .createPlanVersion(command)
          .then((result) =>
            result.kind === "created-plan" ? { plan: result.plan } : result,
          );
      if (input.recipients === undefined)
        throw new RangeError("Explicit commission policy requires recipients");
      return this.commission
        .createPlanVersion({
          ...command,
          rateBps: input.rateBps,
          recipients: input.recipients,
        })
        .then((result) =>
          result.kind === "created-plan" ? { plan: result.plan } : result,
        );
    });
  }

  @Post(
    "organizations/:organizationId/finance/deals/:dealId/commissionable-values",
  )
  @ApiOperation({
    operationId: "CommissionController_captureCommissionableValue",
  })
  @ApiParam({ name: "organizationId", required: true, schema: uuidParameter })
  @ApiParam({ name: "dealId", required: true, schema: uuidParameter })
  @ApiBody({ schema: commissionableValueBody })
  @ApiResponse({ status: HttpStatus.CREATED })
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(...GUARDED_POST_GUARDS)
  async captureCommissionableValue(
    @Param("organizationId", new ParseUUIDPipe()) organizationId: string,
    @Param("dealId", new ParseUUIDPipe()) dealId: string,
    @Body() input: CaptureCommissionableValueDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.execute(() =>
      this.commission
        .captureCommissionableValue({
          actor: request.auth,
          userId: request.auth.userId,
          organizationId,
          dealId,
          valueId: input.valueId,
          amountMinor: BigInt(input.amountMinor),
          currency: input.currency,
          capturedAt: new Date(input.capturedAt),
        })
        .then((result) =>
          result.kind === "captured" ? { value: result.value } : result,
        ),
    );
  }

  @Post(
    "organizations/:organizationId/finance/deals/:dealId/expected-commissions",
  )
  @ApiOperation({ operationId: "CommissionController_createExpectedAccrual" })
  @ApiParam({ name: "organizationId", required: true, schema: uuidParameter })
  @ApiParam({ name: "dealId", required: true, schema: uuidParameter })
  @ApiBody({ schema: expectedAccrualBody })
  @ApiResponse({ status: HttpStatus.CREATED })
  @ApiResponse({
    status: HttpStatus.OK,
    description: "Replayed expected accrual",
  })
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(...GUARDED_POST_GUARDS)
  async createExpectedAccrual(
    @Param("organizationId", new ParseUUIDPipe()) organizationId: string,
    @Param("dealId", new ParseUUIDPipe()) dealId: string,
    @Body() input: CreateExpectedAccrualDto,
    @Req() request: AuthenticatedRequest,
    @Res({ passthrough: true }) response: { statusCode: number },
  ) {
    return this.execute(() =>
      this.commission
        .createExpectedAccrual({
          actor: request.auth,
          userId: request.auth.userId,
          organizationId,
          dealId,
          accrualId: input.accrualId,
          commissionableValueId: input.commissionableValueId,
          commissionPlanVersionId: input.commissionPlanVersionId,
          dealClosedWonEventId: input.dealClosedWonEventId,
          createdAt: new Date(),
        })
        .then((result) =>
          result.kind === "created" || result.kind === "replayed"
            ? result.kind === "replayed"
              ? ((response.statusCode = HttpStatus.OK),
                { accrual: result.accrual })
              : { accrual: result.accrual }
            : result,
        ),
    );
  }

  private async execute<T>(
    operation: () => Promise<T>,
  ): Promise<CommissionTransportResponse> {
    try {
      return mapCommissionResult(await operation());
    } catch (error) {
      if (
        error instanceof CommissionValidationError ||
        error instanceof CommissionStateError ||
        error instanceof RangeError
      )
        throw new BadRequestException();
      throw error;
    }
  }
}

function mapCommissionResult<T>(result: T): CommissionTransportResponse {
  if (isKind(result, "access-denied")) throw new ForbiddenException();
  if (isKind(result, "not-found")) throw new NotFoundException();
  if (isKind(result, "conflict")) throw new ConflictException();
  return commissionResponse(result);
}
function isKind(value: unknown, kind: string): boolean {
  return (
    typeof value === "object" &&
    value !== null &&
    "kind" in value &&
    value.kind === kind
  );
}
