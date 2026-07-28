# EstateFlow — Product Requirements v1.1

**Status:** Commercial discovery draft  
**Source of record:** `docs/source/EstateFlow_PRD_v1.0.docx`  
**Direction:** Custom-first product for the first real-estate office, reusable foundations for MamtrexS  
**Decision mode:** approved-phase-autopilot

## 1. Product thesis

EstateFlow is a real-estate operations platform combining a public property marketplace with an internal broker CRM. Its first commercial form is a configurable system sold to one real-estate office, not a broad public SaaS launch.

The first version must prove three business outcomes:

1. No qualified lead is lost because a follow-up was forgotten.
2. Every deal, commission, receivable, expense, and campaign can be traced financially.
3. Listings and follow-up content can be prepared and scheduled with materially less manual work.

The CRM, finance, automation, and campaign-attribution capabilities are designed as reusable modules so MamtrexS can later apply them to agency clients, projects, campaigns, and retainers without importing real-estate-specific rules into the shared core.

## 2. Primary customer and personas

### Paying customer — small real-estate office

A small office or independent brokerage currently coordinating listings, leads, appointments, commissions, and content through WhatsApp, spreadsheets, and personal reminders.

### Operational users

- **Office owner / manager:** cashflow, team performance, campaign ROI, outstanding receivables.
- **Broker:** lead pipeline, viewing schedule, follow-ups, deal and commission status.
- **Property owner:** listing status, interest, viewings, and contract progress.
- **Client:** property discovery, viewing requests, conversations, contracts.
- **Platform admin:** approvals, moderation, audit, and operational support.

## 3. MVP boundaries

### Included

- Secure Auth and role-based access for Admin, Owner, Broker, and Client.
- Organization-aware data ownership from day one (`organization_id`) without building full SaaS subscription billing.
- Listings CRUD with images; heavy video processing can follow after core operations are stable.
- Broker CRM, lead timeline, reminders, tasks, and pipeline stages.
- Finance Core: journal, commissions, receivables, expenses, invoices, payment recording, and dashboards.
- Rule-based automations for follow-up, viewing reminders, finance reminders, and campaign actions.
- Content calendar and listing-to-content drafts with approval before publishing.
- Campaign and lead-source attribution with UTM support and basic ROI reporting.
- Viewing scheduling with database-enforced conflict prevention.
- Simplified e-contract flow and immutable audit trail.
- Arabic/English and real RTL/LTR support.

### Deferred

- Public self-service SaaS signup and subscription billing.
- Native mobile app; API must remain mobile-ready.
- Legally certified national e-signature or DocuSign integration.
- Full autonomous social publishing without human approval.
- AI recommendation engine.
- Payment gateway; MVP records and reconciles payments but does not process them.
- Full media pipeline and custom 360 renderer until first-office validation.

## 4. Functional requirements

### 4.1 Identity and tenancy

| ID | Requirement | Priority |
|---|---|---|
| AUTH-01 | Email/password registration, verification, password reset, refresh-token rotation, and lockout after repeated failures. | P0 |
| AUTH-02 | Roles: Admin, Owner, Broker, Client; broker activation requires approval. | P0 |
| AUTH-03 | Every business record is scoped server-side to an organization and ownership rules prevent IDOR. | P0 |
| AUTH-04 | Google OAuth remains optional after the primary auth flow is secure. | P2 |

### 4.2 CRM and lead operations

| ID | Requirement | Priority |
|---|---|---|
| CRM-01 | Create a Lead automatically from a property inquiry or viewing request, or manually by a broker. | P0 |
| CRM-02 | Stages: new → contacted → viewing scheduled → negotiation → closed won / closed lost. | P0 |
| CRM-03 | Kanban and list views with an append-only stage-change timeline. | P0 |
| CRM-04 | Notes, tasks, owner, due date, next action, follow-up reminder, and inactivity age. | P0 |
| CRM-05 | Link a Lead to one or more properties and record calls, messages, viewings, contracts, and financial events. | P0 |
| CRM-06 | Track source, campaign, UTM data, and referral origin. | P1 |

### 4.3 Finance Core

