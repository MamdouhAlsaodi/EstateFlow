# EstateFlow — سكربت عرض تجريبي ببيانات تركيبية (مسودة EF-704)

> **مسودة سكربت، ليست فيديو ولا لقطات شاشة.** هذا نص مرقّم يتبعه مُقدِّم على بيانات تركيبية (synthetic) فقط — لا بيانات حقيقية ولا عملاء، ولا يُدَّعى رابط عرض مستضاف. الفيديو ولقطات الشاشة بنود EF-704 منفصلة ما تزال مفتوحة في [سجل المهام](../TASKS.md). كل خطوة تذكر المسار الحقيقي في الشيفرة الذي تمارسه. الرفاق: [دراسة الحالة](case-study-ar.md)، و[Architecture tour](architecture-tour.md)، و[الأمن والاختبارات](security-and-testing.md)، و[جولة المالية](finance-walkthrough.md).

## التهيئة (قبل العرض)

1. شغّل البيئة المحلية من المستودع (API + web + PostgreSQL معزولة). تأكد من الجاهزية عبر `GET /health/ready` في [`apps/api/src/features/health/health.controller.ts`](../../apps/api/src/features/health/health.controller.ts) — المسار يفحص PostgreSQL بـ`SELECT 1` ضمن مهلة ثانية ويرجع 503 عامًا عند أي فشل ([`docs/handoffs/EF-702/readiness.md`](../handoffs/EF-702/readiness.md)). استخدم `GET /health/live` كفحص حيّة مستقل عن قاعدة البيانات.
2. جهّز بيانات تركيبية فقط: مؤسسة تجريبية، وملف CSV لعقارات وهمية، ولا شيء يحمل أسماء أو أرقامًا حقيقية.

## السكربت

### 1. الدخول

- افتح الواجهة العربية `/ar` ([`apps/web/src/app/ar/page.tsx`](../../apps/web/src/app/ar/page.tsx)) — الاتجاه RTL من مفتاح اللغة الواحد (EF-630).
- سجّل الدخول بحساب تركيبي عبر `POST /auth/login` في [`auth.controller.ts`](../../apps/api/src/features/auth/http/auth.controller.ts). أشر إلى أن الجلسة قابلة للإبطال وأن حواجز CSRF مفعّلة على الأوامر — مُثبتة عبر HTTP في #34 ([`docs/handoffs/EF-701/log-privacy.md`](../handoffs/EF-701/log-privacy.md) و[سجل المهام](../TASKS.md)).

### 2. المؤسسة

- أنشئ أو اعرض مؤسسة عبر `POST /organizations` و`GET /organizations/:organizationId` في [`organization.controller.ts`](../../apps/api/src/features/organizations/http/organization.controller.ts)، واعرض العضويات عبر `GET /organizations/:organizationId/memberships`.
- أشر إلى أدوار OWNER/MANAGER/BROKER/CLIENT وPLATFORM_ADMIN المنفصلة في [`organization-access.ts`](../../apps/api/src/features/organizations/domain/organization-access.ts).

### 3. العقارات

- أضف عقارًا تركيبيًا: `POST /organizations/:organizationId/properties` ثم اعرض القائمة `GET /organizations/:organizationId/properties` — [`property.controller.ts`](../../apps/api/src/features/properties/http/property.controller.ts).
- انشر القائمة: `POST /organizations/:organizationId/listings/:listingId/publish`، وارفع صورًا عبر `POST .../listings/:listingId/images` (خط الوسائط يتحقق من نوع الملف بالبايتات الفعلية — [`docs/handoffs/EF-601/implementation.md`](../handoffs/EF-601/implementation.md)).

### 4. استيراد CSV — تجربة تشغيل ثم تنفيذ

- من صفحة `/ar/organizations/[organizationId]/properties/import` ([`apps/web/src/app/ar/organizations/[organizationId]/properties/import/page.tsx`](../../apps/web/src/app/ar/organizations/[organizationId]/properties/import/page.tsx)):
  - `POST /organizations/:organizationId/properties/csv-import/dry-run` — أرِ تقرير التجربة بأخطاء الصفوف قبل أي كتابة؛
  - ثم `POST /organizations/:organizationId/properties/csv-import/commit` للتنفيذ بعد المراجعة.
