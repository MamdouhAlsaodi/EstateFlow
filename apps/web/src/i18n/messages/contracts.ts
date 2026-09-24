/**
 * EF-630 — contracts catalog. `ar` is the source of truth; `en` must carry
 * every key (typechecked) and the runtime check lives in
 * `src/test/i18n.test.ts`.
 *
 * `contracts.esignDisclaimer` is also the API protocol sentinel: the
 * contract payloads must carry this exact operational e-sign text, so
 * `contracts-contract.ts` reads the Arabic source of truth from here.
 */

const ar = {
  "contracts.esignDisclaimer":
    "توقيع تشغيلي مبسّط — ليس توقيعًا قانونيًا معتمدًا",

  "contracts.status.DRAFT": "قيد التوقيع",
  "contracts.status.FINALIZED": "مكتمل التوقيع",
  "contracts.status.VOID": "ملغى",

  "contracts.audit.GENERATED": "توليد العقد",
  "contracts.audit.AMEND_REQUESTED": "طلب تعديل",
  "contracts.audit.SIGNATURE_RECORDED": "تسجيل توقيع",
  "contracts.audit.FINALIZED": "إكمال التوقيع",
  "contracts.audit.VOIDED": "إلغاء",

  "contracts.role.OWNER": "المالك",
  "contracts.role.MANAGER": "المدير",
  "contracts.role.BROKER": "الوسيط",
  "contracts.role.CLIENT": "العميل",

  "contracts.template.defaultTitlePattern": "عقد بيع — {PROPERTY_TITLE}",
  "contracts.template.defaultBodyPattern": `تم الاتفاق بين الطرفين على عقار {PROPERTY_TYPE} في {PROPERTY_ADDRESS} ضمن الصفقة {DEAL_REFERENCE}.
الجهة: {ORGANIZATION_NAME}
الوسيط: {BROKER_REFERENCE}
تاريخ اللقطة: {SNAPSHOT_CAPTURED_AT}`,

  "contracts.workspace.loadFailed":
    "تعذر تحميل العقود — تحقق من الجلسة والصلاحيات.",
  "contracts.workspace.actionFailed":
    "تعذر تنفيذ الأمر — تحقق من الصلاحيات وترتيب التوقيع.",
  "contracts.workspace.title": "العقود والتوقيع",
  "contracts.workspace.generateTitle": "توليد عقد من صفقة",
  "contracts.workspace.generateIntro":
    "يولَّد محتوى العقد حتميًا من نسخة قالب معتمدة ولقطة بيانات الصفقة والعقار، ويُسجَّل بصمة SHA-256 للمستند مع ختم المصدر.",
  "contracts.workspace.dealIdLabel": "معرّف الصفقة (UUID)",
  "contracts.workspace.templateLabel": "القالب المعتمد",
  "contracts.workspace.noApprovedTemplates": "لا توجد قوالب معتمدة",
  "contracts.workspace.templateWithVersion": "{templateKey} · نسخة {version}",
  "contracts.workspace.generatedNotice":
    "تم توليد العقد وحفظ لقطة البيانات بشكل غير قابل للتغيير.",
  "contracts.workspace.generate": "توليد العقد",
  "contracts.workspace.templatesTitle": "قوالب العقود",
  "contracts.workspace.newTemplateSummary": "إنشاء قالب جديد (مالك/مدير)",
  "contracts.workspace.templateKeyLabel": "مفتاح القالب",
  "contracts.workspace.titlePatternLabel": "نمط العنوان",
  "contracts.workspace.bodyPatternLabel":
    "نمط المتن — المتغيرات المسموحة فقط مثل {PROPERTY_TITLE}",
  "contracts.workspace.templateCreatedNotice":
    "تم إنشاء القالب كمسودة — يلزم اعتماده قبل الاستخدام.",
  "contracts.workspace.createTemplate": "إنشاء مسودة القالب",
  "contracts.workspace.noTemplates": "لا توجد قوالب بعد.",
  "contracts.workspace.templateApproved": "معتمد",
  "contracts.workspace.templateApprovedAt": "معتمد — {date}",
  "contracts.workspace.templateDraft": "مسودة",
  "contracts.workspace.templateApprovedNotice":
    "تم اعتماد القالب — النسخة المعتمدة غير قابلة للتغيير.",
  "contracts.workspace.approve": "اعتماد",
  "contracts.workspace.contractsTitle": "العقود",
  "contracts.workspace.filterLabel": "تصفية حسب الصفقة (اختياري)",
  "contracts.workspace.filterPlaceholder": "كل العقود",
  "contracts.workspace.noContracts": "لا توجد عقود بعد.",
  "contracts.workspace.signatureCount": "{count}/{total} توقيع",
  "contracts.workspace.contractTemplateVersion": "{templateKey} نسخة {version}",
  "contracts.workspace.hashLine": "المستند: {pdf}… · المحتوى: {content}…",
  "contracts.workspace.viewPdf": "عرض PDF",
  "contracts.workspace.openDetail": "التفاصيل وخط التوقيع",
  "contracts.workspace.finalizedNotice":
    "تم تسجيل آخر توقيع — العقد مكتمل ومجمّد.",
  "contracts.workspace.signedNotice": "تم تسجيل التوقيع بالترتيب الصحيح.",
  "contracts.workspace.sign": "توقيع (حسب الدور)",
  "contracts.workspace.detailTitle": "تفاصيل العقد",
  "contracts.workspace.dtTitle": "العنوان",
  "contracts.workspace.dtStatus": "الحالة",
  "contracts.workspace.dtProperty": "العقار (من اللقطة)",
  "contracts.workspace.dtOrg": "الجهة",
  "contracts.workspace.dtCapturedAt": "تاريخ اللقطة",
  "contracts.workspace.dtPdfHash": "بصمة المستند (PDF)",
  "contracts.workspace.dtContentHash": "بصمة المحتوى",
  "contracts.workspace.signersTitle": "خط التوقيع التسلسلي",
  "contracts.workspace.signedAt": "وُقّع {at} ({hash}…)",
  "contracts.workspace.awaitingTurn": "بانتظار دوره بالترتيب",
  "contracts.workspace.notSigned": "لم يُوقّع",
  "contracts.workspace.nextSignerRequired":
    "الدور المطلوب الآن: التوقيع رقم {order} — الرفض خارج الترتيب إلزامي.",
  "contracts.workspace.auditTitle": "السجل التدقيقي (إلحاقي فقط)",
  "contracts.workspace.auditReason": " — السبب: {reason}",
  "contracts.workspace.amendmentReason": "طلب تعديل قبل التوقيع النهائي",
  "contracts.workspace.amendmentNotice":
    "سُجّل طلب التعديل في السجل التدقيقي (المستند نفسه غير قابل للتعديل).",
  "contracts.workspace.requestAmendment": "طلب تعديل (توثيق فقط)",
  "contracts.workspace.voidPrompt": "سبب إلغاء العقد (إلزامي):",
  "contracts.workspace.voidedNotice":
    "أُلغي العقد وسُجّل السبب — لا تعديل بعده.",
  "contracts.workspace.void": "إلغاء (مالك فقط)",
  "contracts.workspace.closeDetail": "إغلاق التفاصيل",
};

