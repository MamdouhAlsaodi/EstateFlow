import type { NotificationChannel } from "./notification-template.js";

export type ProviderMessage = Readonly<{
  organizationId: string;
  recipientUserId: string;
  channel: NotificationChannel;
  subject: string | null;
  body: string;
}>;

/** Future email/WhatsApp adapters implement this port; credentials stay outside this module. */
export interface NotificationProviderPort {
  send(
    message: ProviderMessage,
  ): Promise<Readonly<{ providerMessageId: string }>>;
}

/** The only EF-305 provider implementation: deterministic fake in-app delivery. */
export class InAppFakeNotificationProvider implements NotificationProviderPort {
  async send(message: ProviderMessage): Promise<{ providerMessageId: string }> {
    return {
      providerMessageId: `fake-in-app:${message.organizationId}:${message.recipientUserId}`,
    };
  }
}
