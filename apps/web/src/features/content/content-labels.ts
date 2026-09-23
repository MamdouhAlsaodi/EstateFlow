/**
 * EF-402 — Arabic-first presentation labels for the content lifecycle,
 * channels, and typed failure kinds. Pure data so tests can assert the exact
 * wording.
 */

import type {
  ContentChannel,
  ContentFailureKind,
  ContentStatus,
} from "./content-contract";

export const contentStatusLabels: Record<ContentStatus, string> = {
  IDEA: "فكرة",
  DRAFT: "مسودة",
  REVIEW: "قيد المراجعة",
  APPROVED: "معتمد",
  SCHEDULED: "مجدول",
  PUBLISHED: "منشور",
  FAILED: "فشل النشر",
};

export const contentChannelLabels: Record<ContentChannel, string> = {
  INSTAGRAM: "إنستغرام",
  X: "إكس",
  SNAPCHAT: "سناب شات",
  TIKTOK: "تيك توك",
  LINKEDIN: "لينكد إن",
  FACEBOOK: "فيسبوك",
  WHATSAPP: "واتساب",
  EMAIL: "بريد إلكتروني",
  WEBSITE: "الموقع",
  OTHER: "أخرى",
};

export const contentFailureKindLabels: Record<ContentFailureKind, string> = {
  CHANNEL_REJECTED: "رفض القناة",
  CHANNEL_TIMEOUT: "انتهاء المهلة",
  CONTENT_POLICY_VIOLATION: "مخالفة سياسة المحتوى",
  SCHEDULE_MISSED: "فوّت الموعد",
  OTHER: "سبب آخر",
};

/** One-line Arabic description of each lifecycle state for the detail view. */
export const contentStatusHints: Record<ContentStatus, string> = {
  IDEA: "فكرة أولية قابلة للتحرير قبل صياغة المحتوى.",
  DRAFT: "مسودة قابلة للتحرير حتى إرسالها للمراجعة.",
  REVIEW: "مقفلة في قائمة المراجعة حتى الاعتماد أو الإعادة.",
  APPROVED: "محتوى معتمد ومقفول بنسخة وبصمة hash.",
  SCHEDULED: "موعد النشر والقناة مسجلان؛ التنفيذ الفعلي في EF-404.",
  PUBLISHED: "محتوى منشور غير قابل لأي تعديل أو حذف.",
  FAILED: "فشل النشر بسبب موثق؛ يمكن إعادته للمراجعة أو إنشاء نسخة منقحة.",
};
