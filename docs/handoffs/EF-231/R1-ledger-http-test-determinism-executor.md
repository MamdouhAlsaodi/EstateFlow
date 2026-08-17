# EF-231-R1 Ledger HTTP Test Determinism — Executor Report

## Status
PASS

## Change
- Allowed path changed: `apps/api/test/ef231-ledger.http.integration.test.mjs`
- Added semantic normalization for source/reversal journal lines.
- Removed dependence on UUID ordering; assertions now prove:
  - four persisted lifecycle lines total;
  - source and reversal lines have matching account, amount, and currency multisets;
  - each side multiset is exactly one `DEBIT` and one `CREDIT`;
  - reversal sides are the exact debit/credit opposites of source sides;
  - source remains `POSTED` and reversal remains `DRAFT`.
- No production finance/controller/schema behavior changed.

## Fresh verification
1. TDD RED, before the edit:
   - `node scripts/assert-test-database.mjs && node --test --test-concurrency=1 apps/api/test/ef231-ledger.http.integration.test.mjs`
   - Database preflight accepted only `estateflow_test` on loopback:55433.
   - Failed at the old UUID-ordered reversal assertion: semantically correct `DEBIT, CREDIT` was compared with expected `CREDIT, DEBIT`.
2. `pnpm --dir apps/api run build`
   - PASS.
3. Guarded integration test, independently after the edit:
   - `node scripts/assert-test-database.mjs && node --test --test-concurrency=1 apps/api/test/ef231-ledger.http.integration.test.mjs`
   - PASS: 1 test, 0 failures.
4. `git diff --check -- apps/api/test/ef231-ledger.http.integration.test.mjs`
   - PASS.

Only the two packet-allowed paths were used for changes. No migration, install, commit, push, deploy, credential, dotenv, or production database changes were performed.
