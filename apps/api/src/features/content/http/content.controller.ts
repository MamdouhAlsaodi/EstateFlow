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
import { ContentApplication } from "../application/content-application.js";
import type {
  ContentActor,
  TransitionContentCommand,
} from "../application/content-application.js";
import {
  ContentStateError,
  ContentValidationError,
} from "../domain/content.js";
import type {
  ContentChannel,
  ContentFailureKind,
  ContentStatus,
} from "../domain/content.js";
import {
  ContentCalendarQueryDto,
  ContentListQueryDto,
  ContentTransitionDto,
  CreateContentDto,
  EditContentDto,
  contentResponse,
} from "./content.dto.js";
import {
  calendarFromParameter,
  calendarResponse,
  calendarToParameter,
  contentCreatedResponse,
  contentDetailResponse,
  contentEditedResponse,
  contentListResponse,
  contentRevisionResponse,
  contentTransitionBody,
  contentTransitionedResponse,
  createContentBody,
  cursorParameter,
  editContentBody,
  limitParameter,
  reviewQueueResponse,
  statusParameter,
  uuidParameter,
} from "./content.openapi.js";

const unsafeMutationGuards = [
  RequireCanonicalOriginGuard,
  BrowserSessionGuard,
  CsrfGuard,
];

/**
 * EF-402 guarded content-workflow HTTP boundary.
 *
 * Authority matrix (ACTIVE membership required): OWNER and MANAGER perform
 * approve/schedule/publish/fail transitions and read every view; BROKER may
 * additionally create items, edit unlocked drafts, submit for review, and
 * create revision variants inside the same organization. Every command is
 * audited; foreign ids yield tenant-safe 404s. Actual channel delivery stays
 * in EF-404 — scheduling only records a timestamp and a channel placeholder.
 */
@ApiTags("Content")
@Controller()
export class ContentController {
  constructor(private readonly content: ContentApplication) {}

