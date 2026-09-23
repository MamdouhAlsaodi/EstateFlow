import {
  Body,
  ConflictException,
  Controller,
  ForbiddenException,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
  BadRequestException,
  Optional,
  Inject,
  forwardRef,
} from "@nestjs/common";
import { ApiBody, ApiHeader, ApiQuery, ApiResponse } from "@nestjs/swagger";
import type { AuthenticatedRequest } from "../../auth/http/auth-request.js";
import { BrowserSessionGuard } from "../../auth/http/browser-session.guard.js";
import { CsrfGuard } from "../../auth/http/csrf.guard.js";
import { RequireCanonicalOriginGuard } from "../../auth/http/origin.guard.js";
import { LeadApplication } from "../application/lead-application.js";
import { LeadAutomationCoordinator } from "../../automation/application/lead-automation-coordinator.js";
import {
  LeadTransitionError,
  LeadValidationError,
  LeadVersionConflictError,
} from "../domain/lead.js";
import {
  AssignLeadDto,
  CloseLostDto,
  CloseWonDto,
  CompleteLeadTaskDto,
  CreateLeadDto,
  CreateLeadNoteDto,
  CreateLeadTaskDto,
  LeadDetailQueryDto,
  LeadListQueryDto,
  NextActionDto,
  RescheduleLeadTaskDto,
  TransitionLeadDto,
} from "./lead.dto.js";

const UNSAFE_BROWSER_GUARDS = [
  RequireCanonicalOriginGuard,
  BrowserSessionGuard,
  CsrfGuard,
];

@Controller()
export class LeadController {
  constructor(
    private readonly leads: LeadApplication,
    @Optional()
    @Inject(forwardRef(() => LeadAutomationCoordinator))
    private readonly automation?: LeadAutomationCoordinator,
  ) {}

  @Post("organizations/:organizationId/leads")
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(...UNSAFE_BROWSER_GUARDS)
  create(
    @Param("organizationId") organizationId: string,
    @Body() input: CreateLeadDto,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.execute(() =>
      this.leads.create({
        actor: request.auth,
        userId: request.auth.userId,
        organizationId,
        lead: input,
        idempotencyKey: idempotencyKey ?? "",
      }),
    );
  }

  @Get("organizations/:organizationId/leads")
  @ApiQuery({
    name: "stage",
    required: false,
    schema: {
      type: "string",
      enum: ["NEW", "CONTACTED", "QUALIFIED", "NURTURING"],
    },
  })
  @ApiQuery({
    name: "cursor",
    required: false,
    schema: { type: "string", maxLength: 255 },
  })
  @ApiQuery({
    name: "limit",
    required: false,
    schema: { type: "integer", minimum: 1, maximum: 100 },
  })
  @UseGuards(BrowserSessionGuard)
  list(
    @Param("organizationId") organizationId: string,
    @Query() query: LeadListQueryDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.execute(() =>
      this.leads.list({
        actor: request.auth,
        userId: request.auth.userId,
        organizationId,
        stage: query.stage,
        cursor: query.cursor,
        limit: query.limit,
      }),
    );
  }

