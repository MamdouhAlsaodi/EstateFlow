/**
 * EF-306 — Arabic-first presentation labels for automation jobs and typed
 * reasons. Pure data so tests can assert the exact wording and the views stay
 * free of inline conditional Arabic.
 */

import type { AutomationJobStatus } from "./automation-contract";

export const jobStatusLabels: Record<AutomationJobStatus, string> = {
  QUEUED: "في الانتظار",
  RUNNING: "قيد التنفيذ",
  RETRYING: "إعادة محاولة",
  SUCCEEDED: "نجحت",
  FAILED: "فاشلة",
  CANCELLED: "ملغاة",
};

export const jobErrorKindLabels: Record<string, string> = {
  "action-executor-not-configured": "المنفذ غير مهيأ",
  "action-permanent-failure": "فشل دائم",
  "action-transient-failure": "فشل مؤقت",
  "unexpected-executor-error": "خطأ غير متوقع",
};

export const jobTriggerKindLabels: Record<string, string> = {
  DOMAIN_EVENT: "حدث",
  SCHEDULE: "جدول يومي",
};

export const jobActionLabels: Record<string, string> = {
  CREATE_LEAD_TASK: "إنشاء مهمة",
  CREATE_INTERNAL_NOTIFICATION: "إشعار داخلي",
  ADD_LEAD_TIMELINE_NOTE: "إضافة ملاحظة للسجل",
};

export const jobTargetLabels: Record<string, string> = {
  LEAD: "عميل",
  RECEIVABLE: "ذمة مدينة",
  COMMISSION: "عمولة",
  RULE_SELF: "القاعدة",
};

export const conditionOperatorLabels: Record<string, string> = {
  equals: "يساوي",
  not_equals: "لا يساوي",
  in: "ضمن",
  not_in: "خارج",
  is_empty: "فارغ",
  is_not_empty: "غير فارغ",
};

/** Retry is offered only for terminally failed jobs — never for successes. */
export function canRetryAutomationJob(status: AutomationJobStatus): boolean {
  return status === "FAILED";
}

/** Cancel is offered only for jobs that have not started running yet. */
export function canCancelAutomationJob(status: AutomationJobStatus): boolean {
  return status === "QUEUED" || status === "RETRYING";
}
