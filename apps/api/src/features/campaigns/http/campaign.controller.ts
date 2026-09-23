import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import { randomUUID } from "node:crypto";
import {
  ApiBody,
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
import { CampaignApplication } from "../application/campaign-application.js";
import type { CampaignActor } from "../application/campaign-application.js";
import {
  CampaignStateError,
  CampaignValidationError,
} from "../domain/campaign.js";
import type {
  CampaignChannel,
  CampaignStatus,
  CampaignTargetStatus,
} from "../domain/campaign.js";
import type { TouchChannel } from "../domain/attribution.js";
import {
  AttributionCorrectionDto,
  CampaignBudgetCorrectionDto,
  CampaignListQueryDto,
  CampaignPageQueryDto,
  CampaignPerformanceEntryDto,
  CampaignTransitionDto,
  CreateCampaignDto,
  CreateLeadTouchDto,
  campaignResponse,
} from "./campaign.dto.js";
import {
  attributionCorrectionBody,
  budgetCorrectionBody,
  campaignDetailResponse,
  campaignListResponse,
  campaignPerformanceEntriesResponse,
  createCampaignBody,
  cursorParameter,
  leadAttributionResponse,
  leadTouchBody,
  leadTouchesResponse,
  limitParameter,
  performanceEntryBody,
  statusParameter,
  transitionBody,
  uuidParameter,
} from "./campaign.openapi.js";
const unsafeMutationGuards = [
  RequireCanonicalOriginGuard,
  BrowserSessionGuard,
  CsrfGuard,
];

/**
 * EF-401 guarded campaigns and attribution HTTP boundary.
 *
 * Authority matrix (ACTIVE membership required): OWNER and MANAGER manage
 * campaigns, transitions, budget corrections, manual performance entries,
 * lead touches, and attribution corrections, and read every campaign view.
 * BROKER and CLIENT are denied (403). Corrections and touches are append-only
 * with a mandatory audit reason where required; foreign ids yield tenant-safe
 * 404s.
 */
@ApiTags("Campaigns")
@Controller()
export class CampaignController {
  constructor(private readonly campaigns: CampaignApplication) {}

  @Post("organizations/:organizationId/campaigns")
  @ApiOperation({ operationId: "CampaignController_create" })
  @ApiParam({ name: "organizationId", required: true, schema: uuidParameter })
  @ApiBody({ schema: createCampaignBody })
  @ApiResponse({ status: HttpStatus.CREATED })
  @ApiResponse({ status: HttpStatus.BAD_REQUEST })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED })
  @ApiResponse({ status: HttpStatus.FORBIDDEN })
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(...unsafeMutationGuards)
  async create(
    @Param("organizationId", new ParseUUIDPipe()) organizationId: string,
    @Body() input: CreateCampaignDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.execute(() =>
      this.campaigns.createCampaign({
        actor: this.actor(request),
        userId: request.auth.userId,
        organizationId,
        campaignId: randomUUID(),
        name: input.name,
        objective: input.objective,
        channel: input.channel as CampaignChannel,
        startsAt: new Date(input.startsAt),
        endsAt: new Date(input.endsAt),
        budgetPlannedMinor: input.budgetPlannedMinor,
        currency: input.currency,
        utm: {
          ...(input.utmSource === undefined
            ? {}
            : { utmSource: input.utmSource }),
          ...(input.utmMedium === undefined
            ? {}
            : { utmMedium: input.utmMedium }),
          ...(input.utmCampaign === undefined
            ? {}
            : { utmCampaign: input.utmCampaign }),
          ...(input.utmContent === undefined
            ? {}
            : { utmContent: input.utmContent }),
          ...(input.utmTerm === undefined ? {} : { utmTerm: input.utmTerm }),
        },
        createdAt: new Date(),
      }),
    );
  }

  @Get("organizations/:organizationId/campaigns")
  @ApiOperation({ operationId: "CampaignController_list" })
  @ApiParam({ name: "organizationId", required: true, schema: uuidParameter })
  @ApiQuery({ ...statusParameter })
  @ApiQuery({ ...cursorParameter })
  @ApiQuery({ ...limitParameter })
  @ApiResponse({
    status: HttpStatus.OK,
    content: { "application/json": { schema: campaignListResponse } },
  })
  @ApiResponse({ status: HttpStatus.BAD_REQUEST })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED })
  @ApiResponse({ status: HttpStatus.FORBIDDEN })
  @HttpCode(HttpStatus.OK)
  @UseGuards(BrowserSessionGuard)
  async list(
    @Param("organizationId", new ParseUUIDPipe()) organizationId: string,
    @Query() query: CampaignListQueryDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.execute(() =>
      this.campaigns.listCampaigns({
        actor: this.actor(request),
        userId: request.auth.userId,
        organizationId,
        ...(query.status === undefined
          ? {}
          : { status: query.status as CampaignStatus }),
        ...(query.cursor === undefined ? {} : { cursor: query.cursor }),
        ...(query.limit === undefined ? {} : { limit: query.limit }),
      }),
    );
  }

  @Get("organizations/:organizationId/campaigns/:campaignId")
  @ApiOperation({ operationId: "CampaignController_find" })
  @ApiParam({ name: "organizationId", required: true, schema: uuidParameter })
  @ApiParam({ name: "campaignId", required: true, schema: uuidParameter })
  @ApiResponse({
    status: HttpStatus.OK,
    content: { "application/json": { schema: campaignDetailResponse } },
  })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED })
  @ApiResponse({ status: HttpStatus.FORBIDDEN })
  @ApiResponse({ status: HttpStatus.NOT_FOUND })
  @HttpCode(HttpStatus.OK)
  @UseGuards(BrowserSessionGuard)
  async find(
    @Param("organizationId", new ParseUUIDPipe()) organizationId: string,
    @Param("campaignId", new ParseUUIDPipe()) campaignId: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.execute(() =>
      this.campaigns.getCampaign({
        actor: this.actor(request),
        userId: request.auth.userId,
        organizationId,
        campaignId,
      }),
    );
  }

  @Post("organizations/:organizationId/campaigns/:campaignId/transition")
  @ApiOperation({ operationId: "CampaignController_transition" })
  @ApiParam({ name: "organizationId", required: true, schema: uuidParameter })
  @ApiParam({ name: "campaignId", required: true, schema: uuidParameter })
  @ApiBody({ schema: transitionBody })
  @ApiResponse({ status: HttpStatus.OK })
  @ApiResponse({ status: HttpStatus.BAD_REQUEST })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED })
  @ApiResponse({ status: HttpStatus.FORBIDDEN })
  @ApiResponse({ status: HttpStatus.NOT_FOUND })
  @ApiResponse({ status: HttpStatus.CONFLICT })
  @HttpCode(HttpStatus.OK)
  @UseGuards(...unsafeMutationGuards)
  async transition(
    @Param("organizationId", new ParseUUIDPipe()) organizationId: string,
    @Param("campaignId", new ParseUUIDPipe()) campaignId: string,
    @Body() input: CampaignTransitionDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.execute(() =>
      this.campaigns.transitionCampaign({
        actor: this.actor(request),
        userId: request.auth.userId,
        organizationId,
        campaignId,
        toStatus: input.toStatus as CampaignTargetStatus,
        ...(input.reason === undefined ? {} : { reason: input.reason }),
        at: new Date(),
      }),
    );
  }

  @Post(
    "organizations/:organizationId/campaigns/:campaignId/budget-corrections",
  )
  @ApiOperation({ operationId: "CampaignController_correctBudget" })
  @ApiParam({ name: "organizationId", required: true, schema: uuidParameter })
  @ApiParam({ name: "campaignId", required: true, schema: uuidParameter })
  @ApiBody({ schema: budgetCorrectionBody })
  @ApiResponse({ status: HttpStatus.CREATED })
  @ApiResponse({ status: HttpStatus.BAD_REQUEST })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED })
  @ApiResponse({ status: HttpStatus.FORBIDDEN })
  @ApiResponse({ status: HttpStatus.NOT_FOUND })
  @ApiResponse({ status: HttpStatus.CONFLICT })
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(...unsafeMutationGuards)
  async correctBudget(
    @Param("organizationId", new ParseUUIDPipe()) organizationId: string,
    @Param("campaignId", new ParseUUIDPipe()) campaignId: string,
    @Body() input: CampaignBudgetCorrectionDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.execute(() =>
      this.campaigns.correctCampaignBudget({
        actor: this.actor(request),
        userId: request.auth.userId,
        organizationId,
        campaignId,
        correctedMinor: input.correctedMinor,
        reason: input.reason,
        at: new Date(),
      }),
    );
  }

  @Post(
    "organizations/:organizationId/campaigns/:campaignId/performance-entries",
  )
  @ApiOperation({ operationId: "CampaignController_recordPerformance" })
  @ApiParam({ name: "organizationId", required: true, schema: uuidParameter })
  @ApiParam({ name: "campaignId", required: true, schema: uuidParameter })
  @ApiBody({ schema: performanceEntryBody })
  @ApiResponse({ status: HttpStatus.CREATED })
  @ApiResponse({ status: HttpStatus.BAD_REQUEST })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED })
  @ApiResponse({ status: HttpStatus.FORBIDDEN })
  @ApiResponse({ status: HttpStatus.NOT_FOUND })
  @ApiResponse({ status: HttpStatus.CONFLICT })
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(...unsafeMutationGuards)
  async recordPerformance(
    @Param("organizationId", new ParseUUIDPipe()) organizationId: string,
    @Param("campaignId", new ParseUUIDPipe()) campaignId: string,
    @Body() input: CampaignPerformanceEntryDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.execute(() =>
      this.campaigns.recordPerformanceEntry({
        actor: this.actor(request),
        userId: request.auth.userId,
        organizationId,
        campaignId,
        entryId: randomUUID(),
        occurredAt: new Date(input.occurredAt),
        impressions: input.impressions,
        clicks: input.clicks,
        leadsCount: input.leadsCount,
        ...(input.note === undefined ? {} : { note: input.note }),
        createdAt: new Date(),
      }),
    );
  }

  @Get(
    "organizations/:organizationId/campaigns/:campaignId/performance-entries",
  )
  @ApiOperation({ operationId: "CampaignController_listPerformance" })
  @ApiParam({ name: "organizationId", required: true, schema: uuidParameter })
  @ApiParam({ name: "campaignId", required: true, schema: uuidParameter })
  @ApiQuery({ ...cursorParameter })
  @ApiQuery({ ...limitParameter })
  @ApiResponse({
    status: HttpStatus.OK,
    content: {
      "application/json": { schema: campaignPerformanceEntriesResponse },
    },
  })
  @ApiResponse({ status: HttpStatus.BAD_REQUEST })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED })
  @ApiResponse({ status: HttpStatus.FORBIDDEN })
  @ApiResponse({ status: HttpStatus.NOT_FOUND })
  @HttpCode(HttpStatus.OK)
  @UseGuards(BrowserSessionGuard)
  async listPerformance(
    @Param("organizationId", new ParseUUIDPipe()) organizationId: string,
    @Param("campaignId", new ParseUUIDPipe()) campaignId: string,
    @Query() query: CampaignPageQueryDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.execute(() =>
      this.campaigns.listPerformanceEntries({
        actor: this.actor(request),
        userId: request.auth.userId,
        organizationId,
        campaignId,
        ...(query.cursor === undefined ? {} : { cursor: query.cursor }),
        ...(query.limit === undefined ? {} : { limit: query.limit }),
      }),
    );
  }

  @Post("organizations/:organizationId/leads/:leadId/touches")
  @ApiOperation({ operationId: "CampaignController_recordTouch" })
  @ApiParam({ name: "organizationId", required: true, schema: uuidParameter })
  @ApiParam({ name: "leadId", required: true, schema: uuidParameter })
  @ApiBody({ schema: leadTouchBody })
  @ApiResponse({ status: HttpStatus.CREATED })
  @ApiResponse({ status: HttpStatus.BAD_REQUEST })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED })
  @ApiResponse({ status: HttpStatus.FORBIDDEN })
  @ApiResponse({ status: HttpStatus.NOT_FOUND })
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(...unsafeMutationGuards)
  async recordTouch(
    @Param("organizationId", new ParseUUIDPipe()) organizationId: string,
    @Param("leadId", new ParseUUIDPipe()) leadId: string,
    @Body() input: CreateLeadTouchDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.execute(() =>
      this.campaigns.recordLeadTouch({
        actor: this.actor(request),
        userId: request.auth.userId,
        organizationId,
        leadId,
        touchId: randomUUID(),
        channel: input.channel as TouchChannel,
        ...(input.source === undefined ? {} : { source: input.source }),
        ...(input.campaignId === undefined
          ? {}
          : { campaignId: input.campaignId }),
        utm: {
          ...(input.utmSource === undefined
            ? {}
            : { utmSource: input.utmSource }),
          ...(input.utmMedium === undefined
            ? {}
            : { utmMedium: input.utmMedium }),
          ...(input.utmCampaign === undefined
            ? {}
            : { utmCampaign: input.utmCampaign }),
          ...(input.utmContent === undefined
            ? {}
            : { utmContent: input.utmContent }),
          ...(input.utmTerm === undefined ? {} : { utmTerm: input.utmTerm }),
        },
        occurredAt:
          input.occurredAt === undefined
            ? new Date()
            : new Date(input.occurredAt),
        createdAt: new Date(),
      }),
    );
  }

  @Get("organizations/:organizationId/leads/:leadId/touches")
  @ApiOperation({ operationId: "CampaignController_listTouches" })
  @ApiParam({ name: "organizationId", required: true, schema: uuidParameter })
  @ApiParam({ name: "leadId", required: true, schema: uuidParameter })
  @ApiQuery({ ...cursorParameter })
  @ApiQuery({ ...limitParameter })
  @ApiResponse({
    status: HttpStatus.OK,
    content: { "application/json": { schema: leadTouchesResponse } },
  })
  @ApiResponse({ status: HttpStatus.BAD_REQUEST })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED })
  @ApiResponse({ status: HttpStatus.FORBIDDEN })
  @ApiResponse({ status: HttpStatus.NOT_FOUND })
  @HttpCode(HttpStatus.OK)
  @UseGuards(BrowserSessionGuard)
  async listTouches(
    @Param("organizationId", new ParseUUIDPipe()) organizationId: string,
    @Param("leadId", new ParseUUIDPipe()) leadId: string,
    @Query() query: CampaignPageQueryDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.execute(() =>
      this.campaigns.listLeadTouches({
        actor: this.actor(request),
        userId: request.auth.userId,
        organizationId,
        leadId,
        ...(query.cursor === undefined ? {} : { cursor: query.cursor }),
        ...(query.limit === undefined ? {} : { limit: query.limit }),
      }),
    );
  }

  @Get("organizations/:organizationId/leads/:leadId/attribution")
  @ApiOperation({ operationId: "CampaignController_getAttribution" })
  @ApiParam({ name: "organizationId", required: true, schema: uuidParameter })
  @ApiParam({ name: "leadId", required: true, schema: uuidParameter })
  @ApiResponse({
    status: HttpStatus.OK,
    content: { "application/json": { schema: leadAttributionResponse } },
  })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED })
  @ApiResponse({ status: HttpStatus.FORBIDDEN })
  @ApiResponse({ status: HttpStatus.NOT_FOUND })
  @HttpCode(HttpStatus.OK)
  @UseGuards(BrowserSessionGuard)
  async getAttribution(
    @Param("organizationId", new ParseUUIDPipe()) organizationId: string,
    @Param("leadId", new ParseUUIDPipe()) leadId: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.execute(() =>
      this.campaigns.getLeadAttribution({
        actor: this.actor(request),
        userId: request.auth.userId,
        organizationId,
        leadId,
      }),
    );
  }

  @Post("organizations/:organizationId/leads/:leadId/attribution-corrections")
  @ApiOperation({ operationId: "CampaignController_correctAttribution" })
  @ApiParam({ name: "organizationId", required: true, schema: uuidParameter })
  @ApiParam({ name: "leadId", required: true, schema: uuidParameter })
  @ApiBody({ schema: attributionCorrectionBody })
  @ApiResponse({ status: HttpStatus.CREATED })
  @ApiResponse({ status: HttpStatus.BAD_REQUEST })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED })
  @ApiResponse({ status: HttpStatus.FORBIDDEN })
  @ApiResponse({ status: HttpStatus.NOT_FOUND })
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(...unsafeMutationGuards)
  async correctAttribution(
    @Param("organizationId", new ParseUUIDPipe()) organizationId: string,
    @Param("leadId", new ParseUUIDPipe()) leadId: string,
    @Body() input: AttributionCorrectionDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.execute(() =>
      this.campaigns.correctLeadAttribution({
        actor: this.actor(request),
        userId: request.auth.userId,
        organizationId,
        leadId,
        ...(input.correctedCampaignId === undefined
          ? {}
          : { correctedCampaignId: input.correctedCampaignId }),
        reason: input.reason,
        createdAt: new Date(),
      }),
    );
  }

  private actor(request: AuthenticatedRequest): CampaignActor {
    return { verified: request.auth.verified };
  }

  private async execute(operation: () => Promise<unknown>): Promise<unknown> {
    try {
      return campaignResponse(mapCampaignResult(await operation()));
    } catch (error) {
      if (
        error instanceof CampaignValidationError ||
        error instanceof CampaignStateError ||
        error instanceof RangeError
      )
        throw new BadRequestException();
      throw error;
    }
  }
}

function mapCampaignResult(result: unknown): unknown {
  if (hasResultKind(result, "access-denied")) throw new ForbiddenException();
  if (hasResultKind(result, "not-found")) throw new NotFoundException();
  if (hasResultKind(result, "conflict")) throw new ConflictException();
  return result;
}

function hasResultKind(value: unknown, kind: string): boolean {
  return (
    typeof value === "object" &&
    value !== null &&
    "kind" in value &&
    value.kind === kind
  );
}
