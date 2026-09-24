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
import { ApiBody, ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import type { AuthenticatedRequest } from "../../auth/http/auth-request.js";
import { BrowserSessionGuard } from "../../auth/http/browser-session.guard.js";
import { CsrfGuard } from "../../auth/http/csrf.guard.js";
import { RequireCanonicalOriginGuard } from "../../auth/http/origin.guard.js";
import { ViewingApplication } from "../application/viewing-application.js";
import {
  ViewingConflictError,
  ViewingTransitionError,
  ViewingValidationError,
} from "../domain/viewing.js";
import {
  AvailabilityExceptionDto,
  AvailabilityRuleDto,
  CreateViewingDto,
  RescheduleViewingDto,
  ViewingListQueryDto,
  ViewingReasonDto,
} from "./viewing.dto.js";

const unsafe = [RequireCanonicalOriginGuard, BrowserSessionGuard, CsrfGuard];

@ApiTags("Viewings")
@Controller()
export class ViewingController {
  constructor(private readonly viewings: ViewingApplication) {}

  @Get("organizations/:organizationId/viewings")
  @ApiOperation({ operationId: "ViewingController_list" })
  @UseGuards(BrowserSessionGuard)
  @HttpCode(HttpStatus.OK)
  list(
    @Param("organizationId", new ParseUUIDPipe()) organizationId: string,
    @Query() query: ViewingListQueryDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.execute(() =>
      this.viewings.list({
        actor: request.auth,
        userId: request.auth.userId,
        organizationId,
        brokerId: query.brokerId,
        from: query.from ? new Date(query.from) : undefined,
        to: query.to ? new Date(query.to) : undefined,
        cursor: query.cursor,
        limit: query.limit,
      }),
    );
  }

  @Get("organizations/:organizationId/viewings/:viewingId")
  @ApiOperation({ operationId: "ViewingController_find" })
  @UseGuards(BrowserSessionGuard)
  find(
    @Param("organizationId", new ParseUUIDPipe()) organizationId: string,
    @Param("viewingId", new ParseUUIDPipe()) viewingId: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.execute(() =>
      this.viewings.find({
        actor: request.auth,
        userId: request.auth.userId,
        organizationId,
        viewingId,
      }),
    );
  }

  @Post("organizations/:organizationId/viewings")
  @ApiOperation({ operationId: "ViewingController_request" })
  @ApiBody({ type: CreateViewingDto })
  @ApiResponse({ status: HttpStatus.CREATED })
  @UseGuards(...unsafe)
  @HttpCode(HttpStatus.CREATED)
  request(
    @Param("organizationId", new ParseUUIDPipe()) organizationId: string,
    @Body() input: CreateViewingDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.execute(() =>
      this.viewings.request({
        actor: request.auth,
        userId: request.auth.userId,
        organizationId,
        viewingId: crypto.randomUUID(),
        leadId: input.leadId,
        propertyId: input.propertyId,
        brokerId: input.brokerId,
        startAt: new Date(input.startAt),
        endAt: new Date(input.endAt),
        notes: input.notes,
      }),
    );
  }

  @Post("organizations/:organizationId/viewings/:viewingId/confirm")
  @ApiOperation({ operationId: "ViewingController_confirm" })
  @UseGuards(...unsafe)
  confirm(
    @Param("organizationId", new ParseUUIDPipe()) organizationId: string,
    @Param("viewingId", new ParseUUIDPipe()) viewingId: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.execute(() =>
      this.viewings.confirm({
        actor: request.auth,
        userId: request.auth.userId,
        organizationId,
        viewingId,
      }),
    );
  }

  @Post("organizations/:organizationId/viewings/:viewingId/reschedule")
  @ApiOperation({ operationId: "ViewingController_reschedule" })
  @ApiBody({ type: RescheduleViewingDto })
  @UseGuards(...unsafe)
  reschedule(
    @Param("organizationId", new ParseUUIDPipe()) organizationId: string,
    @Param("viewingId", new ParseUUIDPipe()) viewingId: string,
    @Body() input: RescheduleViewingDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.execute(() =>
      this.viewings.reschedule({
        actor: request.auth,
        userId: request.auth.userId,
        organizationId,
        viewingId,
        startAt: new Date(input.startAt),
        endAt: new Date(input.endAt),
        reason: input.reason,
      }),
    );
  }

  @Post("organizations/:organizationId/viewings/:viewingId/cancel")
  @ApiOperation({ operationId: "ViewingController_cancel" })
  @UseGuards(...unsafe)
  cancel(
    @Param("organizationId", new ParseUUIDPipe()) organizationId: string,
    @Param("viewingId", new ParseUUIDPipe()) viewingId: string,
    @Body() input: ViewingReasonDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.execute(() =>
      this.viewings.cancel({
        actor: request.auth,
        userId: request.auth.userId,
        organizationId,
        viewingId,
        reason: input.reason,
      }),
    );
  }

  @Post("organizations/:organizationId/viewings/:viewingId/complete")
  @ApiOperation({ operationId: "ViewingController_complete" })
  @UseGuards(...unsafe)
  complete(
    @Param("organizationId", new ParseUUIDPipe()) organizationId: string,
    @Param("viewingId", new ParseUUIDPipe()) viewingId: string,
    @Body() input: ViewingReasonDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.execute(() =>
      this.viewings.complete({
        actor: request.auth,
        userId: request.auth.userId,
        organizationId,
        viewingId,
        reason: input.reason,
      }),
    );
  }

  @Post("organizations/:organizationId/viewings/:viewingId/no-show")
  @ApiOperation({ operationId: "ViewingController_noShow" })
  @UseGuards(...unsafe)
  noShow(
    @Param("organizationId", new ParseUUIDPipe()) organizationId: string,
    @Param("viewingId", new ParseUUIDPipe()) viewingId: string,
    @Body() input: ViewingReasonDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.execute(() =>
      this.viewings.noShow({
        actor: request.auth,
        userId: request.auth.userId,
        organizationId,
        viewingId,
        reason: input.reason,
      }),
    );
  }

  @Get("organizations/:organizationId/brokers/:brokerId/availability")
  @ApiOperation({ operationId: "ViewingController_getAvailability" })
  @UseGuards(BrowserSessionGuard)
  availability(
    @Param("organizationId", new ParseUUIDPipe()) organizationId: string,
    @Param("brokerId", new ParseUUIDPipe()) brokerId: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.execute(() =>
      this.viewings.availability({
        actor: request.auth,
        userId: request.auth.userId,
        organizationId,
        brokerId,
      }),
    );
  }

  @Post("organizations/:organizationId/brokers/:brokerId/availability/weekly")
  @ApiOperation({ operationId: "ViewingController_addWeeklyAvailability" })
  @ApiBody({ type: AvailabilityRuleDto })
  @UseGuards(...unsafe)
  @HttpCode(HttpStatus.CREATED)
  addWeekly(
    @Param("organizationId", new ParseUUIDPipe()) organizationId: string,
    @Param("brokerId", new ParseUUIDPipe()) brokerId: string,
    @Body() input: AvailabilityRuleDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.execute(() =>
      this.viewings.addRule({
        actor: request.auth,
        userId: request.auth.userId,
        organizationId,
        brokerId,
        weekday: input.weekday,
        startMinute: input.startMinute,
        endMinute: input.endMinute,
        timezone: input.timezone,
      }),
    );
  }

  @Post(
    "organizations/:organizationId/brokers/:brokerId/availability/exceptions",
  )
  @ApiOperation({ operationId: "ViewingController_addAvailabilityException" })
  @ApiBody({ type: AvailabilityExceptionDto })
  @UseGuards(...unsafe)
  @HttpCode(HttpStatus.CREATED)
  addException(
    @Param("organizationId", new ParseUUIDPipe()) organizationId: string,
    @Param("brokerId", new ParseUUIDPipe()) brokerId: string,
    @Body() input: AvailabilityExceptionDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.execute(() =>
      this.viewings.addException({
        actor: request.auth,
        userId: request.auth.userId,
        organizationId,
        brokerId,
        localDate: input.localDate,
        kind: input.kind,
        startMinute: input.startMinute,
        endMinute: input.endMinute,
        timezone: input.timezone,
      }),
    );
  }

  private async execute(operation: () => Promise<unknown>): Promise<unknown> {
    try {
      const result = await operation();
      if (hasKind(result, "access-denied")) throw new ForbiddenException();
      if (hasKind(result, "not-found")) throw new NotFoundException();
      if (hasKind(result, "invalid-state"))
        throw new ConflictException({
          code: "VIEWING_INVALID_TRANSITION",
          message: "Viewing lifecycle transition is not allowed",
        });
      return result;
    } catch (error) {
      if (error instanceof ViewingConflictError)
        throw new ConflictException({
          code: "VIEWING_CONFLICT",
          message: "The broker is already booked for this interval",
        });
      if (error instanceof ViewingTransitionError)
        throw new BadRequestException({
          code: "VIEWING_INVALID_TRANSITION",
          message: "Viewing lifecycle transition is not allowed",
        });
      if (error instanceof ViewingValidationError)
        throw new BadRequestException();
      throw error;
    }
  }
}
function hasKind(value: unknown, kind: string): boolean {
  return (
    typeof value === "object" &&
    value !== null &&
    "kind" in value &&
    value.kind === kind
  );
}
