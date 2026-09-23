import type { PrismaClient } from "@prisma/client";
import type {
  AutomationNotification,
  AutomationOutboundDelivery,
} from "../automation/application/lead-automation-executor.js";

/** Durable fake delivery: it records in-app notifications only. */
export class PrismaAutomationDelivery implements AutomationOutboundDelivery {
  constructor(private readonly prisma: PrismaClient) {}

  async deliver(notification: AutomationNotification): Promise<void> {
    await this.prisma.$executeRaw`
      INSERT INTO "AutomationNotification"
        ("id", "organizationId", "recipientUserId", "template", "idempotencyKey", "createdAt")
      VALUES
        (gen_random_uuid(), ${notification.organizationId}::uuid,
         ${notification.recipientUserId}::uuid, ${notification.template},
         ${notification.idempotencyKey}, NOW())
      ON CONFLICT ("organizationId", "idempotencyKey") DO NOTHING`;
  }
}
