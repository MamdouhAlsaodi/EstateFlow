# EstateFlow — Complete Development Plan

> **For Yui:** Execute this plan through bounded task packets and independent verification, one accepted slice at a time. Use TDD for isolated behavior and preserve every phase handoff under `docs/handoffs/`.

**الهدف:** بناء منصة تشغيل عقارية عربية قوية تجمع Listings وCRM وFinance وAutomation وContent/Marketing، تصلح كمشروع تدريبي بارز في Portfolio، ويمكن تحويلها بعد التحقق التجاري إلى منتج يباع لمكاتب العقار.

**النهج المعماري:** Modular Monolith منظم حسب الـfeature، مع Next.js للواجهة، NestJS للـAPI، PostgreSQL/PostGIS للبيانات، Redis/BullMQ للمهام المؤجلة، وWorker منفصل للأعمال الثقيلة. كل Feature يملك UI وAPI use-cases وdomain policy وpersistence adapters واختباراته، بينما تبقى الوحدات العامة المرشحة لـMamtrexS خلف حدود واضحة دون استخراج مبكر إلى Microservices.

**Tech Stack المقترح:** TypeScript، Next.js App Router، NestJS، Prisma مع SQL migrations مخصصة لـPostGIS والقيود المتقدمة، PostgreSQL/PostGIS، Redis/BullMQ، OpenAPI، Jest/Supertest، Playwright، Docker Compose، GitHub Actions عند اعتماد Git.

**الحالة:** Training Demo scope approved; EF-101 workspace/tooling foundation verified PASS.  
**نمط القرار:** `approved-phase-autopilot` داخل المرحلة المعتمدة فقط.  
**قاعدة Git:** لا commit ولا push إلا بطلب صريح من ممدوح.

---

## 1. فلسفة المشروع

EstateFlow ليس تمرين CRUD كبيرًا. نجاحه يجب أن يظهر أربعة أمور:

1. **قدرة تعليمية:** يعلّم Architecture، Domain Modeling، Security، Testing، Queues، Geo، Finance، Observability وDevOps بصورة مترابطة.
2. **قيمة Portfolio:** كل مرحلة تنتج Demo، screenshots، diagrams، test evidence وشرحًا تقنيًا يمكن عرضه لصاحب عمل أو عميل.
3. **قيمة تشغيلية:** يساعد مكتبًا عقاريًا على إدارة Lead → Viewing → Deal → Commission/Receivable → Payment → Report.
4. **قابلية تجارية:** لا يُسمى منتجًا جاهزًا للبيع قبل اجتياز بوابات tenant isolation، security، backups، audit، onboarding وpilot evidence.

### مبادئ ثابتة

- Finance وAutomation جزء من الـcore وليسا صفحات تجميلية.
- لا Microservices لمجرد المظهر؛ Modular Monolith أولًا، وWorker مستقل فقط للأعمال الثقيلة/المؤجلة.
- لا abstraction لمتطلبات MamtrexS غير المعروفة؛ نعيد استخدام الحدود المثبتة فقط.
- كل business mutation له Use Case صريح؛ لا `save()` عام يخفي المعنى.
- UI لا يتصل بقاعدة البيانات أو ORM؛ المسار دائمًا:

```text
Web UI → typed API contract → application use-case → domain policy → repository adapter
```

- المبلغ المالي integer minor units + currency code، وليس floating point.
- Posted financial entries وcontract audit events لا تُعدل؛ التصحيح بإجراء جديد قابل للتتبع.
- External publishing والتحصيل الحساس يحتاجان approval في النسخة الأولى.
- Build أخضر لا يعني Feature مكتملة؛ يلزم اختبار behavior وruntime evidence.

---

## 2. مستويات المنتج المستهدفة

### المستوى A — Training Demo

**الغرض:** التعلم والعرض في Portfolio.

يحتوي على بيانات demo مصطنعة، CRM، basic Listings، Finance flow، Automation simulation، Content Calendar وتقارير. لا يتصل بحسابات اجتماعية أو بيانات عميل حقيقي.

**دليل الاكتمال:** فيديو قصير، screenshots، architecture diagram، test report، seeded demo، وشرح قرارات التصميم.

### المستوى B — Office Pilot

**الغرض:** تشغيل محدود لدى مكتب واحد بقرار واضح ومسؤول واحد.

يضيف organization isolation، onboarding، import، backups، monitoring، reminder delivery channel واحد، بيانات حقيقية محدودة، دعم وتشغيل موثق.

**دليل الاكتمال:** قبول pilot، تقرير أسبوعي، incident/backup drill، ومقاييس استخدام دون تسريب بيانات العميل.

### المستوى C — Sellable v1

**الغرض:** منتج متكرر يمكن تهيئته لأكثر من مكتب.

يضيف provisioning مضبوطًا، tenant lifecycle، configurable branding/workflows، service boundaries، security/release gates، legal/privacy docs، support policy، pricing/package definition وupgrade path.

**لا يشمل تلقائيًا:** public SaaS signup، subscription billing، payment gateway، certified e-signature أو autonomous publishing. كل واحد منها Roadmap مستقل بعد إثبات الحاجة.

---

## 3. نطاق الـMVP وترتيب القيمة

### P0 — يجب أن يعمل في الـPortfolio MVP

- Organization-aware Auth/RBAC.
- Basic Property/Listing CRUD وصور آمنة.
- Lead CRM: owner، stage، timeline، notes، tasks، next action.
- Deal lifecycle.
- Finance: ledger، commission، receivable/invoice، partial payment، expense، owner summary.
- Automation foundation مع Lead/finance reminders داخل النظام.
- Content Calendar، approvals، listing-to-content drafts، UTM attribution.
- Viewing scheduling ومنع التعارض من قاعدة البيانات.
- Audit trail وArabic-first responsive UI.

### P1 — بعد اكتمال الـvertical slice

