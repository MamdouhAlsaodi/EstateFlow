import { ApiError } from "../../lib/api-client/index";

/**
 * EF-306 — Arabic error mapping for automation rule/job actions. Pure so the
 * authority-matrix wording is testable without a browser.
 */

export type AutomationActionError = Readonly<{
  kind: "forbidden" | "stale" | "missing" | "session" | "error";
  message: string;
}>;

export function getAutomationActionError(
  error: unknown,
): AutomationActionError {
  if (error instanceof ApiError) {
    if (error.status === 401 || error.status === 403)
      return {
        kind: "forbidden",
        message: "غير مصرّح: هذه الإجراءات متاحة لصاحب المؤسسة أو المدير فقط.",
      };
    if (error.status === 404)
      return {
        kind: "missing",
        message: "العنصر غير موجود في هذه المؤسسة.",
      };
    if (error.status === 409)
      return {
        kind: "stale",
        message: "تغيرت حالة الوظيفة؛ تم تحديث القائمة بدون تنفيذ مكرر.",
      };
  }
  return {
    kind: "error",
    message: "تعذر تنفيذ الإجراء. تحقق من الجلسة ثم حاول مرة أخرى.",
  };
}
