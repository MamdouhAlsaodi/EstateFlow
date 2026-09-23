/**
 * EF-401 — Arabic-first presentation labels for campaigns, lifecycle states,
 * channels, and attribution. Pure data so tests can assert the exact wording.
 */

import type {
  CampaignChannel,
  CampaignStatus,
  TouchChannel,
} from "./campaign-contract";

export const campaignStatusLabels: Record<CampaignStatus, string> = {
  DRAFT: "مسودة",
  ACTIVE: "نشطة",
  COMPLETED: "مكتملة",
  CANCELLED: "ملغاة",
};

export const campaignChannelLabels: Record<CampaignChannel, string> = {
  META: "ميتا",
  GOOGLE: "جوجل",
  SNAPCHAT: "سناب شات",
  TIKTOK: "تيك توك",
  X: "إكس",
  LINKEDIN: "لينكد إن",
  PRINT: "مطبوعات",
  OUTDOOR: "لوحات خارجية",
  REFERRAL: "إحالات",
  OTHER: "أخرى",
};

export const touchChannelLabels: Record<TouchChannel, string> = {
  WEBSITE: "الموقع",
  WHATSAPP: "واتساب",
  PHONE_CALL: "مكالمة",
  WALK_IN: "زيارة ميدانية",
  REFERRAL: "إحالة",
  META: "ميتا",
  GOOGLE: "جوجل",
  SNAPCHAT: "سناب شات",
  TIKTOK: "تيك توك",
  X: "إكس",
  OTHER: "أخرى",
};

export const attributionModelLabels: Record<
  "FIRST_TOUCH" | "LAST_TOUCH",
  string
> = {
  FIRST_TOUCH: "أول لمسة",
  LAST_TOUCH: "آخر لمسة",
};