- Geo radius/polygon search وmap clustering.
- Email/WhatsApp provider adapter واحد بعد approval.
- CSV import/export مضبوط.
- PDF owner report.
- Manual publishing bundle ثم channel API واحد.
- Simplified contract flow وPDF/hash/audit.
- English locale كامل.

### P2 — مؤجل حتى يثبت السوق الحاجة

- Heavy video pipeline و360 renderer.
- Google OAuth.
- AI property recommendations.
- Payment gateway/bank reconciliation.
- Certified e-signature.
- Native mobile app.
- Self-service SaaS billing.
- Fully autonomous social publishing.

---

## 4. البنية التقنية المستهدفة

### 4.1 هيكل المشروع

```text
estateflow/
├── apps/
│   ├── api/                         # NestJS modular monolith
│   │   ├── prisma/
│   │   │   ├── schema.prisma
│   │   │   ├── migrations/
│   │   │   └── seed.ts
│   │   └── src/
│   │       ├── bootstrap/
│   │       ├── common/              # true cross-cutting primitives only
│   │       └── features/
│   │           ├── identity/
│   │           ├── organizations/
│   │           ├── properties/
│   │           ├── leads/
│   │           ├── deals/
│   │           ├── finance/
│   │           ├── automations/
│   │           ├── campaigns/
│   │           ├── content/
│   │           ├── viewings/
│   │           ├── contracts/
│   │           ├── notifications/
│   │           └── audit/
│   ├── web/                         # Next.js App Router
│   │   └── src/
│   │       ├── app/[locale]/
│   │       ├── features/
│   │       ├── components/
│   │       ├── design-system/
│   │       └── lib/api-client/
│   └── worker/                      # BullMQ processors / media jobs
│       └── src/features/
├── packages/
│   ├── api-client/                  # generated from OpenAPI
│   ├── config/                      # typed environment contracts
│   ├── design-tokens/               # colors/type/spacing, no business logic
│   └── test-fixtures/                # synthetic isolated fixtures only
├── infra/
│   ├── compose/
│   ├── postgres/
│   ├── redis/
│   └── observability/
├── docs/
│   ├── architecture/
│   ├── api/
│   ├── diagrams/
│   ├── handoffs/
│   ├── portfolio/
│   └── runbooks/
├── scripts/
├── pnpm-workspace.yaml
└── package.json
```

### 4.2 شكل كل Feature في الـAPI

```text
features/leads/
├── domain/                 # entities, value objects, state policy, ports
├── application/            # create-lead, change-stage, assign-owner
├── adapters/http/          # controller, DTO parsing, response mapping
├── adapters/persistence/   # Prisma repository and mapping
├── contracts/              # stable error/response shapes
└── tests/                  # domain, use-case, API, integration
```

القواعد:

- Domain لا يستورد NestJS أو Prisma أو Redis أو provider SDK.
- Use Case يملك authorization، validation، transaction intent وstate transition.
- Repository يعزل persistence فقط ولا يتخذ business decisions.
- Controller رقيق: parse → invoke → map.
- كل route يحدد actor، organization scope، success DTO وtyped errors.

### 4.3 الشكل داخل الـWeb

```text
features/leads/
├── api/lead-api.ts
├── components/LeadBoard.tsx
├── components/LeadForm.tsx
├── schemas/lead-form-schema.ts
├── hooks/use-leads.ts
└── tests/
```

- لا ORM أو server service داخل Client Components.
- Loading/empty/error/unauthorized states جزء من Definition of Done.
- كل mutation يستخدم API client واحدًا يطبق credentials، CSRF، request ID وerror mapping.
- الصفحات تركّب feature components؛ لا تتحول الصفحة إلى ملف business ضخم.

### 4.4 حدود MamtrexS

**مرشح مشترك بعد الإثبات:** organizations، contacts/leads، pipelines، finance، automations، campaigns/content، notifications، approvals، audit.

**EstateFlow فقط:** properties، listing publication، geo، broker availability، viewings، real-estate contracts.

لا ننشئ الآن package باسم `mamtrexs-core`. يتم الاستخراج فقط عندما يثبت المنتج الثاني أن العقد متطابق فعلًا.

---

## 5. استراتيجية البيانات

### 5.1 قواعد عامة

- كل business row يحمل `organization_id` عندما ينتمي لمكتب.
- كل query/mutation يمر عبر organization-scoped repository method.
- composite unique constraints تشمل `organization_id` عند الحاجة.
- UUID/ULID غير قابل للتخمين بدل IDs متسلسلة عامة.
- timestamps محفوظة UTC؛ العرض حسب timezone المكتب.
- soft delete للكيانات التشغيلية فقط عندما يلزم؛ financial/audit records لا تُحذف.
- optimistic concurrency (`version`) للعمليات القابلة للتعارض.
- audit يسجل actor، action، target، before/after projection الآمن، time، request/correlation ID.
- `name` و`phone` و`email` وprecise geo وfree-text notes تُصنّف PII؛ production logs تحذفها أو تستخدم masked identifiers حتى في debug، وأي diagnostic override مؤقت يكون مقيدًا ومُدققًا.
- Owner reports وCSV/PDF exports تخفي PII افتراضيًا؛ تضمين حقل حساس يحتاج إعدادًا per-organization وصلاحية Owner وسجل audit.

### 5.2 Finance invariants

- `JournalEntry` balanced قبل posting.
- `JournalLine.amount_minor` عدد صحيح موجب واتجاهه debit/credit صريح.
- Posted entry immutable.
- Reversal يشير إلى الأصل.
- Invoice open balance مشتق من lines/payments؛ لا يُكتب يدويًا كحقيقة مستقلة.
- Payment command idempotent.
- Commission accrual يتطلب triggering deal event وسياسة محفوظة الإصدار.
- Closed period يمنع posting العادي.
- إعادة فتح AccountingPeriod تتطلب Owner permission، سببًا مكتوبًا، independent finance review قبل الـPilot، وAuditEvent يحفظ actor/time/reason وperiod totals قبل الفتح. التصحيح يبقى reversal + replacement، لا تعديلًا للقيود المنشورة.
- انتقال عمولة من `due` إلى payable/posting يخضع maker-checker policy عند تجاوز configurable threshold؛ العتبة والدور إعدادات وليسا رقمًا hard-coded.
- API يعيد الأموال كـstring minor units أو Money DTO آمن من overflow.

