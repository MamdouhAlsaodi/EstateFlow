/**
 * EF-630 — admin console catalog. `ar` is the source of truth; `en` must
 * carry every key (typechecked) and the runtime check lives in
 * `src/test/i18n.test.ts`. Statuses, audit actions, and typed failure kinds
 * render as written Arabic; unknown values keep the raw typed code.
 */

const ar = {
  "admin.membership.PENDING": "بانتظار الموافقة",
  "admin.membership.ACTIVE": "نشط",
  "admin.membership.SUSPENDED": "موقوف",
  "admin.membership.REVOKED": "ملغى",

  "admin.listing.DRAFT": "مسودة",
  "admin.listing.PUBLISHED": "منشور",
  "admin.listing.ARCHIVED": "مؤرشف",

  "admin.moderation.PENDING": "بانتظار المراجعة",
  "admin.moderation.APPROVED": "معتمد",
  "admin.moderation.REJECTED": "مرفوض",
  "admin.moderation.TAKEN_DOWN": "خُفّض عن النشر",

  "admin.auditAction.BROKER_APPROVED": "اعتماد وسيب عقاري",
  "admin.auditAction.BROKER_SUSPENDED": "إيقاف وسيب عقاري",
  "admin.auditAction.BROKER_REINSTATED": "إعادة تفعيل وسيب عقاري",
  "admin.auditAction.LISTING_MODERATION_APPROVED": "اعتماد إعلان عقاري",
  "admin.auditAction.LISTING_MODERATION_REJECTED": "رفض إعلان عقاري",
  "admin.auditAction.LISTING_MODERATION_TAKEN_DOWN": "تخفيض إعلان عن النشر",

  "admin.auditTarget.MEMBERSHIP": "عضوية",
  "admin.auditTarget.LISTING": "إعلان عقاري",

  "admin.failure.action-executor-not-configured": "المنفّذ غير مُعدّ",
  "admin.failure.action-permanent-failure": "فشل دائم في التنفيذ",
  "admin.failure.action-transient-failure": "فشل مؤقت في التنفيذ",
  "admin.failure.unexpected-executor-error": "خطأ غير متوقع في المنفّذ",

  "admin.common.timeUnavailable": "وقت غير متاح",
  "admin.common.refresh": "تحديث",
  "admin.common.filters": "تصفية",
  "admin.common.organizationIdLabel": "معرّف المؤسسة (اختياري)",
  "admin.common.organizationIdPlaceholder": "اتركه فارغاً لكل المؤسسات",
  "admin.common.applyFilters": "تطبيق التصفية",
  "admin.common.loadNewer": "تحميل الأحدث",
  "admin.common.cancel": "إلغاء",
  "admin.common.pending": "جارٍ التنفيذ…",
  "admin.common.continue": "متابعة",
  "admin.common.reasonLabel": "السبب (إلزامي)",
  "admin.common.reasonInvalid": "السبب مطلوب ولا يتجاوز 500 حرف.",
  "admin.common.eyebrow": "لوحة الإدارة",
  "admin.common.stepUpAria": "إعادة تأكيد كلمة المرور",
  "admin.common.stepUpTitle": "إعادة تأكيد الهوية",

  "admin.stepUp.required": "أدخل كلمة المرور لإعادة التأكيد.",
  "admin.stepUp.wrongPassword": "كلمة المرور غير صحيحة. أعد المحاولة.",
  "admin.stepUp.genericError": "تعذر إعادة التأكيد الآن. حاول مرة أخرى.",
  "admin.stepUp.description":
    "هذا إجراء حسّاس: أعد تأكيد كلمة المرور قبل المتابعة. التأكيد صالح لدقائق معدودة على هذه الجلسة فقط.",
  "admin.stepUp.passwordLabel": "كلمة المرور",
  "admin.stepUp.confirm": "تأكيد",
  "admin.stepUp.confirming": "جارٍ التأكيد…",

  "admin.audit.title": "البحث في سجل الإدارة",
  "admin.audit.subtitle":
    "كل إجراءات الإدارة المميزة مسجّلة بشكل غير قابل للتعديل: الإجراء، الهدف، والسبب المعتمد. لا توجد حمولات خام ولا بيانات سرية.",
  "admin.audit.actionLabel": "الإجراء",
  "admin.audit.allActions": "كل الإجراءات",
  "admin.audit.searching": "جارٍ البحث…",
  "admin.audit.loadFailed": "تعذر البحث في السجل",
  "admin.audit.loadFailedHint": "تحقق من قيم التصفية ثم حاول مرة أخرى.",
  "admin.audit.results": "النتائج",
  "admin.audit.eventCount": "{count} حدث",
  "admin.audit.empty": "لا توجد أحداث مطابقة.",
  "admin.audit.targetTypePrefix": "النوع:",
  "admin.audit.orgPrefix": "المؤسسة:",
  "admin.audit.actorPrefix": "المنفّذ:",
  "admin.audit.targetPrefix": "الهدف:",
  "admin.audit.reasonPrefix": "السبب:",

  "admin.brokers.title": "الوسطاء العقاريون",
  "admin.brokers.subtitle":
    "طلبات انضمام الوسطاء في كل المؤسسات، وإدارة الإيقاف على مستوى المنصة.",
  "admin.brokers.loading": "جارٍ تحميل الطلبات…",
  "admin.brokers.loadFailed": "تعذر تحميل قائمة الوسطاء",
  "admin.brokers.loadFailedHint": "تحقق من الجلسة ثم حاول مرة أخرى.",
  "admin.brokers.approveFailed":
    "تعذر اعتماد الوسيط. تحقق من الجلسة وحاول مرة أخرى.",
  "admin.brokers.stepUpRequired":
    "يتطلب هذا الإجراء إعادة تأكيد كلمة المرور قبل التنفيذ.",
  "admin.brokers.decideFailed":
    "تعذر تنفيذ القرار. تأكد من كتابة السبب وحالة الوسيط ثم حاول مرة أخرى.",
  "admin.brokers.listTitle": "الوسطاء وحالاتهم",
  "admin.brokers.itemCount": "{count} عنصر",
  "admin.brokers.empty": "لا توجد طلبات أو وسطاء مطابقون حالياً.",
  "admin.brokers.statusPrefix": "الحالة:",
  "admin.brokers.requestPrefix": "طلب الانضمام:",
  "admin.brokers.approvedPrefix": "الاعتماد:",
  "admin.brokers.approve": "اعتماد",
  "admin.brokers.suspend": "إيقاف",
  "admin.brokers.reinstate": "إعادة التفعيل",
  "admin.brokers.suspendTitle": "إيقاف الوسيط على مستوى المنصة",
  "admin.brokers.reinstateTitle": "إعادة تفعيل الوسيط",
  "admin.brokers.suspendHint":
    "الإيقاف حسّاس: يُطلب السبب ثم إعادة تأكيد كلمة المرور، ويُسجَّل كل ذلك في سجل الإدارة.",
  "admin.brokers.reinstateHint":
    "اذكر سبب إعادة التفعيل؛ يُسجَّل في سجل الإدارة ولا يمكن تعديله.",

  "admin.jobs.title": "الوظائف الفاشلة والأتمتة",
  "admin.jobs.subtitle":
    "وظائف الأتمتة الفاشلة عبر كل المؤسسات مع أسباب الفشل المكتوبة وعدد المحاولات؛ بدون أي حمولات خام أو مفاتيح تنفيذ.",
  "admin.jobs.loading": "جارٍ تحميل الوظائف…",
  "admin.jobs.loadFailed": "تعذر تحميل الوظائف الفاشلة",
  "admin.jobs.loadFailedHint": "تحقق من قيم التصفية ثم حاول مرة أخرى.",
  "admin.jobs.listTitle": "وظائف فاشلة",
  "admin.jobs.jobCount": "{count} وظيفة",
  "admin.jobs.empty": "لا توجد وظائف فاشلة مطابقة.",
  "admin.jobs.typePrefix": "النوع:",
  "admin.jobs.orgPrefix": "المؤسسة:",
  "admin.jobs.attempt": "المحاولة {attempt}/{max}",
  "admin.jobs.failureReasonPrefix": "سبب الفشل:",

  "admin.moderation.title": "مراجعة الإعلانات",
  "admin.moderation.subtitle":
    "الإعلانات المنشورة في كل المؤسسات بانتظار المراجعة. الاعتماد يبقي الإعلان منشوراً، والرفض أو التخفيض يؤرشفه مع تسجيل السبب.",
  "admin.moderation.loading": "جارٍ تحميل قائمة المراجعة…",
  "admin.moderation.loadFailed": "تعذر تحميل قائمة المراجعة",
  "admin.moderation.loadFailedHint": "تحقق من الجلسة ثم حاول مرة أخرى.",
  "admin.moderation.approvedNotice": "تم اعتماد الإعلان.",
  "admin.moderation.rejectedNotice": "تم رفض الإعلان وأرشفته.",
  "admin.moderation.takedownNotice": "تم تخفيض الإعلان عن النشر وأرشفته.",
  "admin.moderation.stepUpRequired":
    "يتطلب تخفيض الإعلان إعادة تأكيد كلمة المرور قبل التنفيذ.",
  "admin.moderation.decideFailed":
    "تعذر تنفيذ قرار المراجعة. تأكد من حالة الإعلان والسبب ثم حاول مرة أخرى.",
  "admin.moderation.queueTitle": "قائمة المراجعة",
  "admin.moderation.itemCount": "{count} عنصر",
  "admin.moderation.empty": "لا توجد إعلانات بانتظار المراجعة. أحسنت!",
  "admin.moderation.publishedPrefix": "نُشر/أُنشئ:",
  "admin.moderation.updatedPrefix": "آخر تحديث:",
  "admin.moderation.previousReasonPrefix": "سبب سابق:",
  "admin.moderation.approve": "اعتماد",
  "admin.moderation.rejectOrTakedown": "رفض / تخفيض",
  "admin.moderation.decisionTitle": "قرار المراجعة",
  "admin.moderation.reject": "رفض وأرشفة",
  "admin.moderation.takedown": "تخفيض عن النشر",
};

