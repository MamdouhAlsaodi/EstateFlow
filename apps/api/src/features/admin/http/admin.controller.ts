import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  HttpException,
  HttpStatus,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import { ApiExcludeController } from "@nestjs/swagger";
import type { AuthenticatedRequest } from "../../auth/http/auth-request.js";
import { BrowserSessionGuard } from "../../auth/http/browser-session.guard.js";
import { CsrfGuard } from "../../auth/http/csrf.guard.js";
import { RequireCanonicalOriginGuard } from "../../auth/http/origin.guard.js";
import { AdminApplication } from "../application/admin-application.js";
import {
  AdminConflictError,
  AdminForbiddenError,
  AdminNotFoundError,
  AdminStepUpDeniedError,
  AdminStepUpRequiredError,
  AdminValidationError,
} from "../domain/admin-errors.js";
import {
  AdminFailedJobsQueryDto,
  AdminAuditSearchQueryDto,
  AdminMandatoryReasonDto,
  AdminPageQueryDto,
  AdminReasonDto,
  AdminStepUpDto,
  renderAdmin,
} from "./admin.dto.js";
import { PlatformAdminGuard } from "./platform-admin.guard.js";

const readGuards = [BrowserSessionGuard, PlatformAdminGuard];
const unsafeGuards = [
  RequireCanonicalOriginGuard,
  BrowserSessionGuard,
  CsrfGuard,
  PlatformAdminGuard,
];

/**
 * EF-620 — platform-admin surface. Internal-only per the EF-601/EF-610
 * precedent: the controller is excluded from the closed-world OpenAPI
 * document, so the generated client inventory is unchanged and
 * `openapi.test.mjs` stays untouched.
 *
 * Authority: every route demands the existing EF-121 PLATFORM_ADMIN role via
 * PlatformAdminGuard AND re-checks it at the application layer. Sensitive
 * commands (suspend broker, listing takedown) require a mandatory reason plus
 * a fresh step-up password re-confirmation bound to the current access
 * session; every accepted transition is appended to the admin audit trail.
 * All reads are bounded keyset pages; no view ever carries raw payloads or
 * secrets.
 */
@ApiExcludeController()
@Controller()
export class AdminController {
  constructor(private readonly admin: AdminApplication) {}

  @Post("admin/auth/step-up")
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(...unsafeGuards)
  async stepUp(
    @Body() input: AdminStepUpDto,
    @Req() request: AuthenticatedRequest,
  ): Promise<void> {
    await this.execute(() =>
      this.admin.stepUp({
        actor: request.auth,
        password: input?.password,
        now: new Date(),
      }),
    );
  }

  @Get("admin/brokers/pending")
  @UseGuards(...readGuards)
  async pendingBrokers(
    @Query() query: AdminPageQueryDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.execute(async () =>
      renderItems(
        renderAdmin(
          await this.admin.listPendingBrokers({
            actor: request.auth,
            cursor: query.cursor,
            limit: query.limit,
          }),
        ),
      ),
    );
  }

  @Post("admin/organizations/:organizationId/brokers/:membershipId/approve")
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(...unsafeGuards)
  async approveBroker(
    @Param("organizationId", new ParseUUIDPipe()) organizationId: string,
    @Param("membershipId", new ParseUUIDPipe()) membershipId: string,
    @Body() input: AdminReasonDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.execute(() =>
      this.admin
        .approveBroker({
          actor: request.auth,
          organizationId,
          membershipId,
          reason: input?.reason,
          now: new Date(),
        })
        .then(renderAdmin),
    );
  }

  @Post("admin/organizations/:organizationId/brokers/:membershipId/suspend")
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(...unsafeGuards)
  async suspendBroker(
    @Param("organizationId", new ParseUUIDPipe()) organizationId: string,
    @Param("membershipId", new ParseUUIDPipe()) membershipId: string,
    @Body() input: AdminMandatoryReasonDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.execute(() =>
      this.admin
        .suspendBroker({
          actor: request.auth,
          organizationId,
          membershipId,
          reason: input?.reason,
          now: new Date(),
        })
        .then(renderAdmin),
    );
  }