- المصدر: [`csv-import.controller.ts`](../../apps/api/src/features/properties/http/csv-import.controller.ts) (EF-703، #37/#38). الرسالة: لا استيراد أعمى — مراجعة أولًا.

### 5. خط العملاء المحتملين (CRM)

- أنشئ leadًا: `POST /organizations/:organizationId/leads`، واعرض اللوحة العربية `/ar/organizations/[organizationId]/leads`.
- حرّك المرحلة `POST .../leads/:leadId/transition`، وأضف ملاحظة `.../notes` ومهمة `.../tasks` مع `next-action` — [`lead.controller.ts`](../../apps/api/src/features/leads/http/lead.controller.ts). أشر إلى الخط الزمني append-only لتغييرات المراحل (CRM-03 في [`docs/PRD.md`](../PRD.md)).

### 6. إغلاق الصفقة

- أغلق الصفقة رابحة: `POST .../leads/:leadId/close-won` في نفس المتحكم.
- اربطها ماليًا في الخطوة التالية (الفاتورة تُنشأ على `dealId`).

### 7. المالية — عمولة وفاتورة وتسديد

- عرّف خطة عمولة: `POST /organizations/:organizationId/finance/commission-plan-versions` — [`commission.controller.ts`](../../apps/api/src/features/finance/http/commission.controller.ts).
- أنشئ فاتورة على الصفقة: `POST /organizations/:organizationId/finance/deals/:dealId/invoices`، ثم `POST .../finance/invoices/:invoiceId/issue` للإصدار غير القابل للتعديل — [`receivable.controller.ts`](../../apps/api/src/features/finance/http/receivable.controller.ts).
- سجّل دفعة جزئية: `POST .../finance/receivables/:receivableId/payments` مع ترويسة `Idempotency-Key` إلزامية — أعد المحاولة أمامهما ليُرَ أن النتيجة نفسها تتكرر بلا ازدواج (ثبات `bigint` بالوحدات الصغرى — [`docs/handoffs/EF-233/T0-receivable-invoice-payment-contract.md`](../handoffs/EF-233/T0-receivable-invoice-payment-contract.md)).
- اعرض التقادم: `GET /organizations/:organizationId/finance/receivables/aging`.

### 8. لوحة المالك

- افتح `/ar/organizations/[organizationId]/finance/reports` — التدفق النقدي والتقادم والعمولات والأداء، كل رقم بطابع `asOf` مع drill-down إلى صفوفه المصدرية (مسارات التقارير في [`report.controller.ts`](../../apps/api/src/features/finance/http/report.controller.ts)). اذكر إثبات المصالحة: كل رقم = مجموع صفوفه تمامًا ([`docs/handoffs/EF-235/EF-235-implementation-2026-09-23.md`](../handoffs/EF-235/EF-235-implementation-2026-09-23.md)).

### 9. العقود

- من `/ar/organizations/[organizationId]/contracts`: ولّد عقدًا من قالب معتمد (`POST /organizations/:organizationId/contracts/generate`)، ووقّع بالتسلسل (`POST .../contracts/:contractId/signatures` — الموقّع الخاطئ أو خارج الترتيب يُرفض)، ونزّل الـPDF المتحقق من بصمته `GET .../contracts/:contractId/pdf`.
- أبرز البانر الإلزامي: «توقيع تشغيلي مبسّط — ليس توقيعًا قانونيًا معتمدًا» — [`docs/handoffs/EF-610/implementation.md`](../handoffs/EF-610/implementation.md).

### 10. الإدارة والتدقيق

- بحساب PLATFORM_ADMIN تركيبي: `/ar/admin` — طابور الوسطاء `/ar/admin/brokers` والإشراف على القوائم `/ar/admin/listings` (الإجراءات الحساسة تطلب خطوة تحقق بكلمة المرور) وسجل التدقيق `/ar/admin/audit` والمهام الفاشلة `/ar/admin/jobs`.
- أشر إلى أن جداول التدقيق append-only مفروضة بـtriggers على مستوى قاعدة البيانات — [`docs/handoffs/EF-620/implementation.md`](../handoffs/EF-620/implementation.md).

### 11. الإقفال

- اختم بـ`GET /health/ready` والعودة إلى `/ar` — ثم اذكر الحدود أدناه صراحةً.

## ما لا يقدمه هذا السكربت — بصدق

- **لا فيديو ولا لقطات شاشة:** بنود EF-704 المتبقية (فيديو ولقطات ببيانات تركيبية + مراجعة) ما تزال مفتوحة في [سجل المهام](../TASKS.md).
- **لا رابط عرض مستضاف ولا deployment:** كل شيء محلي؛ لا نشر إنتاجي ولا Pilot.
- **لا بيانات حقيقية:** كل الحسابات والمؤسسات والعقارات تركيبية؛ التشغيل على قواعد معزولة.
- **لا بوابات مقبولة:** EF-701–EF-705 غير مقبولة؛ هذا السكربت لا يقرّ أي باب منها ولا يبدأ EF-703.
- **العرض لا يثبت الأمان أو الأداء:** العرض التفاعلي ليس بديلًا عن المراجعة الأمنية المستقلة أو اختبارات الحمل — انظر [الأمن والاختبارات](security-and-testing.md).
