import type { PrismaClient } from "@prisma/client";
import type {
  ApprovalRecord,
  DeliveryPolicy,
  NotificationRepository,
  SendRecord,
  TemplateRecord,
} from "./notification-repository.js";
import type {
  NotificationChannel,
  NotificationLocale,
} from "./notification-template.js";

export class PrismaNotificationRepository implements NotificationRepository {
  constructor(private readonly db: PrismaClient) {}

  async createTemplate(
    input: Parameters<NotificationRepository["createTemplate"]>[0],
  ): Promise<TemplateRecord> {
    const rows = await this.db.$queryRaw<TemplateRow[]>`
      INSERT INTO "NotificationTemplate" ("id", "organizationId", "templateKey", "locale", "version", "subject", "body", "createdBy", "createdAt")
      VALUES (${input.id}::uuid, ${input.organizationId}::uuid, ${input.templateKey}, ${input.locale}, ${input.version}, ${input.subject}, ${input.body}, ${input.createdBy}::uuid, ${input.createdAt})
      RETURNING *`;
    return mapTemplate(rows[0]);
  }

  async createRevision(
    input: Parameters<NotificationRepository["createRevision"]>[0],
  ): Promise<TemplateRecord | null> {
    const rows = await this.db.$queryRaw<TemplateRow[]>`
      WITH current_template AS (
        SELECT "organizationId", "templateKey", "locale", MAX("version") AS "currentVersion"
        FROM "NotificationTemplate"
        WHERE "organizationId" = ${input.organizationId}::uuid AND "id" = ${input.templateId}::uuid
        GROUP BY "organizationId", "templateKey", "locale"
      )
      INSERT INTO "NotificationTemplate" ("id", "organizationId", "templateKey", "locale", "version", "subject", "body", "createdBy", "createdAt")
      SELECT ${input.id}::uuid, "organizationId", "templateKey", "locale", "currentVersion" + 1, ${input.subject}, ${input.body}, ${input.createdBy}::uuid, ${input.createdAt}
      FROM current_template
      RETURNING *`;
    return rows[0] ? mapTemplate(rows[0]) : null;
  }

  async findTemplate(
    organizationId: string,
    id: string,
  ): Promise<TemplateRecord | null> {
    const rows = await this.db.$queryRaw<TemplateRow[]>`
      SELECT * FROM "NotificationTemplate" WHERE "organizationId" = ${organizationId}::uuid AND "id" = ${id}::uuid LIMIT 1`;
    return rows[0] ? mapTemplate(rows[0]) : null;
  }

  async findApprovedTemplate(
    organizationId: string,
    templateKey: string,
    locale: NotificationLocale,
  ): Promise<TemplateRecord | null> {
    const rows = await this.db.$queryRaw<TemplateRow[]>`
      SELECT * FROM "NotificationTemplate"
      WHERE "organizationId" = ${organizationId}::uuid AND "templateKey" = ${templateKey} AND "locale" = ${locale} AND "status" = 'APPROVED'
      ORDER BY "version" DESC LIMIT 1`;
    return rows[0] ? mapTemplate(rows[0]) : null;
  }

  async listTemplates(
    organizationId: string,
    limit: number,
  ): Promise<TemplateRecord[]> {
    const rows = await this.db.$queryRaw<TemplateRow[]>`
      SELECT * FROM "NotificationTemplate" WHERE "organizationId" = ${organizationId}::uuid
      ORDER BY "templateKey" ASC, "locale" ASC, "version" DESC LIMIT ${limit}`;
    return rows.map(mapTemplate);
  }

  async approveTemplate(
    input: Parameters<NotificationRepository["approveTemplate"]>[0],
  ): Promise<TemplateRecord | null> {
    const rows = await this.db.$queryRaw<TemplateRow[]>`
      UPDATE "NotificationTemplate"
      SET "status" = 'APPROVED', "approvedBy" = ${input.approverId}::uuid, "approvedAt" = ${input.at}
      WHERE "organizationId" = ${input.organizationId}::uuid AND "id" = ${input.templateId}::uuid AND "status" = 'DRAFT'
      RETURNING *`;
    return rows[0] ? mapTemplate(rows[0]) : null;
  }

  async createApproval(
    input: Parameters<NotificationRepository["createApproval"]>[0],
  ): Promise<ApprovalRecord> {
    const rows = await this.db.$queryRaw<ApprovalRow[]>`
      INSERT INTO "NotificationApproval" ("id", "organizationId", "templateId", "recipientUserId", "channel", "locale", "variables", "requestedBy", "requestedAt", "idempotencyKey")
      VALUES (${input.id}::uuid, ${input.organizationId}::uuid, ${input.templateId}::uuid, ${input.recipientUserId}::uuid, ${input.channel}::"NotificationChannel", ${input.locale}, ${JSON.stringify(input.variables)}::jsonb, ${input.requestedBy}::uuid, ${input.requestedAt}, ${input.idempotencyKey})
      ON CONFLICT ("organizationId", "idempotencyKey") DO UPDATE SET "id" = "NotificationApproval"."id"
      RETURNING *`;
    return mapApproval(rows[0]);
  }

