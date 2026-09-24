/**
 * EF-402/EF-630 — content label maps hold translation-catalog keys; the
 * written Arabic/English text lives in `src/i18n/messages/content.ts`.
 * Pure data so tests can assert the exact catalog wording.
 */

import type { MessageKey, Translator } from "../../i18n";
import type {
  ContentChannel,
  ContentFailureKind,
  ContentStatus,
  GenerationSlot,
} from "./content-contract";

export const contentStatusLabels: Record<ContentStatus, MessageKey> = {
  IDEA: "content.status.IDEA",
  DRAFT: "content.status.DRAFT",
  REVIEW: "content.status.REVIEW",
  APPROVED: "content.status.APPROVED",
  SCHEDULED: "content.status.SCHEDULED",
  PUBLISHED: "content.status.PUBLISHED",
  FAILED: "content.status.FAILED",
};

export const contentChannelLabels: Record<ContentChannel, MessageKey> = {
  INSTAGRAM: "content.channel.INSTAGRAM",
  X: "content.channel.X",
  SNAPCHAT: "content.channel.SNAPCHAT",
  TIKTOK: "content.channel.TIKTOK",
  LINKEDIN: "content.channel.LINKEDIN",
  FACEBOOK: "content.channel.FACEBOOK",
  WHATSAPP: "content.channel.WHATSAPP",
  EMAIL: "content.channel.EMAIL",
  WEBSITE: "content.channel.WEBSITE",
  OTHER: "content.channel.OTHER",
};

export const contentFailureKindLabels: Record<ContentFailureKind, MessageKey> =
  {
    CHANNEL_REJECTED: "content.failure.CHANNEL_REJECTED",
    CHANNEL_TIMEOUT: "content.failure.CHANNEL_TIMEOUT",
    CONTENT_POLICY_VIOLATION: "content.failure.CONTENT_POLICY_VIOLATION",
    SCHEDULE_MISSED: "content.failure.SCHEDULE_MISSED",
    OTHER: "content.failure.OTHER",
  };

/** One-line description of each lifecycle state for the detail view. */
export const contentStatusHints: Record<ContentStatus, MessageKey> = {
  IDEA: "content.hint.IDEA",
  DRAFT: "content.hint.DRAFT",
  REVIEW: "content.hint.REVIEW",
  APPROVED: "content.hint.APPROVED",
  SCHEDULED: "content.hint.SCHEDULED",
  PUBLISHED: "content.hint.PUBLISHED",
  FAILED: "content.hint.FAILED",
};

/**
 * EF-403 — presentation for the generation flow: the missing-fact slot
 * labels and the provenance stamp wording resolved through the catalog.
 */
export const generationSlotLabels: Record<GenerationSlot, MessageKey> = {
  PRICE: "content.slot.PRICE",
  AREA: "content.slot.AREA",
  BEDROOMS: "content.slot.BEDROOMS",
  BATHROOMS: "content.slot.BATHROOMS",
};

export const generationPanelIntroKey: MessageKey = "content.generation.intro";

export const generationProvenanceLabel = (
  t: Translator,
  templateId: string,
  templateVersion: number,
  propertyVersion: number,
): string =>
  t("content.generation.provenance", {
    templateId,
    templateVersion,
    propertyVersion,
  });