const en: Record<keyof typeof ar, string> = {
  "admin.membership.PENDING": "Awaiting approval",
  "admin.membership.ACTIVE": "Active",
  "admin.membership.SUSPENDED": "Suspended",
  "admin.membership.REVOKED": "Revoked",

  "admin.listing.DRAFT": "Draft",
  "admin.listing.PUBLISHED": "Published",
  "admin.listing.ARCHIVED": "Archived",

  "admin.moderation.PENDING": "Awaiting review",
  "admin.moderation.APPROVED": "Approved",
  "admin.moderation.REJECTED": "Rejected",
  "admin.moderation.TAKEN_DOWN": "Taken down",

  "admin.auditAction.BROKER_APPROVED": "Broker approved",
  "admin.auditAction.BROKER_SUSPENDED": "Broker suspended",
  "admin.auditAction.BROKER_REINSTATED": "Broker reinstated",
  "admin.auditAction.LISTING_MODERATION_APPROVED": "Listing approved",
  "admin.auditAction.LISTING_MODERATION_REJECTED": "Listing rejected",
  "admin.auditAction.LISTING_MODERATION_TAKEN_DOWN": "Listing taken down",

  "admin.auditTarget.MEMBERSHIP": "Membership",
  "admin.auditTarget.LISTING": "Listing",

  "admin.failure.action-executor-not-configured": "Executor not configured",
  "admin.failure.action-permanent-failure": "Permanent execution failure",
  "admin.failure.action-transient-failure": "Transient execution failure",
  "admin.failure.unexpected-executor-error": "Unexpected executor error",

  "admin.common.timeUnavailable": "Time unavailable",
  "admin.common.refresh": "Refresh",
  "admin.common.filters": "Filters",
  "admin.common.organizationIdLabel": "Organization ID (optional)",
  "admin.common.organizationIdPlaceholder": "Leave empty for all organizations",
  "admin.common.applyFilters": "Apply filters",
  "admin.common.loadNewer": "Load newer",
  "admin.common.cancel": "Cancel",
  "admin.common.pending": "Working…",
  "admin.common.continue": "Continue",
  "admin.common.reasonLabel": "Reason (mandatory)",
  "admin.common.reasonInvalid": "A reason is required and must not exceed 500 characters.",
  "admin.common.eyebrow": "Admin console",
  "admin.common.stepUpAria": "Re-confirm password",
  "admin.common.stepUpTitle": "Identity re-confirmation",

  "admin.stepUp.required": "Enter the password to re-confirm.",
  "admin.stepUp.wrongPassword": "Incorrect password. Try again.",
  "admin.stepUp.genericError": "Could not re-confirm right now. Try again.",
  "admin.stepUp.description":
    "This is a sensitive action: re-confirm your password before continuing. The confirmation is valid for a few minutes on this session only.",
  "admin.stepUp.passwordLabel": "Password",
  "admin.stepUp.confirm": "Confirm",
  "admin.stepUp.confirming": "Confirming…",

  "admin.audit.title": "Admin audit search",
  "admin.audit.subtitle":
    "Every privileged administrative action is immutably recorded: the action, the target, and the recorded reason. No raw payloads and no secret data.",
  "admin.audit.actionLabel": "Action",
  "admin.audit.allActions": "All actions",
  "admin.audit.searching": "Searching…",
  "admin.audit.loadFailed": "Could not search the audit log",
  "admin.audit.loadFailedHint": "Check the filter values and try again.",
  "admin.audit.results": "Results",
  "admin.audit.eventCount": "{count} events",
  "admin.audit.empty": "No matching events.",
  "admin.audit.targetTypePrefix": "Type:",
  "admin.audit.orgPrefix": "Organization:",
  "admin.audit.actorPrefix": "Actor:",
  "admin.audit.targetPrefix": "Target:",
  "admin.audit.reasonPrefix": "Reason:",

  "admin.brokers.title": "Real-estate brokers",
  "admin.brokers.subtitle":
    "Broker join requests across all organizations, plus platform-level suspension management.",
  "admin.brokers.loading": "Loading requests…",
  "admin.brokers.loadFailed": "Could not load the brokers list",
  "admin.brokers.loadFailedHint": "Check the session and try again.",
  "admin.brokers.approveFailed":
    "Could not approve the broker. Check the session and try again.",
  "admin.brokers.stepUpRequired":
    "This action requires password re-confirmation before it runs.",
  "admin.brokers.decideFailed":
    "Could not apply the decision. Make sure the reason is written and the broker state is valid, then try again.",
  "admin.brokers.listTitle": "Brokers and their states",
  "admin.brokers.itemCount": "{count} items",
  "admin.brokers.empty": "No matching requests or brokers right now.",
  "admin.brokers.statusPrefix": "Status:",
  "admin.brokers.requestPrefix": "Join request:",
  "admin.brokers.approvedPrefix": "Approval:",
  "admin.brokers.approve": "Approve",
  "admin.brokers.suspend": "Suspend",
  "admin.brokers.reinstate": "Reinstate",
  "admin.brokers.suspendTitle": "Platform-level broker suspension",
  "admin.brokers.reinstateTitle": "Broker reinstatement",
  "admin.brokers.suspendHint":
    "Suspension is sensitive: a reason is required, then password re-confirmation, and all of it is recorded in the admin audit log.",
  "admin.brokers.reinstateHint":
    "State the reinstatement reason; it is recorded in the admin audit log and cannot be edited.",

  "admin.jobs.title": "Failed jobs and automation",
  "admin.jobs.subtitle":
    "Failed automation jobs across all organizations with written failure reasons and attempt counts; no raw payloads or execution keys.",
  "admin.jobs.loading": "Loading jobs…",
  "admin.jobs.loadFailed": "Could not load failed jobs",
  "admin.jobs.loadFailedHint": "Check the filter values and try again.",
  "admin.jobs.listTitle": "Failed jobs",
  "admin.jobs.jobCount": "{count} jobs",
  "admin.jobs.empty": "No matching failed jobs.",
  "admin.jobs.typePrefix": "Type:",
  "admin.jobs.orgPrefix": "Organization:",
  "admin.jobs.attempt": "Attempt {attempt}/{max}",
  "admin.jobs.failureReasonPrefix": "Failure reason:",

  "admin.moderation.title": "Listing review",
  "admin.moderation.subtitle":
    "Published listings across all organizations awaiting review. Approval keeps a listing public; rejection or takedown archives it with a recorded reason.",
  "admin.moderation.loading": "Loading the review queue…",
  "admin.moderation.loadFailed": "Could not load the review queue",
  "admin.moderation.loadFailedHint": "Check the session and try again.",
  "admin.moderation.approvedNotice": "The listing was approved.",
  "admin.moderation.rejectedNotice": "The listing was rejected and archived.",
  "admin.moderation.takedownNotice": "The listing was taken down and archived.",
  "admin.moderation.stepUpRequired":
    "Taking down a listing requires password re-confirmation before it runs.",
  "admin.moderation.decideFailed":
    "Could not apply the moderation decision. Make sure the listing state and reason are valid, then try again.",
  "admin.moderation.queueTitle": "Review queue",
  "admin.moderation.itemCount": "{count} items",
  "admin.moderation.empty": "No listings awaiting review. Well done!",
  "admin.moderation.publishedPrefix": "Published/created:",
  "admin.moderation.updatedPrefix": "Last update:",
  "admin.moderation.previousReasonPrefix": "Previous reason:",
  "admin.moderation.approve": "Approve",
  "admin.moderation.rejectOrTakedown": "Reject / takedown",
  "admin.moderation.decisionTitle": "Moderation decision",
  "admin.moderation.reject": "Reject and archive",
  "admin.moderation.takedown": "Take down",
};

export const adminMessages = { ar, en };