  @Get("organizations/:organizationId/leads/:leadId")
  @ApiQuery({
    name: "cursor",
    required: false,
    schema: { type: "string", maxLength: 255 },
  })
  @ApiQuery({
    name: "limit",
    required: false,
    schema: { type: "integer", minimum: 1, maximum: 100 },
  })
  @ApiResponse({
    status: HttpStatus.OK,
    schema: {
      type: "object",
      required: ["lead", "timeline", "notes", "tasks"],
      properties: {
        lead: { type: "object" },
        timeline: { type: "object" },
        notes: {
          type: "array",
          items: {
            type: "object",
            required: ["id", "body", "createdAt"],
            properties: {
              id: { type: "string" },
              body: { type: "string" },
              createdAt: { type: "string", format: "date-time" },
            },
            additionalProperties: false,
          },
        },
        tasks: {
          type: "array",
          items: {
            type: "object",
            required: [
              "id",
              "title",
              "dueAt",
              "status",
              "createdAt",
              "completedAt",
              "version",
            ],
            properties: {
              id: { type: "string" },
              title: { type: "string" },
              dueAt: { type: "string", format: "date-time" },
              status: { type: "string", enum: ["OPEN", "COMPLETED"] },
              createdAt: { type: "string", format: "date-time" },
              completedAt: {
                type: "string",
                format: "date-time",
                nullable: true,
              },
              version: { type: "integer" },
            },
            additionalProperties: false,
          },
        },
      },
      additionalProperties: false,
    },
  })
  @UseGuards(BrowserSessionGuard)
  find(
    @Param("organizationId") organizationId: string,
    @Param("leadId") leadId: string,
    @Query() query: LeadDetailQueryDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.execute(() =>
      this.leads.findDetail({
        actor: request.auth,
        userId: request.auth.userId,
        organizationId,
        leadId,
        cursor: query.cursor,
        limit: query.limit,
      }),
    );
  }

  @Post("organizations/:organizationId/leads/:leadId/close-won")
  @ApiBody({
    schema: {
      type: "object",
      required: ["propertyId", "brokerId", "expectedVersion"],
      properties: {
        propertyId: { type: "string", format: "uuid" },
        brokerId: { type: "string", format: "uuid" },
        expectedVersion: { type: "integer", minimum: 1 },
      },
      additionalProperties: false,
    },
  })
  @ApiHeader({ name: "Idempotency-Key", required: true })
  @ApiResponse({ status: HttpStatus.CREATED })
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(...UNSAFE_BROWSER_GUARDS)
  closeWon(
    @Param("organizationId") organizationId: string,
    @Param("leadId") leadId: string,
    @Body() input: CloseWonDto,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.execute(() =>
      this.leads.closeWon({
        actor: request.auth,
        userId: request.auth.userId,
        organizationId,
        leadId,
        propertyId: input.propertyId,
        brokerId: input.brokerId,
        expectedVersion: input.expectedVersion,
        idempotencyKey: idempotencyKey ?? "",
      }),
    );
  }

  @Post("organizations/:organizationId/leads/:leadId/close-lost")
  @ApiBody({
    schema: {
      type: "object",
      required: ["reason", "expectedVersion"],
      properties: {
        reason: {
          type: "string",
          pattern: "\\S",
          minLength: 1,
          maxLength: 1000,
        },
        expectedVersion: { type: "integer", minimum: 1 },
      },
      additionalProperties: false,
    },
  })
  @ApiHeader({ name: "Idempotency-Key", required: true })
  @ApiResponse({ status: HttpStatus.OK })
  @HttpCode(HttpStatus.OK)
  @UseGuards(...UNSAFE_BROWSER_GUARDS)
  closeLost(
    @Param("organizationId") organizationId: string,
    @Param("leadId") leadId: string,
    @Body() input: CloseLostDto,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.execute(() =>
      this.leads.closeLost({
        actor: request.auth,
        userId: request.auth.userId,
        organizationId,
        leadId,
        reason: input.reason,
        expectedVersion: input.expectedVersion,
        idempotencyKey: idempotencyKey ?? "",
      }),
    );
  }

  @Post("organizations/:organizationId/leads/:leadId/transition")
  @UseGuards(...UNSAFE_BROWSER_GUARDS)
  transition(
    @Param("organizationId") organizationId: string,
    @Param("leadId") leadId: string,
    @Body() input: TransitionLeadDto,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.execute(() =>
      this.leads.transition({
        actor: request.auth,
        userId: request.auth.userId,
        organizationId,
        leadId,
        to: input.to,
        expectedVersion: input.expectedVersion,
        idempotencyKey: idempotencyKey ?? "",
      }),
    );
  }

