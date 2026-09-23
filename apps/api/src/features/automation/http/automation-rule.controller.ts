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
  Req,
  UseGuards,
} from "@nestjs/common";
import { randomUUID } from "node:crypto";
import {
  ApiBody,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from "@nestjs/swagger";
import type { AuthenticatedRequest } from "../../auth/http/auth-request.js";
import { BrowserSessionGuard } from "../../auth/http/browser-session.guard.js";
import { CsrfGuard } from "../../auth/http/csrf.guard.js";
import { RequireCanonicalOriginGuard } from "../../auth/http/origin.guard.js";
import { AutomationRuleApplication } from "../application/rule-application.js";
import { AutomationRuleValidationError } from "../domain/rule.js";
import {
  AddAutomationRuleVersionDto,
  AUTOMATION_JOB_HISTORY_BOUND,
  AUTOMATION_RULE_LIST_BOUND,
  CreateAutomationRuleDto,
  automationJobItem,
  automationResponse,
  failedJobItem,
  ruleSummary,
  ruleVersionItem,
} from "./automation-rule.dto.js";
import {
  cancelJobResponse,
  createRuleBody,
  jobDetailResponse,
  jobListResponse,
  retryJobResponse,
  ruleDetailResponse,
  ruleListResponse,
  ruleVersionBody,
  uuidParameter,
} from "./automation-rule.openapi.js";

const unsafeMutationGuards = [
  RequireCanonicalOriginGuard,
  BrowserSessionGuard,
  CsrfGuard,
];

/**
 * EF-301 guarded rule CRUD and EF-306 guarded execution history. Authority
 * matrix (ACTIVE membership required): OWNER and MANAGER manage and read
 * automation rules and job history, and retry/cancel jobs; BROKER and CLIENT
 * are denied (403). Scheduler internals (EF-302 claiming/backoff) remain
 * non-HTTP; the UI only sees typed job states.
 */
@ApiTags("Automation rules")
@Controller()
export class AutomationRuleController {
  constructor(private readonly rules: AutomationRuleApplication) {}

  @Post("organizations/:organizationId/automation/rules")
  @ApiOperation({ operationId: "AutomationRuleController_create" })
  @ApiParam({ name: "organizationId", required: true, schema: uuidParameter })
  @ApiBody({ schema: createRuleBody as never })
  @ApiResponse({ status: HttpStatus.CREATED })
  @ApiResponse({ status: HttpStatus.BAD_REQUEST })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED })
  @ApiResponse({ status: HttpStatus.FORBIDDEN })
  @ApiResponse({ status: HttpStatus.CONFLICT })
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(...unsafeMutationGuards)
  async create(
    @Param("organizationId", new ParseUUIDPipe()) organizationId: string,
    @Body() input: CreateAutomationRuleDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.execute(() =>
      this.rules.createRule({
        actor: request.auth,
        userId: request.auth.userId,
        organizationId,
        ruleId: randomUUID(),
        name: input.name,
        definition: input.definition,
        createdAt: new Date(),
      }),
    );
  }

  @Post("organizations/:organizationId/automation/rules/:ruleId/versions")
  @ApiOperation({ operationId: "AutomationRuleController_addVersion" })
  @ApiParam({ name: "organizationId", required: true, schema: uuidParameter })
  @ApiParam({ name: "ruleId", required: true, schema: uuidParameter })
  @ApiBody({ schema: ruleVersionBody as never })
  @ApiResponse({ status: HttpStatus.CREATED })
  @ApiResponse({ status: HttpStatus.BAD_REQUEST })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED })
  @ApiResponse({ status: HttpStatus.FORBIDDEN })
  @ApiResponse({ status: HttpStatus.NOT_FOUND })
  @ApiResponse({ status: HttpStatus.CONFLICT })
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(...unsafeMutationGuards)
  async addVersion(
    @Param("organizationId", new ParseUUIDPipe()) organizationId: string,
    @Param("ruleId", new ParseUUIDPipe()) ruleId: string,
    @Body() input: AddAutomationRuleVersionDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.execute(() =>
      this.rules.addRuleVersion({
        actor: request.auth,
        userId: request.auth.userId,
        organizationId,
        ruleId,
        definition: input.definition,
        ...(input.note === undefined ? {} : { note: input.note }),
        createdAt: new Date(),
      }),
    );
  }

  @Post("organizations/:organizationId/automation/rules/:ruleId/enable")
  @ApiOperation({ operationId: "AutomationRuleController_enable" })
  @ApiParam({ name: "organizationId", required: true, schema: uuidParameter })
  @ApiParam({ name: "ruleId", required: true, schema: uuidParameter })
  @ApiResponse({ status: HttpStatus.OK })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED })
  @ApiResponse({ status: HttpStatus.FORBIDDEN })
  @ApiResponse({ status: HttpStatus.NOT_FOUND })
  @HttpCode(HttpStatus.OK)
  @UseGuards(...unsafeMutationGuards)
  async enable(
    @Param("organizationId", new ParseUUIDPipe()) organizationId: string,
    @Param("ruleId", new ParseUUIDPipe()) ruleId: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.execute(() =>
      this.rules.enableRule({
        actor: request.auth,
        userId: request.auth.userId,
        organizationId,
        ruleId,
        at: new Date(),
      }),
    );
  }

  @Post("organizations/:organizationId/automation/rules/:ruleId/disable")
  @ApiOperation({ operationId: "AutomationRuleController_disable" })
  @ApiParam({ name: "organizationId", required: true, schema: uuidParameter })
  @ApiParam({ name: "ruleId", required: true, schema: uuidParameter })
  @ApiResponse({ status: HttpStatus.OK })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED })
  @ApiResponse({ status: HttpStatus.FORBIDDEN })
  @ApiResponse({ status: HttpStatus.NOT_FOUND })
  @HttpCode(HttpStatus.OK)
  @UseGuards(...unsafeMutationGuards)
  async disable(
    @Param("organizationId", new ParseUUIDPipe()) organizationId: string,
    @Param("ruleId", new ParseUUIDPipe()) ruleId: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.execute(() =>
      this.rules.disableRule({
        actor: request.auth,
        userId: request.auth.userId,
        organizationId,
        ruleId,
        at: new Date(),
      }),
    );
  }

  @Get("organizations/:organizationId/automation/rules")
  @ApiOperation({ operationId: "AutomationRuleController_list" })
  @ApiParam({ name: "organizationId", required: true, schema: uuidParameter })
  @ApiResponse({
    status: HttpStatus.OK,
    content: {
      "application/json": {
        schema: ruleListResponse as never,
      },
    },
  })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED })
  @ApiResponse({ status: HttpStatus.FORBIDDEN })
  @HttpCode(HttpStatus.OK)
  @UseGuards(BrowserSessionGuard)
  async list(
    @Param("organizationId", new ParseUUIDPipe()) organizationId: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.execute(async () => {
      const result = await this.rules.listRules({
        actor: request.auth,
        userId: request.auth.userId,
        organizationId,
        limit: AUTOMATION_RULE_LIST_BOUND,
      });
      if (result.kind !== "found") return result;
      const failedJobs = await this.rules.listFailedJobs({
        actor: request.auth,
        userId: request.auth.userId,
        organizationId,
        limit: 50,
      });
      if (failedJobs.kind !== "found") return failedJobs;
      const recentFinanceJobs = await this.rules.listRecentFinanceJobs({
        actor: request.auth,
        userId: request.auth.userId,
        organizationId,
        limit: 50,
      });
      if (recentFinanceJobs.kind !== "found") return recentFinanceJobs;
      return {
        rules: result.rules.map((entry) =>
          ruleSummary(entry.rule, entry.definition, entry.version),
        ),
        failedJobs: failedJobs.jobs.map((job) => failedJobItem(job)),
        recentFinanceJobs: recentFinanceJobs.jobs.map((job) => ({
          id: job.id,
          ruleId: job.ruleId,
          ruleVersion: job.ruleVersion,
          actionType: job.actionType,
          targetType: job.targetType,
          targetId: job.targetId,
          status: job.status,
          attemptCount: job.attemptCount,
          maxAttempts: job.maxAttempts,
          lastError: job.lastError,
          scheduledFor: job.scheduledFor,
          completedAt: job.completedAt,
          updatedAt: job.updatedAt,
        })),
      };
    });
  }

  @Get("organizations/:organizationId/automation/rules/:ruleId")
  @ApiOperation({ operationId: "AutomationRuleController_find" })
  @ApiParam({ name: "organizationId", required: true, schema: uuidParameter })
  @ApiParam({ name: "ruleId", required: true, schema: uuidParameter })
  @ApiResponse({
    status: HttpStatus.OK,
    content: {
      "application/json": {
        schema: ruleDetailResponse as never,
      },
    },
  })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED })
  @ApiResponse({ status: HttpStatus.FORBIDDEN })
  @ApiResponse({ status: HttpStatus.NOT_FOUND })
  @HttpCode(HttpStatus.OK)
  @UseGuards(BrowserSessionGuard)
  async find(
    @Param("organizationId", new ParseUUIDPipe()) organizationId: string,
    @Param("ruleId", new ParseUUIDPipe()) ruleId: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.execute(async (): Promise<unknown> => {
      const result = await this.rules.getRule({
        actor: request.auth,
        userId: request.auth.userId,
        organizationId,
        ruleId,
      });
      if (result.kind !== "found") return result;
      const current = result.versions.at(-1);
      if (!current)
        throw new Error(
          "automation rule has no versions; storage is inconsistent",
        );
      return {
        rule: ruleSummary(result.rule, current.definition, current.version),
        versions: result.versions.map(ruleVersionItem),
      };
    });
  }

  /**
   * EF-306 — execution history. Owner/Manager only (same authority matrix as
   * every other automation command), organization-scoped, typed job rendering
   * with no raw payload or secret.
   */
  @Get("organizations/:organizationId/automation/jobs")
  @ApiOperation({ operationId: "AutomationRuleController_listJobs" })
  @ApiParam({ name: "organizationId", required: true, schema: uuidParameter })
  @ApiResponse({
    status: HttpStatus.OK,
    content: {
      "application/json": {
        schema: jobListResponse as never,
      },
    },
  })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED })
  @ApiResponse({ status: HttpStatus.FORBIDDEN })
  @HttpCode(HttpStatus.OK)
  @UseGuards(BrowserSessionGuard)
  async listJobs(
    @Param("organizationId", new ParseUUIDPipe()) organizationId: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.execute(async () => {
      const result = await this.rules.listOrganizationJobs({
        actor: request.auth,
        userId: request.auth.userId,
        organizationId,
        limit: AUTOMATION_JOB_HISTORY_BOUND,
      });
      if (result.kind !== "found") return result;
      return { jobs: result.jobs.map(automationJobItem) };
    });
  }

  @Get("organizations/:organizationId/automation/rules/:ruleId/jobs")
  @ApiOperation({ operationId: "AutomationRuleController_listRuleJobs" })
  @ApiParam({ name: "organizationId", required: true, schema: uuidParameter })
  @ApiParam({ name: "ruleId", required: true, schema: uuidParameter })
  @ApiResponse({
    status: HttpStatus.OK,
    content: {
      "application/json": {
        schema: jobListResponse as never,
      },
    },
  })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED })
  @ApiResponse({ status: HttpStatus.FORBIDDEN })
  @ApiResponse({ status: HttpStatus.NOT_FOUND })
  @HttpCode(HttpStatus.OK)
  @UseGuards(BrowserSessionGuard)
  async listRuleJobs(
    @Param("organizationId", new ParseUUIDPipe()) organizationId: string,
    @Param("ruleId", new ParseUUIDPipe()) ruleId: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.execute(async () => {
      const result = await this.rules.listRuleJobs({
        actor: request.auth,
        userId: request.auth.userId,
        organizationId,
        ruleId,
        limit: AUTOMATION_JOB_HISTORY_BOUND,
      });
      if (result.kind !== "found") return result;
      return { jobs: result.jobs.map(automationJobItem) };
    });
  }

  @Get("organizations/:organizationId/automation/jobs/:jobId")
  @ApiOperation({ operationId: "AutomationRuleController_findJob" })
  @ApiParam({ name: "organizationId", required: true, schema: uuidParameter })
  @ApiParam({ name: "jobId", required: true, schema: uuidParameter })
  @ApiResponse({
    status: HttpStatus.OK,
    content: {
      "application/json": {
        schema: jobDetailResponse as never,
      },
    },
  })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED })
  @ApiResponse({ status: HttpStatus.FORBIDDEN })
  @ApiResponse({ status: HttpStatus.NOT_FOUND })
  @HttpCode(HttpStatus.OK)
  @UseGuards(BrowserSessionGuard)
  async findJob(
    @Param("organizationId", new ParseUUIDPipe()) organizationId: string,
    @Param("jobId", new ParseUUIDPipe()) jobId: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.execute(async () => {
      const result = await this.rules.getJob({
        actor: request.auth,
        userId: request.auth.userId,
        organizationId,
        jobId,
      });
      if (result.kind !== "found") return result;
      return { job: automationJobItem(result.job) };
    });
  }

  /**
   * EF-306 — retry a FAILED job. Always creates a NEW job occurrence; a
   * repeated retry of the same source job resolves to 409 duplicate so side
   * effects can never be duplicated.
   */
  @Post("organizations/:organizationId/automation/jobs/:jobId/retry")
  @ApiOperation({ operationId: "AutomationRuleController_retryJob" })
  @ApiParam({ name: "organizationId", required: true, schema: uuidParameter })
  @ApiParam({ name: "jobId", required: true, schema: uuidParameter })
  @ApiResponse({
    status: HttpStatus.CREATED,
    content: {
      "application/json": {
        schema: retryJobResponse as never,
      },
    },
  })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED })
  @ApiResponse({ status: HttpStatus.FORBIDDEN })
  @ApiResponse({ status: HttpStatus.NOT_FOUND })
  @ApiResponse({ status: HttpStatus.CONFLICT })
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(...unsafeMutationGuards)
  async retryJob(
    @Param("organizationId", new ParseUUIDPipe()) organizationId: string,
    @Param("jobId", new ParseUUIDPipe()) jobId: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.execute(async () => {
      const result = await this.rules.retryJob({
        actor: request.auth,
        userId: request.auth.userId,
        organizationId,
        jobId,
        now: new Date(),
      });
      if (result.kind === "retried")
        return { job: automationJobItem(result.job) };
      return result;
    });
  }

  /** EF-306 — cancel a queued/retrying job; never a running or terminal one. */
  @Post("organizations/:organizationId/automation/jobs/:jobId/cancel")
  @ApiOperation({ operationId: "AutomationRuleController_cancelJob" })
  @ApiParam({ name: "organizationId", required: true, schema: uuidParameter })
  @ApiParam({ name: "jobId", required: true, schema: uuidParameter })
  @ApiResponse({
    status: HttpStatus.OK,
    content: {
      "application/json": {
        schema: cancelJobResponse as never,
      },
    },
  })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED })
  @ApiResponse({ status: HttpStatus.FORBIDDEN })
  @ApiResponse({ status: HttpStatus.NOT_FOUND })
  @ApiResponse({ status: HttpStatus.CONFLICT })
  @HttpCode(HttpStatus.OK)
  @UseGuards(...unsafeMutationGuards)
  async cancelJob(
    @Param("organizationId", new ParseUUIDPipe()) organizationId: string,
    @Param("jobId", new ParseUUIDPipe()) jobId: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.execute(async () => {
      const result = await this.rules.cancelJob({
        actor: request.auth,
        userId: request.auth.userId,
        organizationId,
        jobId,
        now: new Date(),
      });
      if (result.kind === "cancelled")
        return { job: automationJobItem(result.job) };
      return result;
    });
  }

  private async execute(operation: () => Promise<unknown>): Promise<unknown> {
    try {
      const result = await operation();
      return mapRuleResult(result);
    } catch (error) {
      if (
        error instanceof AutomationRuleValidationError ||
        error instanceof RangeError
      )
        throw new BadRequestException();
      throw error;
    }
  }
}

function mapRuleResult(result: unknown): unknown {
  if (hasResultKind(result, "access-denied")) throw new ForbiddenException();
  if (hasResultKind(result, "not-found")) throw new NotFoundException();
  // EF-306: duplicate retry, invalid-state retry/cancel, and a cancel that
  // lost the claim race are all state conflicts, never silent successes.
  if (
    hasResultKind(result, "conflict") ||
    hasResultKind(result, "duplicate") ||
    hasResultKind(result, "invalid-state")
  )
    throw new ConflictException();
  return automationResponse(result);
}

function hasResultKind(value: unknown, kind: string): boolean {
  return (
    typeof value === "object" &&
    value !== null &&
    "kind" in value &&
    value.kind === kind
  );
}
