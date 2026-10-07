# EstateFlow — جولة المالية (مسودة EF-704)

> **مسودة، بيانات تركيبية فقط.** تسير هذه الوثيقة في وحدات المالية كما هي منفَّذة في المستودع، بأدلة من الشيفرة وتوثيق التسليم — دون أي دفتر حسابات حقيقي أو بنك أو عملاء. الرفيق: [دراسة الحالة](case-study-ar.md) و[Architecture tour](architecture-tour.md) و[الأمن والاختبارات](security-and-testing.md) و[سكربت العرض](demo-script.md). المتطلبات المالية المرجعية في [`docs/PRD.md` §4.3](../PRD.md) (FIN-01–FIN-08)، وحالة كل بند في [سجل المهام](../TASKS.md) ومصفوفة التتبع [`docs/handoffs/EF-233/finance-prd-traceability-2026-08-17.md`](../handoffs/EF-233/finance-prd-traceability-2026-08-17.md).

## 1. دفتر اليومية (EF-231 — FIN-01)

- **العقد:** قيود متوازنة فقط — سطران على الأقل بعملة واحدة، ورفض الخلط العملات أو السطور غير المتوازنة، والترحيل مرة واحدة (`DRAFT` → `POSTED`)، والتصحيح بقيود عكسية منفصلة (`reversalOfEntryId`) تتبادل الأطراف وتشير إلى الأصل — [`docs/handoffs/EF-231/T0-ledger-contract.md`](../handoffs/EF-231/T0-ledger-contract.md).
- **القيود المرحَّلة غير قابلة للتعديل:** التحرير والحذف مرفوضان، والحذف داخل فترة محسومة أو عبر المؤسسات مرفوض.
- **المصروفات المرتبطة بالحملات (EF-234 — FIN-04):** مصروفات مصنَّفة بأبعاد campaign/property/deal مع حالة اعتماد، عبر [`expense.controller.ts`](../../apps/api/src/features/finance/http/expense.controller.ts) (`POST organizations/:organizationId/finance/expenses` ومسارات submit/decision).

## 2. العمولات (EF-232 — FIN-02، جزئي)

- خطة عمولة بإصدارات، ولقطة commissionable للصفقة، واستحقاق متوقع (expected) محفوظ في قاعدة البيانات مع قيد CHECK يسمح بحالة `EXPECTED` فقط — أي أن الـdashboard يقرأ الواقع المحفوظ بصدق ولا يخترع حالة `DUE`/`PAID` دائمة ([`docs/handoffs/EF-235/EF-235-implementation-2026-09-23.md`](../handoffs/EF-235/EF-235-implementation-2026-09-23.md)).
- **حد صادق:** دورة الحياة realized/due/paid للعمولة ما تزال خارج الشريحة المقبولة — FIN-02 مسجَّلة `PARTIAL` في [مصفوفة التتبع](../handoffs/EF-233/finance-prd-traceability-2026-08-17.md). التقارير تعرض مبالغ `due`/`paid` كمجاميع صفرية اليوم بجانب شريحة `EXPECTED` المحفوظة.
- مسارات الأوامر عبر [`commission.controller.ts`](../../apps/api/src/features/finance/http/commission.controller.ts) (`commission-plan-versions` وغيرها).

## 3. الفواتير والمستحقات والأقساط (EF-233 — FIN-03)