### 5.3 Geo وViewing concurrency

- PostGIS `geography(Point, 4326)` للعقار.
- GiST index للاستعلامات الجغرافية.
- parameterized raw SQL فقط عندما لا يغطي ORM الاستعلام.
- Viewing time overlap يُمنع بـPostgreSQL exclusion constraint، لا بفحص application وحده.
- Integration test يرسل حجوزات متوازية ويثبت نجاح واحدة ورفض التعارض.

### 5.4 Events وAutomation

- business transaction تكتب domain record + outbox event في transaction واحدة.
- Worker يسحب outbox/queue بآلية idempotent.
- مفتاح التنفيذ مشتق حتميًا من `organization_id + rule_id + rule_version + event_id + action_type + target_type + target_id + schedule_bucket`؛ terminal execution يمنع replay لنفس المفتاح.
- execution state: queued → running → succeeded / retrying / failed / cancelled.
- لا تُسجل provider token أو full message body أو Lead PII أو precise geo في logs.
- dead-letter item ظاهر للمدير مع retry/cancel reason.

---

## 6. UX والهوية البصرية

### الاتجاه

واجهة **Arabic-first operational cockpit**، لا Dashboard template عام. الشخصية البصرية مأخوذة من ملفات العقار والعقود والخرائط: هادئة، دقيقة، موثوقة، وتعرض المال والمهام بوضوح.

### تصميم مقترح يخضع لمراجعة Phase 0

- خلفية فاتحة محايدة ونص داكن لسهولة العمل الطويل.
- لون أساسي Deep Navy للثقة، ولون Cobalt/Teal محدود للحركة والخرائط.
- Gold لا يُستخدم كزينة؛ يُحجز لحالة deal/financial milestone ذات معنى.
- خط عربي واضح للواجهة، وخط utility tabular للأرقام المالية.
- Signature element: **Transaction/Lead Timeline واحدة** تربط الاتصال والمعاينة والصفقة والمال والحملة في خط تشغيلي قابل للتصفية.

### صفحات الـPortfolio MVP

- Login/Account Recovery.
- Owner Home: cash، receivables، commissions، Lead SLA، content due.
- Leads Kanban + list + detail timeline.
- Properties list/detail/create/edit.
- Deal workspace.
- Finance: ledger summary، invoices، payments، expenses، commissions، reports.
- Automations list/rule detail/execution history.
- Content calendar/editor/approval.
- Campaign detail + attribution/ROI.
- Viewing calendar.
- Admin approval/audit.

### جودة الواجهة

- Responsive من 360px إلى desktop.
- keyboard navigation وvisible focus.
- WCAG AA contrast المستهدف.
- reduced-motion محترم.
- Arabic plural/date/currency formatting.
- empty states توجه للفعل، والأخطاء تشرح السبب والخطوة التالية.
- Skeleton محدود؛ لا نخفي الأخطاء خلف loading أبدي.
- screenshots لكل breakpoint أساسي في كل milestone.

---

## 7. البيئات وإدارة الأسرار

| Environment | البيانات | الاستخدام | قواعد |
|---|---|---|---|
| Local | synthetic | التطوير اليومي | Docker Compose، لا secrets حقيقية |
| Test | disposable isolated DB | unit/integration/E2E | reset مسموح داخل DB المحددة فقط |
| Demo | synthetic curated dataset | Portfolio/sales demo | read-friendly، resettable، لا بيانات عميل |
| Pilot | real limited office data | مكتب واحد | backups، audit، access review، approval |
| Production | بعد sellable gate فقط | عدة عملاء | release/change policy منفصل |

- `.env.example` أسماء فقط ولا يحتوي credentials أو fallback secrets.
- production boot يفشل عند غياب JWT/session/DB/provider secrets.
- لا shared development DB في integration tests.
- كل migration لها forward check وbackup/rollback note.
- أي reset يحتاج إثبات اسم قاعدة الاختبار قبل التنفيذ.
- قبل إدخال Pilot data: privacy inventory، consent/notice flow، retention/deletion/exit policy، data-location decision، ومراجعة انطباق المتطلبات القانونية المحلية ومنها PDPL بواسطة مختص؛ الخطة لا تدّعي امتثالًا قانونيًا ذاتيًا.

---

## 8. Roadmap التنفيذية الكاملة

## Phase 0 — Commercial Discovery, Product Design & Contracts

**الحالة:** مكتملة بصيغة Training Demo؛ يظل pilot التجاري مؤجلًا حتى قرار مستقل.  
**الهدف:** إزالة الافتراضات التجارية والتقنية قبل كتابة المنتج.

### Tasks

#### EF-005 — Customer evidence

- مقابلة 5 مكاتب صغيرة أو تثبيت مكتب Pilot مسمى.
- حفظ interview template وملخص مجهّل تحت `docs/research/`.
- جمع artifacts فعلية: spreadsheet fields، follow-up pattern، commission rule، owner report.
- عدم حفظ أسماء/أرقام/بيانات شخصية دون موافقة.

#### EF-006 — First sellable workflow

اختيار workflow واحد:

```text
Listing inquiry → Lead → Follow-up → Viewing → Deal
→ Commission + Receivable → Payment → Owner report
```

وتحديد:

- pilot duration/pricing hypothesis.
- Arabic-only أو bilingual في الـPilot.
- reminder channel الأول.
- manual CSV import contract.
- ما هو operational finance document وما يحتاج مراجعة قانونية/محاسبية.

