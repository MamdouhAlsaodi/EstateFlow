# Role Report — EF-233-T2-R3-ISSUED-INVOICE-IMMUTABILITY

## Status
PASS

## Goal
Added forward-only PostgreSQL enforcement preventing direct updates to an issued Invoice financial, ownership, lifecycle, and issue snapshot fields, with a guarded raw-SQL integration proof. No application behavior or transport layer changed.

## Allowed paths used
- `apps/api/prisma/migrations/20260816010000_ef233_issued_invoice_immutability/migration.sql`
- `apps/api/test/ef233-receivable.repository.integration.test.mjs`
- `docs/handoffs/EF-233/T2-R3-issued-invoice-immutability-executor.md`

## Files changed
- Added trigger function `ef233_reject_issued_invoice_update` and `Invoice_issued_immutability` `BEFORE UPDATE` trigger.
- Added guarded raw-SQL assertions for issued Invoice `amountMinor`, `currency`, `dealId`, `dueAt`, and `status` updates; each rejects and the Invoice plus Receivable snapshots remain unchanged.
- Added a second valid same-organization Deal fixture so the direct `dealId` mutation is tested against a valid foreign-key target.
- Added this executor report.

## Commands run
- Constructed the child-only test URL in shell memory from the running compose Postgres container environment; set `ALLOW_DESTRUCTIVE_TESTS=1`; ran `node scripts/assert-test-database.mjs` before destructive database work.
- TDD RED: `node --test --test-concurrency=1 apps/api/test/ef233-receivable.repository.integration.test.mjs`
- `pnpm --dir apps/api run db:generate`
- `pnpm --dir apps/api run db:migrate:test`
- `pnpm --dir apps/api run build`
- Exact serial integration test: `node --test --test-concurrency=1 apps/api/test/ef233-receivable.repository.integration.test.mjs`
- Final migration/build/integration/T1 verification sequence.
- `git diff --check -- apps/api/prisma/migrations/20260816010000_ef233_issued_invoice_immutability/migration.sql apps/api/test/ef233-receivable.repository.integration.test.mjs docs/handoffs/EF-233/T2-R3-issued-invoice-immutability-executor.md`
- Allowed-path status check.

## Observed output
- RED after correcting the test fixture setup: exit `1`, expected `AssertionError [ERR_ASSERTION]: Missing expected rejection` on the first raw issued-Invoice update before the new migration was deployed.
- Migration deployment applied `20260816010000_ef233_issued_invoice_immutability`.
- Final migration deploy: `No pending migrations to apply.`
- API build exited `0`.
- Exact integration suite: `2` passed, `0` failed, `0` rejected.
- T1 domain/application suites: `21` passed, `0` failed.
- `git diff --check`: exit `0`, no whitespace errors.
- No URL, password, dotenv content, or credential-bearing value was printed or persisted.

## Verification
The trigger protects these exact columns once `OLD.issuedAt IS NOT NULL` (covering ISSUED and any already-issued final snapshot): `amountMinor`, `currency`, `organizationId`, `dealId`, `draftCreatedBy`, `draftCreatedAt`, `issuedBy`, `issuedAt`, `dueAt`, and `status`. Comparisons use `IS DISTINCT FROM`; the rejection message is the non-sensitive `issued invoice snapshot is immutable`. The migration is forward-only; `20260816000000_ef233_receivables` was not edited.

The guarded test proves direct SQL changes to `amountMinor`, `currency`, `dealId`, `dueAt`, and `status` reject, and that Invoice and Receivable snapshot values remain unchanged afterward. Existing issue/payment, replay, concurrency, and T1 suites remain green.

## Execution lifecycle
completed; no timeout, cancellation, signal, retry packet, install, commit, push, deploy, or publication occurred.

## Touched paths observed
Only the three packet-allowed paths were touched by this execution. No schema, previous migration, repository, application, domain, DI, HTTP, OpenAPI, client, Web, ledger, or install path was changed.

## Session/resume reference
Not applicable.

## Risks
Invoice cancellation and amendment behavior remain deferred; this slice intentionally does not add a cancellation command or status-transition policy. No mutable issued Invoice field is permitted by this trigger.

## Documentation impact observed
No product, API, architecture, or operator contract changed. This executor report is the only documentation artifact required by the packet.

## Git/publication posture observed
No commit, push, publication, or deploy performed. No Git publication is authorized by this report.

## Recommended next human decision
Review the allowed-path diff and fresh guarded evidence; no verifier, repair, successor task, or publication is authorized automatically.
