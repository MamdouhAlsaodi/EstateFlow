import { randomUUID } from "node:crypto";
import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import type { AuthenticatedRequest } from "../../auth/http/auth-request.js";
import { BrowserSessionGuard } from "../../auth/http/browser-session.guard.js";
import { CsrfGuard } from "../../auth/http/csrf.guard.js";
import { RequireCanonicalOriginGuard } from "../../auth/http/origin.guard.js";
import {
  PropertyAccessDeniedError,
  PropertyApplication,
  type ActorContext,
  PropertyNotFoundError,
} from "../application/property-application.js";
import { PropertyRepositoryConflictError } from "../application/property-repository.js";
import {
  PropertyTransitionError,
  PropertyValidationError,
  PropertyVersionConflictError,
} from "../domain/property.js";
import { ApiQuery } from "@nestjs/swagger";
import {
  CreatePropertyDto,
  ImageMetadataDto,
  ListingVersionDto,
  PropertyListQueryDto,
  UpdatePropertyDto,
} from "./property.dto.js";

const UNSAFE_BROWSER_GUARDS = [
  RequireCanonicalOriginGuard,
  BrowserSessionGuard,
  CsrfGuard,
];
export const PROPERTY_MEMBERSHIP_READER = Symbol("PROPERTY_MEMBERSHIP_READER");
type MembershipReader = {
  findMembership(
    organizationId: string,
    userId: string,
  ): Promise<{
    organizationId: string;
    role: ActorContext["memberships"][number]["role"];
    status: string;
  } | null>;
};

@Controller()
export class PropertyController {
  constructor(
    private readonly properties: PropertyApplication,
    @Inject(PROPERTY_MEMBERSHIP_READER)
    private readonly memberships: MembershipReader,
  ) {}