#### EF-007 — Contracts and ADR review

إنشاء/مراجعة:

- `docs/architecture/system-context.md`
- `docs/architecture/domain-boundaries.md`
- `docs/architecture/data-ownership.md`
- `docs/architecture/auth-session-adr.md`
- `docs/architecture/finance-ledger-adr.md`
- `docs/architecture/automation-outbox-adr.md`
- `docs/architecture/postgis-prisma-spike.md`

#### EF-008 — Interactive UX prototype

- Arabic clickable prototype للـOwner Home، Lead detail، Finance summary وContent Calendar.
- اختبار 3 سيناريوهات مع مستخدمين محتملين.
- تسجيل confusion points والنسخة المعدلة.

### تعليم المرحلة

- Customer discovery.
- Domain Event Storming.
- C4 context/container diagrams.
- ADR writing.
- UX prototype/usability testing.

### Portfolio evidence

- Problem/solution case study.
- Workflow before/after diagram.
- Prototype screenshots.
- Decision log يشرح ما أُجّل ولماذا.

### Gate

لا يبدأ Phase 1 إلا بعد موافقة ممدوح على customer profile، workflow، architecture ADRs وscope.

---

## Phase 1 — Platform Foundation

**الهدف:** أساس تنفيذي آمن وقابل للاختبار، بلا بناء business screens كثيرة.

### EF-101 — Workspace and tooling

**Create:**

- `package.json`
- `pnpm-workspace.yaml`
- `.nvmrc`
- `.editorconfig`
- `.gitignore`
- `tsconfig.base.json`
- `apps/api/`
- `apps/web/`
- `apps/worker/`
- `packages/config/`

**Steps:**

1. Pin compatible Node/package-manager/framework versions.
2. Add scripts: `lint`, `typecheck`, `test`, `test:integration`, `test:e2e`, `build`.
3. Add ESLint/Prettier rules and import-boundary rule.
4. Verify clean install from lockfile.

### EF-102 — Local/test infrastructure

**Create:**

- `infra/compose/docker-compose.local.yml`
- `infra/compose/docker-compose.test.yml`
- `infra/postgres/init.sql`
- `.env.example`

**Services:** PostgreSQL/PostGIS، Redis، optional local mail catcher.

**Acceptance:** local and test database names differ; destructive test scripts reject non-test DB.

### EF-103 — API baseline

**Create:**

- `apps/api/src/main.ts`
- `apps/api/src/app.module.ts`
- `apps/api/src/bootstrap/config.ts`
- `apps/api/src/common/http/api-error.ts`
- `apps/api/src/features/health/`

**Acceptance:** liveness and readiness separate، ValidationPipe، request ID، structured logs، production secret validation.

### EF-104 — Database and migration baseline

- Prisma schema and migration workflow.
- PostgreSQL extensions: PostGIS; `btree_gist` only when viewing constraint lands.
- `PrismaService` DI-managed.
- Integration test harness with FK-safe cleanup.
- No `new PrismaService()` in controller/use-case.

### EF-105 — Web shell and design system

**Create:**

- locale-aware App Router shell.
- design tokens package.
- Arabic navigation and responsive app shell.
- Story/demo page for typography، forms، tables، finance numbers، statuses.
- Error boundary، not-found، loading and empty primitives.

### EF-106 — OpenAPI/API client

- API DTOs generate OpenAPI.
- `packages/api-client` generated reproducibly.
- Web never imports API server internals.
- Contract drift check in CI.

### EF-107 — CI and quality gates

Planned checks:

```bash
pnpm install --frozen-lockfile
pnpm lint
pnpm typecheck
pnpm test
pnpm test:integration
pnpm build
```

GitHub workflow يُنشأ محليًا لكن لا push دون موافقة.

### Phase 1 verification

- production missing-secret boot test fails as expected.
- organization isolation test skeleton ready.
- API health runtime smoke.
- web shell screenshot in Arabic desktop/mobile.
- fresh-clone setup documented.
- independent architecture/import-direction review.

### تعليم/Portfolio

Monorepo، Nest bootstrap، configuration validation، Postgres migrations، OpenAPI generation، design tokens، CI.

---

## Phase 2 — Sellable Operations Slice

تنقسم إلى Milestones صغيرة، ولا تُنفذ كدفعة واحدة.

### Milestone 2A — Identity and Organization

#### EF-120 — Auth domain

- User، Credential، Session/RefreshToken، EmailVerification، PasswordReset.
- Argon2id/password policy.
- short-lived access + rotated refresh session وفق ADR.
- lockout/rate limits.
- cookie security + CSRF إذا اعتمد cookie auth.

#### EF-121 — Organization membership/RBAC

- Organization، Membership، Role، permissions.
- Roles: Owner/Manager، Broker، Client، PlatformAdmin.
- Broker activation approval.
- backend permission policy؛ UI hiding ليس authorization.

#### Tests

- registration/verification/login/refresh/logout/reset.
- wrong password/lockout/rate limit.
- tenant A cannot access tenant B.
- client cannot invoke broker/owner command.
- token/session invalidation.

### Milestone 2B — Properties and Listings

#### EF-201

- Property domain، address/location، ownership، listing status.
- Basic image metadata/upload abstraction.
- create/update/publish/archive commands منفصلة.
- server allowlist للحقول والحالات.
- searchable list/detail؛ map advanced deferred.

#### Portfolio evidence

Property lifecycle diagram، responsive forms، upload validation tests، authorization matrix.

### Milestone 2C — CRM and Deals

#### EF-202 — Leads

- Create from inquiry/manual.
- owner assignment، stage، next action، source/UTM، timeline.
- Kanban uses explicit stage-change endpoint.
- optimistic concurrency prevents lost update.

#### EF-203 — Deal