  async findApproval(
    organizationId: string,
    id: string,
  ): Promise<ApprovalRecord | null> {
    const rows = await this.db.$queryRaw<ApprovalRow[]>`
      SELECT * FROM "NotificationApproval" WHERE "organizationId" = ${organizationId}::uuid AND "id" = ${id}::uuid LIMIT 1`;
    return rows[0] ? mapApproval(rows[0]) : null;
  }

  async listPendingApprovals(
    organizationId: string,
    limit: number,
  ): Promise<ApprovalRecord[]> {
    const rows = await this.db.$queryRaw<ApprovalRow[]>`
      SELECT * FROM "NotificationApproval" WHERE "organizationId" = ${organizationId}::uuid AND "status" = 'PENDING'
      ORDER BY "requestedAt" ASC, "id" ASC LIMIT ${limit}`;
    return rows.map(mapApproval);
  }

  async decideApproval(
    input: Parameters<NotificationRepository["decideApproval"]>[0],
  ): Promise<ApprovalRecord | null> {
    const rows = await this.db.$queryRaw<ApprovalRow[]>`
      UPDATE "NotificationApproval"
      SET "status" = ${input.status}::"NotificationApprovalStatus", "decidedBy" = ${input.deciderId}::uuid,
          "decidedAt" = ${input.at}, "decisionReason" = ${input.reason}
      WHERE "organizationId" = ${input.organizationId}::uuid AND "id" = ${input.approvalId}::uuid AND "status" = 'PENDING'
      RETURNING *`;
    return rows[0] ? mapApproval(rows[0]) : null;
  }

  async getPolicy(organizationId: string): Promise<DeliveryPolicy> {
    const rows = await this.db.$queryRaw<PolicyRow[]>`
      SELECT "timeZone", "quietStart", "quietEnd" FROM "NotificationDeliveryPolicy" WHERE "organizationId" = ${organizationId}::uuid LIMIT 1`;
    return rows[0]
      ? {
          timeZone: rows[0].timeZone,
          quietStart: rows[0].quietStart,
          quietEnd: rows[0].quietEnd,
        }
      : { timeZone: "UTC", quietStart: "22:00", quietEnd: "07:00" };
  }

  async setPolicy(
    input: Parameters<NotificationRepository["setPolicy"]>[0],
  ): Promise<void> {
    await this.db.$executeRaw`
      INSERT INTO "NotificationDeliveryPolicy" ("organizationId", "timeZone", "quietStart", "quietEnd", "updatedBy", "updatedAt")
      VALUES (${input.organizationId}::uuid, ${input.policy.timeZone}, ${input.policy.quietStart}, ${input.policy.quietEnd}, ${input.updatedBy}::uuid, ${input.at})
      ON CONFLICT ("organizationId") DO UPDATE SET "timeZone" = EXCLUDED."timeZone", "quietStart" = EXCLUDED."quietStart", "quietEnd" = EXCLUDED."quietEnd", "updatedBy" = EXCLUDED."updatedBy", "updatedAt" = EXCLUDED."updatedAt"`;
  }

  async getPreference(
    organizationId: string,
    userId: string,
    channel: NotificationChannel,
  ): Promise<{ consent: boolean; optedOut: boolean } | null> {
    const rows = await this.db.$queryRaw<PreferenceRow[]>`
      SELECT "consent", "optedOut" FROM "NotificationRecipientPreference"
      WHERE "organizationId" = ${organizationId}::uuid AND "userId" = ${userId}::uuid AND "channel" = ${channel}::"NotificationChannel" LIMIT 1`;
    return rows[0]
      ? { consent: rows[0].consent, optedOut: rows[0].optedOut }
      : null;
  }

  async setPreference(
    input: Parameters<NotificationRepository["setPreference"]>[0],
  ): Promise<void> {
    await this.db.$executeRaw`
      INSERT INTO "NotificationRecipientPreference" ("organizationId", "userId", "channel", "consent", "optedOut", "updatedAt")
      VALUES (${input.organizationId}::uuid, ${input.userId}::uuid, ${input.channel}::"NotificationChannel", ${input.consent}, ${input.optedOut}, ${input.at})
      ON CONFLICT ("organizationId", "userId", "channel") DO UPDATE SET "consent" = EXCLUDED."consent", "optedOut" = EXCLUDED."optedOut", "updatedAt" = EXCLUDED."updatedAt"`;
  }