  @Post("admin/organizations/:organizationId/brokers/:membershipId/reinstate")
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(...unsafeGuards)
  async reinstateBroker(
    @Param("organizationId", new ParseUUIDPipe()) organizationId: string,
    @Param("membershipId", new ParseUUIDPipe()) membershipId: string,
    @Body() input: AdminMandatoryReasonDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.execute(() =>
      this.admin
        .reinstateBroker({
          actor: request.auth,
          organizationId,
          membershipId,
          reason: input?.reason,
          now: new Date(),
        })
        .then(renderAdmin),
    );
  }

  @Get("admin/listings/moderation-queue")
  @UseGuards(...readGuards)
  async moderationQueue(
    @Query() query: AdminPageQueryDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.execute(async () =>
      renderItems(
        renderAdmin(
          await this.admin.moderationQueue({
            actor: request.auth,
            cursor: query.cursor,
            limit: query.limit,
          }),
        ),
      ),
    );
  }

  @Post(
    "admin/organizations/:organizationId/listings/:listingId/moderation/approve",
  )
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(...unsafeGuards)
  async approveListing(
    @Param("organizationId", new ParseUUIDPipe()) organizationId: string,
    @Param("listingId", new ParseUUIDPipe()) listingId: string,
    @Body() input: AdminReasonDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.execute(() =>
      this.admin
        .approveListing({
          actor: request.auth,
          organizationId,
          listingId,
          reason: input?.reason,
          now: new Date(),
        })
        .then(renderAdmin),
    );
  }

  @Post(
    "admin/organizations/:organizationId/listings/:listingId/moderation/reject",
  )
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(...unsafeGuards)
  async rejectListing(
    @Param("organizationId", new ParseUUIDPipe()) organizationId: string,
    @Param("listingId", new ParseUUIDPipe()) listingId: string,
    @Body() input: AdminMandatoryReasonDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.execute(() =>
      this.admin
        .rejectListing({
          actor: request.auth,
          organizationId,
          listingId,
          reason: input?.reason,
          now: new Date(),
        })
        .then(renderAdmin),
    );
  }

  @Post(
    "admin/organizations/:organizationId/listings/:listingId/moderation/takedown",
  )
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(...unsafeGuards)
  async takedownListing(
    @Param("organizationId", new ParseUUIDPipe()) organizationId: string,
    @Param("listingId", new ParseUUIDPipe()) listingId: string,
    @Body() input: AdminMandatoryReasonDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.execute(() =>
      this.admin
        .takedownListing({
          actor: request.auth,
          organizationId,
          listingId,
          reason: input?.reason,
          now: new Date(),
        })
        .then(renderAdmin),
    );
  }

  @Get("admin/audit/events")
  @UseGuards(...readGuards)
  async auditSearch(
    @Query() query: AdminAuditSearchQueryDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.execute(async () =>
      renderItems(
        renderAdmin(
          await this.admin.searchAudit({
            actor: request.auth,
            action: query.action,
            organizationId: query.organizationId,
            actorId: query.actorId,
            cursor: query.cursor,
            limit: query.limit,
          }),
        ),
      ),
    );
  }

  @Get("admin/automation/failed-jobs")
  @UseGuards(...readGuards)
  async failedJobs(
    @Query() query: AdminFailedJobsQueryDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.execute(async () =>
      renderItems(
        renderAdmin(
          await this.admin.failedJobs({
            actor: request.auth,
            organizationId: query.organizationId,
            cursor: query.cursor,
            limit: query.limit,
          }),
        ),
      ),
    );
  }

  private async execute<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      if (error instanceof AdminStepUpRequiredError)
        throw new ForbiddenException(error.code);
      if (error instanceof AdminStepUpDeniedError)
        throw new HttpException(error.code, HttpStatus.TOO_MANY_REQUESTS);
      if (error instanceof AdminForbiddenError) throw new ForbiddenException();
      if (error instanceof AdminNotFoundError) throw new NotFoundException();
      if (error instanceof AdminConflictError) throw new ConflictException();
      if (error instanceof AdminValidationError)
        throw new BadRequestException();
      throw error;
    }
  }
}

/**
 * Keyset pages are shaped `{ items, nextCursor }`; the per-item renderers run
 * first so only the closed, bounded projection ever leaves the API.
 */
function renderItems(page: { items: readonly unknown[]; nextCursor: unknown }) {
  return { items: page.items, nextCursor: page.nextCursor ?? null };
}