- closed-won/lost command with reason.
- link Lead، Property، Broker، Campaign.
- closed-won emits versioned domain event for Finance.

#### Tests

- valid/invalid state transitions.
- duplicate command idempotency.
- unowned Lead restrictions.
- cross-organization denial.
- timeline append behavior.

### Milestone 2D — Finance Core

#### EF-231 — Ledger

**Paths:**

- `apps/api/src/features/finance/domain/`
- `apps/api/src/features/finance/application/post-journal-entry.ts`
- `apps/api/src/features/finance/adapters/persistence/`
- `apps/api/src/features/finance/tests/`

**TDD order:**

1. Money value object and currency mismatch tests.
2. balanced journal validation.
3. draft posting.
4. immutable posted entry.
5. reversal.
6. accounting period close behavior.
7. organization isolation.

#### EF-232 — Commissions

- versioned CommissionPlan.
- accrual from Deal event.
- expected → confirmed → due → paid/cancelled.
- split recipients and rounding policy.

#### EF-233 — Invoices/receivables/payments

- invoice draft/issue/cancel rules.
- due date and aging.
- partial/full payment.
- idempotent payment recording.
- no gateway in MVP.

#### EF-234 — Expenses

- category، vendor/payee reference، campaign/property/deal dimensions.
- approval threshold policy.
- evidence attachment metadata.

#### EF-235 — Owner Finance Dashboard

- cash-in/out.
- receivables aging.
- commission due/paid.
- revenue/margin by deal/property.
- freshness timestamp and drill-down.
- CSV/PDF after query correctness is proven.

#### Finance verification

- property-based test: posted entries always balance.
- concurrency test: duplicate payment command posts once.
- reconciliation test: dashboard totals equal journal query.
- authorization: صلاحيات Broker تسمح له برؤية عمولته فقط، ولا تسمح له بتسجيل owner-level adjustments.
- export structure and formula-injection protection.

### Milestone 2E — Basic Viewings for the sellable slice

- viewing request/confirm/reschedule/cancel/complete/no-show.
- database exclusion constraint prevents overlapping confirmed slots.
- concurrent booking integration test proves one success and one typed `409 VIEWING_CONFLICT`.
- basic 24h/1h in-app reminder records are created; durable external delivery remains Phase 3.
- Lead timeline records viewing state and outcome.

### Phase 2 demo

```text
Create Listing → receive Lead → assign/follow up
→ schedule conflict-safe Viewing → close Deal
→ accrue commission → issue receivable → record partial/full payment
→ see owner report
```

### Phase 2 learning/Portfolio

Domain state machines، RBAC، tenant isolation، double-entry accounting، idempotency، booking concurrency، report reconciliation، end-to-end demo. Phase 2 also creates a draft Arabic case study and three verified screenshots; later phases expand rather than restart the Portfolio package.

### Gate

ممدوح يقبل الـvertical slice فعليًا—بما فيه Basic Viewing وعدم التعارض—قبل إضافة automation breadth. لا يُدعى Office Pilot قبل هذا gate.

---

## Phase 3 — Automation & Reminders

### EF-301 — Rule contracts

- Trigger schema/version.
- typed Conditions.
- allowlisted Actions.
- organization scope، rule version، enabled state، cooldown/deduplication.
- no arbitrary JavaScript/code execution.

### EF-302 — Durable execution

- transactional outbox.
- BullMQ queue adapter.
- execution/idempotency record.
- deterministic idempotency key over organization/rule-version/event/action/target/schedule bucket with a database unique constraint.
- bounded retries/backoff.
- dead-letter/failed state visible.
- safe logs and correlation IDs.

### EF-303 — Lead automations

- Lead created → owner/task.
- stage SLA exceeded → reminder/escalation.
- missing next action → daily internal task.
- duplicate event does not duplicate task.

### EF-304 — Finance automations

- receivable due soon → reminder draft.
- overdue → collection task/escalation.
- commission due → internal notification.
- closed period/payment failure do not silently advance workflow.

### EF-305 — Notification templates and approvals

- Arabic/English templates.
- draft → approved → sent/failed.
- in-app channel first.
- email/WhatsApp adapter behind explicit port after credentials approval.
- quiet hours، timezone، opt-out/consent policy.

### EF-306 — Automation UI

- rule list/detail.
- execution history.
- retry/cancel allowed by permission.
- reason shown for skip/failure.
- no raw provider payload or secret.

### Verification

- fake clock tests.
- duplicate event/idempotency tests.
- retry then permanent failure test.
- timezone/DST boundary tests.
- approval-required action cannot send directly.
- worker restart does not lose queued work.

### Learning/Portfolio

Queues، outbox، retries، idempotency، temporal testing، provider ports، observability dashboard.

---

## Phase 4 — Content & Campaigns

### EF-401 — Campaigns and attribution

- budget planned/actual، objective، channel، dates، UTMs.
- first-touch، last-touch، touch history.
- authorized correction with audit reason.
- manual performance entry first.

### EF-402 — Content workflow

- idea → draft → review → approved → scheduled → published/failed.
- version/hash on approval.
- published content immutable; revision creates variant.
- calendar and review queue.

### EF-403 — Safe listing-to-content generation

- allowlisted property projection.
- templates per channel.
- missing facts become placeholders.
- prohibit invented price/location/area/legal claim.
- AI, if added later, is a draft adapter behind approval and provenance.

### EF-404 — Publishing adapters

Stage 1:

- share-ready bundle and manual confirmation.
- UTM link generation.

Stage 2 after approval:

- one official channel API.
- credential vault/secret boundary.
- provider confirmation، retry، rate limit، revocation behavior.
- قبل كل attempt يعاد التحقق أن `content_hash` يساوي آخر approved hash وأن channel/schedule/credential configuration لم تتغير منذ الموافقة؛ وإلا يعود العنصر إلى review queue بسبب واضح.

### EF-405 — Marketing analytics