const en: Record<keyof typeof ar, string> = {
  "contracts.esignDisclaimer":
    "Simplified operational signature — not a legally certified signature",

  "contracts.status.DRAFT": "Awaiting signatures",
  "contracts.status.FINALIZED": "Fully signed",
  "contracts.status.VOID": "Voided",

  "contracts.audit.GENERATED": "Contract generated",
  "contracts.audit.AMEND_REQUESTED": "Amendment requested",
  "contracts.audit.SIGNATURE_RECORDED": "Signature recorded",
  "contracts.audit.FINALIZED": "Signing completed",
  "contracts.audit.VOIDED": "Voided",

  "contracts.role.OWNER": "Owner",
  "contracts.role.MANAGER": "Manager",
  "contracts.role.BROKER": "Broker",
  "contracts.role.CLIENT": "Client",

  "contracts.template.defaultTitlePattern": "Sale contract — {PROPERTY_TITLE}",
  "contracts.template.defaultBodyPattern": `Both parties agreed on a {PROPERTY_TYPE} property at {PROPERTY_ADDRESS} under deal {DEAL_REFERENCE}.
Organization: {ORGANIZATION_NAME}
Broker: {BROKER_REFERENCE}
Snapshot captured at: {SNAPSHOT_CAPTURED_AT}`,

  "contracts.workspace.loadFailed":
    "Could not load the contracts — check the session and permissions.",
  "contracts.workspace.actionFailed":
    "Could not run the command — check the permissions and signing order.",
  "contracts.workspace.title": "Contracts and signing",
  "contracts.workspace.generateTitle": "Generate a contract from a deal",
  "contracts.workspace.generateIntro":
    "The contract body is generated deterministically from an approved template version and a snapshot of the deal and property data, with the document SHA-256 hash recorded alongside the source stamp.",
  "contracts.workspace.dealIdLabel": "Deal ID (UUID)",
  "contracts.workspace.templateLabel": "Approved template",
  "contracts.workspace.noApprovedTemplates": "No approved templates",
  "contracts.workspace.templateWithVersion":
    "{templateKey} · version {version}",
  "contracts.workspace.generatedNotice":
    "The contract was generated and the data snapshot stored immutably.",
  "contracts.workspace.generate": "Generate contract",
  "contracts.workspace.templatesTitle": "Contract templates",
  "contracts.workspace.newTemplateSummary":
    "Create a new template (owner/manager)",
  "contracts.workspace.templateKeyLabel": "Template key",
  "contracts.workspace.titlePatternLabel": "Title pattern",
  "contracts.workspace.bodyPatternLabel":
    "Body pattern — only allowed variables such as {PROPERTY_TITLE}",
  "contracts.workspace.templateCreatedNotice":
    "The template was created as a draft — it must be approved before use.",
  "contracts.workspace.createTemplate": "Create template draft",
  "contracts.workspace.noTemplates": "No templates yet.",
  "contracts.workspace.templateApproved": "Approved",
  "contracts.workspace.templateApprovedAt": "Approved — {date}",
  "contracts.workspace.templateDraft": "Draft",
  "contracts.workspace.templateApprovedNotice":
    "The template was approved — the approved version is immutable.",
  "contracts.workspace.approve": "Approve",
  "contracts.workspace.contractsTitle": "Contracts",
  "contracts.workspace.filterLabel": "Filter by deal (optional)",
  "contracts.workspace.filterPlaceholder": "All contracts",
  "contracts.workspace.noContracts": "No contracts yet.",
  "contracts.workspace.signatureCount": "{count}/{total} signatures",
  "contracts.workspace.contractTemplateVersion":
    "{templateKey} version {version}",
  "contracts.workspace.hashLine": "Document: {pdf}… · Content: {content}…",
  "contracts.workspace.viewPdf": "View PDF",
  "contracts.workspace.openDetail": "Details and signing order",
  "contracts.workspace.finalizedNotice":
    "The last signature was recorded — the contract is complete and frozen.",
  "contracts.workspace.signedNotice":
    "The signature was recorded in the correct order.",
  "contracts.workspace.sign": "Sign (by role)",
  "contracts.workspace.detailTitle": "Contract details",
  "contracts.workspace.dtTitle": "Title",
  "contracts.workspace.dtStatus": "Status",
  "contracts.workspace.dtProperty": "Property (from the snapshot)",
  "contracts.workspace.dtOrg": "Organization",
  "contracts.workspace.dtCapturedAt": "Snapshot captured at",
  "contracts.workspace.dtPdfHash": "Document hash (PDF)",
  "contracts.workspace.dtContentHash": "Content hash",
  "contracts.workspace.signersTitle": "Sequential signing order",
  "contracts.workspace.signedAt": "Signed {at} ({hash}…)",
  "contracts.workspace.awaitingTurn": "Awaiting their turn in order",
  "contracts.workspace.notSigned": "Not signed",
  "contracts.workspace.nextSignerRequired":
    "Required role now: signature number {order} — out-of-order signing is mandatory to reject.",
  "contracts.workspace.auditTitle": "Audit log (append-only)",
  "contracts.workspace.auditReason": " — Reason: {reason}",
  "contracts.workspace.amendmentReason":
    "Amendment requested before final signing",
  "contracts.workspace.amendmentNotice":
    "The amendment request was recorded in the audit log (the document itself is immutable).",
  "contracts.workspace.requestAmendment":
    "Request amendment (documentation only)",
  "contracts.workspace.voidPrompt": "Contract cancellation reason (mandatory):",
  "contracts.workspace.voidedNotice":
    "The contract was voided and the reason recorded — no edits afterwards.",
  "contracts.workspace.void": "Void (owner only)",
  "contracts.workspace.closeDetail": "Close details",
};

export const contractsMessages = { ar, en };
