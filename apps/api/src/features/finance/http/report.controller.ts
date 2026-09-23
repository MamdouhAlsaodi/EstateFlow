import {
  BadRequestException,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import {
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from "@nestjs/swagger";
import type { AuthenticatedRequest } from "../../auth/http/auth-request.js";
import { BrowserSessionGuard } from "../../auth/http/browser-session.guard.js";
import { ReceivableValidationError } from "../domain/receivable.js";
import { ReportApplication } from "../application/report-application.js";
import type { AgingBucket } from "../domain/receivable.js";
import {
  ReportAgingItemsQueryDto,
  ReportCampaignPerformanceQueryDto,
  ReportCommissionItemsQueryDto,
  ReportItemsQueryDto,
  ReportWindowQueryDto,
  reportResponse,
} from "./report.dto.js";
import {
  agingItemsResponse,
  agingSummaryResponse,
  cashFlowResponse,
  commissionItemsResponse,
  commissionSummaryResponse,
  campaignPerformanceResponse,
  expensesResponse,
  paymentsResponse,
  performanceResponse,
  reportQueryParameters,
  uuidParameter,
} from "./report.openapi.js";

/**
 * EF-235 / FIN-05 owner finance dashboard HTTP boundary.
 *
 * Read-only GET surface: Owner-only, strict DTO validation, bigint-safe
 * responses, and a freshness timestamp (`asOf`) in every payload.
 */
@ApiTags("Owner reports")
@Controller()
export class ReportController {
  constructor(private readonly reports: ReportApplication) {}

  @Get("organizations/:organizationId/finance/reports/cash-flow")
  @ApiOperation({ operationId: "ReportController_getCashFlow" })
  @ApiParam({ name: "organizationId", required: true, schema: uuidParameter })
  @ApiQuery({ ...reportQueryParameters.window()[0] })
  @ApiQuery({ ...reportQueryParameters.window()[1] })
  @ApiResponse({
    status: HttpStatus.OK,
    content: { "application/json": { schema: cashFlowResponse } },
  })
  @ReportErrors()
  @HttpCode(HttpStatus.OK)
  @UseGuards(BrowserSessionGuard)
  async getCashFlow(
    @Param("organizationId", new ParseUUIDPipe()) organizationId: string,
    @Query() query: ReportWindowQueryDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.execute(() =>
      this.reports.getCashFlow({
        actor: request.auth,
        userId: request.auth.userId,
        organizationId,
        window: reportWindow(query),
      }),
    );
  }

  @Get("organizations/:organizationId/finance/reports/payments")
  @ApiOperation({ operationId: "ReportController_listPayments" })
  @ApiParam({ name: "organizationId", required: true, schema: uuidParameter })
  @ApiQuery({ ...reportQueryParameters.dealDimension()[0] })
  @ApiQuery({ ...reportQueryParameters.dealDimension()[1] })
  @ApiQuery({ ...reportQueryParameters.window()[0] })
  @ApiQuery({ ...reportQueryParameters.window()[1] })
  @ApiQuery({ ...reportQueryParameters.page()[0] })
  @ApiQuery({ ...reportQueryParameters.page()[1] })
  @ApiResponse({
    status: HttpStatus.OK,
    content: { "application/json": { schema: paymentsResponse } },
  })
  @ReportErrors()
  @HttpCode(HttpStatus.OK)
  @UseGuards(BrowserSessionGuard)
  async listPayments(
    @Param("organizationId", new ParseUUIDPipe()) organizationId: string,
    @Query() query: ReportItemsQueryDto,
    @Req() request: AuthenticatedRequest,
  ) {
    const { window, dimension, page } = reportQueryParts(query);
    return this.execute(() =>
      this.reports.listCashInflowItems({
        actor: request.auth,
        userId: request.auth.userId,
        organizationId,
        window,
        dimension,
        ...page,
      }),
    );
  }

  @Get("organizations/:organizationId/finance/reports/expenses")
  @ApiOperation({ operationId: "ReportController_listExpenses" })
  @ApiParam({ name: "organizationId", required: true, schema: uuidParameter })
  @ApiQuery({ ...reportQueryParameters.dealDimension()[0] })
  @ApiQuery({ ...reportQueryParameters.dealDimension()[1] })
  @ApiQuery({ ...reportQueryParameters.dealDimension()[2] })
  @ApiQuery({ ...reportQueryParameters.window()[0] })
  @ApiQuery({ ...reportQueryParameters.window()[1] })
  @ApiQuery({ ...reportQueryParameters.page()[0] })
  @ApiQuery({ ...reportQueryParameters.page()[1] })
  @ApiResponse({
    status: HttpStatus.OK,
    content: { "application/json": { schema: expensesResponse } },
  })
  @ReportErrors()
  @HttpCode(HttpStatus.OK)
  @UseGuards(BrowserSessionGuard)
  async listExpenses(
    @Param("organizationId", new ParseUUIDPipe()) organizationId: string,
    @Query() query: ReportItemsQueryDto,
    @Req() request: AuthenticatedRequest,
  ) {
    const { window, dimension, page } = reportQueryParts(query);
    return this.execute(() =>
      this.reports.listCashOutflowItems({
        actor: request.auth,
        userId: request.auth.userId,
        organizationId,
        window,
        dimension,
        ...page,
      }),
    );
  }

  @Get("organizations/:organizationId/finance/reports/receivables/aging")
  @ApiOperation({ operationId: "ReportController_getAgingSummary" })
  @ApiParam({ name: "organizationId", required: true, schema: uuidParameter })
  @ApiResponse({
    status: HttpStatus.OK,
    content: { "application/json": { schema: agingSummaryResponse } },
  })
  @ReportErrors()
  @HttpCode(HttpStatus.OK)
  @UseGuards(BrowserSessionGuard)
  async getAgingSummary(
    @Param("organizationId", new ParseUUIDPipe()) organizationId: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.execute(() =>
      this.reports.getAgingSummary({
        actor: request.auth,
        userId: request.auth.userId,
        organizationId,
      }),
    );
  }

  @Get("organizations/:organizationId/finance/reports/receivables/aging/items")
  @ApiOperation({ operationId: "ReportController_listAgingItems" })
  @ApiParam({ name: "organizationId", required: true, schema: uuidParameter })
  @ApiQuery({
    name: "bucket",
    required: true,
    schema: {
      type: "string",
      enum: [
        "CURRENT",
        "DAYS_1_30",
        "DAYS_31_60",
        "DAYS_61_90",
        "DAYS_91_PLUS",
      ],
    },
  })
  @ApiQuery({ ...reportQueryParameters.page()[0] })
  @ApiQuery({ ...reportQueryParameters.page()[1] })
  @ApiResponse({
    status: HttpStatus.OK,
    content: { "application/json": { schema: agingItemsResponse } },
  })
  @ReportErrors()
  @HttpCode(HttpStatus.OK)
  @UseGuards(BrowserSessionGuard)
  async listAgingItems(
    @Param("organizationId", new ParseUUIDPipe()) organizationId: string,
    @Query() query: ReportAgingItemsQueryDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.execute(() =>
      this.reports.listAgingItems({
        actor: request.auth,
        userId: request.auth.userId,
        organizationId,
        bucket: query.bucket as AgingBucket,
        cursor: query.cursor,
        limit: query.limit,
      }),
    );
  }

  @Get("organizations/:organizationId/finance/reports/commissions")
  @ApiOperation({ operationId: "ReportController_getCommissionSummary" })
  @ApiParam({ name: "organizationId", required: true, schema: uuidParameter })
  @ApiResponse({
    status: HttpStatus.OK,
    content: { "application/json": { schema: commissionSummaryResponse } },
  })
  @ReportErrors()
  @HttpCode(HttpStatus.OK)
  @UseGuards(BrowserSessionGuard)
  async getCommissionSummary(
    @Param("organizationId", new ParseUUIDPipe()) organizationId: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.execute(() =>
      this.reports.getCommissionSummary({
        actor: request.auth,
        userId: request.auth.userId,
        organizationId,
      }),
    );
  }

  @Get("organizations/:organizationId/finance/reports/commissions/items")
  @ApiOperation({ operationId: "ReportController_listCommissionItems" })
  @ApiParam({ name: "organizationId", required: true, schema: uuidParameter })
  @ApiQuery({
    name: "status",
    required: true,
    schema: {
      type: "string",
      enum: ["EXPECTED", "CONFIRMED", "DUE", "PAID", "CANCELLED"],
    },
  })
  @ApiQuery({ ...reportQueryParameters.page()[0] })
  @ApiQuery({ ...reportQueryParameters.page()[1] })
  @ApiResponse({
    status: HttpStatus.OK,
    content: { "application/json": { schema: commissionItemsResponse } },
  })
  @ReportErrors()
  @HttpCode(HttpStatus.OK)
  @UseGuards(BrowserSessionGuard)
  async listCommissionItems(
    @Param("organizationId", new ParseUUIDPipe()) organizationId: string,
    @Query() query: ReportCommissionItemsQueryDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.execute(() =>
      this.reports.listCommissionItems({
        actor: request.auth,
        userId: request.auth.userId,
        organizationId,
        status: query.status as
          "EXPECTED" | "CONFIRMED" | "DUE" | "PAID" | "CANCELLED",
        cursor: query.cursor,
        limit: query.limit,
      }),
    );
  }

  @Get("organizations/:organizationId/finance/reports/performance")
  @ApiOperation({ operationId: "ReportController_getPerformance" })
  @ApiParam({ name: "organizationId", required: true, schema: uuidParameter })
  @ApiQuery({ ...reportQueryParameters.window()[0] })
  @ApiQuery({ ...reportQueryParameters.window()[1] })
  @ApiResponse({
    status: HttpStatus.OK,
    content: { "application/json": { schema: performanceResponse } },
  })
  @ReportErrors()
  @HttpCode(HttpStatus.OK)
  @UseGuards(BrowserSessionGuard)
  async getPerformance(
    @Param("organizationId", new ParseUUIDPipe()) organizationId: string,
    @Query() query: ReportWindowQueryDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.execute(() =>
      this.reports.getPerformance({
        actor: request.auth,
        userId: request.auth.userId,
        organizationId,
        window: reportWindow(query),
      }),
    );
  }

  @Get("organizations/:organizationId/finance/reports/campaigns/performance")
  @ApiOperation({ operationId: "ReportController_getCampaignPerformance" })
  @ApiParam({ name: "organizationId", required: true, schema: uuidParameter })
  @ApiQuery({
    name: "model",
    required: true,
    schema: { type: "string", enum: ["FIRST_TOUCH", "LAST_TOUCH"] },
  })
  @ApiQuery({ ...reportQueryParameters.window()[0] })
  @ApiQuery({ ...reportQueryParameters.window()[1] })
  @ApiResponse({
    status: HttpStatus.OK,
    content: { "application/json": { schema: campaignPerformanceResponse } },
  })
  @ReportErrors()
  @HttpCode(HttpStatus.OK)
  @UseGuards(BrowserSessionGuard)
  async getCampaignPerformance(
    @Param("organizationId", new ParseUUIDPipe()) organizationId: string,
    @Query() query: ReportCampaignPerformanceQueryDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.execute(() =>
      this.reports.getCampaignPerformance({
        actor: request.auth,
        userId: request.auth.userId,
        organizationId,
        model: query.model as "FIRST_TOUCH" | "LAST_TOUCH",
        window: reportWindow(query),
      }),
    );
  }

  private async execute(operation: () => Promise<unknown>): Promise<unknown> {
    try {
      return reportResponse(mapReportResult(await operation()));
    } catch (error) {
      if (
        error instanceof ReceivableValidationError ||
        error instanceof RangeError
      )
        throw new BadRequestException();
      throw error;
    }
  }
}

function reportWindow(query: ReportWindowQueryDto): {
  from?: Date;
  to?: Date;
} {
  return {
    ...(query.from === undefined ? {} : { from: new Date(query.from) }),
    ...(query.to === undefined ? {} : { to: new Date(query.to) }),
  };
}

function reportQueryParts(query: ReportItemsQueryDto): {
  window: { from?: Date; to?: Date };
  dimension: { dealId?: string; propertyId?: string; campaignId?: string };
  page: { cursor?: string; limit?: number };
} {
  return {
    window: reportWindow(query),
    dimension: ReportItemsQueryDto.dimension(query),
    page: { cursor: query.cursor, limit: query.limit },
  };
}

function ReportErrors(): MethodDecorator {
  return (target, propertyKey, descriptor) => {
    ApiResponse({ status: 400, description: "Invalid report query" })(
      target,
      propertyKey,
      descriptor,
    );
    ApiResponse({ status: 401, description: "Missing or invalid session" })(
      target,
      propertyKey,
      descriptor,
    );
    ApiResponse({ status: 403, description: "Owner role required" })(
      target,
      propertyKey,
      descriptor,
    );
  };
}

function mapReportResult(result: unknown): unknown {
  if (
    typeof result === "object" &&
    result !== null &&
    "kind" in result &&
    result.kind === "access-denied"
  )
    throw new ForbiddenException();
  return result;
}