- spend، Leads، qualified Leads، wins، attributed revenue.
- CPL، CAC، ROI.
- `not enough data` for invalid denominator.
- first/last-touch views.
- data-completeness warnings.

### Verification

- generated draft cannot contain unapproved fields.
- approval hash changes when content changes.
- unapproved item cannot publish.
- duplicate provider response is idempotent.
- attribution correction is audited.
- campaign finance totals reconcile to Finance Core.

### Learning/Portfolio

Content state machine، API adapter، human-in-the-loop AI safety، attribution models، marketing analytics، calendar UX.

---

## Phase 5 — Advanced Viewings & Geo Discovery

Basic conflict-safe viewing exists from Milestone 2E. هذه المرحلة توسع availability، automation depth، geo discovery وperformance؛ لا تعيد بناء الأساس.

### EF-501 — Availability and conflict prevention

- broker availability rules.
- viewing request/confirm/reschedule/cancel/complete/no-show.
- PostgreSQL exclusion constraint for overlapping confirmed intervals.
- transaction maps DB conflict إلى typed `409 VIEWING_CONFLICT`.

### EF-502 — Viewing automation

- 24h/1h reminders.
- outcome request.
- follow-up task and suggested Lead transition.
- no automatic closing of Lead without business approval.

### EF-510 — Geo search

- normalized location data.
- radius، polygon، bbox، filters.
- GiST index and explain-plan evidence.
- map clustering and list-map synchronization.
- pagination/cursor rules.

### Verification

- parallel booking race test.
- timezone/reschedule reminder cancellation.
- geo correctness fixtures.
- P95 target under agreed data volume.
- unauthorized precise location fields are not leaked where privacy requires reduction.

### Learning/Portfolio

PostGIS، exclusion constraints، race conditions، maps، performance profiling، spatial UX.

---

## Phase 6 — Media, Contracts, Admin & i18n

### EF-601 — Media pipeline

- signed upload intent.
- MIME/size/signature validation.
- image variants.
- async video processing only if still justified.
- storage adapter and orphan cleanup policy.
- no server filesystem path in DTO.

### EF-610 — Contracts

- approved template/version.
- data snapshot used for generation.
- PDF hash.
- sequential signatures/acknowledgments.
- append-only audit events.
- clearly labelled operational/simple e-sign, not certified legal signature.

### EF-620 — Admin and moderation

- broker approval/suspension.
- listing moderation.
- audit search.
- failed jobs/automation review.
- privileged actions require reason and re-auth where appropriate.

### EF-630 — Arabic/English

- complete translation inventory.
- RTL/LTR visual regression.
- locale-aware dates/numbers/currency.
- PDF Arabic font embedding.
- no hardcoded visible strings in feature code.

### Verification

- malicious upload cases.
- XSS payload rendering as text.
- contract hash/audit integrity.
- privileged action authorization.
- i18n missing-key check.
- Arabic PDF visual inspection.

### Learning/Portfolio

Async media، object storage، document generation، immutable audit، admin security، internationalization.

---

## Phase 7 — Pilot Hardening & Market Launch

### EF-701 — Security audit

- Auth/session/CSRF/CORS/rate limits.
- IDOR/tenant isolation.
- OWASP-focused API tests.
- secrets/config scan.
- user-content XSS review.
- dependency/license audit.
- no default production credential.
- independent security/privacy review before Pilot؛ ثم focused review لكل release حساس ومراجعة دورية يحدد cadence الخاص بها عقد التشغيل، بدل اعتبار EF-701 فحصًا لمرة واحدة.

### EF-702 — Reliability and operations

- liveness/readiness.
- structured logs، metrics، queue dashboard، alert thresholds.
- database backup and restore drill.
- migration rehearsal.
- retention/deletion policy.
- incident and support runbooks.

### EF-703 — Pilot onboarding

- office configuration.
- reviewed CSV import with dry-run/report.
- named decision owner.
- user training and quick guide.
- pilot success dashboard.
- weekly feedback/release cadence.

### EF-704 — Portfolio release

Create:

- `docs/portfolio/case-study-ar.md`
- `docs/portfolio/architecture-tour.md`
- `docs/portfolio/security-and-testing.md`
- `docs/portfolio/finance-walkthrough.md`
- `docs/portfolio/demo-script.md`
- demo video and screenshots with synthetic data.

### EF-705 — Sellable-product gate

Before calling it sellable:

- tenant isolation passes.
- backup restore exercised.
- privacy/terms/support boundaries documented.
- configurable branding and workflow defaults.
- onboarding can be repeated without code fork.
- critical financial/automation states audited.
- pilot evidence demonstrates value.
- pricing/package assumptions reviewed.
- explicit deployment and customer-data approval.

---

## 9. Testing strategy

### Test pyramid

| Type | Scope | أدوات | Gate |
|---|---|---|---|
| Unit | Money، state machines، rules، mappers | Jest | كل task behavior |
| Use-case | authorization، validation، ports | Jest + fakes | كل command/query |
| Repository integration | SQL/Prisma، constraints، transactions | Jest + isolated Postgres | كل persistence boundary |
| API integration | DTO، status، auth، error mapping | Supertest | كل consequential endpoint |
| Worker integration | queue، retry، idempotency | Jest + isolated Redis | كل automation processor |
| UI component | forms، states، accessibility | Testing Library | كل critical form/view |
| E2E | user journeys | Playwright | كل milestone demo |
| Security | IDOR، XSS، CSRF، rate limits، secrets | automated + review | phase/release gates |
| Performance | geo/report/query/queue | k6 أو scripted benchmark | agreed hotspots |
| Visual/accessibility | Arabic/English، breakpoints، keyboard | Playwright screenshots + axe | major pages |

### Critical test matrix

#### Auth/tenant

- happy path and invalid payload.
- wrong role.
- wrong organization.
- deleted/suspended membership.
- expired/revoked session.
- CSRF missing/invalid when applicable.

