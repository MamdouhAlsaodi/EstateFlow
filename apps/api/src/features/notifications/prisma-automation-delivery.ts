import type { PrismaClient } from "@prisma/client";
import type {
  AutomationNotification,
  AutomationOutboundDelivery,
} from "../automation/application/lead-automation-executor.js";
import type { NotificationApplication } from "./notification-application.js";

/** Durable fake delivery: delegates policy/template rendering to EF-305 and keeps the EF-304 compatibility record. */
export class PrismaAutomationDelivery implements AutomationOutboundDelivery {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly notifications: NotificationApplication,
  ) {}

  async deliver(notification: AutomationNotification): Promise<void> {
    const result = await this.notifications.sendAutomation({
      organizationId: notification.organizationId,
      recipientUserId: notification.recipientUserId,
      templateKey: notification.template,
      locale: notification.locale,
      variables: notification.variables,
      idempotencyKey: notification.idempotencyKey,
      now: new Date(),
    });
    if (result.kind !== "sent") return;
    await this.prisma.$executeRaw`
      INSERT INTO "AutomationNotification"
        ("id", "organizationId", "recipientUserId", "template", "idempotencyKey", "createdAt")
      VALUES
        (gen_random_uuid(), ${notification.organizationId}::uuid,
         ${notification.recipientUserId}::uuid, ${result.send?.renderedBody ?? notification.template},
         ${notification.idempotencyKey}, NOW())
      ON CONFLICT ("organizationId", "idempotencyKey") DO NOTHING`;
  }
}