  private async actor(
    request: AuthenticatedRequest,
    organizationId: string,
  ): Promise<ActorContext> {
    const membership = await this.memberships.findMembership(
      organizationId,
      request.auth.userId,
    );
    return {
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
  }

  @Post("organizations/:organizationId/properties")
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(...UNSAFE_BROWSER_GUARDS)
  async create(
    @Param("organizationId", new ParseUUIDPipe()) organizationId: string,
    @Body() input: CreatePropertyDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.execute(async () =>
      this.properties.createProperty({
        actor: await this.actor(request, organizationId),
        organizationId,
        property: { id: randomUUID(), ...input },
      }),
    );
  }

  @Patch("organizations/:organizationId/properties/:propertyId")
  @UseGuards(...UNSAFE_BROWSER_GUARDS)
  async update(
    @Param("organizationId", new ParseUUIDPipe()) organizationId: string,
    @Param("propertyId", new ParseUUIDPipe()) propertyId: string,
    @Body() input: UpdatePropertyDto,
    @Req() request: AuthenticatedRequest,
  ) {
    const { version, ...changes } = input;
    return this.execute(async () =>
      this.properties.update({
        actor: await this.actor(request, organizationId),
        organizationId,
        propertyId,
        version,
        changes,
      }),
    );
  }

  @Get("organizations/:organizationId/properties")
  @ApiQuery({
    name: "search",
    required: false,
    schema: { type: "string", maxLength: 200 },
  })
  @ApiQuery({
    name: "cursor",
    required: false,
    schema: { type: "string", maxLength: 255 },
  })
  @ApiQuery({
    name: "limit",
    required: false,
    schema: { type: "integer", minimum: 1, maximum: 50 },
  })
  @UseGuards(BrowserSessionGuard)
  async list(
    @Param("organizationId", new ParseUUIDPipe()) organizationId: string,
    @Query() query: PropertyListQueryDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.execute(async () =>
      this.properties.searchProperties({
        actor: await this.actor(request, organizationId),
        organizationId,
        ...query,
      }),
    );
  }

  @Get("organizations/:organizationId/properties/:propertyId")
  @UseGuards(BrowserSessionGuard)
  async find(
    @Param("organizationId", new ParseUUIDPipe()) organizationId: string,
    @Param("propertyId", new ParseUUIDPipe()) propertyId: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.execute(async () =>
      this.properties.getProperty({
        actor: await this.actor(request, organizationId),
        organizationId,
        propertyId,
      }),
    );
  }

  @Post("organizations/:organizationId/properties/:propertyId/listings")
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(...UNSAFE_BROWSER_GUARDS)
  async createListing(
    @Param("organizationId", new ParseUUIDPipe()) organizationId: string,
    @Param("propertyId", new ParseUUIDPipe()) propertyId: string,
    @Body() input: ListingVersionDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.execute(async () =>
      this.properties.createListing({
        actor: await this.actor(request, organizationId),
        organizationId,
        propertyId,
        propertyVersion: input.version,
        listingId: randomUUID(),
      }),
    );
  }

  @Post("organizations/:organizationId/listings/:listingId/publish")
  @UseGuards(...UNSAFE_BROWSER_GUARDS)
  async publish(
    @Param("organizationId", new ParseUUIDPipe()) organizationId: string,
    @Param("listingId", new ParseUUIDPipe()) listingId: string,
    @Body() input: ListingVersionDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.execute(async () =>
      this.properties.publishListing({
        actor: await this.actor(request, organizationId),
        organizationId,
        listingId,
        version: input.version,
      }),
    );
  }

  @Post("organizations/:organizationId/listings/:listingId/archive")
  @UseGuards(...UNSAFE_BROWSER_GUARDS)
  async archive(
    @Param("organizationId", new ParseUUIDPipe()) organizationId: string,
    @Param("listingId", new ParseUUIDPipe()) listingId: string,
    @Body() input: ListingVersionDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.execute(async () =>
      this.properties.archiveListing({
        actor: await this.actor(request, organizationId),
        organizationId,
        listingId,
        version: input.version,
      }),
    );
  }

  @Get("organizations/:organizationId/listings/:listingId")
  @UseGuards(BrowserSessionGuard)
  async getListing(
    @Param("organizationId", new ParseUUIDPipe()) organizationId: string,
    @Param("listingId", new ParseUUIDPipe()) listingId: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.execute(async () =>
      this.properties.getListing({
        actor: await this.actor(request, organizationId),
        organizationId,
        listingId,
      }),
    );
  }

  @Post("organizations/:organizationId/listings/:listingId/images")
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(...UNSAFE_BROWSER_GUARDS)
  async addImage(
    @Param("organizationId", new ParseUUIDPipe()) organizationId: string,
    @Param("listingId", new ParseUUIDPipe()) listingId: string,
    @Body() input: ImageMetadataDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.execute(async () =>
      this.properties.registerImageMetadata({
        actor: await this.actor(request, organizationId),
        organizationId,
        listingId,
        imageId: randomUUID(),
        ...input,
      }),
    );
  }

  @Get("organizations/:organizationId/listings/:listingId/images")
  @UseGuards(BrowserSessionGuard)
  async listImages(
    @Param("organizationId", new ParseUUIDPipe()) organizationId: string,
    @Param("listingId", new ParseUUIDPipe()) listingId: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.execute(async () =>
      this.properties.listImageMetadata({
        actor: await this.actor(request, organizationId),
        organizationId,
        listingId,
      }),
    );
  }

  private async execute<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      if (error instanceof PropertyNotFoundError) throw new NotFoundException();
      if (error instanceof PropertyAccessDeniedError)
        throw new ForbiddenException();
      if (
        error instanceof PropertyVersionConflictError ||
        error instanceof PropertyRepositoryConflictError
      )
        throw new ConflictException();
      if (
        error instanceof PropertyValidationError ||
        error instanceof PropertyTransitionError
      )
        throw new BadRequestException();
      throw error;
    }
  }
}
