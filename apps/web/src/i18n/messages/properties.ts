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
  "properties.media.workspace.step.confirming":
    "Confirm and verify the bytes",
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
};

export const propertiesMessages = { ar, en };
