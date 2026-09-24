/**
 * EF-630 — campaigns catalog. `ar` is the source of truth; `en` must carry
 * every key (typechecked) and the runtime check lives in
 * `src/test/i18n.test.ts`.
 */

const ar = {
  "campaigns.budgetProgressAria": "تقدم الميزانية",
  "campaigns.budgetPlannedOnly":
    "المخطط: {plannedMinor} {currency} — لا مصروفات معتمدة بعد",
  "campaigns.budgetOver":
    "تجاوز الميزانية: {actualMinor} من {plannedMinor} {currency}",
  "campaigns.budgetSpent":
    "المصروف: {actualMinor} من {plannedMinor} {currency} ({percent}%)",

  "campaigns.status.DRAFT": "مسودة",
  "campaigns.status.ACTIVE": "نشطة",
  "campaigns.status.COMPLETED": "مكتملة",
  "campaigns.status.CANCELLED": "ملغاة",

  "campaigns.channel.META": "ميتا",
  "campaigns.channel.GOOGLE": "جوجل",
  "campaigns.channel.SNAPCHAT": "سناب شات",
  "campaigns.channel.TIKTOK": "تيك توك",
  "campaigns.channel.X": "إكس",
  "campaigns.channel.LINKEDIN": "لينكد إن",
  "campaigns.channel.PRINT": "مطبوعات",
  "campaigns.channel.OUTDOOR": "لوحات خارجية",
  "campaigns.channel.REFERRAL": "إحالات",
  "campaigns.channel.OTHER": "أخرى",

  "campaigns.touch.WEBSITE": "الموقع",
  "campaigns.touch.WHATSAPP": "واتساب",
  "campaigns.touch.PHONE_CALL": "مكالمة",
  "campaigns.touch.WALK_IN": "زيارة ميدانية",
  "campaigns.touch.REFERRAL": "إحالة",

  "campaigns.attribution.FIRST_TOUCH": "أول لمسة",
  "campaigns.attribution.LAST_TOUCH": "آخر لمسة",

  "campaigns.list.loadFailed": "تعذر تحميل الحملات من الخادم. حاول مرة أخرى.",
  "campaigns.list.validation":
    "تحقق من الحقول: الاسم، الهدف، التواريخ UTC، والميزانية.",
  "campaigns.list.createFailed":
    "تعذر إنشاء الحملة. تحقق من صلاحياتك وحاول مجددًا.",
  "campaigns.list.eyebrow": "EF-401 — الحملات والإسناد",
  "campaigns.list.title": "الحملات التسويقية",
  "campaigns.list.subtitle":
    "الميزانية المخططة مقابل الفعلية من المصروفات المعتمدة المرتبطة بالحملة، مع عدد لمسات العملاء المرتبطة.",
  "campaigns.list.loading": "جارٍ التحميل…",
  "campaigns.list.refresh": "تحديث القائمة",
  "campaigns.list.sectionTitle": "قائمة الحملات",
  "campaigns.list.pressRefresh": "اضغط «تحديث القائمة» للعرض.",
  "campaigns.list.empty": "لا توجد حملات بعد.",
  "campaigns.list.morePages":
    "توجد حملات إضافية — استخدم تصفية الحالة لتضييق القائمة.",
  "campaigns.list.createTitle": "حملة جديدة",
  "campaigns.list.nameLabel": "الاسم",
  "campaigns.list.objectiveLabel": "الهدف",
  "campaigns.list.channelLabel": "القناة",
  "campaigns.list.startsLabel": "البداية (UTC)",
  "campaigns.list.endsLabel": "النهاية (UTC)",
  "campaigns.list.budgetLabel": "الميزانية المخططة (أصغر وحدة)",
  "campaigns.list.currencyLabel": "العملة",
  "campaigns.list.creating": "جارٍ الإنشاء…",
  "campaigns.list.create": "إنشاء الحملة",
  "campaigns.list.touches": "لمسات مرتبطة: {count}",
  "campaigns.analytics.title": "ملخص تحليلات التسويق",
  "campaigns.analytics.noBudgets": "لا توجد ميزانيات حملات بعد.",
  "campaigns.analytics.touches": "اللمسات",
  "campaigns.analytics.firstTouchLeads": "عملاء أول لمسة",
  "campaigns.analytics.lastTouchLeads": "عملاء آخر لمسة",
  "campaigns.analytics.attributedWins": "الفوز المنسوب",
  "campaigns.analytics.lastUpdatePrefix": "آخر تحديث:",
  "campaigns.analytics.publishedByChannel": "منشور {channel}:",

  "campaigns.detail.loadFailed": "تعذر تحميل الحملة من الخادم.",
  "campaigns.detail.actionFailed":
    "تعذر تنفيذ الأمر. تحقق من الصلاحيات والبيانات ثم حاول مجددًا.",
  "campaigns.detail.attributionLookupFailed":
    "تعذر جلب إسناد العميل. تحقق من المعرّف.",
  "campaigns.detail.eyebrow": "EF-401 — تفاصيل الحملة",
  "campaigns.detail.fallbackTitle": "تفاصيل الحملة",
  "campaigns.detail.loading": "جارٍ التحميل…",
  "campaigns.detail.refresh": "تحديث",
  "campaigns.detail.pressRefresh": "اضغط «تحديث» لعرض الحملة.",
  "campaigns.detail.budgetTitle": "الميزانية",
  "campaigns.detail.spendByCurrencyCaption": "المصروفات المعتمدة حسب العملة",
  "campaigns.detail.thCurrency": "العملة",
  "campaigns.detail.thExpenseCount": "عدد المصروفات",
  "campaigns.detail.thTotal": "الإجمالي",
  "campaigns.detail.correctedBudgetLabel": "ميزانية مصححة (أصغر وحدة)",
  "campaigns.detail.reasonLabel": "سبب التصحيح (إلزامي)",
  "campaigns.detail.correctBudget": "تسجيل تصحيح ميزانية",
  "campaigns.detail.analyticsTitle": "تحليلات الحملة",
  "campaigns.detail.touches": "اللمسات",
  "campaigns.detail.firstTouch": "أول لمسة",
  "campaigns.detail.lastTouch": "آخر لمسة",
  "campaigns.detail.leadsPerQualified": "{leads} عملاء / {qualified} مؤهل",
  "campaigns.detail.attributedWins": "الفوز المنسوب",
  "campaigns.detail.dataUpdatedPrefix": "تحديث البيانات:",
  "campaigns.detail.publishedByChannel": "منشور {channel}:",
  "campaigns.detail.lifecycleTitle": "دورة الحياة",
  "campaigns.detail.currentStatusPrefix": "الحالة الحالية:",
  "campaigns.detail.activate": "تنشيط",
  "campaigns.detail.complete": "إكمال",
  "campaigns.detail.cancelRequiresReason": "الإلغاء يتطلب سببًا مكتوبًا أعلاه",
  "campaigns.detail.cancel": "إلغاء (بسبب إلزامي)",
  "campaigns.detail.correctionsTitle":
    "تصحيحات الميزانية (سجل غير قابل للتغيير)",
  "campaigns.detail.entriesTitle": "أداء القناة (إدخال يدوي)",
  "campaigns.detail.entriesEmpty": "لا توجد إدخالات أداء بعد.",
  "campaigns.detail.entriesCaption":
    "انطباعات ونقرات وعملاء لكل إدخال يدوي — المال يبقى في المصروفات المعتمدة فقط",
  "campaigns.detail.thTime": "الوقت",
  "campaigns.detail.thImpressions": "انطباعات",
  "campaigns.detail.thClicks": "نقرات",
  "campaigns.detail.thLeads": "عملاء",
  "campaigns.detail.thNote": "ملاحظة",
  "campaigns.detail.attributionTitle": "الإسناد (أول/آخر لمسة)",
  "campaigns.detail.attributionIntro":
    "اعرض إسناد عميل عبر أول لمسة وآخر لمسة، أو صحّح الحملة المسند إليها بسبب موثق.",
  "campaigns.detail.leadIdLabel": "معرّف العميل (Lead)",
  "campaigns.detail.showAttribution": "عرض الإسناد",
  "campaigns.detail.correctAttributionTitle":
    "التصحيح يتطلب سببًا مكتوبًا في لوحة الميزانية",
  "campaigns.detail.attributeToCampaign": "إسناد هذا العميل إلى هذه الحملة",
  "campaigns.detail.correctedAttributionPrefix": "إسناد مصحح:",
  "campaigns.detail.noAttributedTouch": "لا توجد لمسة مُسندة لحملة.",
};

