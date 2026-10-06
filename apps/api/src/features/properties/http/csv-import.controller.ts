/**
 * EF-703 — CSV import HTTP boundary. Like the EF-601 media controller, this
 * controller is intentionally excluded from the closed-world Swagger document
 * (apps/api/test/openapi.test.mjs stays untouched). New routes:
 *
 *   POST /organizations/:organizationId/properties/csv-import/dry-run
 *   POST /organizations/:organizationId/properties/csv-import/commit
 *
 * Responses are bounded JSON (counts, 1-based row numbers, field codes); cell
 * contents, coordinates, and ownerReference values are never echoed in
 * errors, and no request payload is ever logged.
 */

import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  ForbiddenException,
  HttpCode,
  HttpStatus,
  Inject,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";
import { ApiExcludeController } from "@nestjs/swagger";
import { IsOptional, IsString, MaxLength } from "class-validator";
import type { AuthenticatedRequest } from "../../auth/http/auth-request.js";
import { BrowserSessionGuard } from "../../auth/http/browser-session.guard.js";
import { CsrfGuard } from "../../auth/http/csrf.guard.js";
import { RequireCanonicalOriginGuard } from "../../auth/http/origin.guard.js";
import {
  CsvImportApplication,
  CsvImportRejectedError,
} from "../application/csv-import-application.js";
import {
  CsvDryRunTokenError,
  CsvImportValidationError,
} from "../domain/csv-import.js";
import {
  PropertyAccessDeniedError,
  type ActorContext,
} from "../application/property-application.js";
import { PROPERTY_MEMBERSHIP_READER } from "./property.controller.js";

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

const UNSAFE_BROWSER_GUARDS = [
  RequireCanonicalOriginGuard,
  BrowserSessionGuard,
  CsrfGuard,
];

export const CSV_IMPORT_MAX_CSV_CHARS = 512 * 1024;
export const CSV_IMPORT_MAX_TOKEN_CHARS = 8192;

export class CsvImportDto {
  @IsString()
  @MaxLength(CSV_IMPORT_MAX_CSV_CHARS)
  csv!: string;
  @IsOptional()
  @IsString()
  @MaxLength(CSV_IMPORT_MAX_TOKEN_CHARS)
  dryRunToken?: string;
}

@ApiExcludeController()
@Controller()
export class CsvImportController {
  constructor(
    private readonly csvImport: CsvImportApplication,
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

  @Post("organizations/:organizationId/properties/csv-import/dry-run")
  @HttpCode(HttpStatus.OK)
  @UseGuards(...UNSAFE_BROWSER_GUARDS)
  async dryRun(
    @Body() input: CsvImportDto,
    @Req() request: AuthenticatedRequest,
  ): Promise<unknown> {
    const organizationId = this.organizationIdOf(request);
    return this.execute(async () =>
      this.csvImport.dryRun({
        actor: await this.actor(request, organizationId),
        organizationId,
        csv: input.csv,
      }),
    );
  }

  @Post("organizations/:organizationId/properties/csv-import/commit")
  @HttpCode(HttpStatus.OK)
  @UseGuards(...UNSAFE_BROWSER_GUARDS)
  async commit(
    @Body() input: CsvImportDto,
    @Req() request: AuthenticatedRequest,
  ): Promise<unknown> {
    const organizationId = this.organizationIdOf(request);
    return this.execute(async () =>
      this.csvImport.commit({
        actor: await this.actor(request, organizationId),
        organizationId,
        csv: input.csv,
        dryRunToken: input.dryRunToken ?? "",
      }),
    );
  }

  private organizationIdOf(request: AuthenticatedRequest): string {
    const value = (request as { params?: { organizationId?: string } }).params
      ?.organizationId;
    if (typeof value !== "string" || value.length === 0)
      throw new BadRequestException();
    return value;
  }

  private async execute<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      if (error instanceof PropertyAccessDeniedError)
        throw new ForbiddenException();
      if (error instanceof CsvDryRunTokenError) throw new ConflictException();
      if (error instanceof CsvImportRejectedError)
        throw new BadRequestException();
      if (error instanceof CsvImportValidationError)
        throw new BadRequestException();
      throw error;
    }
  }
}
