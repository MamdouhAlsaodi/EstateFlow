/**
 * EF-401/EF-630 — campaign label maps hold translation-catalog keys; the
 * written Arabic/English text lives in
 * `src/i18n/messages/campaigns.ts`. Pure data so tests can assert the exact
 * catalog wording.
 */

import type { MessageKey } from "../../i18n";
import type {
  CampaignChannel,
  CampaignStatus,
  TouchChannel,
} from "./campaign-contract";

export const campaignStatusLabels: Record<CampaignStatus, MessageKey> = {
  DRAFT: "campaigns.status.DRAFT",
  ACTIVE: "campaigns.status.ACTIVE",
  COMPLETED: "campaigns.status.COMPLETED",
  CANCELLED: "campaigns.status.CANCELLED",
};

export const campaignChannelLabels: Record<CampaignChannel, MessageKey> = {
  META: "campaigns.channel.META",
  GOOGLE: "campaigns.channel.GOOGLE",
  SNAPCHAT: "campaigns.channel.SNAPCHAT",
  TIKTOK: "campaigns.channel.TIKTOK",
  X: "campaigns.channel.X",
  LINKEDIN: "campaigns.channel.LINKEDIN",
  PRINT: "campaigns.channel.PRINT",
  OUTDOOR: "campaigns.channel.OUTDOOR",
  REFERRAL: "campaigns.channel.REFERRAL",
  OTHER: "campaigns.channel.OTHER",
};

export const touchChannelLabels: Record<TouchChannel, MessageKey> = {
  WEBSITE: "campaigns.touch.WEBSITE",
  WHATSAPP: "campaigns.touch.WHATSAPP",
  PHONE_CALL: "campaigns.touch.PHONE_CALL",
  WALK_IN: "campaigns.touch.WALK_IN",
  REFERRAL: "campaigns.touch.REFERRAL",
  META: "campaigns.channel.META",
  GOOGLE: "campaigns.channel.GOOGLE",
  SNAPCHAT: "campaigns.channel.SNAPCHAT",
  TIKTOK: "campaigns.channel.TIKTOK",
  X: "campaigns.channel.X",
  OTHER: "campaigns.channel.OTHER",
};

export const attributionModelLabels: Record<
  "FIRST_TOUCH" | "LAST_TOUCH",
  MessageKey
> = {
  FIRST_TOUCH: "campaigns.attribution.FIRST_TOUCH",
  LAST_TOUCH: "campaigns.attribution.LAST_TOUCH",
};
