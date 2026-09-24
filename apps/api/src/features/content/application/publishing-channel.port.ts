/**
 * EF-404 — publishing channel port, mirroring the EF-305
 * NotificationProviderPort pattern: one explicit interface, deterministic
 * fake implementations only. Real portal/social APIs, credentials, and HTTP
 * calls stay outside this module until a future packet approves an official
 * channel adapter.
 */

import type { ContentChannel, ContentFailureKind } from "../domain/content.js";
import type { PublishingShareBundle } from "../domain/publishing.js";

export type PublishingDeliveryRequest = Readonly<{
  organizationId: string;
  contentItemId: string;
  approvedVersion: number;
  channel: ContentChannel;
  /** The exact approved share bundle (copy + UTM link) to deliver. */
  bundle: PublishingShareBundle;
}>;

export type PublishingDeliveryOutcome =
  | Readonly<{ kind: "delivered"; providerMessageId: string }>
  | Readonly<{
      kind: "rejected";
      failureKind: ContentFailureKind;
      reason: string;
    }>;

/**
 * The boundary every channel adapter implements. Implementations must be
 * deterministic in demo/training mode and must never require credentials.
 */
export interface PublishingChannelPort {
  deliver(
    request: PublishingDeliveryRequest,
  ): Promise<PublishingDeliveryOutcome>;
}

/**
 * The only EF-404 channel adapter shipped in this packet: a deterministic
 * in-memory fake network. It records every delivery for inspection (tests,
 * demos) and derives a stable provider message id from the occurrence
 * identity, so the same request always resolves to the same receipt.
 */
export class InMemoryRecordingPublishingAdapter implements PublishingChannelPort {
  private readonly deliveries: RecordedPublishingDelivery[] = [];

  async deliver(
    request: PublishingDeliveryRequest,
  ): Promise<PublishingDeliveryOutcome> {
    const receipt: RecordedPublishingDelivery = Object.freeze({
      organizationId: request.organizationId,
      contentItemId: request.contentItemId,
      approvedVersion: request.approvedVersion,
      channel: request.channel,
      providerMessageId: `fake-publish:${request.channel}:${request.organizationId}:${request.contentItemId}:v${request.approvedVersion}`,
    });
    this.deliveries.push(receipt);
    return { kind: "delivered", providerMessageId: receipt.providerMessageId };
  }

  /** Observed deliveries, oldest first (in-memory only, never persisted). */
  recordedDeliveries(): readonly RecordedPublishingDelivery[] {
    return this.deliveries;
  }

  reset(): void {
    this.deliveries.length = 0;
  }
}

export type RecordedPublishingDelivery = Readonly<{
  organizationId: string;
  contentItemId: string;
  approvedVersion: number;
  channel: ContentChannel;
  providerMessageId: string;
}>;
