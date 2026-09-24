/**
 * EF-610 — Contracts HTTP boundary. Like the EF-601 media controller, this
 * controller is intentionally excluded from the closed-world Swagger document
 * (apps/api/test/openapi.test.mjs stays untouched). New routes:
 *
 *   POST /organizations/:organizationId/contract-templates
 *   POST /organizations/:organizationId/contract-templates/:templateId/approve
 *   GET  /organizations/:organizationId/contract-templates
 *   GET  /organizations/:organizationId/contract-templates/slots
 *   POST /organizations/:organizationId/contracts/generate
 *   GET  /organizations/:organizationId/contracts
 *   GET  /organizations/:organizationId/contracts/:contractId
 *   GET  /organizations/:organizationId/contracts/:contractId/pdf
 *   POST /organizations/:organizationId/contracts/:contractId/signatures
 *   POST /organizations/:organizationId/contracts/:contractId/amend-requests
 *   POST /organizations/:organizationId/contracts/:contractId/void
 *
 * ⚠️ OPERATIONAL SIMPLE E-SIGN — NOT a certified legal signature. The exact
 * Arabic label («توقيع تشغيلي مبسّط — ليس توقيعًا قانونيًا معتمدًا») is
 * stamped on every document and surfaced in every view payload.
 */

import { randomUUID } from "node:crypto";
import type { Response } from "express";
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
  ContractAccessDeniedError,
  ContractApplication,
  ContractNotFoundError,
  type ContractActor,
  type ContractRole,
} from "../application/contract-application.js";
import {
  ContractStateError,
  ContractValidationError,
} from "../domain/contract.js";
import { ContractTemplateValidationError } from "../domain/contract-template.js";
import { ContractSnapshotError } from "../domain/contract-snapshot.js";
import {
  AmendContractDto,
  CreateContractTemplateDto,
  GenerateContractDto,
  VoidContractDto,
} from "./contract.dto.js";

const UNSAFE_BROWSER_GUARDS = [
  RequireCanonicalOriginGuard,
  BrowserSessionGuard,
  CsrfGuard,
];

export const CONTRACTS_MEMBERSHIP_READER = Symbol(
  "CONTRACTS_MEMBERSHIP_READER",
);

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
@ApiTags("Contracts")
@Controller()
export class ContractController {
  constructor(
    private readonly contracts: ContractApplication,
    @Inject(CONTRACTS_MEMBERSHIP_READER)
    private readonly memberships: MembershipReader,
  ) {}

  private async withMembership<T>(
    request: AuthenticatedRequest,
    organizationId: string,
    operation: (actor: ContractActor) => Promise<T>,
  ): Promise<T> {
    const membership = await this.memberships.findMembership(
      organizationId,
      request.auth.userId,
    );
    const actor: ContractActor = {
      userId: request.auth.userId,
      verified: request.auth.verified,
      memberships: membership
        ? [
            {
              organizationId: membership.organizationId,
              role: membership.role as ContractRole,
              active: membership.status === "ACTIVE",
            },
          ]
        : [],
    };
    return this.execute(() => operation(actor));
  }

  @Post("organizations/:organizationId/contract-templates")
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(...UNSAFE_BROWSER_GUARDS)
  async createTemplate(
    @Param("organizationId", new ParseUUIDPipe()) organizationId: string,
    @Body() input: CreateContractTemplateDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.withMembership(request, organizationId, (actor) =>
      this.contracts.createTemplate({
        actor,
        userId: request.auth.userId,
        organizationId,
        templateId: randomUUID(),
        templateKey: input.templateKey,
        titlePattern: input.titlePattern,
        bodyPattern: input.bodyPattern,
        now: new Date(),
      }),
    );
  }

  @Post("organizations/:organizationId/contract-templates/:templateId/approve")
  @HttpCode(HttpStatus.OK)
  @UseGuards(...UNSAFE_BROWSER_GUARDS)
  async approveTemplate(
    @Param("organizationId", new ParseUUIDPipe()) organizationId: string,
    @Param("templateId", new ParseUUIDPipe()) templateId: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.withMembership(request, organizationId, (actor) =>
      this.contracts.approveTemplate({
        actor,
        userId: request.auth.userId,
        organizationId,
        templateId,
        now: new Date(),
      }),
    );
  }

  @Get("organizations/:organizationId/contract-templates/slots")
  @HttpCode(HttpStatus.OK)
  @UseGuards(BrowserSessionGuard)
  templateSlots() {
    return { slots: this.contracts.listSlots() };
  }

  @Get("organizations/:organizationId/contract-templates")
  @HttpCode(HttpStatus.OK)
  @UseGuards(BrowserSessionGuard)
  async listTemplates(
    @Param("organizationId", new ParseUUIDPipe()) organizationId: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.withMembership(request, organizationId, async (actor) => ({
      items: await this.contracts.listTemplates({
        actor,
        userId: request.auth.userId,
        organizationId,
      }),
    }));
  }

