VERDICT: NEEDS_FIX

CRITICAL:
1. تعارض ترتيب المراحل بين PLAN وREQUIREMENTS_TRACEABILITY: ميزانية المعاينات (Auto-03 وحد منع التعارض في قاعدة البيانات) مصنّفة P0 في PRD لكن تنفيذها يقع في Phase 5، وبوابة Phase 2 Gate تعلن اكتمال عمليات/مالية/أتمتة/تسويق قبل المعاينات. النتيجة: "Portfolio MVP" المُعلن في §13 لا يغطي المعاينات رغم P0، أو يجب تقسيم الـgate.
2. FINANCE_AUTOMATION §3 ينصّ على "الفترة المغلقة تمنع الترحيل العادي" لكنه لا يحدد: (أ) من يملك صلاحية إعادة فتح فترة مغلقة، (ب) متى يُسمح بذلك، (ج) أي سجل تدقيق إلزامي لأي تعديل لاحق. فجوة حوكمة مالية مباشرة.
3. AUT-C01 (العمولة المستحقة → إخطار) مصنّف "Automatic internal" دون أي عتبة مبلغ أو آلية maker-checker لمبالغ معينة؛ عمولات العقار قد تصل لمبالغ كبيرة تستحق تحققًا إضافيًا قبل تحوّل الحالة إلى payable.
4. AUTOMATION §6 يذكر idempotency keys كمبدأ عام دون ربطها بـ tuple (event_id, organization_id, rule_id+version, action_type, target_type+id). في غياب الربط، AUT-L01 وAUT-C01 وAUT-M02 معرضة لتكرار المهام/الإخطارات عند إعادة معالجة outbox أو إعادة تشغيل العامل.
5. PRODUCT_STRATEGY §4 يصف نطاقات التسعير "to validate, not final promises" ويترك الالتزام حتى EF-705 Sellable gate. عرض Pilot يحتاج سعرًا محسومًا (حتى لو مؤسِّس) ليُعتَبر pilot evidence حقيقيًا ولتمويل الحوكمة التجارية.

HIGH:
6. لا توجد سياسة حصر PII (اسم العميل، الجوال، البريد، الإحداثيات الدقيقة) في logs عند مستوى debug؛ الخطط تغطي provider tokens فقط.
7. لا إشارة لمتطلبات PDPL السعودي أو سياسة حجز البيانات الجغرافية؛ سوق العقار في KSA حساس لخصوصية الموقع الدقيق (أحياء/إحداثيات العقار).
8. لا توجد آلية تحقق contract test أو static check تمنع تسريب قواعد العقار إلى نواة MamtrexS المشتركة؛ ADR-002 يحدد الفصل نظريًا فقط دون gate قابل للتنفيذ عند الاستخراج.
9. PLAN §10 يستدعي `pnpm security:scan` و`pnpm openapi:check` دون اختيار أداة أو عتبة قبول؛ تصبح CI غير قابلة للتطبيق إذا بقيت الأسماء رمزية.
10. AUT-M02 "Publish through configured adapter" بحالة "Previously approved" غامضة: موافقة سابقة على المحتوى لا يجب أن تمنح تفويضًا للنشر التلقائي بعد تعديل الجدول/القناة دون إعادة تحقق.
11. EF-601 يسمح بمعالجة الفيديو غير المتزامن "only if still justified"، لكن لا توجد معايير قرار لإيقاف/تشغيل المسار؛ scope creep محتمل في Phase 6.
12. EF-705 security audit كحدث واحد دون cadence لاختبار اختراق/مراجعة أمنية بعد Sellable؛ غياب اختبار اختراق سنوي/Per-release gate.
13. PRD §7 يُحمّل "Mamdouh approves" كل بوابات الاكتشاف/security/finance؛ غياب owner ثانٍ للأمان والمالية يصنع single point of failure.

MEDIUM:
14. EF-120 يربط CSRF بشرط "إذا اعتمد cookie auth"، دون ADR صريح يختار JWT-only أو cookie+JWT hybrid؛ قرار أمني أساسي يُترك للبنية التنفيذية.
15. ADR-005 يذكر PDFKit وHTML-to-PDF "after a focused spike" دون gate زمني أو نتيجة محسومة لتوليد PDF للعقود العربية (يؤثر FIN-07/العقود في Phase 6).
16. Productization backlog يؤجل retention/deletion workflow لما بعد Sellable، لكن Pilot يجمع بيانات حقيقية لمكتب → يحتاج policy تنشط قبل نهاية pilot (خصوصًا حذف البيانات عند السحب).
17. EF-107 ينصّ "GitHub workflow يُنشأ محليًا لكن لا push دون موافقة"، بينما PLAN §10 يفترض تشغيل الاختبارات/البناء كإثبات CI. تناقض: كيف يحصل العامل على evidence CI دون push؟
18. EF-106 "API DTOs generate OpenAPI" مع "Contract drift check in CI": لا يُحدد ما يُقارَن به (commit snapshot من OpenAPI؟). غموض contract-drift detection.
19. PLAN §6 "Owner Home" يدمج "content due" ضمن واجهة الـMVP، لكن المحتوى/الحملات في Phase 4؛ غير منطقي ظهورها في Phase 2 demo.
20. "Owner weekly report" (§6, EF-235) لا يحدد ما إذا كان يُسمح بتضمين PII للعميل (اسم/جوال) في PDF/CSV المُولّد، ولا gate Owner-only لتفعيل حقول معينة.

