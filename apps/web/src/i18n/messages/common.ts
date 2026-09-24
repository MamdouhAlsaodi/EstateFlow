/**
 * EF-630 — shared catalog: metadata, app shell, error/loading/not-found
 * states, the platform-admin landing, and the EF-105 design-system demo.
 * `ar` is the source of truth; `en` must carry every key (typechecked).
 */

const ar = {
  "meta.title": "EstateFlow | منصة تشغيل العقار",
  "meta.description":
    "واجهة EstateFlow العربية التجريبية لإدارة عمليات العقار.",

  "shell.skipToContent": "تجاوز إلى المحتوى",
  "shell.brandAria": "EstateFlow، العودة إلى النموذج",
  "shell.envBadge": "نموذج تجريبي",
  "shell.notificationsAria": "فتح الإشعارات",
  "shell.accountMenuAria": "فتح قائمة الحساب",
  "shell.avatarInitial": "م",
  "shell.mainNavAria": "التنقل الرئيسي",
  "shell.workspaceLabel": "مساحة المالك",
  "shell.navOverview": "نظرة عامة",
  "shell.navLeads": "الاستفسارات",
  "shell.navProperties": "العقارات",
  "shell.navFinance": "الصفقات والمال",
  "shell.navTasks": "المهام والمتابعة",
  "shell.sidebarNoteTitle": "واجهة الأساس",
  "shell.sidebarNoteBody": "بيانات توضيحية فقط، بلا اتصال تشغيلي.",

  "notFound.title": "هذه الصفحة غير موجودة",
  "notFound.description":
    "قد يكون الرابط غير صحيح أو أن هذه القدرة لم تُبنَ بعد.",
  "notFound.backHome": "العودة إلى نموذج الواجهة",

  "error.eyebrow": "تعذر تحميل الواجهة",
  "error.title": "لم نتمكن من عرض هذه الصفحة الآن",
  "error.description":
    "جرّب إعادة المحاولة. إذا استمرت المشكلة، راجع حالة الخدمة قبل إدخال أي بيانات.",
  "error.retry": "إعادة المحاولة",

  "loading.aria": "جارٍ تحميل الواجهة",

  "adminLanding.eyebrow": "منصة إستيت فلو",
  "adminLanding.title": "لوحة الإدارة",
  "adminLanding.intro":
    "سطح الإدارة على مستوى المنصة: اعتماد الوسطاء والإيقاف، مراجعة الإعلانات، البحث في سجل الإدارة، ومراجعة الوظائف الفاشلة. الإجراءات الحساسة تتطلب سبباً وإعادة تأكيد كلمة المرور، وكلها مسجّلة.",
  "adminLanding.sectionsTitle": "الأقسام",
  "adminLanding.brokersTitle": "الوسطاء العقاريون",
  "adminLanding.brokersDescription":
    "طلبات الانضمام بانتظار الموافقة، وإيقاف أو إعادة تفعيل وسيط على مستوى المنصة.",
  "adminLanding.listingsTitle": "مراجعة الإعلانات",
  "adminLanding.listingsDescription":
    "قائمة الإعلانات المنشورة بانتظار المراجعة: اعتماد أو رفض أو تخفيض عن النشر بسبب مُسجَّل.",
  "adminLanding.auditTitle": "سجل الإدارة",
  "adminLanding.auditDescription":
    "بحث محدود النطاق في كل الإجراءات الإدارية المسجّلة بشكل غير قابل للتعديل.",
  "adminLanding.jobsTitle": "الوظائف الفاشلة",
  "adminLanding.jobsDescription":
    "مراجعة وظائف الأتمتة الفاشلة عبر كل المؤسسات مع أسباب الفشل المكتوبة.",

  "demo.eyebrow": "مكتبة الواجهة · EF-105",
  "demo.title": "أساس عملي لعمليات العقار",
  "demo.description":
    "هذا ليس Dashboard جاهزًا؛ بل لغة واجهة عربية موحّدة للمال والمتابعة والعقار قبل بناء workflows الحقيقية.",
  "demo.demoAction": "إجراء تجريبي",
  "demo.metricsAria": "مؤشرات مختصرة",
  "demo.metricCashLabel": "النقد المتاح",
  "demo.metricCashValue": "126,400 ر.س",
  "demo.metricCashNote": "تحديث توضيحي · اليوم",
  "demo.metricCommissionsLabel": "عمولات قيد التحصيل",
  "demo.metricCommissionsValue": "42,600 ر.س",
  "demo.metricCommissionsNote": "↑ 12% من الشهر السابق",
  "demo.metricSlaLabel": "مهام SLA اليوم",
  "demo.metricSlaValue": "08",
  "demo.metricSlaNote": "4 تحتاج متابعة قبل 16:00",
  "demo.componentsAria": "عناصر نظام التصميم",
  "demo.tableEyebrow": "جدول توضيحي",
  "demo.tableTitle": "قائمة الاستفسارات",
  "demo.tableCount": "3 عناصر",
  "demo.theadClient": "العميل",
  "demo.theadProperty": "العقار",
  "demo.theadStage": "المرحلة",
  "demo.theadValue": "القيمة المتوقعة",
  "demo.statusEyebrow": "الحالات",
  "demo.statusTitle": "إشارات لا تعتمد على اللون وحده",
  "demo.formEyebrow": "النماذج",
  "demo.formTitle": "حقل واضح قبل أي workflow",
  "demo.noteLabel": "ملاحظة متابعة",
  "demo.notePlaceholder": "اكتب ملخصًا قصيرًا للتواصل القادم",
  "demo.saveDemo": "حفظ تجريبي",
  "demo.cancel": "إلغاء",
  "demo.statesAria": "حالات الواجهة",
  "demo.emptyTitle": "حالة فارغة",
  "demo.emptyBody":
    "لا توجد معاينات مجدولة. أضف معاينة عندما يصبح workflow جاهزًا.",
  "demo.emptyAction": "عرض المبدأ",
  "demo.errorTitle": "رسالة خطأ واضحة",
  "demo.errorBody":
    "تعذر حفظ التعديل. تحقق من الحقول المطلوبة ثم أعد المحاولة.",
  "demo.statusDueSoon": "مستحقات قريبة",
  "demo.statusFollowupsToday": "متابعات اليوم",
  "demo.statusAwaitingDecision": "بانتظار قرار",
  "demo.leadStageAwaitingCall": "بانتظار الاتصال",
  "demo.leadStageViewingConfirmed": "معاينة مؤكدة",
  "demo.leadStageOfferReview": "عرض قيد المراجعة",
  "common.listSeparator": "، ",
};

