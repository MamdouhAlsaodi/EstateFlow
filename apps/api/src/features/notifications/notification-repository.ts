import type {
  NotificationChannel,
  NotificationLocale,
} from "./notification-template.js";

export type TemplateRecord = Readonly<{
  id: string;
  organizationId: string;
  templateKey: string;
  locale: NotificationLocale;
  version: number;
  status: "DRAFT" | "APPROVED";
  subject: string | null;
  body: string;
  createdBy: string;
  createdAt: Date;
  approvedBy: string | null;
  approvedAt: Date | null;
}>;

export type ApprovalRecord = Readonly<{
  id: string;
  organizationId: string;
  templateId: string;
  recipientUserId: string;
  channel: NotificationChannel;
  locale: NotificationLocale;
  variables: Readonly<Record<string, string>>;
  status: "PENDING" | "APPROVED" | "DENIED";
  requestedBy: string;
  requestedAt: Date;
  decidedBy: string | null;
  decidedAt: Date | null;
  decisionReason: string | null;
}>;

export type SendRecord = Readonly<{
  id: string;
  templateKey: string;
  templateVersion: number | null;
  recipientUserId: string;
  channel: NotificationChannel;
  locale: NotificationLocale;
  status: "SENT" | "SUPPRESSED" | "FAILED";
  suppressionReason:
    "QUIET_HOURS" | "NO_CONSENT" | "OPTED_OUT" | "NO_APPROVED_TEMPLATE" | null;
  renderedSubject: string | null;
  renderedBody: string;
  createdAt: Date;
}>;

export type DeliveryPolicy = Readonly<{
  timeZone: string;
  quietStart: string;
  quietEnd: string;
}>;

export interface NotificationRepository {
  createTemplate(input: {
    id: string;
    organizationId: string;
    templateKey: string;
    locale: NotificationLocale;
    version: number;
    subject: string | null;
    body: string;
    createdBy: string;
    createdAt: Date;
  }): Promise<TemplateRecord>;
  createRevision(input: {
    id: string;
    organizationId: string;
    templateId: string;
    subject: string | null;
    body: string;
    createdBy: string;
    createdAt: Date;
  }): Promise<TemplateRecord | null>;
  findTemplate(
    organizationId: string,
    id: string,
  ): Promise<TemplateRecord | null>;
  findApprovedTemplate(
    organizationId: string,
    templateKey: string,
    locale: NotificationLocale,
  ): Promise<TemplateRecord | null>;
  listTemplates(
    organizationId: string,
    limit: number,
  ): Promise<TemplateRecord[]>;
  approveTemplate(input: {
    organizationId: string;
    templateId: string;
    approverId: string;
    at: Date;
  }): Promise<TemplateRecord | null>;
  createApproval(input: {
    id: string;
    organizationId: string;
    templateId: string;
    recipientUserId: string;
    channel: NotificationChannel;
    locale: NotificationLocale;
    variables: Readonly<Record<string, string>>;
    requestedBy: string;
    requestedAt: Date;
    idempotencyKey: string;
  }): Promise<ApprovalRecord>;
  findApproval(
    organizationId: string,
    id: string,
  ): Promise<ApprovalRecord | null>;
  listPendingApprovals(
    organizationId: string,
    limit: number,
  ): Promise<ApprovalRecord[]>;
  decideApproval(input: {
    organizationId: string;
    approvalId: string;
    deciderId: string;
    status: "APPROVED" | "DENIED";
    reason: string | null;
    at: Date;
  }): Promise<ApprovalRecord | null>;
  getPolicy(organizationId: string): Promise<DeliveryPolicy>;
  setPolicy(input: {
    organizationId: string;
    updatedBy: string;
    policy: DeliveryPolicy;
    at: Date;
  }): Promise<void>;
  getPreference(
    organizationId: string,
    userId: string,
    channel: NotificationChannel,
  ): Promise<{ consent: boolean; optedOut: boolean } | null>;
  setPreference(input: {
    organizationId: string;
    userId: string;
    channel: NotificationChannel;
    consent: boolean;
    optedOut: boolean;
    at: Date;
  }): Promise<void>;
  recordSend(input: {
    organizationId: string;
    approvalId?: string;
    templateId?: string;
    templateKey: string;
    templateVersion?: number;
    recipientUserId: string;
    channel: NotificationChannel;
    locale: NotificationLocale;
    status: "SENT" | "SUPPRESSED" | "FAILED";
    suppressionReason?:
      "QUIET_HOURS" | "NO_CONSENT" | "OPTED_OUT" | "NO_APPROVED_TEMPLATE";
    renderedSubject: string | null;
    renderedBody: string;
    providerMessageId?: string;
    idempotencyKey: string;
    createdAt: Date;
  }): Promise<SendRecord | null>;
  listSends(organizationId: string, limit: number): Promise<SendRecord[]>;
  audit(input: {
    organizationId: string;
    entityType: string;
    entityId: string;
    action: string;
    actorUserId: string | null;
    reason?: string | null;
    metadata?: unknown;
    at: Date;
  }): Promise<void>;
}
