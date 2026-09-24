/**
 * EF-630 — viewings catalog. `ar` is the source of truth; `en` must carry
 * every key (typechecked) and the runtime check lives in
 * `src/test/i18n.test.ts`.
 */

const ar = {
  "viewings.status.REQUESTED": "قيد الطلب",
  "viewings.status.CONFIRMED": "مؤكدة",
  "viewings.status.CANCELLED": "ملغاة",
  "viewings.status.COMPLETED": "مكتملة",
  "viewings.status.NO_SHOW": "لم يحضر",

  "viewings.reminder.REMINDER_24H": "تذكير قبل 24 ساعة",
  "viewings.reminder.REMINDER_1H": "تذكير قبل ساعة",
  "viewings.reminder.OUTCOME_REQUEST": "طلب تسجيل النتيجة",

  "viewings.list.loadFailed": "تعذر تحميل جدول المعاينات.",
  "viewings.list.conflict": "هذا الموعد يتعارض مع معاينة مؤكدة أخرى.",
  "viewings.list.actionFailed":
    "تعذر تنفيذ الإجراء. تحقق من الحالة والصلاحيات.",
  "viewings.list.requiredFields":
    "أدخل معرّفات العميل والعقار والوسيط والوقت UTC.",
  "viewings.list.eyebrow": "EF-501 — المواعيد والتوافر",
  "viewings.list.title": "معاينات هذا الأسبوع",
  "viewings.list.subtitle":
    "الأوقات محفوظة كـ UTC، ولا يحجز وقت الوسيط إلا الموعد المؤكد.",
  "viewings.list.refresh": "تحديث الأسبوع",
  "viewings.list.pending": "جارٍ التنفيذ…",
  "viewings.list.calendarTitle": "اليوم / الأسبوع",
  "viewings.list.loading": "جارٍ التحميل…",
  "viewings.list.empty": "لا توجد معاينات في هذا الأسبوع.",
  "viewings.list.requestTitle": "طلب معاينة",
  "viewings.list.leadIdLabel": "معرّف العميل",
  "viewings.list.propertyIdLabel": "معرّف العقار",
  "viewings.list.brokerIdLabel": "معرّف الوسيط",
  "viewings.list.startLabel": "البداية UTC",
  "viewings.list.endLabel": "النهاية UTC",
  "viewings.list.submit": "إرسال طلب المعاينة",
  "viewings.list.brokerPrefix": "الوسيط:",
  "viewings.list.leadPrefix": "العميل:",
  "viewings.list.detailsLink": "تفاصيل والتذكيرات",
  "viewings.list.actionConfirm": "تأكيد",
  "viewings.list.actionCancel": "إلغاء",
  "viewings.list.actionComplete": "إتمام",
  "viewings.list.actionNoShow": "لم يحضر",

  "viewings.detail.loadFailed": "تعذر تحميل تفاصيل المعاينة.",
  "viewings.detail.loading": "جارٍ تحميل التفاصيل…",
  "viewings.detail.eyebrow": "EF-502 — أتمتة المعاينة",
  "viewings.detail.title": "تفاصيل المعاينة والتذكيرات",
  "viewings.detail.statusPrefix": "الحالة:",
  "viewings.detail.brokerPrefix": "الوسيط:",
  "viewings.detail.leadPrefix": "العميل:",
  "viewings.detail.backToList": "العودة إلى جدول المعاينات",
  "viewings.detail.remindersTitle": "التذكيرات القادمة",
  "viewings.detail.remindersEmpty":
    "لا توجد تذكيرات معلقة. قد تكون المعاينة ملغاة أو اكتملت.",
};

const en: Record<keyof typeof ar, string> = {
  "viewings.status.REQUESTED": "Requested",
  "viewings.status.CONFIRMED": "Confirmed",
  "viewings.status.CANCELLED": "Cancelled",
  "viewings.status.COMPLETED": "Completed",
  "viewings.status.NO_SHOW": "No-show",

  "viewings.reminder.REMINDER_24H": "24-hour reminder",
  "viewings.reminder.REMINDER_1H": "1-hour reminder",
  "viewings.reminder.OUTCOME_REQUEST": "Outcome request",

  "viewings.list.loadFailed": "Could not load the viewing schedule.",
  "viewings.list.conflict":
    "This slot conflicts with another confirmed viewing.",
  "viewings.list.actionFailed":
    "Could not perform the action. Check the status and permissions.",
  "viewings.list.requiredFields":
    "Enter the client, property, and broker IDs plus the UTC times.",
  "viewings.list.eyebrow": "EF-501 — Schedules and availability",
  "viewings.list.title": "This week's viewings",
  "viewings.list.subtitle":
    "Times are stored as UTC, and only a confirmed viewing reserves the broker's time.",
  "viewings.list.refresh": "Refresh week",
  "viewings.list.pending": "Working…",
  "viewings.list.calendarTitle": "Day / week",
  "viewings.list.loading": "Loading…",
  "viewings.list.empty": "No viewings this week.",
  "viewings.list.requestTitle": "Request a viewing",
  "viewings.list.leadIdLabel": "Client ID",
  "viewings.list.propertyIdLabel": "Property ID",
  "viewings.list.brokerIdLabel": "Broker ID",
  "viewings.list.startLabel": "Start (UTC)",
  "viewings.list.endLabel": "End (UTC)",
  "viewings.list.submit": "Submit viewing request",
  "viewings.list.brokerPrefix": "Broker:",
  "viewings.list.leadPrefix": "Client:",
  "viewings.list.detailsLink": "Details & reminders",
  "viewings.list.actionConfirm": "Confirm",
  "viewings.list.actionCancel": "Cancel",
  "viewings.list.actionComplete": "Complete",
  "viewings.list.actionNoShow": "No-show",

  "viewings.detail.loadFailed": "Could not load the viewing details.",
  "viewings.detail.loading": "Loading details…",
  "viewings.detail.eyebrow": "EF-502 — Viewing automation",
  "viewings.detail.title": "Viewing details and reminders",
  "viewings.detail.statusPrefix": "Status:",
  "viewings.detail.brokerPrefix": "Broker:",
  "viewings.detail.leadPrefix": "Client:",
  "viewings.detail.backToList": "Back to the viewing schedule",
  "viewings.detail.remindersTitle": "Upcoming reminders",
  "viewings.detail.remindersEmpty":
    "No pending reminders. The viewing may be cancelled or completed.",
};

export const viewingsMessages = { ar, en };
