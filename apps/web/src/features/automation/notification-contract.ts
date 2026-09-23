export type NotificationTemplateSummary = Readonly<{
  id: string;
  templateKey: string;
  locale: "ar" | "en";
  version: number;
  status: "DRAFT" | "APPROVED";
  subject: string | null;
  body: string;
  createdAt: string;
  approvedAt: string | null;
}>;

export type NotificationApprovalSummary = Readonly<{
  id: string;
  templateId: string;
  recipientUserId: string;
  channel: "IN_APP" | "EMAIL" | "WHATSAPP";
  locale: "ar" | "en";
  status: "PENDING" | "APPROVED" | "DENIED";
  requestedAt: string;
}>;

export type NotificationSendSummary = Readonly<{
  id: string;
  templateKey: string;
  templateVersion: number | null;
  recipientUserId: string;
  channel: "IN_APP" | "EMAIL" | "WHATSAPP";
  locale: "ar" | "en";
  status: "SENT" | "SUPPRESSED" | "FAILED";
  suppressionReason: string | null;
  renderedSubject: string | null;
  renderedBody: string;
  createdAt: string;
}>;
