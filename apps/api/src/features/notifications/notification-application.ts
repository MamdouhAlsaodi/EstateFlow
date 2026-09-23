import { randomUUID } from "node:crypto";
import type {
  NotificationMembership,
  NotificationMembershipReader,
} from "./notification-membership.js";
import type { NotificationProviderPort } from "./notification-provider.port.js";
import type {
  ApprovalRecord,
  NotificationRepository,
  SendRecord,
  TemplateRecord,
} from "./notification-repository.js";
import {
  isWithinQuietHours,
  renderTemplate,
  templateFallback,
  validateChannel,
  validateLocale,
  validateTemplateContent,
  validateTemplateKey,
  type NotificationLocale,
} from "./notification-template.js";

export type NotificationActor = Readonly<{ verified: boolean }>;
type Command = Readonly<{
  actor: NotificationActor;
  userId: string;
  organizationId: string;
}>;

export class NotificationAccessError extends Error {}
export class NotificationNotFoundError extends Error {}

export type SendOutcome = Readonly<{
  kind: "sent" | "suppressed";
  reason?: string;
  send: SendRecord | null;
}>;

export class NotificationApplication {
  constructor(
    private readonly repository: NotificationRepository,
    private readonly membershipReader: NotificationMembershipReader,
    private readonly provider: NotificationProviderPort,
  ) {}

  async createTemplate(
    input: Command & {
      templateKey: string;
      locale: string;
      subject?: string;
      body: string;
      at: Date;
    },
  ): Promise<TemplateRecord> {
    await this.authorize(input);
    validateTemplateKey(input.templateKey);
    validateLocale(input.locale);
    validateTemplateContent(input.subject ?? null, input.body);
    const template = await this.repository.createTemplate({
      id: randomUUID(),
      organizationId: input.organizationId,
      templateKey: input.templateKey,
      locale: input.locale,
      version: 1,
      subject: input.subject ?? null,
      body: input.body,
      createdBy: input.userId,
      createdAt: input.at,
    });
    await this.audit(input, template.id, "TEMPLATE_DRAFT_CREATED");
    return template;
  }

  async reviseTemplate(
    input: Command & {
      templateId: string;
      subject?: string;
      body: string;
      at: Date;
    },
  ): Promise<TemplateRecord> {
    await this.authorize(input);
    validateTemplateContent(input.subject ?? null, input.body);
    const template = await this.repository.createRevision({
      id: randomUUID(),
      organizationId: input.organizationId,
      templateId: input.templateId,
      subject: input.subject ?? null,
      body: input.body,
      createdBy: input.userId,
      createdAt: input.at,
    });
    if (!template) throw new NotificationNotFoundError();
    await this.audit(input, template.id, "TEMPLATE_REVISION_CREATED");
    return template;
  }

  async approveTemplate(
    input: Command & { templateId: string; at: Date },
  ): Promise<TemplateRecord> {
    await this.authorize(input);
    const template = await this.repository.approveTemplate({
      organizationId: input.organizationId,
      templateId: input.templateId,
      approverId: input.userId,
      at: input.at,
    });
    if (!template) throw new NotificationNotFoundError();
    await this.audit(input, template.id, "TEMPLATE_APPROVED");
    return template;
  }

  async listTemplates(
    input: Command & { limit: number },
  ): Promise<TemplateRecord[]> {
    await this.authorize(input);
    return this.repository.listTemplates(input.organizationId, input.limit);
  }

  async requestApproval(
    input: Command & {
      templateId: string;
      recipientUserId: string;
      channel: string;
      locale: string;
      variables: Readonly<Record<string, string>>;
      idempotencyKey: string;
      at: Date;
    },
  ): Promise<ApprovalRecord> {
    await this.authorize(input);
    validateChannel(input.channel);
    validateLocale(input.locale);
    const template = await this.repository.findTemplate(
      input.organizationId,
      input.templateId,
    );
    if (
      !template ||
      template.status !== "APPROVED" ||
      template.locale !== input.locale
    )
      throw new NotificationNotFoundError();
    renderTemplate(template.subject, template.body, input.variables);
    const approval = await this.repository.createApproval({
      id: randomUUID(),
      organizationId: input.organizationId,
      templateId: input.templateId,
      recipientUserId: input.recipientUserId,
      channel: input.channel,
      locale: input.locale,
      variables: input.variables,
      requestedBy: input.userId,
      requestedAt: input.at,
      idempotencyKey: input.idempotencyKey,
    });
    await this.audit(input, approval.id, "SEND_APPROVAL_REQUESTED");
    return approval;
  }