- **دورة كاملة مقبولة:** مسودة فاتورة على صفقة، إصدار غير قابل للتعديل بـreceivable واحد، تسديد جزئي/كامل بأدق قيمة، إلغاء `ISSUED` فقط بلا أي تسديد (والتسديد يمنع الإلغاء كـ`409` مكتوب النوع)، ولقطات مالية صادرة غير قابلة للتعديل، وتقادم (aging) محسوب وقت القراءة بتوقيت UTC من `dueAt` بـ`asOf` يملكه الخادم — [`docs/handoffs/EF-233/EF-233-final-verification-2026-08-17.md`](../handoffs/EF-233/EF-233-final-verification-2026-08-17.md).
- **ثبات الأموال الحرفي:** المجال يقبل `bigint` بالوحدات الصغرى (minor units) فقط — لا floats ولا عمليات عشرية — مع عملة ISO-4217 ثلاثية الأحرف، ومطابقة عملة تامة بين الدفعة والمستحق، ولا overpayment، وتسديد idempotent بمفتاح `Idempotency-Key` إلزامي مع إعادة تشغيل وتزامن مُثبتان — [`docs/handoffs/EF-233/T0-receivable-invoice-payment-contract.md`](../handoffs/EF-233/T0-receivable-invoice-payment-contract.md).
- المسارات عبر [`receivable.controller.ts`](../../apps/api/src/features/finance/http/receivable.controller.ts): إنشاء فاتورة على صفقة، `issue`، `cancel`، `GET .../finance/receivables/aging`، و`POST .../finance/receivables/:receivableId/payments` بمفتاح idempotency إلزامي.

## 4. لوحة المالك (EF-235 — FIN-05)

- **قراءة فقط، Owner-only:** 8 مسارات تقارير عبر [`report.controller.ts`](../../apps/api/src/features/finance/http/report.controller.ts) (cash-flow، payments، expenses، receivables/aging، commissions، performance، وأكثر) — كل رقم مصحوب بطابع `asOf` يولّده الخادم وdrill-down يحصره في صفوفه المصدرية.
- **إثبات المصالحة هو محور القبول:** اختبار تكامل على PostgreSQL معزولة يثبت بـ`deepEqual` أن **كل رقم في اللوحة يساوي مجموع صفوفه المصدرية تمامًا** — التدفق النقدي، صافي كل عملة، التقادم مطابقًا لمصنِّف المجال `classifyReceivableAging` صفًا صفًا، والعمولات، والأداء بالصفقة والعقار، وعزل المستأجر — [`docs/handoffs/EF-235/EF-235-implementation-2026-09-23.md`](../handoffs/EF-235/EF-235-implementation-2026-09-23.md).
- **إعادة استخدام دلالات التقادم:** اللوحة لا تخترع فئات؛ تعيد حدود `CURRENT`/`DAYS_1_30`/`DAYS_31_60`/`DAYS_61_90`/`DAYS_91_PLUS` من EF-233 حرفيًا.
- **واجهة عربية أولًا:** لوحة `/ar/organizations/[organizationId]/finance/reports` العربية RTL، وصفحات مالية عربية للعمولات والمصروفات والمستحقات في [`apps/web/src/app/ar/`](../../apps/web/src/app/ar/).
- **حد صادق:** تصدير CSV/PDF مؤجل (FIN-07، مسجَّلة `DEFERRED-P1`)، وأبعاد الحملات في التقارير وصلت لاحقًا عبر EF-401/EF-405 لا عبر EF-235.

## 5. ما لا تدّعيه هذه الجولة — بصدق

- **لا تكامل بنكي ولا بوابة دفع:** FIN-08 مؤجلة عمدًا؛ لا سلوك gateway أو provider في المجال، ولا مصالحة بنكية ولا refunds ولا payment reversals — كلها non-goals موثقة في [تسليم EF-233](../handoffs/EF-233/EF-233-final-verification-2026-08-17.md).
- **لا ادعاء محاسبي أو ضريبي أو قانوني:** هذا نظام تشغيلي لعقارات؛ لا يُدّعى مطابقة لأي نظام محاسبة قانوني.
- **بيانات تركيبية فقط:** كل السيناريوهات والأرقام في الاختبارات والدليل تركيبية على قواعد معزولة (`estateflow_test`)؛ لا بيانات عملاء ولا نشر إنتاجي.
- **FIN-02 جزئية وFIN-07 مؤجلة** كما في [مصفوفة التتبع](../handoffs/EF-233/finance-prd-traceability-2026-08-17.md) — لا يُدَّعى اكتمال Phase 2 المالية.
- **لا أرقام أداء:** لم تُقس سرعة التقارير أو الاستعلامات في هذا المستودع.
