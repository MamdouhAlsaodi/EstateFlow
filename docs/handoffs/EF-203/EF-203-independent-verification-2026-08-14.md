# EF-203 — Independent End-to-End Verification (2026-08-14)

## Verdict

**PASS — EF-203 is closed within its approved Deal terminal-outcome scope.**

EF-203 delivers a tenant-scoped Lead terminal closure workflow: close a qualified/nurturing Lead as Won with a Property and Broker, or as Lost with a required reason. It does **not** deliver Viewings, finance/commission posting, campaign linkage, outbox execution, generic Deal CRUD, or deployment.

## Accepted layers

| Layer | Evidence |
|---|---|
| T1 Domain/application | typed mandatory close ports, terminal guards, idempotency preflight before Lead/version lookup, replay and conflict semantics. Independent regression: **30/30 PASS**. |
| T2 PostgreSQL persistence | atomic terminal Lead update + Won Deal/Event/Timeline, Lost no Deal/Event, replay safety, tenant/property/broker validity and terminal child-command protection. Fresh guarded repository integrations: **7/7 PASS**; canonical API suite then **198/198 PASS**. |
| T3 HTTP | Origin/session/CSRF/idempotency protected `close-won` (`201`) and `close-lost` (`200`), tenant-safe `404`, conflict and DTO rejection. Fresh static **11/11**, real guarded HTTP **1/1**, shared serial HTTP **2/2**. |
| T4 OpenAPI/client | exact Swagger schemas, generated closed-world typed client, source generation and immediate drift verification. Fresh static/OpenAPI **12/12**, generated client **15/15**, build/drift PASS. |
| T5 Web | Arabic inline Workspace close controls through the existing same-origin browser adapter; explicit Won/Lost forms only, CSRF/fresh idempotency, per-command pending, validation, safe error state, reload-only success. Fresh Web tests **31/31**, typecheck PASS, production build PASS with explicit non-secret `API_ORIGIN=http://localhost`. |

## Final fresh cross-layer gate

- API compilation: PASS.
- OpenAPI source generation and tracked-artifact drift: PASS.
- Generated client compilation and tests: **15/15 PASS**.
- Web tests: **31/31 PASS**.
- Web production build: PASS with `API_ORIGIN=http://localhost`; the repository deliberately requires an absolute `API_ORIGIN`, so a bare build without it is configuration-incomplete rather than a T5 code failure.
- Guarded test database: accepted only `estateflow_test` on loopback:55433.
- Real terminal-close HTTP integration: **1/1 PASS**.
- `git diff --check`: PASS.

## Behavioral proof

- Only `QUALIFIED` and `NURTURING` Leads are closable; terminal Leads reject transition, owner assignment, next-action changes, and CRM child mutations.
- Won creates precisely one Deal, `DEAL_CLOSED_WON` domain event, and close timeline event atomically. Exact replay returns the original result without duplicates; altered same-key payload or expectedVersion conflicts before Lead read/mutation.
- Lost stores only the close timeline, never a Deal or finance event.
- Browser route requests use same-origin credentials, CSRF, request ID, encoded IDs, and a new idempotency key per command. The Web never calls `fetch` directly from the Workspace and never constructs optimistic Lead/Deal/timeline state.
- UI hides close controls and Note/Task mutation forms after server reload returns a terminal stage.

## Scope and publication posture

No real data, credentials, deployment, commit, push, install, migration beyond the accepted T2 migration, or generic Deal resource was introduced. Pre-existing unrelated dirty work was preserved and is outside this acceptance. `git diff --check` passed; no publication is authorized by this report.

## Deferred work

- EF-501: Viewings/calendar scheduling and exclusion constraints.
- Finance/commission/receivable/payment workflow: separate Finance phase only.
- EF-401 campaign opaque-ID linkage.
- Outbox execution/notifications: later async phase.
- Generic Deal detail/list/edit API or UI is intentionally absent.
