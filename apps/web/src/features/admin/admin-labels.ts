/**
 * EF-620 — Arabic labels for the admin console. Statuses, audit actions, and
 * typed failure kinds render as written Arabic; unknown values keep the raw
 * typed code so nothing is ever invented.
 */

import type { AdminAuditAction } from "./admin-contract";

export const MEMBERSHIP_STATUS_LABELS: Readonly<Record<string, string>> = {
  PENDING: "بانتظار الموافقة",
  ACTIVE: "نشط",
  SUSPENDED: "موقوف",
  REVOKED: "ملغى",
};

export const LISTING_STATUS_LABELS: Readonly<Record<string, string>> = {
  DRAFT: "مسودة",
  PUBLISHED: "منشور",
  ARCHIVED: "مؤرشف",
};

export const MODERATION_STATUS_LABELS: Readonly<Record<string, string>> = {
  PENDING: "بانتظار المراجعة",
  APPROVED: "معتمد",
  REJECTED: "مرفوض",
  TAKEN_DOWN: "خُفّض عن النشر",
};

export const AUDIT_ACTION_LABELS: Readonly<Record<AdminAuditAction, string>> = {
  BROKER_APPROVED: "اعتماد وسيب عقاري",
  BROKER_SUSPENDED: "إيقاف وسيب عقاري",
  BROKER_REINSTATED: "إعادة تفعيل وسيب عقاري",
  LISTING_MODERATION_APPROVED: "اعتماد إعلان عقاري",
  LISTING_MODERATION_REJECTED: "رفض إعلان عقاري",
  LISTING_MODERATION_TAKEN_DOWN: "تخفيض إعلان عن النشر",
};

export const AUDIT_TARGET_LABELS: Readonly<Record<string, string>> = {
  MEMBERSHIP: "عضوية",
  LISTING: "إعلان عقاري",
};

export const FAILURE_KIND_LABELS: Readonly<Record<string, string>> = {
  "action-executor-not-configured": "المنفّذ غير مُعدّ",
  "action-permanent-failure": "فشل دائم في التنفيذ",
  "action-transient-failure": "فشل مؤقت في التنفيذ",
  "unexpected-executor-error": "خطأ غير متوقع في المنفّذ",
};

export function labelFrom(
  labels: Readonly<Record<string, string>>,
  value: string | null | undefined,
): string {
  if (!value) return "غير متاح";
  return labels[value] ?? value;
}