  @Post("organizations/:organizationId/leads/:leadId/assign")
  @UseGuards(...UNSAFE_BROWSER_GUARDS)
  assign(
    @Param("organizationId") organizationId: string,
    @Param("leadId") leadId: string,
    @Body() input: AssignLeadDto,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.execute(() =>
      this.leads.assign({
        actor: request.auth,
        userId: request.auth.userId,
        organizationId,
        leadId,
        ownerId: input.ownerId,
        expectedVersion: input.expectedVersion,
        idempotencyKey: idempotencyKey ?? "",
      }),
    );
  }

  @Post("organizations/:organizationId/leads/:leadId/next-action")
  @UseGuards(...UNSAFE_BROWSER_GUARDS)
  nextAction(
    @Param("organizationId") organizationId: string,
    @Param("leadId") leadId: string,
    @Body() input: NextActionDto,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.execute(() =>
      this.leads.setNextAction({
        actor: request.auth,
        userId: request.auth.userId,
        organizationId,
        leadId,
        nextAction: input.nextAction,
        expectedVersion: input.expectedVersion,
        idempotencyKey: idempotencyKey ?? "",
      }),
    );
  }

  @Post("organizations/:organizationId/leads/:leadId/notes")
  @ApiBody({
    schema: {
      type: "object",
      required: ["body"],
      properties: { body: { type: "string", maxLength: 2000 } },
    },
  })
  @ApiHeader({ name: "Idempotency-Key", required: true })
  @ApiResponse({ status: HttpStatus.CREATED })
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(...UNSAFE_BROWSER_GUARDS)
  createNote(
    @Param("organizationId") organizationId: string,
    @Param("leadId") leadId: string,
    @Body() input: CreateLeadNoteDto,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.execute(() =>
      this.leads.createNote({
        actor: request.auth,
        userId: request.auth.userId,
        organizationId,
        leadId,
        body: input.body,
        idempotencyKey: idempotencyKey ?? "",
      }),
    );
  }

  @Post("organizations/:organizationId/leads/:leadId/tasks")
  @ApiBody({
    schema: {
      type: "object",
      required: ["title", "dueAt"],
      properties: {
        title: { type: "string", maxLength: 500 },
        dueAt: { type: "string", format: "date-time" },
      },
    },
  })
  @ApiHeader({ name: "Idempotency-Key", required: true })
  @ApiResponse({ status: HttpStatus.CREATED })
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(...UNSAFE_BROWSER_GUARDS)
  createTask(
    @Param("organizationId") organizationId: string,
    @Param("leadId") leadId: string,
    @Body() input: CreateLeadTaskDto,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.execute(() =>
      this.leads.createTask({
        actor: request.auth,
        userId: request.auth.userId,
        organizationId,
        leadId,
        title: input.title,
        dueAt: new Date(input.dueAt),
        idempotencyKey: idempotencyKey ?? "",
      }),
    );
  }

  @Post("organizations/:organizationId/leads/:leadId/tasks/:taskId/complete")
  @ApiBody({
    schema: {
      type: "object",
      required: ["expectedVersion"],
      properties: { expectedVersion: { type: "integer", minimum: 1 } },
    },
  })
  @ApiHeader({ name: "Idempotency-Key", required: true })
  @ApiResponse({ status: HttpStatus.OK })
  @HttpCode(HttpStatus.OK)
  @UseGuards(...UNSAFE_BROWSER_GUARDS)
  completeTask(
    @Param("organizationId") organizationId: string,
    @Param("leadId") leadId: string,
    @Param("taskId") taskId: string,
    @Body() input: CompleteLeadTaskDto,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.execute(() =>
      this.leads.completeTask({
        actor: request.auth,
        userId: request.auth.userId,
        organizationId,
        leadId,
        taskId,
        expectedVersion: input.expectedVersion,
        idempotencyKey: idempotencyKey ?? "",
      }),
    );
  }