  async listPendingApprovals(
    input: Command & { limit: number },
  ): Promise<ApprovalRecord[]> {
    await this.authorize(input);
    return this.repository.listPendingApprovals(
      input.organizationId,
      input.limit,
    );
  }

  async approveSend(
    input: Command & { approvalId: string; at: Date },
  ): Promise<SendOutcome> {
    await this.authorize(input);
    const existing = await this.repository.findApproval(
      input.organizationId,
      input.approvalId,
    );
    if (!existing) throw new NotificationNotFoundError();
    const approval = await this.repository.decideApproval({
      organizationId: input.organizationId,
      approvalId: input.approvalId,
      deciderId: input.userId,
      status: "APPROVED",
      reason: null,
      at: input.at,
    });
    if (!approval) throw new NotificationAccessError();
    await this.audit(input, approval.id, "SEND_APPROVED");
    return this.sendApproval(approval, input.at);
  }

  async rejectSend(
    input: Command & { approvalId: string; reason: string; at: Date },
  ): Promise<ApprovalRecord> {
    await this.authorize(input);
    if (input.reason.trim().length === 0 || input.reason.length > 500)
      throw new Error("rejection reason is required");
    const approval = await this.repository.decideApproval({
      organizationId: input.organizationId,
      approvalId: input.approvalId,
      deciderId: input.userId,
      status: "DENIED",
      reason: input.reason,
      at: input.at,
    });
    if (!approval) throw new NotificationNotFoundError();
    await this.audit(input, approval.id, "SEND_DENIED", input.reason);
    return approval;
  }

  async listSends(input: Command & { limit: number }): Promise<SendRecord[]> {
    await this.authorize(input);
    return this.repository.listSends(input.organizationId, input.limit);
  }

  async updatePolicy(
    input: Command & {
      timeZone: string;
      quietStart: string;
      quietEnd: string;
      at: Date;
    },
  ): Promise<void> {
    await this.authorize(input);
    isWithinQuietHours({
      now: input.at,
      timeZone: input.timeZone,
      quietStart: input.quietStart,
      quietEnd: input.quietEnd,
    });
    await this.repository.setPolicy({
      organizationId: input.organizationId,
      updatedBy: input.userId,
      policy: {
        timeZone: input.timeZone,
        quietStart: input.quietStart,
        quietEnd: input.quietEnd,
      },
      at: input.at,
    });
    await this.audit(input, input.organizationId, "DELIVERY_POLICY_UPDATED");
  }

  async updatePreference(
    input: Command & {
      recipientUserId: string;
      channel: string;
      consent: boolean;
      optedOut: boolean;
      at: Date;
    },
  ): Promise<void> {
    await this.authorize(input);
    validateChannel(input.channel);
    await this.repository.setPreference({
      organizationId: input.organizationId,
      userId: input.recipientUserId,
      channel: input.channel,
      consent: input.consent,
      optedOut: input.optedOut,
      at: input.at,
    });
    await this.audit(
      input,
      input.organizationId,
      "RECIPIENT_PREFERENCE_UPDATED",
    );
  }

