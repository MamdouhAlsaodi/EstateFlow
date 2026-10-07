# EF-704 — Arabic case study (`docs/portfolio/case-study-ar.md`) packet

Base `6b33c1a` (`main`). Portfolio documentation slice; synthetic data only. Not EF-704 completion, no Pilot, no deployment, no real customer data, no security signoff. `docs/DEVELOPMENT_PLAN.md` Phase 7 remains canonical.

## Goal

Create `docs/portfolio/case-study-ar.md` — an Arabic-first, RTL case study for the public portfolio, telling the project story honestly from repository evidence. Companion to the existing `docs/portfolio/architecture-tour.md` (draft). Structure:

1. **المشكلة** — small real-estate brokerages drowning in scattered lead/contract/finance workflows (framed from `docs/PRD.md`, no invented customer).
2. **الحل** — EstateFlow overview: modular property/lead/deal/commission/receivable platform, Arabic-first RTL, PostgreSQL + NestJS + Next.js, worker automation. Reference modules by EF IDs with one-line value each.
3. **ما أثبتته الاختبارات** — verifiable claims only, drawn from the repo: unit/integration suites, guarded HTTP+PostgreSQL cross-tenant proofs (#29/#32/#33/#34), CI-isolated backup/restore drill (#31), migration rehearsal (#36), append-only audit enforcement, i18n/RTL sweeps (EF-630). Cite docs/handoffs paths and CI, no invented numbers.
4. **الحدود بصدق** — explicit non-claims: no Pilot, no production deployment, no real customer data, no independent security signoff, EF-701/702/703/705 gates remain open; performance numbers not claimed.
5. **التقنيات** — short stack list (TypeScript, NestJS, Next.js, Prisma, PostgreSQL/PostGIS, Redis, Docker CI, GitHub Actions).

## Style rules

- Arabic-first (مطبوع RTL)، technical terms may stay English inline (repo convention).
- Every factual claim must trace to a repository path/handoff/PR; no marketing puffery, no invented metrics or testimonials.
- Synthetic-data screenshots/video NOT part of this slice (separate EF-704 items).
- Add the file to any portfolio index if one exists; otherwise leave standalone. Do not touch other EF-704 files.

## Testing / verification

Docs-only slice. Run: repo format check for touched path (`prettier --check docs/portfolio/case-study-ar.md` — if ignored, say so), `pnpm security:check` on staged files, and a links/truthfulness self-audit: every referenced handoff path exists in the repo. Update `docs/TASKS.md` EF-704 row and `docs/handoffs/` if the repo convention requires a handoff note — keep minimal. Independent read-only review required; CI on exact head before merge; do not claim EF-704 acceptance.

## Implementation notes (EF-704 case-study-ar slice)

- `docs/portfolio/case-study-ar.md` created on branch `docs/ef704-case-study-ar` (base `6b33c1a`): Arabic-first RTL case study, structure per packet (المشكلة / الحل / ما أثبتته الاختبارات / الحدود بصدق / التقنيات).
- All claims cite repository paths: `docs/PRD.md`, `docs/TASKS.md`, `docs/handoffs/EF-601/implementation.md`, `docs/handoffs/EF-630/implementation.md`, `docs/handoffs/EF-702/readiness.md`, `docs/DEVELOPMENT_PLAN.md`, `docs/portfolio/architecture-tour.md`; PR numbers cited only where they appear in `docs/TASKS.md` / `git log` (#22/#29/#30/#31/#32/#33/#34/#36/#37/#38).
- Numbers quoted verbatim from handoffs (EF-601 test counts, EF-630 108/108). No metrics invented.
- Honest non-claims section included: no Pilot, no production, no real customer data, no independent security signoff, EF-701–EF-705 gates open, no performance numbers. EF-704 not claimed complete.
- Verification performed: handoff paths `ls`-checked; `prettier --check` NOT run (prettier not installed in this clone — no `node_modules/`); `pnpm security:check` run on staged file via PATH injection with COREPACK_ENABLE_NETWORK=0. No commit/push.
