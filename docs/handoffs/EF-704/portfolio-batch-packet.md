# EF-704 — remaining portfolio docs batch packet (`security-and-testing`, `finance-walkthrough`, `demo-script`)

Base `909b081` (`main`). Docs-only portfolio batch; synthetic data only. Owner authorized completing everything technically completable in one batch; formal gates that require Mamdouh's own decisions (independent security signoff, named decision owner, Pilot, deployment) stay documented as OPEN — this batch does NOT accept EF-701–705 or start a Pilot.

## Goal — create exactly three files

1. `docs/portfolio/security-and-testing.md` (Arabic-first, same style as case-study-ar.md): what the test pyramid actually covers today, traced to repository evidence — unit suites, guarded HTTP+PostgreSQL integration suites (cross-tenant media #29/#32/#33/#34, session revocation/CSRF #34, CSV import #37), CI-isolated drills (#31 backup/restore, #36 migration rehearsal), readiness probe (#22/#30), append-only audit tests (EF-610/620), i18n/RTL tests (EF-630), security baseline scanner (#20), license inventory (#21). An honest "ما لا يغطيه هذا" section: no independent security review, no penetration test, no load/perf testing, no OWASP full matrix, gates EF-701–705 open.
2. `docs/portfolio/finance-walkthrough.md` (Arabic-first): walk the finance modules from PRD/handoffs — Ledger (EF-401/campaign budget→expenses), commissions (EF-402/403), receivables aging + cancellation (EF-233), owner dashboard (EF-235), exact money-string minor-units invariant, append-only posted records, report-to-ledger reconciliation test, Arabic-first report UI. Honest limits: no bank integration, no tax/legal accounting claim, synthetic data only.
3. `docs/portfolio/demo-script.md` (Arabic-first): a synthetic-data demo WALKTHROUGH SCRIPT (numbered steps a presenter would follow: login → org → properties → CSV import dry-run/commit → leads pipeline → deal → commission/receivable → dashboards → contracts → admin/audit → health). Each step cites the real route/feature it exercises. Explicitly: no screenshots/video yet (separate EF-704 items), no real data, no hosted demo URL claimed.

## Style/truth rules

Same as case-study-ar.md: Arabic-first RTL, English tech terms inline, every claim traces to repo path/PR/handoff, numbers quoted verbatim or omitted, explicit non-claims sections, no invented metrics/testimonials/screenshots. Cross-link the four portfolio docs (case-study-ar, architecture-tour, and each other).

## Register

Update `docs/TASKS.md` EF-704 row honestly: all four written docs drafted, remaining EF-704 items = screenshots/video with synthetic data + review; EF-704 NOT accepted. Minimal TASKS edit only.

## Verification

Every cited path exists (ls); PR numbers match git log; prettier --check on new files; `corepack pnpm security:check` on staged files (offline); independent read-only review; no commit/push from the executor; report unverified facts honestly.
