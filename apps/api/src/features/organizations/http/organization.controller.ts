import {
  Body,
  ConflictException,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";
import { ApproveBrokerMembership } from "../application/approve-broker-membership.js";
import { CreateMembership } from "../application/create-membership.js";
import { CreateOrganization } from "../application/create-organization.js";
import { GetMyMembership } from "../application/get-my-membership.js";
import { GetOrganization } from "../application/get-organization.js";
import { ListOrganizationMemberships } from "../application/list-organization-memberships.js";
import {
  OrganizationConflictError,
  OrganizationForbiddenError,
  OrganizationNotFoundError,
} from "../domain/organization-errors.js";
import type { AuthenticatedRequest } from "../../auth/http/auth-request.js";
import { BrowserSessionGuard } from "../../auth/http/browser-session.guard.js";
import { CsrfGuard } from "../../auth/http/csrf.guard.js";
import { RequireCanonicalOriginGuard } from "../../auth/http/origin.guard.js";
import {
  ApproveBrokerMembershipDto,
  CreateMembershipDto,
  CreateOrganizationDto,
} from "./organization.dto.js";

const UNSAFE_BROWSER_GUARDS = [
  RequireCanonicalOriginGuard,
  BrowserSessionGuard,
  CsrfGuard,
];

@Controller()
export class OrganizationController {
  constructor(
    private readonly createOrganizationCommand: CreateOrganization,
    private readonly getOrganizationQuery: GetOrganization,
    private readonly listMembershipsQuery: ListOrganizationMemberships,
    private readonly getMyMembershipQuery: GetMyMembership,
    private readonly createMembershipCommand: CreateMembership,
    private readonly approveBrokerMembershipCommand: ApproveBrokerMembership,
  ) {}

  @Post("organizations")
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(...UNSAFE_BROWSER_GUARDS)
  createOrganization(
    @Body() input: CreateOrganizationDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.execute(() =>
      this.createOrganizationCommand.execute(request.auth, input),
    );
  }

  @Get("organizations/:organizationId")
  @UseGuards(BrowserSessionGuard)
  getOrganization(
    @Param("organizationId") organizationId: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.execute(() =>
      this.getOrganizationQuery.execute(request.auth, { organizationId }),
    );
  }

  @Get("organizations/:organizationId/memberships")
  @UseGuards(BrowserSessionGuard)
  listMemberships(
    @Param("organizationId") organizationId: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.execute(() =>
      this.listMembershipsQuery.execute(request.auth, { organizationId }),
    );
  }

  @Get("organizations/:organizationId/memberships/me")
  @UseGuards(BrowserSessionGuard)
  getMyMembership(
    @Param("organizationId") organizationId: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.execute(() =>
      this.getMyMembershipQuery.execute(request.auth, { organizationId }),
    );
  }

  @Post("organizations/:organizationId/memberships")
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(...UNSAFE_BROWSER_GUARDS)
  createMembership(
    @Param("organizationId") organizationId: string,
    @Body() input: CreateMembershipDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.execute(() =>
      this.createMembershipCommand.execute(request.auth, {
        organizationId,
        ...input,
      }),
    );
  }

  @Post("platform/broker-memberships/:membershipId/approve")
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(...UNSAFE_BROWSER_GUARDS)
  approveBrokerMembership(
    @Param("membershipId") membershipId: string,
    @Body() input: ApproveBrokerMembershipDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.execute(() =>
      this.approveBrokerMembershipCommand.execute(request.auth, {
        organizationId: input.organizationId,
        membershipId,
      }),
    );
  }

  private async execute<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      if (error instanceof OrganizationForbiddenError)
        throw new ForbiddenException();
      if (error instanceof OrganizationNotFoundError)
        throw new NotFoundException();
      if (error instanceof OrganizationConflictError)
        throw new ConflictException();
      throw error;
    }
  }
}