const en: Record<keyof typeof ar, string> = {
  "meta.title": "EstateFlow | Real-estate Operations Platform",
  "meta.description":
    "EstateFlow's Arabic-first demo interface for real-estate operations.",

  "shell.skipToContent": "Skip to content",
  "shell.brandAria": "EstateFlow, back to the demo",
  "shell.envBadge": "Demo environment",
  "shell.notificationsAria": "Open notifications",
  "shell.accountMenuAria": "Open account menu",
  "shell.avatarInitial": "M",
  "shell.mainNavAria": "Main navigation",
  "shell.workspaceLabel": "Owner workspace",
  "shell.navOverview": "Overview",
  "shell.navLeads": "Inquiries",
  "shell.navProperties": "Properties",
  "shell.navFinance": "Deals & finance",
  "shell.navTasks": "Tasks & follow-up",
  "shell.sidebarNoteTitle": "Foundation UI",
  "shell.sidebarNoteBody":
    "Illustrative data only, not connected to live operations.",

  "notFound.title": "Page not found",
  "notFound.description":
    "The link may be incorrect, or this capability has not been built yet.",
  "notFound.backHome": "Back to the demo interface",

  "error.eyebrow": "The interface failed to load",
  "error.title": "We could not display this page right now",
  "error.description":
    "Try again. If the problem persists, check service status before entering any data.",
  "error.retry": "Retry",

  "loading.aria": "Loading the interface",

  "adminLanding.eyebrow": "EstateFlow platform",
  "adminLanding.title": "Admin console",
  "adminLanding.intro":
    "Platform-level administration: broker approval and suspension, listing review, admin audit search, and failed-job review. Sensitive actions require a reason and password re-confirmation, and all of them are audited.",
  "adminLanding.sectionsTitle": "Sections",
  "adminLanding.brokersTitle": "Real-estate brokers",
  "adminLanding.brokersDescription":
    "Join requests awaiting approval, plus platform-level broker suspension or reinstatement.",
  "adminLanding.listingsTitle": "Listing review",
  "adminLanding.listingsDescription":
    "Published listings awaiting review: approve, reject, or take down with a recorded reason.",
  "adminLanding.auditTitle": "Admin audit log",
  "adminLanding.auditDescription":
    "Bounded search across every immutably recorded administrative action.",
  "adminLanding.jobsTitle": "Failed jobs",
  "adminLanding.jobsDescription":
    "Review failed automation jobs across all organizations with written failure reasons.",

  "demo.eyebrow": "UI library · EF-105",
  "demo.title": "A practical foundation for real-estate operations",
  "demo.description":
    "This is not a ready-made dashboard; it is a unified Arabic UI language for finance, follow-up, and property workflows before the real workflows are built.",
  "demo.demoAction": "Demo action",
  "demo.metricsAria": "Brief metrics",
  "demo.metricCashLabel": "Available cash",
  "demo.metricCashValue": "SAR 126,400",
  "demo.metricCashNote": "Illustrative update · today",
  "demo.metricCommissionsLabel": "Commissions being collected",
  "demo.metricCommissionsValue": "SAR 42,600",
  "demo.metricCommissionsNote": "↑ 12% from last month",
  "demo.metricSlaLabel": "SLA tasks today",
  "demo.metricSlaValue": "08",
  "demo.metricSlaNote": "4 need follow-up before 16:00",
  "demo.componentsAria": "Design system components",
  "demo.tableEyebrow": "Sample table",
  "demo.tableTitle": "Inquiry list",
  "demo.tableCount": "3 items",
  "demo.theadClient": "Client",
  "demo.theadProperty": "Property",
  "demo.theadStage": "Stage",
  "demo.theadValue": "Expected value",
  "demo.statusEyebrow": "Statuses",
  "demo.statusTitle": "Signals that do not rely on color alone",
  "demo.formEyebrow": "Forms",
  "demo.formTitle": "A clear field before any workflow",
  "demo.noteLabel": "Follow-up note",
  "demo.notePlaceholder": "Write a short summary for the next contact",
  "demo.saveDemo": "Demo save",
  "demo.cancel": "Cancel",
  "demo.statesAria": "Interface states",
  "demo.emptyTitle": "Empty state",
  "demo.emptyBody":
    "No viewings scheduled. Add a viewing when the workflow is ready.",
  "demo.emptyAction": "View the principle",
  "demo.errorTitle": "A clear error message",
  "demo.errorBody":
    "Could not save the edit. Check the required fields and try again.",
  "demo.statusDueSoon": "Due soon",
  "demo.statusFollowupsToday": "Today's follow-ups",
  "demo.statusAwaitingDecision": "Awaiting decision",
  "demo.leadStageAwaitingCall": "Awaiting call",
  "demo.leadStageViewingConfirmed": "Viewing confirmed",
  "demo.leadStageOfferReview": "Offer under review",
  "common.listSeparator": ", ",
};

export const commonMessages = { ar, en };
