/**
 * EF-601 — Media HTTP boundary. Like the EF-510 geo controller, this
 * controller is intentionally excluded from the closed-world Swagger document
 * (apps/api/test/openapi.test.mjs stays untouched). New routes:
 *
 *   POST   /organizations/:organizationId/properties/:propertyId/media/upload-intents
 *   PUT    /organizations/:organizationId/properties/:propertyId/media/storage-objects/:storageKey   (storage-sim, token-authorized)
 *   POST   /organizations/:organizationId/properties/:propertyId/media/:mediaId/confirm
 *   GET    /organizations/:organizationId/properties/:propertyId/media
 *   GET    /organizations/:organizationId/properties/:propertyId/media/:mediaId/bytes
 *   POST   /organizations/:organizationId/properties/:propertyId/media/:mediaId/cover
 *   DELETE /organizations/:organizationId/properties/:propertyId/media/:mediaId
 *
 * All responses are opaque JSON media views — no storage keys, no filesystem
 * paths, no file-byte payloads.
 */

import { randomUUID } from "node:crypto";
import type { Response } from "express";
import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from "@nestjs/common";
import { ApiExcludeController, ApiTags } from "@nestjs/swagger";
import type { AuthenticatedRequest } from "../../auth/http/auth-request.js";
import { BrowserSessionGuard } from "../../auth/http/browser-session.guard.js";
import { CsrfGuard } from "../../auth/http/csrf.guard.js";
import { RequireCanonicalOriginGuard } from "../../auth/http/origin.guard.js";
import {
  MediaAccessDeniedError,
  MediaApplication,
  MediaNotFoundError,
  MediaStateError,
  type MediaActorContext,
} from "../application/media-application.js";
import { MediaValidationError } from "../domain/media.js";
import { UploadIntentError } from "../domain/media-intent.js";
import {
  ConfirmUploadDto,
  CreateUploadIntentDto,
  MediaBytesQueryDto,
} from "./media.dto.js";

const UNSAFE_BROWSER_GUARDS = [
  RequireCanonicalOriginGuard,
  BrowserSessionGuard,
  CsrfGuard,
];

export const MEDIA_MEMBERSHIP_READER = Symbol("MEDIA_MEMBERSHIP_READER");
type MembershipReader = {
  findMembership(
    organizationId: string,
    userId: string,
  ): Promise<{
    organizationId: string;
    role: "OWNER" | "MANAGER" | "BROKER" | "CLIENT";
    status: string;
  } | null>;
};

@ApiExcludeController()
@ApiTags("Media")
@Controller()
export class MediaController {
  constructor(
    private readonly media: MediaApplication,
    @Inject(MEDIA_MEMBERSHIP_READER)
    private readonly memberships: MembershipReader,
  ) {}

  private async withMembership<T>(
    request: AuthenticatedRequest,
    organizationId: string,
    operation: (actor: MediaActorContext) => Promise<T>,
  ): Promise<T> {
    const membership = await this.memberships.findMembership(
      organizationId,
      request.auth.userId,
    );
    const actor: MediaActorContext = {
      userId: request.auth.userId,
      verified: request.auth.verified,
      platformAdmin: request.auth.platformRole === "PLATFORM_ADMIN",
      memberships: membership
        ? [
            {
              organizationId: membership.organizationId,
              role: membership.role,
              active: membership.status === "ACTIVE",
            },
          ]
        : [],
    };
    return this.execute(() => operation(actor));
  }

  @Post(
    "organizations/:organizationId/properties/:propertyId/media/upload-intents",
  )
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(...UNSAFE_BROWSER_GUARDS)
  async createUploadIntent(
    @Param("organizationId", new ParseUUIDPipe()) organizationId: string,
    @Param("propertyId", new ParseUUIDPipe()) propertyId: string,
    @Body() input: CreateUploadIntentDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.withMembership(request, organizationId, (actor) =>
      this.media.createUploadIntent({
        actor,
        organizationId,
        propertyId,
        mediaId: randomUUID(),
        kind: input.kind,
        contentType: input.contentType,
        byteSize: input.byteSize,
        fileName: input.fileName,
      }),
    );
  }

