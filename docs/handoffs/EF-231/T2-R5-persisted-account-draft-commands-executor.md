# Role Report — EF-231-T2-R5-PERSISTED-ACCOUNT-DRAFT-COMMANDS

## Status
PASS

## Goal
Completed the pre-HTTP authority boundary for chart-account creation and journal-draft creation. Commands now use validated primitive fields; draft lines resolve organization-scoped persisted accounts before domain construction and mutation.

## Allowed paths used
- `apps/api/src/features/finance/application/ledger-repository.ts`
- `apps/api/src/features/finance/application/ledger-application.ts`
- `apps/api/src/features/finance/infrastructure/prisma-ledger.repository.ts`
- `apps/api/test/ef231-ledger.application.test.mjs`
- `apps/api/test/ef231-ledger.repository.integration.test.mjs`
- `docs/handoffs/EF-231/T2-R5-persisted-account-draft-commands-executor.md`

## Files changed
- Added mandatory typed `findAccount` and `createAccount` repository ports with typed creation conflict results.
- Changed application account creation to authorize first, build through the domain factory, and persist only command-derived account fields.
- Changed application draft creation to accept primitive metadata/lines, reject fewer than two lines before lookup, resolve every account by organization and ID, return typed account not-found before mutation, and build the domain draft only from resolved accounts.
- Added Prisma composite account lookup and exact account persistence with typed `P2002`/`P2003` conflict mapping; draft creation no longer creates caller-supplied accounts.
- Updated application and guarded integration coverage for forged runtime objects, lookup isolation, validation ordering, exact persistence, unique code conflict, and cleanup.

## Commands run

### TDD RED
```text
pnpm --dir apps/api exec node --test --test-concurrency=1 test/ef231-ledger.application.test.mjs
```

Exit `1`; `tests 11`, `pass 4`, `fail 7`. Expected failures showed the missing `createAccount` application command and the predecessor `createDraft` rich-entry contract (`TypeError`/access denial), before production implementation.

### Build and exact domain/application verification
```text
pnpm --dir apps/api run build
```

Exit `0`.

```text
pnpm --dir apps/api exec node --test --test-concurrency=1 test/ef231-ledger.domain.test.mjs test/ef231-ledger.application.test.mjs
```

Exit `0`; `tests 18`, `pass 18`, `fail 0`.

### Guarded database verification
```text
node scripts/assert-test-database.mjs
```

Exit `0`; destructive target accepted only `estateflow_test` on loopback port `55433`.

```text
pnpm --dir apps/api run db:generate && pnpm --dir apps/api run db:migrate:test && pnpm --dir apps/api run build && pnpm --dir apps/api exec node --test --test-concurrency=1 test/ef231-ledger.repository.integration.test.mjs test/ef203-deal.repository.integration.test.mjs
```

Exit `0`; Prisma generated, 8 migrations found with no pending migrations, build passed, and `tests 6`, `pass 6`, `fail 0` (EF-231 `1/1`, EF-203 `5/5`).

### Scoped whitespace verification
```text
git diff --check -- apps/api/src/features/finance/application/ledger-repository.ts apps/api/src/features/finance/application/ledger-application.ts apps/api/src/features/finance/infrastructure/prisma-ledger.repository.ts apps/api/test/ef231-ledger.application.test.mjs apps/api/test/ef231-ledger.repository.integration.test.mjs docs/handoffs/EF-231/T2-R5-persisted-account-draft-commands-executor.md
```

Exit `0`; no whitespace errors.

## Observed output
- TDD RED observed the expected predecessor-contract failures.
- Build passed.
- Exact EF-231 domain/application suite passed `18/18`.
- Guarded Prisma generate/migrate passed; no migration changes were made.
- Guarded EF-231 integration and serial EF-203 integration passed `6/6`.
- Scoped `git diff --check` passed.

## Verification
- Forged extra `Account` and `DraftJournalEntry` runtime properties do not influence account or draft commands.
- Authorization precedes account lookup and account creation.
- Missing/cross-organization account IDs return typed `{ kind: "not-found", resource: "account" }` before draft mutation.
- Fewer than two lines fail before account lookup; invalid amount, currency, and side fail before draft mutation.
- Valid persisted accounts produce a balanced draft using loaded account objects.
- Prisma account lookup uses composite `organizationId_id`; account creation persists exact validated fields and maps expected unique/ownership failures to typed conflict; unexpected errors propagate.
- No HTTP, schema, migration, module, controller, DTO, OpenAPI, client, Web, or domain changes were made.
- No `any`, unsafe casts, dynamic capability detection, raw SQL in production code, non-null assertions, or swallowed errors were added.

## Execution lifecycle
completed. No commit, push, deploy, install, credential/environment-file access, or non-test database action was performed. Pre-existing unrelated dirty work was preserved.

## Touched paths observed
Only the six packet-allowed paths were changed by this execution. Existing unrelated dirty paths remain outside the packet scope.

## Session/resume reference
Not applicable.

## Risks
HTTP and public transport integration remain intentionally deferred to a separate packet. Existing reversal persistence retains its predecessor account persistence helper, but reversal commands use persisted journal-entry accounts loaded through the R4 authority boundary.

## Documentation impact observed
Required for CTO routing: this report records the accepted pre-HTTP application/repository contract boundary. No public HTTP or user-facing contract changed.

## Git/publication posture observed
No commit, push, deploy, or publication performed. Git audit/publication remains outside this execution packet.

## Recommended next human decision
Accept this bounded pre-HTTP recovery evidence and route any subsequent HTTP work through a separately approved packet.