  @Post("organizations/:organizationId/contracts/generate")
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(...UNSAFE_BROWSER_GUARDS)
  async generate(
    @Param("organizationId", new ParseUUIDPipe()) organizationId: string,
    @Body() input: GenerateContractDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.withMembership(request, organizationId, (actor) =>
      this.contracts.generateContract({
        actor,
        userId: request.auth.userId,
        organizationId,
        contractId: randomUUID(),
        dealId: input.dealId,
        templateId: input.templateId,
        ...(input.templateVersion === undefined
          ? {}
          : { templateVersion: input.templateVersion }),
        now: new Date(),
      }),
    );
  }

  @Get("organizations/:organizationId/contracts")
  @HttpCode(HttpStatus.OK)
  @UseGuards(BrowserSessionGuard)
  async list(
    @Param("organizationId", new ParseUUIDPipe()) organizationId: string,
    @Query("dealId") dealId: string | undefined,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.withMembership(request, organizationId, async (actor) => ({
      items: await this.contracts.listContracts({
        actor,
        userId: request.auth.userId,
        organizationId,
        ...(dealId === undefined || dealId.length === 0 ? {} : { dealId }),
      }),
    }));
  }

  @Get("organizations/:organizationId/contracts/:contractId")
  @HttpCode(HttpStatus.OK)
  @UseGuards(BrowserSessionGuard)
  async find(
    @Param("organizationId", new ParseUUIDPipe()) organizationId: string,
    @Param("contractId", new ParseUUIDPipe()) contractId: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.withMembership(request, organizationId, (actor) =>
      this.contracts.getContract({
        actor,
        userId: request.auth.userId,
        organizationId,
        contractId,
      }),
    );
  }

  @Get("organizations/:organizationId/contracts/:contractId/pdf")
  @UseGuards(BrowserSessionGuard)
  async pdf(
    @Param("organizationId", new ParseUUIDPipe()) organizationId: string,
    @Param("contractId", new ParseUUIDPipe()) contractId: string,
    @Req() request: AuthenticatedRequest,
    @Res() response: Response,
  ): Promise<Response> {
    const document = await this.withMembership(
      request,
      organizationId,
      (actor) =>
        this.contracts.getContractPdf({
          actor,
          userId: request.auth.userId,
          organizationId,
          contractId,
        }),
    );
    response.setHeader("Content-Type", "application/pdf");
    response.setHeader(
      "Content-Disposition",
      `inline; filename="contract-${contractId}.pdf"`,
    );
    response.setHeader("Content-Length", String(document.bytes.length));
    response.setHeader("Cache-Control", "private, no-store");
    response.end(Buffer.from(document.bytes));
    return response;
  }

  @Post("organizations/:organizationId/contracts/:contractId/signatures")
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(...UNSAFE_BROWSER_GUARDS)
  async sign(
    @Param("organizationId", new ParseUUIDPipe()) organizationId: string,
    @Param("contractId", new ParseUUIDPipe()) contractId: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.withMembership(request, organizationId, (actor) =>
      this.contracts.signContract({
        actor,
        userId: request.auth.userId,
        organizationId,
        contractId,
        now: new Date(),
      }),
    );
  }

  @Post("organizations/:organizationId/contracts/:contractId/amend-requests")
  @HttpCode(HttpStatus.OK)
  @UseGuards(...UNSAFE_BROWSER_GUARDS)
  async requestAmendment(
    @Param("organizationId", new ParseUUIDPipe()) organizationId: string,
    @Param("contractId", new ParseUUIDPipe()) contractId: string,
    @Body() input: AmendContractDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.withMembership(request, organizationId, (actor) =>
      this.contracts.requestAmendment({
        actor,
        userId: request.auth.userId,
        organizationId,
        contractId,
        reason: input.reason,
        now: new Date(),
      }),
    );
  }

  @Post("organizations/:organizationId/contracts/:contractId/void")
  @HttpCode(HttpStatus.OK)
  @UseGuards(...UNSAFE_BROWSER_GUARDS)
  async void(
    @Param("organizationId", new ParseUUIDPipe()) organizationId: string,
    @Param("contractId", new ParseUUIDPipe()) contractId: string,
    @Body() input: VoidContractDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.withMembership(request, organizationId, (actor) =>
      this.contracts.voidContract({
        actor,
        userId: request.auth.userId,
        organizationId,
        contractId,
        reason: input.reason,
        now: new Date(),
      }),
    );
  }

  private async execute<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      if (error instanceof ContractNotFoundError) throw new NotFoundException();
      if (error instanceof ContractAccessDeniedError)
        throw new ForbiddenException();
      if (error instanceof ContractStateError)
        throw new ConflictException(error.code);
      if (
        error instanceof ContractValidationError ||
        error instanceof ContractTemplateValidationError ||
        error instanceof ContractSnapshotError
      )
        throw new BadRequestException(error.code);
      throw error;
    }
  }
}