  @Post(
    "organizations/:organizationId/properties/:propertyId/media/:mediaId/confirm",
  )
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(...UNSAFE_BROWSER_GUARDS)
  async confirmUpload(
    @Param("organizationId", new ParseUUIDPipe()) organizationId: string,
    @Param("propertyId", new ParseUUIDPipe()) propertyId: string,
    @Param("mediaId", new ParseUUIDPipe()) mediaId: string,
    @Body() input: ConfirmUploadDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.withMembership(request, organizationId, (actor) =>
      this.media.confirmUpload({
        actor,
        organizationId,
        propertyId,
        mediaId,
        token: input.token,
      }),
    );
  }

  @Get("organizations/:organizationId/properties/:propertyId/media")
  @UseGuards(BrowserSessionGuard)
  async listMedia(
    @Param("organizationId", new ParseUUIDPipe()) organizationId: string,
    @Param("propertyId", new ParseUUIDPipe()) propertyId: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.withMembership(request, organizationId, (actor) =>
      this.media.listMedia({ actor, organizationId, propertyId }),
    );
  }

  @Get(
    "organizations/:organizationId/properties/:propertyId/media/:mediaId/bytes",
  )
  @UseGuards(BrowserSessionGuard)
  async mediaBytes(
    @Param("organizationId", new ParseUUIDPipe()) organizationId: string,
    @Param("propertyId", new ParseUUIDPipe()) propertyId: string,
    @Param("mediaId", new ParseUUIDPipe()) mediaId: string,
    @Query() query: MediaBytesQueryDto,
    @Req() request: AuthenticatedRequest,
    @Res() response: Response,
  ): Promise<Response> {
    const media = await this.withMembership(request, organizationId, (actor) =>
      this.media.mediaBytes({
        actor,
        organizationId,
        propertyId,
        mediaId,
        variant: query.variant,
      }),
    );
    response.setHeader("Content-Type", media.contentType);
    response.setHeader("Content-Length", String(media.byteSize));
    response.setHeader("Cache-Control", "private, max-age=60");
    response.end(Buffer.from(media.bytes));
    return response;
  }

  @Post(
    "organizations/:organizationId/properties/:propertyId/media/:mediaId/cover",
  )
  @UseGuards(...UNSAFE_BROWSER_GUARDS)
  async setCover(
    @Param("organizationId", new ParseUUIDPipe()) organizationId: string,
    @Param("propertyId", new ParseUUIDPipe()) propertyId: string,
    @Param("mediaId", new ParseUUIDPipe()) mediaId: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.withMembership(request, organizationId, (actor) =>
      this.media.setCover({ actor, organizationId, propertyId, mediaId }),
    );
  }

  @Delete("organizations/:organizationId/properties/:propertyId/media/:mediaId")
  @UseGuards(...UNSAFE_BROWSER_GUARDS)
  async removeMedia(
    @Param("organizationId", new ParseUUIDPipe()) organizationId: string,
    @Param("propertyId", new ParseUUIDPipe()) propertyId: string,
    @Param("mediaId", new ParseUUIDPipe()) mediaId: string,
    @Req() request: AuthenticatedRequest,
  ) {
    await this.withMembership(request, organizationId, (actor) =>
      this.media.removeMedia({ actor, organizationId, propertyId, mediaId }),
    );
    return { deleted: true };
  }

  private async execute<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      if (error instanceof MediaNotFoundError) throw new NotFoundException();
      if (error instanceof MediaAccessDeniedError)
        throw new ForbiddenException();
      if (error instanceof MediaStateError)
        throw new ConflictException(error.code);
      if (error instanceof MediaValidationError)
        throw new BadRequestException(error.code);
      if (error instanceof UploadIntentError)
        throw new BadRequestException(error.code);
      throw error;
    }
  }
}