STRENGTHS:
1. فصل صريح بين "operational document" والمستند المعتمد قانونيًا/محاسبيًا مع بوابة مراجعة قبل إعادة توصيف أي وثيقة كقانونية.
2. قاعدة "لا اختراع حقائق عقارية" في MARKETING_AUTOMATION §4 مفصّلة جيدًا، ومقترنة بـ allowlist projection وplaceholders للحقول الناقصة.
3. Transactional outbox مع idempotency keys و bounded retries في AUTOMATION §6 يطابق أنماط durable execution المعروفة.
4. Modular Monolith في PLAN §4 مع تأخير استخراج نواة MamtrexS حتى يثبت المنتج الثاني يتجنّب over-engineering مبكر.
5. قاعدة "Build أخضر لا يعني Feature مكتملة" و Definition of Done لكل code task (§9) تبني ثقة قائمة على evidence بدل ادعاء.
6. Test pyramid شامل يشمل security/visual/accessibility/performance مع DoD لكل task.
7. Money DTO عبر integer minor units + ISO currency code يمنع أخطاء floating-point الشائعة في تطبيقات مالية.
8. Database-enforced exclusion constraint للمعاينات (لا فحص على application) يمنع race condition معروفًا.
9. استخدام بيانات synthetic فقط في Portfolio demo يحمي خصوصية بيانات العميل.
10. ADR-006 يفصل tenant-aware الآن عن self-service SaaS لتقليل مخاطر retrofitting.

RECOMMENDED_PATCHES:

أ) PLAN §3 و §8 و REQUIREMENTS_TRACEABILITY.md — تقسيم Phase 2 Gate:
```
Phase 2A: identity+properties+CRM+deals+finance.
Phase 2B: viewings+conflicts+suggested follow-ups+sales demo.
Phase 2 Gate يقبل 2A فقط، و2B هو شرط دعوة Pilot.
```
أو نقل EF-501/EF-502 إلى Milestone 2E داخل Phase 2.

ب) FINANCE_AUTOMATION §3 — إضافة قاعدة إعادة فتح الفترة:
```
- Reopening a closed AccountingPeriod requires Owner role + written reason
  + audit event including before-period totals. Re-opening is logged with
  signer identity; ordinary posting into reopened periods remains forbidden
  and corrections always use reversal entries.
```

ج) AUTOMATION §6 + FINANCE_AUTOMATION §7 — ربط idempotency:
```
idempotency_key = sha256(
  organization_id, rule_id, rule_version, event_id,
  action_type, target_type, target_id, schedule_bucket
)
Worker rejects replays that resolve to a recorded terminal state.
```

د) FINANCE_AUTOMATION §7 — إضافة rule maker-checker للعمولات:
```
AUT-C01b: Commission payable aggregate ≥ X (SAR) requires explicit Owner
approval before status transitions to "payable-posted"; below threshold
follows AUT-C01 path. Threshold and approver role are configuration, not code.
```

هـ) PRD §5 + خطة logging — إضافة سياسة PII:
```
- Name, phone, email, precise geo are PII.
- Default log level in production is INFO; PII fields appear only under a
  PI-DEBUG flag whose activation is itself audited.
- Per-organization PII access report available within 30 days.
```

و) PLAN §4.4 + Phase 7 — gate MamtrexS kernel:
```
- packages/kernel (when extracted) ships with a contract test:
  `grep -E 'property|listing|broker|viewing' packages/kernel` must return 0.
  CI fails on violation. Same check runs as a Prisma migration guard.
```

ز) PLAN §10 — استبدال النصوص الرمزية بأدوات محسومة:
```
"security:scan": "pnpm audit --prod && gitleaks protect --staged --redact && eslint --plugin security",
"openapi:check": "node scripts/openapi-drift.ts --generated --committed --fail-on-diff"
```

ح) AUTOMATION §7 AUT-M02 — توضيح إعادة التحقق:
```
AUT-M02 fires only if ContentItem.content_hash equals the last-approved
hash AND adapter config (channel credentials, schedule timezone) is
unchanged since approval timestamp; otherwise the item is rerouted to
review queue with reason.
```

ط) FINANCE_AUTOMATION §3 + PRD §5 — retention policy:
```
AuditEvent and posted JournalEntry are retained for ≥ 7 years from
fiscal period close; deletion requires Owner request, written reason,
and audit entry; legal-hold supersedes retention.
```

ي) PLAN §7 + FINANCE_AUTOMATION §8 — data residency:
```
Pilot/production deployment region is fixed at onboarding and recorded
in TenantConfig; database + object-storage live in chosen region;
cross-region backups carry org-id scrubbing.
```

ك) PLAN §11 + EF-107 — حل تناقض CI:
```
Local verification runs `pnpm verify:local` (lint + typecheck + test +
test:integration + build) and is recorded in phase handoff.
Remote CI activation is one-time and requires Mamdouh approval + a
secret-store entry recorded in settings.json. CI echo is forbidden.
```

ل) PRD §4.1 + EF-120 — ADR auth strategy قبل التنفيذ:
```
ADR-007 (auth session): choose between JWT-only access + rotating refresh
or http-only cookie + CSRF; document token lifetime, rotation, lockout,
logout, device-binding policy. Without ADR-007 accepted, EF-120 does not
start.
```

م) PLAN §6 + EF-704 — Portfolio incremental:
```
Phase 2 close produces portfolio/case-study-ar.md (draft) + 3 screenshots.
Phase 4 close adds sequence diagrams + attribution walkthrough.
Phase 7 close freezes the public-ready package.
```

ن) FINANCE_AUTOMATION §5 — Privacy-by-reporting:
```
Owner weekly report PDF/CSV export hides PII fields by default;
per-field inclusion is a per-office Owner setting, audited on change.
```