  async sendAutomation(input: {
    organizationId: string;
    recipientUserId: string;
    templateKey: string;
    locale?: NotificationLocale;
    variables?: Readonly<Record<string, string>>;
    idempotencyKey: string;
    now: Date;
  }): Promise<SendOutcome> {
    const locale = input.locale ?? "ar";
    const template = await this.repository.findApprovedTemplate(
      input.organizationId,
      input.templateKey,
      locale,
    );
    const fallback = templateFallback(input.templateKey, locale);
    const rendered = template
      ? renderTemplate(template.subject, template.body, input.variables ?? {})
      : renderTemplate(fallback.subject, fallback.body, input.variables ?? {});
    const policy = await this.repository.getPolicy(input.organizationId);
    const preference = await this.repository.getPreference(
      input.organizationId,
      input.recipientUserId,
      "IN_APP",
    );
    const suppressionReason = preference?.optedOut
      ? "OPTED_OUT"
      : preference?.consent === false
        ? "NO_CONSENT"
        : isWithinQuietHours({ now: input.now, ...policy })
          ? "QUIET_HOURS"
          : undefined;
    if (suppressionReason) {
      const send = await this.repository.recordSend({
        organizationId: input.organizationId,
        templateId: template?.id,
        templateKey: input.templateKey,
        templateVersion: template?.version,
        recipientUserId: input.recipientUserId,
        channel: "IN_APP",
        locale,
        status: "SUPPRESSED",
        suppressionReason,
        renderedSubject: rendered.subject,
        renderedBody: rendered.body,
        idempotencyKey: input.idempotencyKey,
        createdAt: input.now,
      });
      if (send)
        await this.repository.audit({
          organizationId: input.organizationId,
          entityType: "SEND",
          entityId: send.id,
          action: "SEND_SUPPRESSED",
          actorUserId: null,
          reason: suppressionReason,
          at: input.now,
        });
      return { kind: "suppressed", reason: suppressionReason, send };
    }
    const provider = await this.provider.send({
      organizationId: input.organizationId,
      recipientUserId: input.recipientUserId,
      channel: "IN_APP",
      subject: rendered.subject,
      body: rendered.body,
    });
    const send = await this.repository.recordSend({
      organizationId: input.organizationId,
      templateId: template?.id,
      templateKey: input.templateKey,
      templateVersion: template?.version,
      recipientUserId: input.recipientUserId,
      channel: "IN_APP",
      locale,
      status: "SENT",
      renderedSubject: rendered.subject,
      renderedBody: rendered.body,
      providerMessageId: provider.providerMessageId,
      idempotencyKey: input.idempotencyKey,
      createdAt: input.now,
    });
    if (send)
      await this.repository.audit({
        organizationId: input.organizationId,
        entityType: "SEND",
        entityId: send.id,
        action: "SEND_SENT",
        actorUserId: null,
        at: input.now,
      });
    return { kind: "sent", send };
  }

  private async sendApproval(
    approval: ApprovalRecord,
    now: Date,
  ): Promise<SendOutcome> {
    const template = await this.repository.findTemplate(
      approval.organizationId,
      approval.templateId,
    );
    if (!template || template.status !== "APPROVED")
      throw new NotificationNotFoundError();
    if (approval.channel !== "IN_APP") {
      const send = await this.repository.recordSend({
        organizationId: approval.organizationId,
        approvalId: approval.id,
        templateId: template.id,
        templateKey: template.templateKey,
        templateVersion: template.version,
        recipientUserId: approval.recipientUserId,
        channel: approval.channel,
        locale: approval.locale,
        status: "SUPPRESSED",
        suppressionReason: "NO_CONSENT",
        renderedSubject: template.subject,
        renderedBody: template.body,
        idempotencyKey: `approval:${approval.id}`,
        createdAt: now,
      });
      return { kind: "suppressed", reason: "NO_CONSENT", send };
    }
    return this.sendAutomation({
      organizationId: approval.organizationId,
      recipientUserId: approval.recipientUserId,
      templateKey: template.templateKey,
      locale: approval.locale,
      variables: approval.variables,
      idempotencyKey: `approval:${approval.id}`,
      now,
    });
  }

  private async authorize(input: Command): Promise<NotificationMembership> {
    if (!input.actor.verified || input.userId.trim().length === 0)
      throw new NotificationAccessError();
    const membership = await this.membershipReader.findMembership(
      input.organizationId,
      input.userId,
    );
    if (
      !membership ||
      membership.organizationId !== input.organizationId ||
      membership.status !== "ACTIVE" ||
      (membership.role !== "OWNER" && membership.role !== "MANAGER")
    )
      throw new NotificationAccessError();
    return membership;
  }

  private audit(
    input: Command,
    entityId: string,
    action: string,
    reason?: string,
  ): Promise<void> {
    const at = (input as Command & { at?: Date }).at ?? new Date();
    return this.repository.audit({
      organizationId: input.organizationId,
      entityType: "NOTIFICATION",
      entityId,
      action,
      actorUserId: input.userId,
      reason,
      at,
    });
  }
}
