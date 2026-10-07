/**
 * EF-630 — properties/media catalog. `ar` is the source of truth; `en` must
 * carry every key (typechecked) and the runtime check lives in
 * `src/test/i18n.test.ts`.
 */

const ar = {
  "properties.media.status.PENDING": "بانتظار التأكيد",
  "properties.media.status.CONFIRMED": "مؤكدة",
  "properties.media.status.PROCESSING": "قيد المعالجة",
  "properties.media.kind.IMAGE": "صورة",
  "properties.media.kind.VIDEO": "فيديو",
  "properties.media.variant.THUMB": "مصغّرة",
  "properties.media.variant.PREVIEW": "معاينة",
  "properties.media.unit.bytes": "بايت",
  "properties.media.unit.kb": "ك.ب",
  "properties.media.unit.mb": "م.ب",

  "properties.detail.loadFailed":
    "تعذر تحميل بيانات العقار — تحقق من الجلسة والصلاحيات.",
  "properties.detail.title": "تفاصيل العقار",
  "properties.detail.dtTitle": "العنوان",
  "properties.detail.dtType": "النوع",
  "properties.detail.dtAddress": "العنوان النصي",
  "properties.detail.dtStatus": "الحالة",
  "properties.detail.statusActive": "نشط",
  "properties.detail.statusArchived": "مؤرشف",
  "properties.detail.dtCoordinates": "الإحداثيات",
  "properties.detail.coordinatesMissing": "غير محددة",
  "properties.detail.loading": "جارٍ التحميل…",

  "properties.media.upload.failed": "فشل الرفع",
  "properties.media.upload.loadFailed": "تعذر تحميل وسائط العقار",
  "properties.media.upload.chooseFile": "اختر ملفًا أولًا.",
  "properties.media.upload.unsupportedType":
    "الصيغ المدعومة: JPEG أو PNG أو WEBP للصور، و MP4/WEBM/MOV للفيديو.",
  "properties.media.upload.tooLarge": "حجم الملف يتجاوز الحد المسموح لنوعه.",
  "properties.media.upload.badFileName":
    "اسم الملف يجب أن يكون لاتينيًا بامتداد واحد فقط.",
  "properties.media.upload.genericError":
    "تعذر إكمال رفع الوسائط — تحقق من الصيغة والحجم ثم أعد المحاولة.",
  "properties.media.cover.failed":
    "تعذر تعيين الغلاف — يجب أن تكون الصورة مؤكدة.",
  "properties.media.delete.failed": "تعذر حذف الوسيط.",
  "properties.media.workspace.title": "وسائط العقار",
  "properties.media.workspace.description":
    "الرفع يتم عبر نية موقّعة قصيرة العمر وتحميل مباشر إلى التخزين، ثم تأكيد يفحص البايتات الفعلية (التوقيع الرقمي للصورة، الأبعاد، الحجم) قبل الظهور.",
  "properties.media.workspace.chooseFile": "اختر صورة أو فيديو",
  "properties.media.workspace.upload": "رفع وتأكيد",
  "properties.media.workspace.pending": "جارٍ التنفيذ…",
  "properties.media.workspace.stepsAria": "خطوات الرفع",
  "properties.media.workspace.step.intent": "طلب رابط رفع موقّع",
  "properties.media.workspace.step.uploading": "رفع مباشر إلى التخزين",
  "properties.media.workspace.step.confirming": "تأكيد والتحقق من البايتات",
  "properties.media.workspace.step.done": "تمت الإضافة إلى الشبكة",
  "properties.media.workspace.empty": "لا توجد وسائط بعد.",
  "properties.media.card.cover": "الغلاف",
  "properties.media.card.variants": "مشتقات:",
  "properties.media.card.processingNote":
    "معالجة الفيديو غير مفعّلة في هذه المرحلة.",
  "properties.media.card.setCover": "تعيين كغلاف",
  "properties.media.card.completeConfirmFirst": "أكمل التأكيد لإظهارها.",
  "properties.media.card.delete": "حذف",

  "properties.csvImport.eyebrow": "استيراد العقارات",
  "properties.csvImport.title": "استيراد العقارات من ملف CSV",
  "properties.csvImport.description":
    "الصق محتوى ملف CSV ثم شغّل فحصًا أوليًا دون حفظ، وبعد مراجعة التقرير أكّد الاستيراد. تُعرض الأخطاء برقم الصف والعمود دون إظهار محتوى الخلايا.",
  "properties.csvImport.inputLabel": "محتوى ملف CSV (يشمل صف العناوين)",
  "properties.csvImport.boundsHint":
    "الحد الأقصى {rows} صفًا للبيانات أو 512 ك.ب لكل عملية.",
  "properties.csvImport.pending": "جارٍ التنفيذ…",
  "properties.csvImport.dryRunButton": "فحص أولي",
  "properties.csvImport.commitButton": "تأكيد الاستيراد",
  "properties.csvImport.tooFewRows":
    "الصق محتوى CSV صالحًا يضم صف عناوين وصف بيانات واحدًا على الأقل.",
  "properties.csvImport.tooLarge":
    "حجم المحتوى يتجاوز 512 ك.ب — قسّمه إلى عمليات أصغر.",
  "properties.csvImport.tooManyRows":
    "عدد الصفوف يتجاوز 100 صف — قسّمه إلى عمليات أصغر.",
  "properties.csvImport.reportAria": "تقرير الفحص الأولي",
  "properties.csvImport.report.totalRows": "إجمالي الصفوف",
  "properties.csvImport.report.validRows": "الصفوف الصالحة",
  "properties.csvImport.errorRowsAria": "أخطاء الصفوف",
  "properties.csvImport.previewsAria": "معاينة الصفوف الصالحة",
  "properties.csvImport.column.row": "الصف",
  "properties.csvImport.column.field": "العمود",
  "properties.csvImport.column.title": "العنوان",
  "properties.csvImport.column.propertyType": "نوع العقار",
  "properties.csvImport.column.ownerReference": "مرجع المالك",
  "properties.csvImport.field.title": "العنوان",
  "properties.csvImport.field.propertyType": "نوع العقار",
  "properties.csvImport.field.ownerReference": "مرجع المالك",
  "properties.csvImport.field.other": "عمود غير صالح",
  "properties.csvImport.ownerReferenceLinked": "مرتبط",
  "properties.csvImport.ownerReferenceNone": "بدون",
  "properties.csvImport.forbidden":
    "لا تملك صلاحية استيراد العقارات لهذه المؤسسة.",
  "properties.csvImport.conflict":
    "انتهت صلاحية رمز الفحص أو لا يطابق هذا الملف — أعد الفحص الأولي ثم أكّد من جديد.",
  "properties.csvImport.session":
    "انتهت الجلسة — أعد تسجيل الدخول ثم أعد المحاولة.",
  "properties.csvImport.generic":
    "تعذر إكمال العملية — تحقق من تنسيق الملف ثم أعد المحاولة.",
  "properties.csvImport.commitSuccess": "تم الاستيراد بنجاح.",
  "properties.csvImport.resultAria": "نتيجة الاستيراد",
  "properties.csvImport.result.imported": "صفوف مستوردة",
  "properties.csvImport.result.skippedDuplicate": "صفوف مكررة تم تجاوزها",
  "properties.csvImport.result.totalRows": "إجمالي الصفوف",
};