| ID | Requirement | Priority |
|---|---|---|
| FIN-01 | Record balanced journal entries; posted entries are immutable and corrections use reversal entries. | P0 |
| FIN-02 | Track expected and realized broker commissions per deal, split, due date, status, and recipient. | P0 |
| FIN-03 | Create invoices/receivables, record partial/full payments, and show overdue balances. | P0 |
| FIN-04 | Record categorized office and campaign expenses with attachment metadata and approval status. | P0 |
| FIN-05 | Show cash-in, cash-out, outstanding receivables, commissions due, gross margin, and net operating result by period. | P0 |
| FIN-06 | Link financial events to Deal, Property, Lead, Campaign, Broker, and Organization. | P0 |
| FIN-07 | Export auditable CSV/PDF summaries; no destructive edit of posted financial records. | P1 |
| FIN-08 | Payment gateway and bank reconciliation remain deferred, but the domain model must support provider references later. | P2 |

### 4.4 Automation and reminders

| ID | Requirement | Priority |
|---|---|---|
| AUTO-01 | Rule model: Trigger → Conditions → Actions, scoped to an organization. | P0 |
| AUTO-02 | Durable scheduled jobs with idempotency keys, retry/backoff, dead-letter status, and audit events. | P0 |
| AUTO-03 | Viewing reminders at 24 hours and 1 hour, with timezone-safe scheduling. | P0 |
| AUTO-04 | Lead inactivity reminder and escalation when no next action exists or a stage exceeds its SLA. | P0 |
| AUTO-05 | Receivable and commission-due reminders before and after due dates. | P0 |
| AUTO-06 | After a viewing outcome, create the appropriate follow-up task and suggest a CRM stage transition. | P1 |
| AUTO-07 | Every outbound message/content action has draft, approved, sent/failed states and an audit record. | P0 |

### 4.5 Content and marketing

| ID | Requirement | Priority |
|---|---|---|
| MKT-01 | Content calendar with draft, review, approved, scheduled, published, failed, and cancelled states. | P0 |
| MKT-02 | Generate reusable listing-content drafts from approved property fields; no invented price or property fact. | P0 |
| MKT-03 | Human approval is required before an external post in MVP. | P0 |
| MKT-04 | Campaign entity with budget, channel, objective, start/end dates, UTM parameters, and linked content. | P0 |
| MKT-05 | Attribute Leads and closed deals to campaigns and compute spend, leads, qualified leads, wins, revenue, CAC, CPL, and ROI when data exists. | P0 |
| MKT-06 | Channel adapters are isolated behind an interface; Instagram/Meta/WhatsApp integrations are implemented only after credential and policy review. | P1 |
| MKT-07 | Content performance can be recorded manually first, then synchronized through approved APIs later. | P1 |

### 4.6 Listings, search, viewing, and contracts

The original v1.0 requirements remain in force for:

- Listing CRUD, media validation, status lifecycle, and moderation.
- Map discovery, radius/polygon search, combined filters, and SEO-friendly property pages.
- Database-enforced viewing conflict prevention.
- Contract generation, sequential signing, document hash, and append-only audit trail.
- Admin approvals, real-time notifications, email fallback, and bilingual UX.

Implementation order changes: operations, finance, automation, and marketing attribution are validated before expensive heavy-media and broad-marketplace work.

## 5. Non-functional requirements

- PostgreSQL + PostGIS; financial posted records and contract audit events are append-only.
- API fails startup in production when mandatory secrets are absent.
- Rate limits on Auth, uploads, viewings, publishing, and automation-trigger endpoints.
- Queue jobs are idempotent, observable, retryable, and never silently fail.
- P95 geo-search target remains under 400 ms for agreed test data.
- Zero double-booking under parallel viewing requests, enforced by database constraint.
- At least 70% coverage for Auth, Finance posting, Automation rules, Viewing scheduling, CRM transitions, and Contracts.
- OpenAPI stays generated from implementation.
- No secret, access token, social credential, or customer data is committed to the repository.

## 6. Commercial success metrics for the pilot

- One real office accepts a paid or explicitly time-bounded pilot.
- 100% of active Leads have an owner and next action or an intentional closed state.
- No missed viewing caused by an absent system reminder during the pilot.
- All pilot deals and commissions are represented in the financial ledger.
- Campaign source is known for at least 80% of newly created Leads.
- At least one approved listing moves through draft → scheduled/published content with traceable campaign attribution.
- Office owner can answer: cash received, receivables due, commissions due, campaign spend, and wins without a separate spreadsheet.

## 7. Acceptance gate before coding

Discovery is not complete until Mamdouh approves:

1. The first-office profile and who will use the pilot.
2. Pilot pricing hypothesis and duration.
3. Mandatory channels for reminders/content.
4. Whether Arabic-only is acceptable for the first pilot while the data model stays bilingual-ready.
5. Which financial documents are operational records versus legally/tax recognized documents in the target market.
