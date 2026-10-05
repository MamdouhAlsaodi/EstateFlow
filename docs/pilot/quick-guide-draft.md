# دليل المدرّب السريع — مسودة ما قبل التجربة (EF-703 PRE-PILOT DRAFT)

> **حالة الوثيقة:** مسودة تدريبية داخلية (draft) للاستخدام مع فريق التشغيل فقط.
> ليست إطلاق Pilot، وليست إقرار اكتمال EF-703، وليست وثيقة عميل.
> كل الشاشات والأوامر المذكورة هنا موثّقة من الكود الفعلي في الفرع الحالي
> (base `860bb06`، PRs #24/#25 مدموجان) — انظر ملحق الأدلة في الأسفل.

---

## 1. ما الذي يغطيه هذا الدليل (وما لا يغطيه)

يشرح هذا الدليل جولة تدريبية اصطناعية (synthetic walkthrough) عبر واجهة
EstateFlow العربية-first: التنقل بين الشاشات، الأوامر المتاحة، ومن يُسمّى له
فعل كل أمر. جميع الأمثلة تعتمد بيانات اصطناعية تدريبياً فقط.

**ما لم يكتمل بعد — ويجب قوله للمتدرّبين صراحةً:**

- استيراد CSV مع تنفيذ تجريبي (dry-run) وتقرير مراجعة للنتائج قبل التنفيذ
  الفعلي: **غير موجود**.
- تحديد "decision owner" بالاسم لكل مكتب: **غير موجود**.
- لوحة مؤشرات Pilot (pilot success dashboard) والتغذية الراجعة الأسبوعية:
  **غير موجودة**.
- النسخ الاحتياطي لقاعدة البيانات وتنبيهات التشغيل الجاهزة للإنتاج: **غير
  مكتملة** (انظر EF-702 في `docs/DEVELOPMENT_PLAN.md`).
- القبول الرسمي لـ EF-701 (تدقيق أمني) وEF-702 (موثوقية وتشغيل): **لم يحدث**.
- **ممنوع** إدخال بيانات عملاء حقيقية، أو بيانات اعتماد حقيقية، أو رفع ملفات
  خارج بيئة التدريب، أو أي استخدام إنتاجي.
- لا يوجد في التطبيق أي ادعاء توقيع إلكتروني قانوني؛ شاشة العقود وspace عمل
  تعاقدي داخلي فقط.

---

## 2. الأدوار والصلاحيات — كما هي في الكود

الأدوار على مستوى المنظمة (organization) معرّفة في
`apps/api/src/features/organizations/domain/organization-access.ts`:

| الدور              | الصلاحيات                                             |
| ------------------ | ----------------------------------------------------- |
| `OWNER` (المالك)   | قراءة المنظمة + إدارة العضويات (`MANAGE_MEMBERSHIPS`) |
| `MANAGER` (المدير) | قراءة المنظمة + إدارة العضويات                        |
| `BROKER` (الوسيط)  | قراءة المنظمة فقط                                     |
| `CLIENT` (العميل)  | قراءة المنظمة فقط                                     |

ملاحظات دقيقة مهمة للتدريب:

- الصلاحيات تسري فقط إذا كانت حالة العضوية `ACTIVE`؛ الحالات
  `PENDING` / `SUSPENDED` / `REVOKED` تُلغي كل الصلاحيات (نفس الملف).
- يوجد دور منصّة منفصل تماماً: `PLATFORM_ADMIN` في نفس الملف، وهو دور إداري
  على مستوى النظام (ليس داخل منظمة) ويخص شاشات `/ar/admin/*` فقط.
- تقارير المالك المالية تُرجع `403 Owner role required` لغير المالك —
  انظر `apps/api/src/features/finance/http/report.controller.ts`.

قاعدة تدريبية: **المالك/المدير = إدارة المنظمة وبعض أوامر المالية والأتمتة
وفق صلاحية كل ميزة؛ الوسيط = مهام يومية بحسب حدود كل ميزة، لا إدارة عضويات؛
مدير المنصّة = اعتماد الوسطاء والإدراجات والتدقيق.**

---

## 3. الدخول والتنقل الأساسي

- الصفحة العربية الرئيسية: `/ar` — تعرض عرض النظام (design system demo
  حالياً) مع روابط تنقل داخلية (`#leads`, `#properties`, `#finance`,
  `#tasks`) في `apps/web/src/app/ar/_components/app-shell.tsx`.
- كل شاشات المكتب تقع تحت مسار المنظمة. **المسار `[organizationId]` هو
  placeholder لمُعرّف منظمة فعلي — ليس رابطاً جاهزاً ولا UUID مُختلَقاً.**
  عند التدريب، استخدم مُعرّف منظمة الاختبار من بيئتك المحلية فقط.
- ليس لكل كيان صفحة قائمة مستقلة: لا توجد صفحة "قائمة عقارات" — الوصول
  للعقار يتم عبر مسار التفاصيل `[propertyId]` مباشرة (انظر §5).

---

## 4. المنظمة والعضويات (Organization & Memberships)

ما هو متاح فعلياً كواجهة: سياق المنظمة يُمرَّر لكل الشاشات عبر
`OrganizationProvider` (`apps/web/src/features/organization-context/organization-context.tsx`)،
وإدارة العضويات موجودة كصلاحية API (`MANAGE_MEMBERSHIPS`) للمالك/المدير.

سيناريو تدريبي اصطناعي:

جولة تدريبية للشرح فقط (read-only) باستخدام حسابات اصطناعية مُعدّة مسبقاً —
لا تنفّذ أي أوامر API أثناء الجلسة:

1. المالك يتحقق أن عضوية وسيط تجريبي مُعدّ مسبقاً أصبحت `ACTIVE` قبل أن
   يتوقع أن يرى الوسيط أي شيء — عضوية `PENDING` تعني لا صلاحيات.
2. اشرح (دون تنفيذ) أن المدير يملك أمر إضافة عضوية عبر الـ API، لكن
   **لا يملك أمر تعليق الوسيط**؛ تعليق الوسيط مسؤولية مدير المنصّة وتتطلب
   step-up (انظر §10). العضوية المعلّقة (`SUSPENDED`) تفقد صلاحياتها.
3. الوسيط يتحقق من ظهور سياق المنظمة دون أوامر إدارة عضويات؛ صلاحيات
   العمل الأخرى تُحدَّد لكل ميزة على حدة، وليست «قراءة فقط» على مستوى النظام.

> تنبيه للمدرّب: لا توجد شاشة ويب مستقلة مخصّصة لإدارة العضويات في
> `apps/web/src/app` حتى الآن؛ الصلاحية على مستوى API، ولا يوجد بيئة
> تدريبية آمنة لتنفيذ أوامر العضويات — اقتصر على الشرح باستخدام الحسابات
> الاصطناعية المُعدّة مسبقاً. لا تدّعِ وجود شاشة.

## 5. العقار والإدراج (Property & Listing)

- شاشة تفاصيل العقار: `/ar/organizations/[organizationId]/properties/[propertyId]`
  — تعرض `PropertyDetailView` مع مساحة عمل الوسائط (`MediaWorkspace`):
  عرض الوسائط، رفع صورة/فيديو (`uploadMediaBytes`)، تعيين غلاف (`setMediaCover`)،
  حذف عنصر (`removeMedia`) —
  `apps/web/src/features/properties/property-detail-view.tsx` و`media-workspace.tsx`.
- حالة الوسائط تمر بـ `PENDING → CONFIRMED / PROCESSING` مع متغيرات
  `THUMB` / `PREVIEW` (`apps/web/src/features/properties/media-contract.ts`) —
  اشرح للمتدرّب أن الرفع لا يعني الظهور الفوري.
- مراجعة الإدراجات (approve/reject) موجودة لدى مدير المنصّة في
  `/ar/admin/listings` (`apps/web/src/features/admin/listing-moderation-view.tsx`).
  ملاحظة: الاعتماد/الرفض لا يتطلبان step-up؛ الـ step-up مطلوب فقط لـ
  `BROKER_SUSPENDED` و`LISTING_MODERATION_TAKEN_DOWN` (سحب الإدراج، وليس
  الرفض) — انظر `apps/api/src/features/admin/domain/admin-policy.ts`.

سيناريو تدريبي: افتح عقار اختبار، ارفع صورة اصطناعية، تابع حالتها حتى
`CONFIRMED`، ثم اشرح أن الإدراج نفسه قد يمر بمراجعة مدير المنصّة.

## 6. العملاء والمعاينات (Leads & Viewings)

- لوحة العملاء: `/ar/organizations/[organizationId]/leads` — أعمدة المراحل
  `NEW / CONTACTED / QUALIFIED / NURTURING` مع انتقالات مسموحة فقط بين
  المراحل (خريطة `ALLOWED_LEAD_TRANSITIONS` في
  `apps/web/src/features/leads/lead-board-model.ts`؛ الاختبار:
  `apps/web/src/test/leads-board.test.ts`).
- مساحة عمل العميل تدعم ملاحظات ومهام وجدول زمني (timeline) وأوامر إغلاق
  رابح/خاسر (`normalizeLeadCloseWonResponse` /
  `normalizeLeadCloseLostResponse` في `apps/web/src/lib/api-client/leads.ts`).
- المعاينات: `/ar/organizations/[organizationId]/viewings` — إنشاء طلب معاينة
  (`requestViewing`) وتنفيذ إجراءات حالة (`viewingAction`) من
  `viewings-list-view.tsx`؛ حالات المعاينة:
  `REQUESTED / CONFIRMED / CANCELLED / COMPLETED / NO_SHOW`
  (`apps/web/src/features/viewings/viewing-contract.ts`)؛ صفحة التفاصيل
  `/ar/organizations/[organizationId]/viewings/[viewingId]` تعرض سجل
  الانتقالات والتذكيرات المجدولة (`viewing-detail-view.tsx`).
- بحث جغرافي: `/ar/organizations/[organizationId]/search`
  (`apps/web/src/features/search/geo-search-view.tsx`).

سيناريو تدريبي: استخدم عميلاً اصطناعياً مُعدّاً مسبقاً (لا توجد واجهة لإنشاء
عميل جديد — الإنشاء عبر مساحة العمل يقتصر على الملاحظات والمهام)، حرّكه
`NEW → CONTACTED`، جرّب انتقالاً غير مسموح ولاحظ الرفض، ثم أنشئ معاينة
وأكّدها واختمها `COMPLETED`.

## 7. المالية والتقارير (Finance & Reports)

جميع الشاشات تحت مسار المنظمة؛ الأوامر المالية حساسة — درّب على الملاحظة
قبل التنفيذ:

- تقارير المالك: `/ar/organizations/[organizationId]/finance/reports` —
  لوحة المالك (`OwnerFinanceDashboard`) تعرض تدفق نقدي، ملخص عمولات، وأعمار
  الذمم (`owner-finance-dashboard.tsx`). **الوصول للمالك فقط** (403 لغيره —
  `report.controller.ts`).
- الذمم: `/ar/organizations/[organizationId]/finance/receivables` — مساحة
  المطابقة (`ReceivableReconciliationWorkspace`) تتضمن لوحة إلغاء فاتورة
  بسبب مُسجّل (`receivable-cancellation-panel.tsx` عبر `cancelInvoice`)؛
  الاختبارات: `receivable-reconciliation-workspace.test.ts`,
  `receivable-command-workspace.test.ts`, `receivable-api-client.test.ts`.
- العمولات: `/ar/organizations/[organizationId]/finance/commissions` — ثلاثة
  أوامر: إنشاء نسخة خطة عمولة (`createCommissionPlanVersion`)، تسجيل قيمة
  قابلة للعمولة على صفقة (`captureCommissionableValue`)، وإنشاء استحقاق
  متوقع (`createExpectedAccrual`) —
  `commission-command-workspace.tsx` + `apps/web/src/lib/api-client/commission.ts`؛
  الاختبار: `commission-command-workspace.test.ts`.
- المصروفات: `/ar/organizations/[organizationId]/finance/expenses` — مساحة
  أوامر المصروفات (`expense-command-workspace.tsx`)؛ الاختبار:
  `expense-command-workspace.test.ts`.

> لا توجد حالياً شاشة تصدير CSV أو ملفات مالية من الواجهة — لا تدّعِ ذلك.

## 8. الحملات والعقود (اختياري)

- الحملات: `/ar/organizations/[organizationId]/campaigns` (قائمة) و
  `/ar/organizations/[organizationId]/campaigns/[campaignId]` (تفاصيل مع
  تقدم الميزانية `budget-progress.tsx`) —
  `apps/web/src/features/campaigns/`؛ الاختبارات: `campaign-contract.test.ts`,
  `ef405-campaign-analytics.test.ts`.
- العقود: `/ar/organizations/[organizationId]/contracts` — مساحة عمل عقود
  (`contracts-workspace.tsx`)؛ عقد داخلي لتوثيق الاتفاق، **وليس توقيعاً
  إلكترونياً قانونياً**. الاختبار: `ef610-contracts-contract.test.ts`.

## 9. الأتمتة والمحتوى (اختياري — اذكر حدود المراجعة البشرية)

- الأتمتة: `/ar/organizations/[organizationId]/automation` (الرؤية) و
  `/automation/jobs` (سجل المهام) و `/automation/rules/[ruleId]` (تفاصيل
  قاعدة). إعادة المحاولة (`retry`) والإلغاء (`cancel`) تظهران فقط للحالات
  القابلة للتنفيذ ويُسمّى لهما Owner/Manager عبر الـ API —
  `automation-job-list.tsx`؛ الاختبار: `automation-jobs.test.ts`.
- المحتوى: قائمة `/content`، تقويم `/content/calendar`، طابور مراجعة
  `/content/review-queue`، نشر `/content/publishing`، وتفاصيل
  `/content/[contentId]` (تعديل، جدولة، تسجيل فشل، وإصدار معتمد) —
  `apps/web/src/features/content/`؛ الاختبارات: `content-contract.test.ts`,
  `content-generation.test.ts`, `content-publishing.test.ts`.
- رسالة تدريبية أساسية: **نشر المحتوى** يمر بمراجعة بشرية (دورة
  `REVIEW → APPROVED` في `apps/api/src/features/content/domain/content.ts`) —
  لا نشر بلا موافقة. أما قواعد الأتمتة التي فُعّلت بصلاحية مناسبة (`enabled`)
  فقد تُنفّذ تلقائياً — لا تدّعِ أن كل تشغيل يحتاج موافقة بشرية
  (`apps/api/src/features/automation/application/automation-scheduler.ts`).

## 10. وحدة مدير المنصّة (Platform Admin)

- المركز: `/ar/admin` يربط أربعة أقسام مميزة، وكل قسم يفرض حدّ platform-admin
  على مستوى الـ API (`apps/web/src/app/ar/admin/page.tsx`).
  الأقسام: `/ar/admin/brokers` (اعتماد وسطاء من طابور انتظار؛ تعليق وسيط
  يتطلب خطوة step-up)، `/ar/admin/listings` (اعتماد/رفض إدراجات؛ الـ
  step-up للسحب/takedown لا للاعتماد أو الرفض)، `/ar/admin/audit`
  (بحث تدقيق)، `/ar/admin/jobs` (مهام فاشلة) —
  `apps/web/src/features/admin/`؛ الاختبار: `ef620-admin-contract.test.ts`.

## 11. قائمة تحقّق المدرّب قبل الجلسة

1. بيئة محلية تعمل ببيانات اصطناعية فقط — لا عملاء حقيقيون ولا بيانات اعتماد
   حقيقية ولا رفع ملفات خارج بيئة التدريب.
2. جهّز مُعرّف منظمة وعقار اختبار حقيقيين من بيئتك المحلية لملء الـ
   placeholders — لا تُختلِق UUIDs في المثال.
3. اذكر صراحةً العناصر الناقصة في §1 (CSV، decision owner، لوحة Pilot،
   النسخ الاحتياطي/التنبيهات، قبول EF-701/702).
4. هذه المسودة ليست إطلاق Pilot ولا اكتمال EF-703.

---

## ملحق الأدلة (Evidence Appendix)

| ادعاء في الدليل                                                       | المصدر/الاختبار                                                                                                                                                                                                                      |
| --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| أدوار OWNER/MANAGER/BROKER/CLIENT وصلاحياتها وحالات العضوية           | `apps/api/src/features/organizations/domain/organization-access.ts`                                                                                                                                                                  |
| دور `PLATFORM_ADMIN`                                                  | نفس الملف أعلاه                                                                                                                                                                                                                      |
| تقرير المالك: 403 "Owner role required"                               | `apps/api/src/features/finance/http/report.controller.ts`                                                                                                                                                                            |
| الصفحة العربية الرئيسية وروابط الـ shell                              | `apps/web/src/app/ar/page.tsx`, `apps/web/src/app/ar/_components/app-shell.tsx`                                                                                                                                                      |
| سياق المنظمة يُمرَّر لكل الشاشات                                      | `apps/web/src/features/organization-context/organization-context.tsx` وجميع صفحات `apps/web/src/app/ar/organizations/[organizationId]/**/page.tsx`                                                                                   |
| تفاصيل العقار + رفع/غلاف/حذف وسائط                                    | `apps/web/src/app/ar/organizations/[organizationId]/properties/[propertyId]/page.tsx`, `apps/web/src/features/properties/property-detail-view.tsx`, `media-workspace.tsx`                                                            |
| حالات الوسائط والحدود والمتغيرات                                      | `apps/web/src/features/properties/media-contract.ts`; اختبار `apps/web/src/test/ef601-media-contract.test.ts`                                                                                                                        |
| مراجعة الإدراجات + step-up (مدير المنصّة)                             | `apps/web/src/app/ar/admin/listings/page.tsx`, `apps/web/src/features/admin/listing-moderation-view.tsx`, `step-up-form.tsx`                                                                                                         |
| لوحة العملاء والمراحل والانتقالات المسموحة                            | `apps/web/src/app/ar/organizations/[organizationId]/leads/page.tsx`, `apps/web/src/features/leads/lead-board.tsx`, `lead-board-model.ts`                                                                                             |
| ملاحظات/مهام/إغلاق رابح-خاسر                                          | `apps/web/src/features/leads/lead-workspace.tsx`, `apps/web/src/lib/api-client/leads.ts`                                                                                                                                             |
| المعاينات: طلب/إجراء/حالات/تفاصيل وتذكيرات                            | `apps/web/src/app/ar/organizations/[organizationId]/viewings/page.tsx`, `viewings/[viewingId]/page.tsx`, `apps/web/src/features/viewings/viewings-list-view.tsx`, `viewing-detail-view.tsx`, `viewing-api.ts`, `viewing-contract.ts` |
| البحث الجغرافي                                                        | `apps/web/src/app/ar/organizations/[organizationId]/search/page.tsx`, `apps/web/src/features/search/geo-search-view.tsx`                                                                                                             |
| لوحة تقارير المالك (نقدي/عمولات/أعمار)                                | `apps/web/src/app/ar/organizations/[organizationId]/finance/reports/page.tsx`, `apps/web/src/features/finance/owner-finance-dashboard.tsx`                                                                                           |
| الذمم: مطابقة وإلغاء فاتورة بسبب                                      | `.../finance/receivables/page.tsx`, `receivable-reconciliation-workspace.tsx`, `receivable-cancellation-panel.tsx`; اختبارات `receivable-*.test.ts`                                                                                  |
| العمولات: خطة/قيمة/استحقاق                                            | `.../finance/commissions/page.tsx`, `commission-command-workspace.tsx`, `apps/web/src/lib/api-client/commission.ts`; اختبار `commission-command-workspace.test.ts`                                                                   |
| المصروفات                                                             | `.../finance/expenses/page.tsx`, `expense-command-workspace.tsx`; اختبار `expense-command-workspace.test.ts`                                                                                                                         |
| الحملات وقائمة/تفاصيل وميزانية                                        | `.../campaigns/page.tsx`, `campaigns/[campaignId]/page.tsx`, `apps/web/src/features/campaigns/`; اختبارات `campaign-contract.test.ts`, `ef405-campaign-analytics.test.ts`                                                            |
| العقود (ليست توقيعاً قانونياً)                                        | `.../contracts/page.tsx`, `apps/web/src/features/contracts/contracts-workspace.tsx`; اختبار `ef610-contracts-contract.test.ts`                                                                                                       |
| الأتمتة: رؤية/مهام/إعادة محاولة/إلغاء (Owner/Manager)                 | `.../automation/page.tsx`, `automation/jobs/page.tsx`, `automation/rules/[ruleId]/page.tsx`, `apps/web/src/features/automation/automation-job-list.tsx`; اختبار `automation-jobs.test.ts`                                            |
| المحتوى: قائمة/تقويم/مراجعة/نشر/تفاصيل                                | `.../content/**/page.tsx`, `apps/web/src/features/content/`; اختبارات `content-contract.test.ts`, `content-generation.test.ts`, `content-publishing.test.ts`                                                                         |
| مركز مدير المنصّة وأقسامه الأربعة                                     | `apps/web/src/app/ar/admin/page.tsx` (و`brokers`, `listings`, `audit`, `jobs`), `apps/web/src/features/admin/`; اختبار `ef620-admin-contract.test.ts`                                                                                |
| نطاق EF-703 والناقص (CSV, decision owner, dashboard, weekly feedback) | `docs/DEVELOPMENT_PLAN.md` Phase 7 (EF-701/702/703)                                                                                                                                                                                  |

### تحفّظات (Caveats)

- لا توجد شاشة ويب لإدارة العضويات في `apps/web/src/app` حتى الآن؛
  `MANAGE_MEMBERSHIPS` صلاحية API موثقة في domain فقط.
- صلاحيات OWNER/MANAGER/BROKER الموثقة في الـ domain تخص إدارة المنظمة؛
  سلوك صلاحيات بقية الأوامر (مالية/أتمتة) مفروض على مستوى الـ API لكل
  controller، ولم يُدقَّق هنا إلا لتقرير المالك (403 Owner).
- `shells.navOverview` في app-shell يشير إلى `/ar` بأقسام anchor — الصفحة
  نفسها design-system demo حالياً، وليست لوحة تشغيلية كاملة.