const en: Record<keyof typeof ar, string> = {
  "properties.media.status.PENDING": "Awaiting confirmation",
  "properties.media.status.CONFIRMED": "Confirmed",
  "properties.media.status.PROCESSING": "Processing",
  "properties.media.kind.IMAGE": "Image",
  "properties.media.kind.VIDEO": "Video",
  "properties.media.variant.THUMB": "Thumbnail",
  "properties.media.variant.PREVIEW": "Preview",
  "properties.media.unit.bytes": "B",
  "properties.media.unit.kb": "KB",
  "properties.media.unit.mb": "MB",

  "properties.detail.loadFailed":
    "Could not load the property — check the session and permissions.",
  "properties.detail.title": "Property details",
  "properties.detail.dtTitle": "Title",
  "properties.detail.dtType": "Type",
  "properties.detail.dtAddress": "Address text",
  "properties.detail.dtStatus": "Status",
  "properties.detail.statusActive": "Active",
  "properties.detail.statusArchived": "Archived",
  "properties.detail.dtCoordinates": "Coordinates",
  "properties.detail.coordinatesMissing": "Not set",
  "properties.detail.loading": "Loading…",

  "properties.media.upload.failed": "Upload failed",
  "properties.media.upload.loadFailed": "Could not load property media",
  "properties.media.upload.chooseFile": "Choose a file first.",
  "properties.media.upload.unsupportedType":
    "Supported formats: JPEG, PNG, or WEBP for images; MP4/WEBM/MOV for video.",
  "properties.media.upload.tooLarge":
    "The file size exceeds the allowed limit for its kind.",
  "properties.media.upload.badFileName":
    "The file name must be Latin with exactly one extension.",
  "properties.media.upload.genericError":
    "Could not complete the media upload — check the format and size, then retry.",
  "properties.media.cover.failed":
    "Could not set the cover — the image must be confirmed.",
  "properties.media.delete.failed": "Could not delete the media item.",
  "properties.media.workspace.title": "Property media",
  "properties.media.workspace.description":
    "Uploads go through a short-lived signed intent and a direct-to-storage transfer, then a confirmation inspects the actual bytes (image signature, dimensions, size) before anything appears.",
  "properties.media.workspace.chooseFile": "Choose an image or video",
  "properties.media.workspace.upload": "Upload & confirm",
  "properties.media.workspace.pending": "Working…",
  "properties.media.workspace.stepsAria": "Upload steps",
  "properties.media.workspace.step.intent": "Request a signed upload URL",
  "properties.media.workspace.step.uploading": "Direct upload to storage",
  "properties.media.workspace.step.confirming": "Confirm and verify the bytes",
  "properties.media.workspace.step.done": "Added to the grid",
  "properties.media.workspace.empty": "No media yet.",
  "properties.media.card.cover": "Cover",
  "properties.media.card.variants": "Variants:",
  "properties.media.card.processingNote":
    "Video processing is not enabled at this stage.",
  "properties.media.card.setCover": "Set as cover",
  "properties.media.card.completeConfirmFirst":
    "Complete confirmation to show it.",
  "properties.media.card.delete": "Delete",

  "properties.csvImport.eyebrow": "Property import",
  "properties.csvImport.title": "Import properties from CSV",
  "properties.csvImport.description":
    "Paste the CSV content, run a dry-run that saves nothing, then confirm the import after reviewing the report. Errors show the row and column only — cell contents are never displayed.",
  "properties.csvImport.inputLabel": "CSV content (including the header row)",
  "properties.csvImport.boundsHint":
    "Up to {rows} data rows or 512 KiB per run.",
  "properties.csvImport.pending": "Working…",
  "properties.csvImport.dryRunButton": "Dry-run",
  "properties.csvImport.commitButton": "Confirm import",
  "properties.csvImport.tooFewRows":
    "Paste valid CSV with a header row and at least one data row.",
  "properties.csvImport.tooLarge":
    "The content exceeds 512 KiB — split it into smaller runs.",
  "properties.csvImport.tooManyRows":
    "More than 100 rows — split it into smaller runs.",
  "properties.csvImport.reportAria": "Dry-run report",
  "properties.csvImport.report.totalRows": "Total rows",
  "properties.csvImport.report.validRows": "Valid rows",
  "properties.csvImport.errorRowsAria": "Row errors",
  "properties.csvImport.previewsAria": "Valid row previews",
  "properties.csvImport.column.row": "Row",
  "properties.csvImport.column.field": "Field",
  "properties.csvImport.column.title": "Title",
  "properties.csvImport.column.propertyType": "Property type",
  "properties.csvImport.column.ownerReference": "Owner reference",
  "properties.csvImport.field.title": "Title",
  "properties.csvImport.field.propertyType": "Property type",
  "properties.csvImport.field.ownerReference": "Owner reference",
  "properties.csvImport.field.other": "Invalid field",
  "properties.csvImport.ownerReferenceLinked": "Linked",
  "properties.csvImport.ownerReferenceNone": "None",
  "properties.csvImport.forbidden":
    "You do not have permission to import properties for this organization.",
  "properties.csvImport.conflict":
    "The dry-run token expired or does not match this file — run the dry-run again and confirm anew.",
  "properties.csvImport.session":
    "Your session expired — sign in again and retry.",
  "properties.csvImport.generic":
    "Could not complete the operation — check the file format and retry.",
  "properties.csvImport.commitSuccess": "Import completed successfully.",
  "properties.csvImport.resultAria": "Import result",
  "properties.csvImport.result.imported": "Rows imported",
  "properties.csvImport.result.skippedDuplicate": "Duplicate rows skipped",
  "properties.csvImport.result.totalRows": "Total rows",
};

export const propertiesMessages = { ar, en };