  @Post("organizations/:organizationId/leads/:leadId/tasks/:taskId/reschedule")
  @ApiBody({
    schema: {
      type: "object",
      required: ["expectedVersion", "dueAt"],
      properties: {
        expectedVersion: { type: "integer", minimum: 1 },
        dueAt: { type: "string", format: "date-time" },
      },
    },
  })
  @ApiHeader({ name: "Idempotency-Key", required: true })
  @ApiResponse({ status: HttpStatus.OK })
  @HttpCode(HttpStatus.OK)
  @UseGuards(...UNSAFE_BROWSER_GUARDS)
  rescheduleTask(
    @Param("organizationId") organizationId: string,
    @Param("leadId") leadId: string,
    @Param("taskId") taskId: string,
    @Body() input: RescheduleLeadTaskDto,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.execute(() =>
      this.leads.rescheduleTask({
        actor: request.auth,
        userId: request.auth.userId,
        organizationId,
        leadId,
        taskId,
        dueAt: new Date(input.dueAt),
        expectedVersion: input.expectedVersion,
        idempotencyKey: idempotencyKey ?? "",
      }),
    );
  }

  private async execute<T>(operation: () => Promise<T>) {
    try {
      const result = await operation();
      await this.publishAutomationLifecycle(result);
      if (isDeniedResult(result)) {
        if (result.kind === "access-denied") throw new ForbiddenException();
        throw new NotFoundException();
      }
      if (isConflictResult(result)) {
        if (result.kind === "ownership-conflict") throw new NotFoundException();
        if (result.kind === "invalid-idempotency-key")
          throw new BadRequestException();
        throw new ConflictException();
      }
      return result;
    } catch (error) {
      if (error instanceof LeadVersionConflictError)
        throw new ConflictException();
      if (
        error instanceof LeadValidationError ||
        error instanceof LeadTransitionError
      )
        throw new BadRequestException();
      throw error;
    }
  }

  private async publishAutomationLifecycle(result: unknown): Promise<void> {
    if (!this.automation || !isSuccessfulLeadMutation(result)) return;
    for (const event of result.timelineEvents) {
      const eventType =
        event.type === "LEAD_CREATED"
          ? "lead.created"
          : event.type === "LEAD_STAGE_CHANGED"
            ? "lead.stage_changed"
            : event.type === "LEAD_ASSIGNED"
              ? "lead.assignment_changed"
              : null;
      if (!eventType) continue;
      try {
        await this.automation.publishLeadLifecycle({
          lead: result.lead,
          eventType,
          occurredAt: event.occurredAt,
          subject: { lead: result.lead, event: event.data },
        });
      } catch {
        // The Lead mutation is already durable. A worker sweep/retry will
        // recover scheduling; never turn a committed CRM command into 500.
      }
    }
  }
}

type ResultWithKind = { kind: string };
type SuccessfulLeadMutation = {
  kind: "ok";
  lead: import("../domain/lead.js").Lead;
  timelineEvents: readonly import("../domain/lead.js").TimelineEventIntent[];
};
function isSuccessfulLeadMutation(
  value: unknown,
): value is SuccessfulLeadMutation {
  return Boolean(
    value &&
    typeof value === "object" &&
    "kind" in value &&
    (value as ResultWithKind).kind === "ok" &&
    "lead" in value &&
    "timelineEvents" in value &&
    Array.isArray(value.timelineEvents),
  );
}
function isDeniedResult(
  value: unknown,
): value is { kind: "access-denied" | "ownership-conflict" } {
  return Boolean(
    value &&
    typeof value === "object" &&
    "kind" in value &&
    ((value as ResultWithKind).kind === "access-denied" ||
      (value as ResultWithKind).kind === "ownership-conflict"),
  );
}
function isConflictResult(value: unknown): value is ResultWithKind {
  return Boolean(
    value &&
    typeof value === "object" &&
    "kind" in value &&
    [
      "ownership-conflict",
      "invalid-idempotency-key",
      "idempotency-conflict",
      "stale-version-conflict",
    ].includes((value as ResultWithKind).kind),
  );
}
