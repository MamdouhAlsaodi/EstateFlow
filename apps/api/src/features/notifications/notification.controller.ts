import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  ForbiddenException,
  Get,
  HttpStatus,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";
import {
  ApiBody,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from "@nestjs/swagger";
import type { AuthenticatedRequest } from "../auth/http/auth-request.js";
import { BrowserSessionGuard } from "../auth/http/browser-session.guard.js";
import { CsrfGuard } from "../auth/http/csrf.guard.js";
import { RequireCanonicalOriginGuard } from "../auth/http/origin.guard.js";
import {
  NotificationAccessError,
  NotificationApplication,
  NotificationNotFoundError,
} from "./notification-application.js";
import { NotificationTemplateValidationError } from "./notification-template.js";

const mutationGuards = [
  RequireCanonicalOriginGuard,
  BrowserSessionGuard,
  CsrfGuard,
];
const uuid = { type: "string", format: "uuid" };

@ApiTags("Notifications")
@Controller()
export class NotificationController {
  constructor(private readonly notifications: NotificationApplication) {}

  @Get("organizations/:organizationId/notifications/templates")
  @ApiOperation({ operationId: "NotificationController_listTemplates" })
  @ApiParam({ name: "organizationId", schema: uuid })
  @ApiResponse({ status: HttpStatus.OK })
  @UseGuards(BrowserSessionGuard)
  listTemplates(
    @Param("organizationId", new ParseUUIDPipe()) organizationId: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.execute(() =>
      this.notifications.listTemplates({
        actor: request.auth,
        userId: request.auth.userId,
        organizationId,
        limit: 100,
      }),
    );
  }

  @Post("organizations/:organizationId/notifications/templates")
  @ApiOperation({ operationId: "NotificationController_createTemplate" })
  @ApiBody({
    schema: {
      type: "object",
      required: ["templateKey", "locale", "body"],
      properties: {
        templateKey: { type: "string" },
        locale: { enum: ["ar", "en"] },
        subject: { type: "string" },
        body: { type: "string" },
      },
    },
  })
  @UseGuards(...mutationGuards)
  createTemplate(
    @Param("organizationId", new ParseUUIDPipe()) organizationId: string,
    @Body() body: TemplateBody,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.execute(() =>
      this.notifications.createTemplate({
        ...this.command(request, organizationId),
        templateKey: body.templateKey,
        locale: body.locale,
        subject: body.subject,
        body: body.body,
        at: new Date(),
      }),
    );
  }

  @Post(
    "organizations/:organizationId/notifications/templates/:templateId/revisions",
  )
  @ApiOperation({ operationId: "NotificationController_reviseTemplate" })
  @ApiParam({ name: "organizationId", schema: uuid })
  @ApiParam({ name: "templateId", schema: uuid })
  @UseGuards(...mutationGuards)
  reviseTemplate(
    @Param("organizationId", new ParseUUIDPipe()) organizationId: string,
    @Param("templateId", new ParseUUIDPipe()) templateId: string,
    @Body() body: ContentBody,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.execute(() =>
      this.notifications.reviseTemplate({
        ...this.command(request, organizationId),
        templateId,
        subject: body.subject,
        body: body.body,
        at: new Date(),
      }),
    );
  }

  @Post(
    "organizations/:organizationId/notifications/templates/:templateId/approve",
  )
  @ApiOperation({ operationId: "NotificationController_approveTemplate" })
  @UseGuards(...mutationGuards)
  approveTemplate(
    @Param("organizationId", new ParseUUIDPipe()) organizationId: string,
    @Param("templateId", new ParseUUIDPipe()) templateId: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.execute(() =>
      this.notifications.approveTemplate({
        ...this.command(request, organizationId),
        templateId,
        at: new Date(),
      }),
    );
  }

  @Get("organizations/:organizationId/notifications/approvals")
  @ApiOperation({ operationId: "NotificationController_listApprovals" })
  @UseGuards(BrowserSessionGuard)
  listApprovals(
    @Param("organizationId", new ParseUUIDPipe()) organizationId: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.execute(() =>
      this.notifications.listPendingApprovals({
        ...this.command(request, organizationId),
        limit: 100,
      }),
    );
  }

  @Post("organizations/:organizationId/notifications/send-requests")
  @ApiOperation({ operationId: "NotificationController_requestSend" })
  @ApiBody({
    schema: {
      type: "object",
      required: [
        "templateId",
        "recipientUserId",
        "channel",
        "locale",
        "variables",
      ],
      properties: {
        templateId: uuid,
        recipientUserId: uuid,
        channel: { enum: ["IN_APP", "EMAIL", "WHATSAPP"] },
        locale: { enum: ["ar", "en"] },
        variables: { type: "object" },
      },
    },
  })
  @UseGuards(...mutationGuards)
  requestSend(
    @Param("organizationId", new ParseUUIDPipe()) organizationId: string,
    @Body() body: SendBody,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.execute(() =>
      this.notifications.requestApproval({
        ...this.command(request, organizationId),
        templateId: body.templateId,
        recipientUserId: body.recipientUserId,
        channel: body.channel,
        locale: body.locale,
        variables: body.variables ?? {},
        idempotencyKey:
          request.headers["idempotency-key"]?.toString() ??
          `${request.auth.userId}:${body.templateId}`,
        at: new Date(),
      }),
    );
  }

  @Post(
    "organizations/:organizationId/notifications/approvals/:approvalId/approve",
  )
  @ApiOperation({ operationId: "NotificationController_approveSend" })
  @UseGuards(...mutationGuards)
  approveSend(
    @Param("organizationId", new ParseUUIDPipe()) organizationId: string,
    @Param("approvalId", new ParseUUIDPipe()) approvalId: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.execute(() =>
      this.notifications.approveSend({
        ...this.command(request, organizationId),
        approvalId,
        at: new Date(),
      }),
    );
  }

  @Post(
    "organizations/:organizationId/notifications/approvals/:approvalId/reject",
  )
  @ApiOperation({ operationId: "NotificationController_rejectSend" })
  @UseGuards(...mutationGuards)
  rejectSend(
    @Param("organizationId", new ParseUUIDPipe()) organizationId: string,
    @Param("approvalId", new ParseUUIDPipe()) approvalId: string,
    @Body() body: RejectBody,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.execute(() =>
      this.notifications.rejectSend({
        ...this.command(request, organizationId),
        approvalId,
        reason: body.reason,
        at: new Date(),
      }),
    );
  }

  @Post("organizations/:organizationId/notifications/policy")
  @ApiOperation({ operationId: "NotificationController_updatePolicy" })
  @UseGuards(...mutationGuards)
  updatePolicy(
    @Param("organizationId", new ParseUUIDPipe()) organizationId: string,
    @Body() body: PolicyBody,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.execute(() =>
      this.notifications.updatePolicy({
        ...this.command(request, organizationId),
        ...body,
        at: new Date(),
      }),
    );
  }

  @Post("organizations/:organizationId/notifications/preferences")
  @ApiOperation({ operationId: "NotificationController_updatePreference" })
  @UseGuards(...mutationGuards)
  updatePreference(
    @Param("organizationId", new ParseUUIDPipe()) organizationId: string,
    @Body() body: PreferenceBody,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.execute(() =>
      this.notifications.updatePreference({
        ...this.command(request, organizationId),
        recipientUserId: body.recipientUserId,
        channel: body.channel,
        consent: body.consent,
        optedOut: body.optedOut,
        at: new Date(),
      }),
    );
  }

  @Get("organizations/:organizationId/notifications/sends")
  @ApiOperation({ operationId: "NotificationController_listSends" })
  @UseGuards(BrowserSessionGuard)
  listSends(
    @Param("organizationId", new ParseUUIDPipe()) organizationId: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.execute(() =>
      this.notifications.listSends({
        ...this.command(request, organizationId),
        limit: 100,
      }),
    );
  }

  private command(request: AuthenticatedRequest, organizationId: string) {
    return { actor: request.auth, userId: request.auth.userId, organizationId };
  }

  private async execute(operation: () => Promise<unknown>): Promise<unknown> {
    try {
      return await operation();
    } catch (error) {
      if (error instanceof NotificationAccessError)
        throw new ForbiddenException();
      if (error instanceof NotificationNotFoundError)
        throw new NotFoundException();
      if (
        error instanceof NotificationTemplateValidationError ||
        (error instanceof Error && error.message.includes("rejection reason"))
      )
        throw new BadRequestException();
      if (
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        (error as { code?: string }).code === "P2002"
      )
        throw new ConflictException();
      throw error;
    }
  }
}

type TemplateBody = {
  templateKey: string;
  locale: string;
  subject?: string;
  body: string;
};
type ContentBody = { subject?: string; body: string };
type SendBody = {
  templateId: string;
  recipientUserId: string;
  channel: string;
  locale: string;
  variables?: Record<string, string>;
};
type RejectBody = { reason: string };
type PolicyBody = { timeZone: string; quietStart: string; quietEnd: string };
type PreferenceBody = {
  recipientUserId: string;
  channel: string;
  consent: boolean;
  optedOut: boolean;
};