  async recordSend(
    input: Parameters<NotificationRepository["recordSend"]>[0],
  ): Promise<SendRecord | null> {
    const rows = await this.db.$queryRaw<SendRow[]>`
      INSERT INTO "NotificationSend" ("organizationId", "approvalId", "templateId", "templateKey", "templateVersion", "recipientUserId", "channel", "locale", "status", "suppressionReason", "renderedSubject", "renderedBody", "providerMessageId", "idempotencyKey", "createdAt")
      VALUES (${input.organizationId}::uuid, ${input.approvalId ?? null}::uuid, ${input.templateId ?? null}::uuid, ${input.templateKey}, ${input.templateVersion ?? null}, ${input.recipientUserId}::uuid, ${input.channel}::"NotificationChannel", ${input.locale}, ${input.status}::"NotificationSendStatus", ${input.suppressionReason ?? null}::"NotificationSuppressionReason", ${input.renderedSubject}, ${input.renderedBody}, ${input.providerMessageId ?? null}, ${input.idempotencyKey}, ${input.createdAt})
      ON CONFLICT ("organizationId", "idempotencyKey") DO NOTHING
      RETURNING *`;
    return rows[0] ? mapSend(rows[0]) : null;
  }

  async listSends(
    organizationId: string,
    limit: number,
  ): Promise<SendRecord[]> {
    const rows = await this.db.$queryRaw<SendRow[]>`
      SELECT * FROM "NotificationSend" WHERE "organizationId" = ${organizationId}::uuid
      ORDER BY "createdAt" DESC, "id" DESC LIMIT ${limit}`;
    return rows.map(mapSend);
  }

  async audit(
    input: Parameters<NotificationRepository["audit"]>[0],
  ): Promise<void> {
    if (input.actorUserId) {
      await this.db.$executeRaw`
        INSERT INTO "NotificationAuditEvent" ("organizationId", "entityType", "entityId", "action", "actorUserId", "reason", "metadata", "createdAt")
        VALUES (${input.organizationId}::uuid, ${input.entityType}, ${input.entityId}::uuid, ${input.action}, ${input.actorUserId}::uuid, ${input.reason ?? null}, ${JSON.stringify(input.metadata ?? {})}::jsonb, ${input.at})`;
    } else {
      await this.db.$executeRaw`
        INSERT INTO "NotificationAuditEvent" ("organizationId", "entityType", "entityId", "action", "actorUserId", "reason", "metadata", "createdAt")
        VALUES (${input.organizationId}::uuid, ${input.entityType}, ${input.entityId}::uuid, ${input.action}, NULL, ${input.reason ?? null}, ${JSON.stringify(input.metadata ?? {})}::jsonb, ${input.at})`;
    }
  }
}

type TemplateRow = {
  id: string;
  organizationId: string;
  templateKey: string;
  locale: string;
  version: number;
  status: "DRAFT" | "APPROVED";
  subject: string | null;
  body: string;
  createdBy: string;
  createdAt: Date;
  approvedBy: string | null;
  approvedAt: Date | null;
};
type ApprovalRow = {
  id: string;
  organizationId: string;
  templateId: string;
  recipientUserId: string;
  channel: NotificationChannel;
  locale: string;
  variables: unknown;
  status: "PENDING" | "APPROVED" | "DENIED";
  requestedBy: string;
  requestedAt: Date;
  decidedBy: string | null;
  decidedAt: Date | null;
  decisionReason: string | null;
};
type PolicyRow = { timeZone: string; quietStart: string; quietEnd: string };
type PreferenceRow = { consent: boolean; optedOut: boolean };
type SendRow = {
  id: string;
  templateKey: string;
  templateVersion: number | null;
  recipientUserId: string;
  channel: NotificationChannel;
  locale: string;
  status: "SENT" | "SUPPRESSED" | "FAILED";
  suppressionReason: SendRecord["suppressionReason"];
  renderedSubject: string | null;
  renderedBody: string;
  createdAt: Date;
};

function locale(value: string): NotificationLocale {
  return value as NotificationLocale;
}
function mapTemplate(row: TemplateRow): TemplateRecord {
  return { ...row, locale: locale(row.locale) };
}
function variables(value: unknown): Readonly<Record<string, string>> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? Object.fromEntries(
        Object.entries(value).filter(
          (entry): entry is [string, string] => typeof entry[1] === "string",
        ),
      )
    : {};
}
function mapApproval(row: ApprovalRow): ApprovalRecord {
  return {
    ...row,
    locale: locale(row.locale),
    variables: variables(row.variables),
  };
}
function mapSend(row: SendRow): SendRecord {
  return { ...row, locale: locale(row.locale) };
}
