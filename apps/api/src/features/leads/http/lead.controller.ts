import { Body, ConflictException, Controller, ForbiddenException, Get, Headers, HttpCode, HttpStatus, NotFoundException, Param, Post, Query, Req, UseGuards, BadRequestException } from "@nestjs/common";
import type { AuthenticatedRequest } from "../../auth/http/auth-request.js";
import { BrowserSessionGuard } from "../../auth/http/browser-session.guard.js";
import { CsrfGuard } from "../../auth/http/csrf.guard.js";
import { RequireCanonicalOriginGuard } from "../../auth/http/origin.guard.js";
import { LeadApplication } from "../application/lead-application.js";
import { LeadTransitionError, LeadValidationError, LeadVersionConflictError } from "../domain/lead.js";
import { AssignLeadDto, CreateLeadDto, LeadListQueryDto, NextActionDto, TransitionLeadDto } from "./lead.dto.js";

const UNSAFE_BROWSER_GUARDS = [RequireCanonicalOriginGuard, BrowserSessionGuard, CsrfGuard];

@Controller()
export class LeadController {
  constructor(private readonly leads: LeadApplication) {}

  @Post("organizations/:organizationId/leads")
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(...UNSAFE_BROWSER_GUARDS)
  create(@Param("organizationId") organizationId: string, @Body() input: CreateLeadDto, @Headers("idempotency-key") idempotencyKey: string | undefined, @Req() request: AuthenticatedRequest) {
    return this.execute(() => this.leads.create({ actor: request.auth, userId: request.auth.userId, organizationId, lead: input, idempotencyKey: idempotencyKey ?? "" }));
  }

  @Get("organizations/:organizationId/leads")
  @UseGuards(BrowserSessionGuard)
  list(@Param("organizationId") organizationId: string, @Query() query: LeadListQueryDto, @Req() request: AuthenticatedRequest) {
    return this.execute(() => this.leads.list({ actor: request.auth, userId: request.auth.userId, organizationId, stage: query.stage, cursor: query.cursor, limit: query.limit }));
  }

  @Get("organizations/:organizationId/leads/:leadId")
  @UseGuards(BrowserSessionGuard)
  find(@Param("organizationId") organizationId: string, @Param("leadId") leadId: string, @Req() request: AuthenticatedRequest) {
    return this.execute(() => this.leads.find({ actor: request.auth, userId: request.auth.userId, organizationId, leadId }));
  }

  @Post("organizations/:organizationId/leads/:leadId/transition")
  @UseGuards(...UNSAFE_BROWSER_GUARDS)
  transition(@Param("organizationId") organizationId: string, @Param("leadId") leadId: string, @Body() input: TransitionLeadDto, @Headers("idempotency-key") idempotencyKey: string | undefined, @Req() request: AuthenticatedRequest) {
    return this.execute(() => this.leads.transition({ actor: request.auth, userId: request.auth.userId, organizationId, leadId, to: input.to, expectedVersion: input.expectedVersion, idempotencyKey: idempotencyKey ?? "" }));
  }

  @Post("organizations/:organizationId/leads/:leadId/assign")
  @UseGuards(...UNSAFE_BROWSER_GUARDS)
  assign(@Param("organizationId") organizationId: string, @Param("leadId") leadId: string, @Body() input: AssignLeadDto, @Headers("idempotency-key") idempotencyKey: string | undefined, @Req() request: AuthenticatedRequest) {
    return this.execute(() => this.leads.assign({ actor: request.auth, userId: request.auth.userId, organizationId, leadId, ownerId: input.ownerId, expectedVersion: input.expectedVersion, idempotencyKey: idempotencyKey ?? "" }));
  }

  @Post("organizations/:organizationId/leads/:leadId/next-action")
  @UseGuards(...UNSAFE_BROWSER_GUARDS)
  nextAction(@Param("organizationId") organizationId: string, @Param("leadId") leadId: string, @Body() input: NextActionDto, @Headers("idempotency-key") idempotencyKey: string | undefined, @Req() request: AuthenticatedRequest) {
    return this.execute(() => this.leads.setNextAction({ actor: request.auth, userId: request.auth.userId, organizationId, leadId, nextAction: input.nextAction, expectedVersion: input.expectedVersion, idempotencyKey: idempotencyKey ?? "" }));
  }

  private async execute<T>(operation: () => Promise<T>) {
    try {
      const result = await operation();
      if (isDeniedResult(result)) {
        if (result.kind === "access-denied") throw new ForbiddenException();
        throw new NotFoundException();
      }
      if (isConflictResult(result)) {
        if (result.kind === "ownership-conflict") throw new NotFoundException();
        if (result.kind === "invalid-idempotency-key") throw new BadRequestException();
        throw new ConflictException();
      }
      return result;
    } catch (error) {
      if (error instanceof LeadVersionConflictError) throw new ConflictException();
      if (error instanceof LeadValidationError || error instanceof LeadTransitionError) throw new BadRequestException();
      throw error;
    }
  }
}

type ResultWithKind = { kind: string };
function isDeniedResult(value: unknown): value is { kind: "access-denied" | "ownership-conflict" } { return Boolean(value && typeof value === "object" && "kind" in value && ((value as ResultWithKind).kind === "access-denied" || (value as ResultWithKind).kind === "ownership-conflict")); }
function isConflictResult(value: unknown): value is ResultWithKind { return Boolean(value && typeof value === "object" && "kind" in value && ["ownership-conflict", "invalid-idempotency-key", "idempotency-conflict", "stale-version-conflict"].includes((value as ResultWithKind).kind)); }
