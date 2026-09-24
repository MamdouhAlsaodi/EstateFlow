/**
 * EF-630 — finance catalog. `ar` is the source of truth; `en` must carry
 * every key (typechecked) and the runtime check lives in
 * `src/test/i18n.test.ts`.
 */

const ar = {
  "finance.formPendingAction": "جارٍ التنفيذ…",

  "finance.agingNotAuthorized": "لا تملك صلاحية عرض مستحقات هذه المؤسسة.",
  "finance.agingLoadFailed":
    "تعذر تحميل أعمار المستحقات. تحقق من الاتصال ثم أعد المحاولة.",
  "finance.agingBucketCurrent": "حالي",
  "finance.agingBucket1To30": "من يوم إلى 30 يومًا",
  "finance.agingBucket31To60": "من 31 إلى 60 يومًا",
  "finance.agingBucket61To90": "من 61 إلى 90 يومًا",
  "finance.agingBucket91Plus": "أكثر من 90 يومًا",
  "finance.receivableStatusOpen": "مفتوح",
  "finance.receivableStatusPartiallyPaid": "مدفوع جزئيًا",

  "finance.aging.serverRead": "قراءة من الخادم",
  "finance.aging.title": "أعمار المستحقات",
  "finance.aging.subtitle":
    "لا تُحذف الصفوف أو تتغير ماليًا قبل نجاح استجابة الخادم.",
  "finance.aging.refresh": "تحديث صريح",
  "finance.aging.asOfPrefix": "حتى",
  "finance.aging.loading": "جارٍ تحميل المستحقات…",
  "finance.aging.retry": "إعادة المحاولة",
  "finance.aging.empty": "لا توجد مستحقات مفتوحة حاليًا.",
  "finance.aging.loadingMore": "جارٍ تحميل الصفحة التالية…",
  "finance.aging.loadMore": "تحميل المزيد",
  "finance.aging.caption": "المستحقات مرتبة حسب أقرب موعد استحقاق",
  "finance.aging.thInvoice": "الفاتورة",
  "finance.aging.thOutstanding": "المبلغ المتبقي",
  "finance.aging.thStatus": "الحالة",
  "finance.aging.thBucket": "الفئة",
  "finance.aging.thDue": "الاستحقاق",
  "finance.aging.daysPastDue": "{days} days",
  "finance.aging.issuedPrefix": "issued",

  "finance.command.sessionExpired":
    "انتهت الجلسة. أعد التحقق ثم حاول مرة أخرى.",
  "finance.command.sessionExpiredRetry":
    "انتهت الجلسة. أعد التحقق ثم نفّذ الأمر مرة أخرى.",
  "finance.command.reauthButton": "إعادة التحقق من الجلسة",
  "finance.command.actionFailed":
    "تعذر تنفيذ الأمر. بقيت البيانات كما هي لتراجعها وتحاول مجددًا.",

  "finance.field.dealId": "معرّف الصفقة",
  "finance.field.amountMinor": "المبلغ بوحدة صغرى",
  "finance.field.currency": "العملة",
  "finance.field.category": "التصنيف",
  "finance.field.expenseId": "معرّف المصروف",
  "finance.stepIndex.1": "١",
  "finance.stepIndex.2": "٢",
  "finance.stepIndex.3": "٣",
  "finance.stepIndex.4": "٤",
  "finance.stepIndex.5": "٥",

  "finance.commission.eyebrow": "أوامر العمولات",
  "finance.commission.title": "مساحة أوامر العمولة",
  "finance.commission.subtitle":
    "تنفيذ أوامر محددة للمؤسسة الحالية، دون عرض أرصدة أو تقارير.",
  "finance.commission.planTitle": "إنشاء نسخة خطة العمولة",
  "finance.commission.versionLabel": "رقم النسخة",
  "finance.commission.rateLabel": "المعدل بالنقاط الأساسية",
  "finance.commission.rateHint": "(اختياري للخطة الافتراضية)",
  "finance.commission.brokerSplitLabel": "حصة الوسيط",
  "finance.commission.officeSplitLabel": "حصة المكتب",
  "finance.commission.planSubmit": "إنشاء الخطة",
  "finance.commission.valueTitle": "التقاط القيمة القابلة للعمولة",
  "finance.commission.capturedAtLabel": "وقت الالتقاط UTC",
  "finance.commission.valueSubmit": "التقاط القيمة",
  "finance.commission.accrualTitle": "إنشاء الاستحقاق المتوقع",
  "finance.commission.valueIdLabel": "معرّف القيمة القابلة للعمولة",
  "finance.commission.planIdLabel": "معرّف نسخة الخطة",
  "finance.commission.eventIdLabel": "معرّف حدث إغلاق الصفقة",
  "finance.commission.accrualSubmit": "إنشاء الاستحقاق",
  "finance.commission.planValidation": "تحقق من رقم النسخة ونسب التوزيع.",
  "finance.commission.valueValidation":
    "تحقق من معرّف الصفقة والمبلغ ووقت الالتقاط.",
  "finance.commission.accrualValidation":
    "تحقق من معرّفات الصفقة والقيمة والخطة والحدث.",
  "finance.commission.replayedNotice": "تمت إعادة تشغيل الأمر بنجاح.",
  "finance.commission.successNotice": "تم تنفيذ الأمر بنجاح.",
  "finance.commission.sessionExpired":
    "انتهت الجلسة. أعد التحقق ثم حاول مرة أخرى.",
  "finance.commission.actionFailed":
    "تعذر تنفيذ الأمر. راجع البيانات وحاول مرة أخرى.",

  "finance.receivable.eyebrow": "الفواتير والمستحقات",
  "finance.receivable.title": "مسار التحصيل",
  "finance.receivable.subtitle":
    "ثلاثة أوامر مالية واضحة للمؤسسة الحالية. كل مرحلة تعتمد على معرّفات مؤكدة، وتظهر أسفلها أدوات الإلغاء وقراءة أعمار المستحقات.",
  "finance.receivable.railAria": "مراحل التحصيل الثلاث",
  "finance.receivable.draftTitle": "إنشاء مسودة فاتورة",
  "finance.receivable.draftNote":
    "حدد الصفقة والمبلغ الصريح قبل تثبيت الفاتورة.",
  "finance.receivable.draftAction": "إنشاء المسودة",
  "finance.receivable.issueTitle": "إصدار الفاتورة",
  "finance.receivable.issueNote": "الإصدار يثبت المبلغ وينشئ مستحقًا واحدًا.",
  "finance.receivable.issueAction": "إصدار الفاتورة",
  "finance.receivable.paymentTitle": "تسجيل دفعة",
  "finance.receivable.paymentNote":
    "أعد المحاولة بأمان عند انقطاع الطلب؛ هوية الدفعة تبقى ثابتة حتى النجاح.",
  "finance.receivable.paymentAction": "تسجيل الدفعة",
  "finance.receivable.invoiceIdLabel": "معرّف الفاتورة",
  "finance.receivable.newReceivableIdLabel": "معرّف المستحق الجديد",
  "finance.receivable.issuedAtLabel": "وقت الإصدار UTC",
  "finance.receivable.dueAtLabel": "موعد الاستحقاق UTC",
  "finance.receivable.receivableIdLabel": "معرّف المستحق",
  "finance.receivable.recordedAtLabel": "وقت التسجيل UTC",
  "finance.receivable.draftValidation": "تحقق من معرّف الصفقة والمبلغ والعملة.",
  "finance.receivable.issueValidation":
    "تحقق من المعرّفات والتواريخ؛ موعد الاستحقاق لا يسبق الإصدار.",
  "finance.receivable.paymentValidation":
    "تحقق من معرّف المستحق والمبلغ والعملة ووقت التسجيل.",
  "finance.receivable.replayNotice":
    "الأمر مطابق لعملية سابقة؛ لم تُنشأ حركة مالية مكررة.",
  "finance.receivable.createdDraft": "أُنشئت مسودة الفاتورة.",
  "finance.receivable.issued": "أُصدرت الفاتورة وأُنشئ المستحق.",
  "finance.receivable.paymentRecorded": "سُجلت الدفعة دون تجاوز المستحق.",
  "finance.receivable.sessionExpired":
    "انتهت الجلسة. أعد التحقق ثم نفّذ الأمر مرة أخرى.",

  "finance.cancellation.eyebrow": "إجراء مضبوط",
  "finance.cancellation.title": "إلغاء فاتورة",
  "finance.cancellation.subtitle":
    "يقرر الخادم صلاحية الإلغاء. لا يمكن إلغاء فاتورة لها دفعة.",
  "finance.cancellation.invoiceLabel": "معرّف الفاتورة",
  "finance.cancellation.reasonLabel": "سبب الإلغاء",
  "finance.cancellation.cancelling": "جارٍ الإلغاء…",
  "finance.cancellation.submit": "إلغاء الفاتورة",
  "finance.cancellation.invoiceValidation": "تحقق من معرّف الفاتورة.",
  "finance.cancellation.reasonValidation": "أدخل سببًا من 1 إلى 500 حرفًا.",
  "finance.cancellation.success": "أُلغيت الفاتورة بنجاح دون تعديل أي دفعة.",
  "finance.cancellation.paidConflict": "لا يمكن إلغاء فاتورة عليها دفعة مالية.",
  "finance.cancellation.sessionExpired":
    "انتهت الجلسة أو لا تملك الصلاحية. أعد التحقق ثم حاول مجددًا.",
  "finance.cancellation.genericError":
    "تعذر إلغاء الفاتورة. بقي المعرّف والسبب كما هما لمحاولة آمنة.",

  "finance.expense.eyebrow": "المصروفات والمستندات",
  "finance.expense.title": "مسار المصروف",
  "finance.expense.subtitle":
    "خمسة أوامر مالية محصورة: مسودة بأبعاد الحملة والعقار والصفقة، إرفاق بيانات المستند المؤيد، إرسال للاعتماد وفق حد المؤسسة، قرار نهائي بموافقة مستقلة، وسياسة الحد التي يملكها المالك وحده.",
  "finance.expense.railAria": "مراحل المصروف الخمس",
  "finance.expense.draftTitle": "إنشاء مسودة مصروف",
  "finance.expense.draftNote":
    "حدد التصنيف والمرجع والأبعاد؛ المبلغ يبقى قابلًا للتعديل قبل الإرسال.",
  "finance.expense.draftAction": "إنشاء المسودة",
  "finance.expense.evidenceTitle": "إرفاق بيانات المستند",
  "finance.expense.evidenceNote":
    "بيانات وصفية فقط: النوع والحجم والوقت؛ لا تُرفع ملفات فعلية.",
  "finance.expense.evidenceAction": "إرفاق المستند",
  "finance.expense.submitTitle": "الإرسال للاعتماد",
  "finance.expense.submitNote":
    "ما دون حد المؤسسة يُعتمد تلقائيًا؛ وما فوقه ينتظر معتمدًا مستقلًا.",
  "finance.expense.submitAction": "إرسال المصروف",
  "finance.expense.decisionTitle": "قرار الاعتماد",
  "finance.expense.decisionNote":
    "المصروف المرسل يحتاج معتمدًا مختلفًا عن مُرسله؛ الرفض يتطلب سببًا.",
  "finance.expense.decisionAction": "تسجيل القرار",
  "finance.expense.policyTitle": "سياسة حد الاعتماد",
  "finance.expense.policyNote":
    "أمر للمالك فقط: حد بالوحدة الصغرى فوقه يلزم اعتماد مستقل؛ فراغه يعني اعتمادًا مستقلًا لكل مصروف.",
  "finance.expense.policyAction": "حفظ السياسة",
  "finance.expense.vendorLabel": "مرجع المورّد / المستفيد",
  "finance.expense.campaignRefLabel": "مرجع الحملة (اختياري)",
  "finance.expense.propertyIdLabel": "معرّف العقار (اختياري)",
  "finance.expense.dealIdLabel": "معرّف الصفقة (اختياري)",
  "finance.expense.evidenceIdLabel": "معرّف المستند",
  "finance.expense.mediaTypeLabel": "نوع المستند",
  "finance.expense.byteSizeLabel": "الحجم بالبايت",
  "finance.expense.noteLabel": "ملاحظة (اختياري)",
  "finance.expense.attachedAtLabel": "وقت الإرفاق UTC",
  "finance.expense.decisionLabel": "القرار",
  "finance.expense.decisionApprove": "اعتماد",
  "finance.expense.decisionReject": "رفض",
  "finance.expense.decisionReasonLabel": "سبب القرار (إلزامي عند الرفض)",
  "finance.expense.thresholdLabel": "حد الاعتماد بوحدة صغرى",
  "finance.expense.policyCurrencyLabel": "عملة الحد",
  "finance.expense.draftValidation":
    "تحقق من التصنيف والمرجع والمبلغ والعملة والأبعاد.",
  "finance.expense.evidenceValidation":
    "تحقق من معرّفات المصروف والمستند وحجمه ووقت الإرفاق.",
  "finance.expense.submitValidation": "أدخل معرّف مصروف صحيحًا للإرسال.",
  "finance.expense.decisionValidation":
    "اختر القرار الصحيح؛ الرفض يتطلب سببًا مكتوبًا.",
  "finance.expense.policyValidation":
    "تحقق من قيمة الحد والعملة؛ الحد الفارغ يعني اعتمادًا مستقلًا دائمًا.",
  "finance.expense.replayNotice":
    "الأمر مطابق لعملية سابقة؛ لم يتغير أي سجل مالي.",
  "finance.expense.createdDraft": "أُنشئت مسودة المصروف بأبعاده ومرجعه.",
  "finance.expense.evidenceAttached": "أُرفقت بيانات المستند المؤيد.",
  "finance.expense.submitted": "أُرسل المصروف للاعتماد وفق سياسة الحد.",
  "finance.expense.decisionRecorded": "سُجل قرار الاعتماد بشكل نهائي.",
  "finance.expense.policySaved": "حُفظت سياسة حد الاعتماد للمؤسسة.",
  "finance.expense.sessionExpired":
    "انتهت الجلسة. أعد التحقق ثم نفّذ الأمر مرة أخرى.",

  "finance.ownerBucket.CURRENT": "غير مستحق بعد",
  "finance.ownerBucket.DAYS_1_30": "متأخر ١–٣٠ يومًا",
  "finance.ownerBucket.DAYS_31_60": "متأخر ٣١–٦٠ يومًا",
  "finance.ownerBucket.DAYS_61_90": "متأخر ٦١–٩٠ يومًا",
  "finance.ownerBucket.DAYS_91_PLUS": "متأخر أكثر من ٩٠ يومًا",

  "finance.commissionStatus.EXPECTED": "متوقعة",
  "finance.commissionStatus.CONFIRMED": "مؤكدة",
  "finance.commissionStatus.DUE": "مستحقة",
  "finance.commissionStatus.PAID": "مدفوعة",
  "finance.commissionStatus.CANCELLED": "ملغاة",

  "finance.owner.loadFailed":
    "تعذر تحميل التقرير من الخادم. بقيت البيانات كما هي.",
  "finance.owner.actionFailed": "تعذر تنفيذ الطلب. حاول مرة أخرى.",
  "finance.owner.contractMismatch": "استجابة الخادم غير مطابقة للعقد المتوقع.",
  "finance.owner.eyebrow": "تقرير المالك — FIN-05",
  "finance.owner.title": "لوحة المالية للمالك",
  "finance.owner.subtitle":
    "أرقام للقراءة فقط من الخادم، مع طابع زمني لحداثة كل قراءة، وتفصيل لكل رقم حتى صفوفه الأصلية.",
  "finance.owner.refreshing": "جارٍ التحديث…",
  "finance.owner.refresh": "تحديث التقرير",
  "finance.owner.freshness": "حداثة القراءة:",
  "finance.owner.pressRefresh": "اضغط «تحديث التقرير» للعرض.",
  "finance.owner.pressRefreshCampaigns":
    "اضغط «تحديث التقرير» لعرض الإيراد والهامش حسب الحملة.",
  "finance.owner.cashFlowTitle": "التدفق النقدي",
  "finance.owner.cashFlowCaption": "المقبوضات والمدفوعات وصافي النقد لكل عملة",
  "finance.owner.inflows": "مقبوضات",
  "finance.owner.outflows": "مدفوعات",
  "finance.owner.netCash": "صافي النقد",
  "finance.owner.inflowsButton": "تفصيل المقبوضات",
  "finance.owner.inflowsDrillTitle": "تفصيل المقبوضات — صفوف الدفعات الأصلية",
  "finance.owner.outflowsButton": "تفصيل المدفوعات",
  "finance.owner.outflowsDrillTitle": "تفصيل المدفوعات — المصروفات المعتمدة",
  "finance.owner.agingTitle": "أعمار المستحقات",
  "finance.owner.noAging": "لا توجد مستحقات مفتوحة.",
  "finance.owner.agingCaption": "إجمالي المتبقي لكل فئة عمرية وعملة",
  "finance.owner.bucketDrillTitle": "تفصيل الفئة: {bucket}",
  "finance.owner.showRows": "عرض الصفوف",
  "finance.owner.commissionsTitle": "العمولات",
  "finance.owner.commissionsCaption": "العمولات المتوقعة والمستحقة والمدفوعة",
  "finance.owner.commissionDrillTitle": "تفصيل العمولات: {status}",
  "finance.owner.performanceTitle": "الإيراد والهامش",
  "finance.owner.byDeal": "حسب الصفقة",
  "finance.owner.noDealActivity": "لا توجد حركات على الصفقات.",
  "finance.owner.dealPaymentsButton": "مقبوضات {id}",
  "finance.owner.dealPaymentsTitle": "مقبوضات الصفقة {id}",
  "finance.owner.byProperty": "حسب العقار",
  "finance.owner.noPropertyActivity": "لا توجد حركات على العقارات.",
  "finance.owner.costsButton": "مصروفات {id}",
  "finance.owner.propertyCostsTitle": "مصروفات العقار {id}",
  "finance.owner.byCampaign": "حسب الحملة (EF-401)",
  "finance.owner.noCampaignActivity": "لا توجد حركات مُسندة لحملات بعد.",
  "finance.owner.campaignCostsTitle": "مصروفات الحملة {id} — {model}",
  "finance.owner.close": "إغلاق",
  "finance.owner.loading": "جارٍ التحميل…",

  "finance.th.item": "البند",
  "finance.th.bucket": "الفئة",
  "finance.th.currency": "العملة",
  "finance.th.count": "العدد",
  "finance.th.outstanding": "المتبقي",
  "finance.th.drill": "تفصيل",
  "finance.th.amount": "المبلغ",
  "finance.th.movementCount": "عدد الحركات",
  "finance.th.id": "المعرّف",
  "finance.th.revenue": "الإيراد",
  "finance.th.costs": "التكلفة",
  "finance.th.margin": "الهامش",

  "finance.head.paymentId": "معرّف الدفعة",
  "finance.head.expenseId": "معرّف المصروف",
  "finance.head.amount": "المبلغ",
  "finance.head.recordedAt": "وقت التسجيل",
  "finance.head.deal": "الصفقة",
  "finance.head.category": "الفئة",
  "finance.head.vendor": "الجهة",
  "finance.head.approvedAt": "وقت الاعتماد",
  "finance.head.amountDue": "المستحق",
  "finance.head.outstanding": "المتبقي",
  "finance.head.status": "الحالة",
  "finance.head.daysPastDue": "أيام متأخرة",
  "finance.head.dueDate": "الاستحقاق",
  "finance.head.splits": "النصيبان",
};

