# EstateFlow — الأمن والاختبارات (مسودة EF-704)

> **مسودة، ليست تصديقًا أمنيًا.** تصف هذه الوثيقة ما تغطيه الاختبارات والفحوص الفعلية في المستودع فقط، بأدلة قابلة للتحقق من مسارات الشيفرة والاختبارات وملفات التسليم ([`docs/handoffs/`](../handoffs/)). هي واحدة من أربع مسودات EF-704: [دراسة الحالة](case-study-ar.md)، و[Architecture tour](architecture-tour.md)، وهذه الوثيقة، و[سكربت العرض](demo-script.md). الخطة الحاكمة هي [المرحلة السابعة في خطة التطوير](../DEVELOPMENT_PLAN.md)، وبوابات EF-701–EF-705 في [سجل المهام](../TASKS.md) ما تزال مفتوحة، وEF-701 نفسها **غير مقبولة**.

## هرم الاختبارات كما هو مطبَّق فعلًا

يحدد [قسم استراتيجية الاختبارات في `docs/DEVELOPMENT_PLAN.md`](../DEVELOPMENT_PLAN.md) طبقات الهرم. ما هو موجود فعلًا في المستودع اليوم:

- **اختبارات وحدة (unit):** مجموعات `node --test` معزولة داخل `apps/api/test/` و`apps/worker/test/` و`apps/web/src/test/` تغطي المجال والتطبيق وحدود HTTP وترقيم الأموال. آخر أرقام كلية موثقة في التسليم: 388/388 اختبار وحدة ناجح وقت EF-235، و65 ملف اختبار API وقت EF-620، و108/108 اختبارات الويب وقت EF-630 — أرقام لحظية من ملفات التسليم نفسها، لا ادعاء حالي.
- **اختبارات تكامل HTTP + PostgreSQL محروسة:** على قاعدة `estateflow_test` معزولة مع `ALLOW_DESTRUCTIVE_TESTS=1`، تشمل إثباتات عزل المستأجرين عبر HTTP الفعلي: رفض قراءة بايتات وسائط لمؤسسة أخرى (#29)، إصلاح إعادة استخدام منح رفع التخزين (#32)، عزل متغيّرات الوسائط (#33)، وإبطال الجلسات وحواجز CSRF مع تدقيق تسجيل خروج مرتبط بمعرّف الطلب (#34). واختبارات استيراد CSV بمراجعة تقرير الـdry-run قبل التنفيذ (#37، #38) عبر [`csv-import.controller.ts`](../../apps/api/src/features/properties/http/csv-import.controller.ts).
- **تمارين معزولة في CI:** تمرين backup/restore على PostgreSQL حقيقي داخل CI (#31)، وبروفة migrations على قاعدة CI معزولة (#36) — كتمارين CI فقط، لا كإثبات تشغيل إنتاجي.
- **جاهزية الصحة:** `GET /health/ready` يفحص PostgreSQL فعليًا عبر `SELECT 1` قراءة فقط ضمن مهلة ثانية واحدة مع admission control (probe واحد عائم كحد أقصى)، ويفشل مغلَقًا بـ503 عام بلا أي تفصيل داخلي، مع 8 اختبارات fake-probe ومسار HTTP معزول (#22، #30). المصدر: [`readiness-probe.port.ts`](../../apps/api/src/features/health/readiness-probe.port.ts) و[`docs/handoffs/EF-702/readiness.md`](../handoffs/EF-702/readiness.md).
- **سجل تدقيق غير قابل للتعديل (append-only):** اختبارات تكامل على `estateflow_test` تُثبت رفض UPDATE/DELETE على مستوى قاعدة البيانات عبر triggers لجداول تدقيق العقود (EF-610) وجداول الإدارة الثلاثة `ListingModerationEvent`/`AdminAuditEvent`/`AdminStepUpEvent` (EF-620) — انظر [`docs/handoffs/EF-610/implementation.md`](../handoffs/EF-610/implementation.md) و[`docs/handoffs/EF-620/implementation.md`](../handoffs/EF-620/implementation.md).
- **اختبارات i18n/RTL (EF-630):** فحص نوعي وزمني للمفاتيح الناقصة في كتالوج الترجمة مكتوب الأنواع، ومسح آلي يمنع النصوص العربية الثابتة خارج الكتالوج — [`docs/handoffs/EF-630/implementation.md`](../handoffs/EF-630/implementation.md).
- **ماسح الأمان الأساسي للفهرس المتتبَّع (#20):** [`scripts/verify-security-baseline.mjs`](../../scripts/verify-security-baseline.mjs) يفحص كل blob في `git ls-files` بحثًا عن مفاتيح خاصة وأسماء ملفات اعتماد، ويفشل مغلَقًا دون طباعة مسارات أو قيم — كما يوثّق [`docs/handoffs/EF-701/implementation.md`](../handoffs/EF-701/implementation.md). الماسح نفسه ينص صراحة أنه ليس ماسح أسرار عامًا ولا يفحص الملفات غير المتتبَّعة.
- **جرد التراخيص (#21):** أمر `licenses:report` يبلّغ أعدادًا تجميعية لتعبيرات التراخيص فقط (283 حزمة عبر 10 مجموعات وقت التسليم)، والتعبيرات المرصودة مثل LGPL-3.0-or-later وCC-BY-4.0 وPython-2.0 وBlueOak-1.0.0 **تتطلب مراجعة بشرية/قانونية** قبل أي استخدام منتجي — [`docs/handoffs/EF-701/supply-chain.md`](../handoffs/EF-701/supply-chain.md).
- **خصوصية سجلات الطلب (#24):** وسيط التسجيل يسجّل قالب المسار (`/api/properties/:propertyId`) أو `<unmatched>` فقط — لا معرّفات فعلية ولا query ولا body ولا headers ولا IP — [`docs/handoffs/EF-701/log-privacy.md`](../handoffs/EF-701/log-privacy.md).
- **ملاحظة worker:** أحداث الـtick المنظمة في [`scripts/automation-worker-loop.mjs`](../../scripts/automation-worker-loop.mjs) (#25) تسجيل JSON محلي مقيَّد بمفاتيح مسموحة، وليست خدمة مقاييس أو تنبيهات — [`docs/handoffs/EF-702/worker-observability.md`](../handoffs/EF-702/worker-observability.md).

## ما لا يغطيه هذا — بصدق

ما **لا** تدّعيه هذه الوثيقة صراحةً:

- **لا مراجعة أمنية مستقلة:** بوابة القبول الأمني/الخصوصي المستقل في EF-701 ما تزال مفتوحة في [سجل المهام](../TASKS.md). كل ما دمج (#20/#21/#23/#24/#29/#32/#33/#34) شرائح محدودة وليست clearance أمنيًا.
- **لا اختبار اختراق (penetration test)** ولا فحص OWASP كامل المصفوفة: خطة EF-701 تتضمن اختبارات API موجَّهة بـOWASP ومراجعة XSS وIDOR وrate limits — لم تُنفَّذ كبوابة مقبولة بعد.
- **لا اختبار حمل أو أداء:** استراتيجية الخطة تذكر أدوات أداء (k6 أو benchmark) لـhotspots متفق عليها — لم تُنفَّذ في هذا المستودع، ولا توجد أي أرقام P95 مقيسة (هدف P95 < 400ms في الـPRD هدف تصميمي غير مقيس).
- **لا مراجعة advisories للتبعيات:** جرد التراخيص معلوماتي فقط؛ قرار سياسة التراخيص وفحص الـadvisories معلّقان على قرار المالك.
- **بوابات EF-701–EF-705 مفتوحة:** لا Pilot ولا نشر إنتاجي ولا بيانات عملاء حقيقية؛ EF-702 (مقاييس/تنبيهات/سياسة احتفاظ/runbook بمالك مُعيَّن) وEF-703 غير مقبولتين أيضًا.
- **لا نقاء بيانات:** كل البيانات في المستودع والاختبارات تركيبية (synthetic)؛ لم يُقرأ أي `.env` حقيقي أو بيانات حية في أي تسليم موثق.