  @Post("organizations/:organizationId/content")
  @ApiOperation({ operationId: "ContentController_create" })
  @ApiParam({ name: "organizationId", required: true, schema: uuidParameter })
  @ApiBody({ schema: createContentBody })
  @ApiResponse({
    status: HttpStatus.CREATED,
    content: { "application/json": { schema: contentCreatedResponse } },
  })
  @ApiResponse({ status: HttpStatus.BAD_REQUEST })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED })
  @ApiResponse({ status: HttpStatus.FORBIDDEN })
  @ApiResponse({ status: HttpStatus.NOT_FOUND })
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(...unsafeMutationGuards)
  async create(
    @Param("organizationId", new ParseUUIDPipe()) organizationId: string,
    @Body() input: CreateContentDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.execute(() =>
      this.content.createContentItem({
        actor: this.actor(request),
        userId: request.auth.userId,
        organizationId,
        contentItemId: randomUUID(),
        title: input.title,
        body: input.body,
        channel: input.channel as ContentChannel,
        ...(input.campaignId === undefined
          ? {}
          : { campaignId: input.campaignId }),
        createdAt: new Date(),
      }),
    );
  }

  @Get("organizations/:organizationId/content")
  @ApiOperation({ operationId: "ContentController_list" })
  @ApiParam({ name: "organizationId", required: true, schema: uuidParameter })
  @ApiQuery({ name: "status", required: false, schema: statusParameter })
  @ApiQuery({ name: "cursor", required: false, schema: cursorParameter })
  @ApiQuery({ name: "limit", required: false, schema: limitParameter })
  @ApiResponse({
    status: HttpStatus.OK,
    content: { "application/json": { schema: contentListResponse } },
  })
  @ApiResponse({ status: HttpStatus.BAD_REQUEST })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED })
  @ApiResponse({ status: HttpStatus.FORBIDDEN })
  @HttpCode(HttpStatus.OK)
  @UseGuards(BrowserSessionGuard)
  async list(
    @Param("organizationId", new ParseUUIDPipe()) organizationId: string,
    @Query() query: ContentListQueryDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.execute(() =>
      this.content.listContentItems({
        actor: this.actor(request),
        userId: request.auth.userId,
        organizationId,
        ...(query.status === undefined
          ? {}
          : { status: query.status as ContentStatus }),
        ...(query.cursor === undefined ? {} : { cursor: query.cursor }),
        ...(query.limit === undefined ? {} : { limit: query.limit }),
      }),
    );
  }

  @Get("organizations/:organizationId/content/review-queue")
  @ApiOperation({ operationId: "ContentController_reviewQueue" })
  @ApiParam({ name: "organizationId", required: true, schema: uuidParameter })
  @ApiResponse({
    status: HttpStatus.OK,
    content: { "application/json": { schema: reviewQueueResponse } },
  })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED })
  @ApiResponse({ status: HttpStatus.FORBIDDEN })
  @HttpCode(HttpStatus.OK)
  @UseGuards(BrowserSessionGuard)
  async reviewQueue(
    @Param("organizationId", new ParseUUIDPipe()) organizationId: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.execute(async () => {
      const entries = await this.content.listReviewQueue({
        actor: this.actor(request),
        userId: request.auth.userId,
        organizationId,
      });
      return Array.isArray(entries) ? { items: entries } : entries;
    });
  }

  @Get("organizations/:organizationId/content/calendar")
  @ApiOperation({ operationId: "ContentController_calendar" })
  @ApiParam({ name: "organizationId", required: true, schema: uuidParameter })
  @ApiQuery({ name: "from", required: true, schema: calendarFromParameter })
  @ApiQuery({ name: "to", required: true, schema: calendarToParameter })
  @ApiResponse({
    status: HttpStatus.OK,
    content: { "application/json": { schema: calendarResponse } },
  })
  @ApiResponse({ status: HttpStatus.BAD_REQUEST })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED })
  @ApiResponse({ status: HttpStatus.FORBIDDEN })
  @HttpCode(HttpStatus.OK)
  @UseGuards(BrowserSessionGuard)
  async calendar(
    @Param("organizationId", new ParseUUIDPipe()) organizationId: string,
    @Query() query: ContentCalendarQueryDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.execute(async () => {
      const entries = await this.content.listCalendar({
        actor: this.actor(request),
        userId: request.auth.userId,
        organizationId,
        from: new Date(query.from),
        to: new Date(query.to),
      });
      return Array.isArray(entries) ? { items: entries } : entries;
    });
  }

  @Get("organizations/:organizationId/content/:contentItemId")
  @ApiOperation({ operationId: "ContentController_find" })
  @ApiParam({ name: "organizationId", required: true, schema: uuidParameter })
  @ApiParam({ name: "contentItemId", required: true, schema: uuidParameter })
  @ApiResponse({
    status: HttpStatus.OK,
    content: { "application/json": { schema: contentDetailResponse } },
  })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED })
  @ApiResponse({ status: HttpStatus.FORBIDDEN })
  @ApiResponse({ status: HttpStatus.NOT_FOUND })
  @HttpCode(HttpStatus.OK)
  @UseGuards(BrowserSessionGuard)
  async find(
    @Param("organizationId", new ParseUUIDPipe()) organizationId: string,
    @Param("contentItemId", new ParseUUIDPipe()) contentItemId: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.execute(() =>
      this.content.getContentItem({
        actor: this.actor(request),
        userId: request.auth.userId,
        organizationId,
        contentItemId,
      }),
    );
  }

  @Post("organizations/:organizationId/content/:contentItemId/edit")
  @ApiOperation({ operationId: "ContentController_edit" })
  @ApiParam({ name: "organizationId", required: true, schema: uuidParameter })
  @ApiParam({ name: "contentItemId", required: true, schema: uuidParameter })
  @ApiBody({ schema: editContentBody })
  @ApiResponse({
    status: HttpStatus.OK,
    content: { "application/json": { schema: contentEditedResponse } },
  })
  @ApiResponse({ status: HttpStatus.BAD_REQUEST })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED })
  @ApiResponse({ status: HttpStatus.FORBIDDEN })
  @ApiResponse({ status: HttpStatus.NOT_FOUND })
  @ApiResponse({ status: HttpStatus.CONFLICT })
  @HttpCode(HttpStatus.OK)
  @UseGuards(...unsafeMutationGuards)
  async edit(
    @Param("organizationId", new ParseUUIDPipe()) organizationId: string,
    @Param("contentItemId", new ParseUUIDPipe()) contentItemId: string,
    @Body() input: EditContentDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.execute(() =>
      this.content.editContentItem({
        actor: this.actor(request),
        userId: request.auth.userId,
        organizationId,
        contentItemId,
        title: input.title,
        body: input.body,
        channel: input.channel as ContentChannel,
        ...(input.campaignId === undefined
          ? {}
          : { campaignId: input.campaignId }),
        at: new Date(),
      }),
    );
  }

  @Post("organizations/:organizationId/content/:contentItemId/transition")
  @ApiOperation({ operationId: "ContentController_transition" })
  @ApiParam({ name: "organizationId", required: true, schema: uuidParameter })
  @ApiParam({ name: "contentItemId", required: true, schema: uuidParameter })
  @ApiBody({ schema: contentTransitionBody })
  @ApiResponse({
    status: HttpStatus.OK,
    content: { "application/json": { schema: contentTransitionedResponse } },
  })
  @ApiResponse({ status: HttpStatus.BAD_REQUEST })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED })
  @ApiResponse({ status: HttpStatus.FORBIDDEN })
  @ApiResponse({ status: HttpStatus.NOT_FOUND })
  @ApiResponse({ status: HttpStatus.CONFLICT })
  @HttpCode(HttpStatus.OK)
  @UseGuards(...unsafeMutationGuards)
  async transition(
    @Param("organizationId", new ParseUUIDPipe()) organizationId: string,
    @Param("contentItemId", new ParseUUIDPipe()) contentItemId: string,
    @Body() input: ContentTransitionDto,
    @Req() request: AuthenticatedRequest,
  ): Promise<unknown> {
    return this.execute(() =>
      this.content.transitionContentItem({
        actor: this.actor(request),
        userId: request.auth.userId,
        organizationId,
        contentItemId,
        toStatus: input.toStatus as TransitionContentCommand["toStatus"],
        ...(input.reason === undefined ? {} : { reason: input.reason }),
        ...(input.failureKind === undefined
          ? {}
          : { failureKind: input.failureKind as ContentFailureKind }),
        ...(input.scheduledFor === undefined
          ? {}
          : { scheduledFor: new Date(input.scheduledFor) }),
        at: new Date(),
      }),
    );
  }

  @Post("organizations/:organizationId/content/:contentItemId/revisions")
  @ApiOperation({ operationId: "ContentController_createRevision" })
  @ApiParam({ name: "organizationId", required: true, schema: uuidParameter })
  @ApiParam({ name: "contentItemId", required: true, schema: uuidParameter })
  @ApiResponse({
    status: HttpStatus.CREATED,
    content: { "application/json": { schema: contentRevisionResponse } },
  })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED })
  @ApiResponse({ status: HttpStatus.FORBIDDEN })
  @ApiResponse({ status: HttpStatus.NOT_FOUND })
  @ApiResponse({ status: HttpStatus.CONFLICT })
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(...unsafeMutationGuards)
  async createRevision(
    @Param("organizationId", new ParseUUIDPipe()) organizationId: string,
    @Param("contentItemId", new ParseUUIDPipe()) contentItemId: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.execute(() =>
      this.content.createRevision({
        actor: this.actor(request),
        userId: request.auth.userId,
        organizationId,
        contentItemId,
        revisionId: randomUUID(),
        createdAt: new Date(),
      }),
    );
  }

  private actor(request: AuthenticatedRequest): ContentActor {
    return { verified: request.auth.verified };
  }

  private async execute(operation: () => Promise<unknown>): Promise<unknown> {
    try {
      return contentResponse(mapContentResult(await operation()));
    } catch (error) {
      if (
        error instanceof ContentValidationError ||
        error instanceof ContentStateError ||
        error instanceof RangeError
      )
        throw new BadRequestException();
      throw error;
    }
  }
}

function mapContentResult(result: unknown): unknown {
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