const en: Record<keyof typeof ar, string> = {
  "finance.formPendingAction": "Working…",

  "finance.agingNotAuthorized":
    "You are not authorized to view this organization's receivables aging.",
  "finance.agingLoadFailed":
    "Could not load receivables aging. Check the connection and try again.",
  "finance.agingBucketCurrent": "Current",
  "finance.agingBucket1To30": "1 to 30 days",
  "finance.agingBucket31To60": "31 to 60 days",
  "finance.agingBucket61To90": "61 to 90 days",
  "finance.agingBucket91Plus": "More than 90 days",
  "finance.receivableStatusOpen": "Open",
  "finance.receivableStatusPartiallyPaid": "Partially paid",

  "finance.aging.serverRead": "Read from the server",
  "finance.aging.title": "Receivables aging",
  "finance.aging.subtitle":
    "Rows are never deleted or financially altered before the server responds successfully.",
  "finance.aging.refresh": "Explicit refresh",
  "finance.aging.asOfPrefix": "As of",
  "finance.aging.loading": "Loading receivables…",
  "finance.aging.retry": "Retry",
  "finance.aging.empty": "No open receivables right now.",
  "finance.aging.loadingMore": "Loading the next page…",
  "finance.aging.loadMore": "Load more",
  "finance.aging.caption": "Receivables ordered by earliest due date",
  "finance.aging.thInvoice": "Invoice",
  "finance.aging.thOutstanding": "Outstanding amount",
  "finance.aging.thStatus": "Status",
  "finance.aging.thBucket": "Bucket",
  "finance.aging.thDue": "Due",
  "finance.aging.daysPastDue": "{days} days",
  "finance.aging.issuedPrefix": "issued",

  "finance.command.sessionExpired":
    "The session expired. Re-authenticate and try again.",
  "finance.command.sessionExpiredRetry":
    "The session expired. Re-authenticate and run the command again.",
  "finance.command.reauthButton": "Re-authenticate the session",
  "finance.command.actionFailed":
    "Could not run the command. The data stayed as it was for your review; try again.",

  "finance.field.dealId": "Deal ID",
  "finance.field.amountMinor": "Amount (minor units)",
  "finance.field.currency": "Currency",
  "finance.field.category": "Category",
  "finance.field.expenseId": "Expense ID",
  "finance.stepIndex.1": "1",
  "finance.stepIndex.2": "2",
  "finance.stepIndex.3": "3",
  "finance.stepIndex.4": "4",
  "finance.stepIndex.5": "5",

  "finance.commission.eyebrow": "Commission commands",
  "finance.commission.title": "Commission command workspace",
  "finance.commission.subtitle":
    "Run specific commands for the current organization, without balances or reports.",
  "finance.commission.planTitle": "Create a commission plan version",
  "finance.commission.versionLabel": "Version number",
  "finance.commission.rateLabel": "Rate in basis points",
  "finance.commission.rateHint": "(optional for the default plan)",
  "finance.commission.brokerSplitLabel": "Broker share",
  "finance.commission.officeSplitLabel": "Office share",
  "finance.commission.planSubmit": "Create the plan",
  "finance.commission.valueTitle": "Capture the commissionable value",
  "finance.commission.capturedAtLabel": "Captured at (UTC)",
  "finance.commission.valueSubmit": "Capture the value",
  "finance.commission.accrualTitle": "Create the expected accrual",
  "finance.commission.valueIdLabel": "Commissionable value ID",
  "finance.commission.planIdLabel": "Plan version ID",
  "finance.commission.eventIdLabel": "Deal-closed-won event ID",
  "finance.commission.accrualSubmit": "Create the accrual",
  "finance.commission.planValidation":
    "Check the version number and the split shares.",
  "finance.commission.valueValidation":
    "Check the deal ID, amount, and capture time.",
  "finance.commission.accrualValidation":
    "Check the deal, value, plan, and event IDs.",
  "finance.commission.replayedNotice": "The command replayed successfully.",
  "finance.commission.successNotice": "The command ran successfully.",
  "finance.commission.sessionExpired":
    "The session expired. Re-authenticate and try again.",
  "finance.commission.actionFailed":
    "Could not run the command. Review the data and try again.",

  "finance.receivable.eyebrow": "Invoices and receivables",
  "finance.receivable.title": "Collection flow",
  "finance.receivable.subtitle":
    "Three clear financial commands for the current organization. Every stage relies on confirmed IDs, with the cancellation and receivables-aging tools shown below.",
  "finance.receivable.railAria": "The three collection stages",
  "finance.receivable.draftTitle": "Create an invoice draft",
  "finance.receivable.draftNote":
    "Pick the deal and the explicit amount before fixing the invoice.",
  "finance.receivable.draftAction": "Create the draft",
  "finance.receivable.issueTitle": "Issue the invoice",
  "finance.receivable.issueNote":
    "Issuing fixes the amount and creates exactly one receivable.",
  "finance.receivable.issueAction": "Issue the invoice",
  "finance.receivable.paymentTitle": "Record a payment",
  "finance.receivable.paymentNote":
    "Retry safely if the request drops; the payment identity stays fixed until success.",
  "finance.receivable.paymentAction": "Record the payment",
  "finance.receivable.invoiceIdLabel": "Invoice ID",
  "finance.receivable.newReceivableIdLabel": "New receivable ID",
  "finance.receivable.issuedAtLabel": "Issued at (UTC)",
  "finance.receivable.dueAtLabel": "Due at (UTC)",
  "finance.receivable.receivableIdLabel": "Receivable ID",
  "finance.receivable.recordedAtLabel": "Recorded at (UTC)",
  "finance.receivable.draftValidation":
    "Check the deal ID, amount, and currency.",
  "finance.receivable.issueValidation":
    "Check the IDs and dates; the due date cannot precede the issue time.",
  "finance.receivable.paymentValidation":
    "Check the receivable ID, amount, currency, and recording time.",
  "finance.receivable.replayNotice":
    "The command matches an earlier operation; no duplicate financial movement was created.",
  "finance.receivable.createdDraft": "The invoice draft was created.",
  "finance.receivable.issued":
    "The invoice was issued and the receivable created.",
  "finance.receivable.paymentRecorded":
    "The payment was recorded without exceeding the receivable.",
  "finance.receivable.sessionExpired":
    "The session expired. Re-authenticate and run the command again.",

  "finance.cancellation.eyebrow": "A controlled action",
  "finance.cancellation.title": "Cancel an invoice",
  "finance.cancellation.subtitle":
    "The server decides the cancellation authority. An invoice with a payment cannot be cancelled.",
  "finance.cancellation.invoiceLabel": "Invoice ID",
  "finance.cancellation.reasonLabel": "Cancellation reason",
  "finance.cancellation.cancelling": "Cancelling…",
  "finance.cancellation.submit": "Cancel the invoice",
  "finance.cancellation.invoiceValidation": "Check the invoice ID.",
  "finance.cancellation.reasonValidation":
    "Enter a reason of 1 to 500 characters.",
  "finance.cancellation.success":
    "The invoice was cancelled successfully without altering any payment.",
  "finance.cancellation.paidConflict":
    "An invoice with a financial payment cannot be cancelled.",
  "finance.cancellation.sessionExpired":
    "The session expired or you lack the permission. Re-authenticate and try again.",
  "finance.cancellation.genericError":
    "Could not cancel the invoice. The ID and reason stayed as they were for a safe retry.",

  "finance.expense.eyebrow": "Expenses and documents",
  "finance.expense.title": "Expense flow",
  "finance.expense.subtitle":
    "Five bounded financial commands: a draft with campaign, property, and deal dimensions; attaching supporting document data; submitting for approval under the organization threshold; a final decision with independent approval; and the threshold policy owned by the owner alone.",
  "finance.expense.railAria": "The five expense stages",
  "finance.expense.draftTitle": "Create an expense draft",
  "finance.expense.draftNote":
    "Pick the category, reference, and dimensions; the amount stays editable before submission.",
  "finance.expense.draftAction": "Create the draft",
  "finance.expense.evidenceTitle": "Attach document data",
  "finance.expense.evidenceNote":
    "Metadata only: type, size, and time; no actual files are uploaded.",
  "finance.expense.evidenceAction": "Attach the document",
  "finance.expense.submitTitle": "Submit for approval",
  "finance.expense.submitNote":
    "Below the organization threshold it is approved automatically; above it an independent approver is required.",
  "finance.expense.submitAction": "Submit the expense",
  "finance.expense.decisionTitle": "Approval decision",
  "finance.expense.decisionNote":
    "A submitted expense needs an approver different from its submitter; rejection requires a reason.",
  "finance.expense.decisionAction": "Record the decision",
  "finance.expense.policyTitle": "Approval threshold policy",
  "finance.expense.policyNote":
    "Owner-only command: a minor-unit threshold above which independent approval is required; leaving it empty means independent approval for every expense.",
  "finance.expense.policyAction": "Save the policy",
  "finance.expense.vendorLabel": "Vendor / beneficiary reference",
  "finance.expense.campaignRefLabel": "Campaign reference (optional)",
  "finance.expense.propertyIdLabel": "Property ID (optional)",
  "finance.expense.dealIdLabel": "Deal ID (optional)",
  "finance.expense.evidenceIdLabel": "Document ID",
  "finance.expense.mediaTypeLabel": "Document type",
  "finance.expense.byteSizeLabel": "Size in bytes",
  "finance.expense.noteLabel": "Note (optional)",
  "finance.expense.attachedAtLabel": "Attached at (UTC)",
  "finance.expense.decisionLabel": "Decision",
  "finance.expense.decisionApprove": "Approve",
  "finance.expense.decisionReject": "Reject",
  "finance.expense.decisionReasonLabel":
    "Decision reason (mandatory on rejection)",
  "finance.expense.thresholdLabel": "Approval threshold (minor units)",
  "finance.expense.policyCurrencyLabel": "Threshold currency",
  "finance.expense.draftValidation":
    "Check the category, reference, amount, currency, and dimensions.",
  "finance.expense.evidenceValidation":
    "Check the expense and document IDs, its size, and the attachment time.",
  "finance.expense.submitValidation": "Enter a valid expense ID to submit.",
  "finance.expense.decisionValidation":
    "Choose a valid decision; rejection requires a written reason.",
  "finance.expense.policyValidation":
    "Check the threshold value and currency; an empty threshold always means independent approval.",
  "finance.expense.replayNotice":
    "The command matches an earlier operation; no financial record changed.",
  "finance.expense.createdDraft":
    "The expense draft was created with its dimensions and reference.",
  "finance.expense.evidenceAttached":
    "The supporting document data was attached.",
  "finance.expense.submitted":
    "The expense was submitted for approval under the threshold policy.",
  "finance.expense.decisionRecorded":
    "The approval decision was recorded permanently.",
  "finance.expense.policySaved":
    "The organization's approval threshold policy was saved.",
  "finance.expense.sessionExpired":
    "The session expired. Re-authenticate and run the command again.",

  "finance.ownerBucket.CURRENT": "Not yet due",
  "finance.ownerBucket.DAYS_1_30": "1–30 days late",
  "finance.ownerBucket.DAYS_31_60": "31–60 days late",
  "finance.ownerBucket.DAYS_61_90": "61–90 days late",
  "finance.ownerBucket.DAYS_91_PLUS": "More than 90 days late",

  "finance.commissionStatus.EXPECTED": "Expected",
  "finance.commissionStatus.CONFIRMED": "Confirmed",
  "finance.commissionStatus.DUE": "Due",
  "finance.commissionStatus.PAID": "Paid",
  "finance.commissionStatus.CANCELLED": "Cancelled",

  "finance.owner.loadFailed":
    "Could not load the report from the server. The data stayed as it was.",
  "finance.owner.actionFailed": "Could not run the request. Try again.",
  "finance.owner.contractMismatch":
    "The server response does not match the expected contract.",
  "finance.owner.eyebrow": "Owner report — FIN-05",
  "finance.owner.title": "Owner finance dashboard",
  "finance.owner.subtitle":
    "Read-only figures from the server, with a freshness timestamp for every read, and a drill-down from every number to its original rows.",
  "finance.owner.refreshing": "Refreshing…",
  "finance.owner.refresh": "Refresh the report",
  "finance.owner.freshness": "Read freshness:",
  "finance.owner.pressRefresh": "Press “Refresh the report” to view.",
  "finance.owner.pressRefreshCampaigns":
    "Press “Refresh the report” to view revenue and margin by campaign.",
  "finance.owner.cashFlowTitle": "Cash flow",
  "finance.owner.cashFlowCaption":
    "Inflows, outflows, and net cash per currency",
  "finance.owner.inflows": "Inflows",
  "finance.owner.outflows": "Outflows",
  "finance.owner.netCash": "Net cash",
  "finance.owner.inflowsButton": "Inflow drill-down",
  "finance.owner.inflowsDrillTitle":
    "Inflow drill-down — original payment rows",
  "finance.owner.outflowsButton": "Outflow drill-down",
  "finance.owner.outflowsDrillTitle": "Outflow drill-down — approved expenses",
  "finance.owner.agingTitle": "Receivables aging",
  "finance.owner.noAging": "No open receivables.",
  "finance.owner.agingCaption":
    "Outstanding total per aging bucket and currency",
  "finance.owner.bucketDrillTitle": "Bucket drill-down: {bucket}",
  "finance.owner.showRows": "View rows",
  "finance.owner.commissionsTitle": "Commissions",
  "finance.owner.commissionsCaption": "Expected, due, and paid commissions",
  "finance.owner.commissionDrillTitle": "Commission drill-down: {status}",
  "finance.owner.performanceTitle": "Revenue and margin",
  "finance.owner.byDeal": "By deal",
  "finance.owner.noDealActivity": "No activity on deals.",
  "finance.owner.dealPaymentsButton": "Payments {id}",
  "finance.owner.dealPaymentsTitle": "Deal payments {id}",
  "finance.owner.byProperty": "By property",
  "finance.owner.noPropertyActivity": "No activity on properties.",
  "finance.owner.costsButton": "Costs {id}",
  "finance.owner.propertyCostsTitle": "Property costs {id}",
  "finance.owner.byCampaign": "By campaign (EF-401)",
  "finance.owner.noCampaignActivity":
    "No activity attributed to campaigns yet.",
  "finance.owner.campaignCostsTitle": "Campaign costs {id} — {model}",
  "finance.owner.close": "Close",
  "finance.owner.loading": "Loading…",

  "finance.th.item": "Item",
  "finance.th.bucket": "Bucket",
  "finance.th.currency": "Currency",
  "finance.th.count": "Count",
  "finance.th.outstanding": "Outstanding",
  "finance.th.drill": "Drill-down",
  "finance.th.amount": "Amount",
  "finance.th.movementCount": "Movements",
  "finance.th.id": "ID",
  "finance.th.revenue": "Revenue",
  "finance.th.costs": "Costs",
  "finance.th.margin": "Margin",

  "finance.head.paymentId": "Payment ID",
  "finance.head.expenseId": "Expense ID",
  "finance.head.amount": "Amount",
  "finance.head.recordedAt": "Recorded at",
  "finance.head.deal": "Deal",
  "finance.head.category": "Category",
  "finance.head.vendor": "Vendor",
  "finance.head.approvedAt": "Approved at",
  "finance.head.amountDue": "Due amount",
  "finance.head.outstanding": "Outstanding",
  "finance.head.status": "Status",
  "finance.head.daysPastDue": "Days late",
  "finance.head.dueDate": "Due date",
  "finance.head.splits": "Split shares",
};

export const financeMessages = { ar, en };