#### Finance

- balanced/unbalanced journal.
- reversal.
- closed period.
- duplicate payment.
- partial payment.
- commission rounding/split.
- report reconciliation.
- concurrent duplicate command.

#### Automation

- duplicate event.
- delayed execution.
- clock/timezone edge.
- retryable/permanent failure.
- approval gate.
- provider timeout and callback duplication.

#### Marketing

- missing UTM.
- unknown source.
- first/last-touch.
- zero denominator.
- edited-after-approval content.
- provider rate limit/revoked credential.

#### Viewing

- overlapping concurrent requests.
- reschedule cancellation of old reminders.
- timezone boundaries.

### Definition of Done لكل code task

- RED observed for the intended missing behavior.
- minimal GREEN implementation.
- focused test passes.
- relevant regression suite passes.
- lint/typecheck clean.
- changed paths within Task Packet.
- no secrets/debug fixtures/unrelated files.
- handoff records commands and output.
- independent Yui verification.
- UI tasks include screenshot and console check.

---

## 10. Quality and release commands

الأوامر النهائية تُثبت في Phase 1، والـcontract المستهدف:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm test:integration
pnpm test:e2e
pnpm build
pnpm openapi:check
pnpm security:scan
```

لا يُستبدل test script بـ`echo`. Build وtests يجب أن تشغل أدوات حقيقية.

- قبل Remote CI، يعمل `pnpm verify:local` كتركيب حقيقي من lint + typecheck + unit + integration + build وتُحفظ نتيجته في handoff.
- Phase 1 يختار أداة فعلية لكل من `openapi:check` و`security:scan` ويثبت fail threshold؛ لا تبقى الأسماء wrappers فارغة.
- Remote CI activation وsecret-store configuration يحتاجان موافقة ممدوح؛ جودة local evidence لا تعتمد على push.

### Phase handoff format

كل handoff يحتوي:

- task/phase ID.
- files/symbols changed.
- acceptance criteria.
- RED/GREEN evidence عند تطبيق TDD.
- commands ونتائجها.
- runtime/browser evidence.
- security/data side effects.
- risks/deferred work.
- verdict: `PASS | PARTIAL | BLOCKED`.

---

## 11. أسلوب التنفيذ والتفويض

1. Yui تختار task صغيرًا من المرحلة المعتمدة.
2. تكتب Task Packet بالإنجليزية:
   - goal.
   - exact paths/symbols.
   - allowed/forbidden paths.
   - changed-file budget.
   - tests/commands.
   - handoff path.
3. Pi/MiniMax ينفذ slice محددًا فقط.
4. Yui تراجع diff وتقرأ الملفات عالية الخطورة.
5. Yui تشغل الاختبارات/build/runtime independently.
6. عند failure: recovery packet واحد لسبب جذري، لا إعادة تشغيل عشوائي.
7. لا تبدأ المهمة التالية قبل verdict نظيف.
8. لا commit/push/deploy دون موافقة ممدوح.

### توقف إلزامي

- secrets أو provider credentials.
- real customer data import.
- destructive migration/reset.
- external publishing enablement.
- network/public exposure.
- paid provider.
- architecture boundary affecting MamtrexS.
- build/release/deploy to pilot/production.
- customer PII، retention/deletion policy، أو legal/accounting interpretation.

قبل Pilot/Sellable gate يلزم reviewer مستقل لمسارات Finance وSecurity/Privacy. ممدوح يبقى صاحب القرار، والمراجعة الثانية evidence وليست نقلًا للملكية.

---

## 12. الخطة التعليمية

| المرحلة | ما نتعلمه | ما نعرضه |
|---|---|---|
| 0 | Discovery، ADR، UX، domain modeling | Case study + prototype |
| 1 | Monorepo، Nest/Next، Postgres، CI | architecture foundation |
| 2 | Auth، RBAC، DDD، finance، transactions | end-to-end commercial slice |
| 3 | Queues، outbox، idempotency، time | automation execution history |
| 4 | Content workflow، attribution، adapters | campaign ROI demo |
| 5 | PostGIS، concurrency، performance | map + no-double-booking proof |
| 6 | media، documents، audit، i18n | Arabic product polish |
| 7 | security، backups، operations، sales | portfolio/pilot package |

### Learning journal

بعد كل milestone:

- ما المشكلة؟
- لماذا اخترنا الحل؟
- ما البدائل المرفوضة؟
- ما الاختبار الذي أثبت الصحة؟
- ما الشيء القابل لإعادة الاستخدام؟
- ماذا سيتغير لو أصبح المنتج SaaS؟

يُحفظ الملخص في `docs/learning/<milestone>.md`، ويغذي Portfolio بدل نشر كود بلا قصة.

---

## 13. Portfolio package

### مواد العرض

- Arabic interactive demo ببيانات synthetic متماسكة.
- 3–5 دقائق walkthrough.
- 10 screenshots منتقاة لا dump لكل صفحة.
- C4 context/container diagrams.
- ER diagram للـcore modules.
- sequence diagrams:
  - Lead to Deal.
  - Deal to Commission/Receivable.
  - Outbox to Reminder.
  - Content Approval to Publication.
- test/coverage summary مع تفسير، لا رقم منفرد.
- security checklist.
- performance result للGeo/concurrency.
- before/after business workflow.

يُبنى Portfolio تدريجيًا: Phase 2 ينتج case-study draft + 3 screenshots، Phase 4 يضيف attribution/content diagrams، Phase 5 يضيف concurrency/geo evidence، وPhase 7 يجمد النسخة العامة بعد إزالة أي PII.

### قصة المشروع

لا نقول: «بنيت CRM عقاريًا كاملًا» فقط. نقول:

> صممت EstateFlow لتقليل ضياع العملاء وإظهار الحقيقة المالية للمكتب، وربطت الحملة والـLead والصفقة والعمولة والتحصيل، مع Automation قابلة للمراجعة وContent workflow بموافقة بشرية. أثبتت التعارضات والـtenant isolation والقيود المالية باختبارات حقيقية.

### Demo data

- مكتب واحد/اثنان synthetic.
- Brokers بأدوار مختلفة.
- Properties متنوعة.
- Campaigns بمصروفات وUTM.
- Leads في مراحل مختلفة.
- Deal رابح وآخر خاسر.
- receivable partial/overdue.
- commission due/paid.
- failed automation retry.
- content draft/approved/published.

لا تستخدم أسماء أو أرقام هواتف حقيقية.

---

## 14. التحول لاحقًا إلى منتج يباع

### ما يكون جاهزًا من التصميم

- organization ownership.
- configurable roles/policies.
- provider adapter boundaries.
- auditable finance/automation.
- API contracts.
- repeatable onboarding/import.
- localization.

### ما لا نبنيه قبل الإثبات

- plan/subscription engine.
- self-service tenant provisioning.
- feature flags لكل تصور مستقبلي.
- microservices لكل domain.
- white-label builder واسع.
- multiple social adapters بلا عميل.

### Productization backlog بعد Pilot

- tenant provisioning/admin.
- branding/theme configuration.
- package/feature entitlement.
- usage metering.
- subscription billing/payment provider.
- data export/deletion/privacy workflows.
- support/SLA/incident policy.
- customer-isolated backups and restore.
- upgrade/migration policy.

يُعتمد فقط بعد pilot evidence وقرار تجاري.

---

## 15. المخاطر وخطط الحد منها

| الخطر | التأثير | الاستجابة |
|---|---|---|
| توسع الـscope بسبب Marketplace + CRM + Finance | تأخير وفقدان التعلم | vertical slice أولًا وP2 مؤجل |
| تصميم MamtrexS مبكرًا | abstractions خاطئة | حدود داخلية ثم extraction بعد المنتج الثاني |
| أخطاء مالية | فقدان ثقة/قرار خاطئ | double-entry، immutability، reconciliation tests، operational label |
| duplicate reminders/posts | إزعاج وسمعة سيئة | idempotency، outbox، provider confirmation |
| social API restrictions | feature متعطلة | manual bundle أولًا وofficial adapter واحد |
| tenant data leak | blocker تجاري | scoped repositories + integration IDOR tests |
| Prisma/PostGIS mismatch | تعطيل geo/concurrency | Phase 0 spike + SQL migrations/repositories |
| UI تبدو template | Portfolio ضعيف | bespoke design tokens/signature timeline/visual critique |
| tests تمر على mocks فقط | ثقة زائفة | isolated DB + API + E2E + runtime evidence |
| الدخول للسوق قبل readiness | ضرر سمعة | Demo/Pilot/Sellable gates منفصلة |
| الاعتماد على provider مدفوع | تكلفة/lock-in | ports/adapters + local/manual defaults |
| بيانات عميل في Portfolio | privacy breach | synthetic data only and anonymized outcomes |

---

## 16. التقدير الزمني الواقعي

هذه تقديرات تخطيطية وليست وعدًا ثابتًا:

- **خلال شهر دخول السوق:** Discovery + interactive sales demo + بداية vertical slice/Pilot agreement.
- **Portfolio MVP متقن:** نحو 12–16 أسبوعًا بوتيرة تعلم وتنفيذ منتظمة.
- **Pilot قوي:** نحو 16–24 أسبوعًا بحسب feedback والقنوات المطلوبة.
- **Sellable repeatable v1:** بعد Pilot ناجح ومرحلة productization منفصلة.

القاعدة: ندخل السوق مبكرًا بعرض صادق وDemo/Pilot، لا نسرّع ادعاء أن كل الـMarketplace أصبح منتجًا تجاريًا.

---

## 17. Milestone scorecard

كل milestone يقاس من 10 نقاط:

- 2 — business outcome demonstrated.
- 2 — authoritative tests and runtime evidence.
- 1 — security/tenant boundary.
- 1 — Arabic responsive UX.
- 1 — documentation/ADR.
- 1 — observability/error behavior.
- 1 — learning note.
- 1 — Portfolio artifact.

أقل من 8/10 يعني milestone غير جاهز للانتقال، حتى لو كان build ناجحًا.

---

## 18. القرارات المطلوبة قبل التنفيذ

### القرار الحالي — Phase 0

اعتماد أحد مسارين:

1. **Pilot-first:** نحدد مكتبًا ونبني vertical slice حول workflow حقيقي.
2. **Demo-first timebox:** نبني Demo synthetic لمدة محددة بالتوازي مع مقابلات السوق.

**توصية Yui:** Demo-first لمدة قصيرة مع interviews بالتوازي، ثم نثبت Pilot scope قبل Phase 2. هذا يحافظ على التعلم والPortfolio ويمنحنا مادة بيع دون بناء المنتج كاملًا في الظلام.

### قرار Phase 1

بعد اعتماد Phase 0:

- architecture stack.
- auth/session model.
- organization scoping policy.
- Finance ledger ADR.
- PostGIS/Prisma spike result.
- initial UI direction.

---

## 19. أول تسلسل تنفيذ بعد الموافقة

1. `EF-005` — interview/demo assumptions and customer evidence.
2. `EF-006` — first workflow and financial owner report.
3. `EF-007` — architecture contracts/ADRs.
4. `EF-008` — Arabic interactive prototype.
5. Phase 0 review/handoff.
6. Explicit Phase 1 approval.
7. `EF-101` workspace/tooling packet.
8. `EF-102` isolated infrastructure packet.
9. `EF-103` API/config/health packet.
10. independent verification before advancing.

هذه الخطة لا تسمح بتسليم المشروع كله لعامل واحد. التنفيذ تسلسلي، محدود، قابل للمراجعة، وكل claim تدعمه نتيجة فعلية.