const en: Record<keyof typeof ar, string> = {
  "campaigns.budgetProgressAria": "Budget progress",
  "campaigns.budgetPlannedOnly":
    "Planned: {plannedMinor} {currency} — no approved expenses yet",
  "campaigns.budgetOver":
    "Over budget: {actualMinor} of {plannedMinor} {currency}",
  "campaigns.budgetSpent":
    "Spent: {actualMinor} of {plannedMinor} {currency} ({percent}%)",

  "campaigns.status.DRAFT": "Draft",
  "campaigns.status.ACTIVE": "Active",
  "campaigns.status.COMPLETED": "Completed",
  "campaigns.status.CANCELLED": "Cancelled",

  "campaigns.channel.META": "Meta",
  "campaigns.channel.GOOGLE": "Google",
  "campaigns.channel.SNAPCHAT": "Snapchat",
  "campaigns.channel.TIKTOK": "TikTok",
  "campaigns.channel.X": "X",
  "campaigns.channel.LINKEDIN": "LinkedIn",
  "campaigns.channel.PRINT": "Print",
  "campaigns.channel.OUTDOOR": "Outdoor boards",
  "campaigns.channel.REFERRAL": "Referrals",
  "campaigns.channel.OTHER": "Other",

  "campaigns.touch.WEBSITE": "Website",
  "campaigns.touch.WHATSAPP": "WhatsApp",
  "campaigns.touch.PHONE_CALL": "Phone call",
  "campaigns.touch.WALK_IN": "Walk-in",
  "campaigns.touch.REFERRAL": "Referral",

  "campaigns.attribution.FIRST_TOUCH": "First touch",
  "campaigns.attribution.LAST_TOUCH": "Last touch",

  "campaigns.list.loadFailed":
    "Could not load campaigns from the server. Please try again.",
  "campaigns.list.validation":
    "Check the fields: name, objective, UTC dates, and budget.",
  "campaigns.list.createFailed":
    "Could not create the campaign. Check your permissions and try again.",
  "campaigns.list.eyebrow": "EF-401 — Campaigns and attribution",
  "campaigns.list.title": "Marketing campaigns",
  "campaigns.list.subtitle":
    "Planned versus actual budget from approved campaign expenses, with linked lead touch counts.",
  "campaigns.list.loading": "Loading…",
  "campaigns.list.refresh": "Refresh list",
  "campaigns.list.sectionTitle": "Campaign list",
  "campaigns.list.pressRefresh": "Press “Refresh list” to view.",
  "campaigns.list.empty": "No campaigns yet.",
  "campaigns.list.morePages":
    "More campaigns exist — use the status filter to narrow the list.",
  "campaigns.list.createTitle": "New campaign",
  "campaigns.list.nameLabel": "Name",
  "campaigns.list.objectiveLabel": "Objective",
  "campaigns.list.channelLabel": "Channel",
  "campaigns.list.startsLabel": "Start (UTC)",
  "campaigns.list.endsLabel": "End (UTC)",
  "campaigns.list.budgetLabel": "Planned budget (minor units)",
  "campaigns.list.currencyLabel": "Currency",
  "campaigns.list.creating": "Creating…",
  "campaigns.list.create": "Create campaign",
  "campaigns.list.touches": "Linked touches: {count}",
  "campaigns.analytics.title": "Marketing analytics summary",
  "campaigns.analytics.noBudgets": "No campaign budgets yet.",
  "campaigns.analytics.touches": "Touches",
  "campaigns.analytics.firstTouchLeads": "First-touch leads",
  "campaigns.analytics.lastTouchLeads": "Last-touch leads",
  "campaigns.analytics.attributedWins": "Attributed wins",
  "campaigns.analytics.lastUpdatePrefix": "Last update:",
  "campaigns.analytics.publishedByChannel": "Published {channel}:",

  "campaigns.detail.loadFailed": "Could not load the campaign from the server.",
  "campaigns.detail.actionFailed":
    "Could not run the command. Check the permissions and data, then try again.",
  "campaigns.detail.attributionLookupFailed":
    "Could not fetch the lead attribution. Check the ID.",
  "campaigns.detail.eyebrow": "EF-401 — Campaign details",
  "campaigns.detail.fallbackTitle": "Campaign details",
  "campaigns.detail.loading": "Loading…",
  "campaigns.detail.refresh": "Refresh",
  "campaigns.detail.pressRefresh": "Press “Refresh” to view the campaign.",
  "campaigns.detail.budgetTitle": "Budget",
  "campaigns.detail.spendByCurrencyCaption": "Approved expenses by currency",
  "campaigns.detail.thCurrency": "Currency",
  "campaigns.detail.thExpenseCount": "Expenses",
  "campaigns.detail.thTotal": "Total",
  "campaigns.detail.correctedBudgetLabel": "Corrected budget (minor units)",
  "campaigns.detail.reasonLabel": "Correction reason (mandatory)",
  "campaigns.detail.correctBudget": "Record budget correction",
  "campaigns.detail.analyticsTitle": "Campaign analytics",
  "campaigns.detail.touches": "Touches",
  "campaigns.detail.firstTouch": "First touch",
  "campaigns.detail.lastTouch": "Last touch",
  "campaigns.detail.leadsPerQualified": "{leads} leads / {qualified} qualified",
  "campaigns.detail.attributedWins": "Attributed wins",
  "campaigns.detail.dataUpdatedPrefix": "Data as of:",
  "campaigns.detail.publishedByChannel": "Published {channel}:",
  "campaigns.detail.lifecycleTitle": "Lifecycle",
  "campaigns.detail.currentStatusPrefix": "Current status:",
  "campaigns.detail.activate": "Activate",
  "campaigns.detail.complete": "Complete",
  "campaigns.detail.cancelRequiresReason":
    "Cancelling requires a written reason above",
  "campaigns.detail.cancel": "Cancel (reason mandatory)",
  "campaigns.detail.correctionsTitle": "Budget corrections (immutable log)",
  "campaigns.detail.entriesTitle": "Channel performance (manual entry)",
  "campaigns.detail.entriesEmpty": "No performance entries yet.",
  "campaigns.detail.entriesCaption":
    "Impressions, clicks, and leads per manual entry — money stays in approved expenses only",
  "campaigns.detail.thTime": "Time",
  "campaigns.detail.thImpressions": "Impressions",
  "campaigns.detail.thClicks": "Clicks",
  "campaigns.detail.thLeads": "Leads",
  "campaigns.detail.thNote": "Note",
  "campaigns.detail.attributionTitle": "Attribution (first/last touch)",
  "campaigns.detail.attributionIntro":
    "View a lead's attribution via first and last touch, or correct the attributed campaign with a documented reason.",
  "campaigns.detail.leadIdLabel": "Lead ID",
  "campaigns.detail.showAttribution": "Show attribution",
  "campaigns.detail.correctAttributionTitle":
    "Correction requires a written reason in the budget panel",
  "campaigns.detail.attributeToCampaign":
    "Attribute this lead to this campaign",
  "campaigns.detail.correctedAttributionPrefix": "Corrected attribution:",
  "campaigns.detail.noAttributedTouch": "No campaign-attributed touch.",
};

export const campaignsMessages = { ar, en };
