# EF-232 T3-R2 Manager Command Matrix Proof

Status: PASS

## Scope

- Changed only `apps/api/test/ef232-commission.http.integration.test.mjs`.
- Added an independent same-organization Manager Deal, Lead, Property, closed-won event, and commission plan version.
- Proved guarded Manager value capture (`201`) and expected accrual creation (`201`) followed by exact-tuple replay (`200`).
- Asserted decimal-string money fields, one Manager Deal accrual, and its two persisted splits.
- Preserved Owner value/accrual/replay, Broker `403`, missing-CSRF/origin/anonymous guards, and cross-tenant generic `404` with unchanged row counts.

## TDD evidence

- RED: initial focused integration run failed on the newly added Manager persistence assertion (`2 !== 1` for the Manager Deal split count).
- GREEN: corrected the assertion to match the guarded fixture's two-recipient split set; focused integration then passed.

## Verification evidence

Commands run:

```text
pnpm --dir apps/api run build
node scripts/assert-test-database.mjs && node --test --test-concurrency=1 apps/api/test/ef232-commission.http.integration.test.mjs
node scripts/assert-test-database.mjs
```

Results:

- API build exited `0`.
- Guarded database preflight accepted `estateflow_test` on loopback `:55433`.
- Focused test: `1` passed, `0` failed.
- Test `finally` cleanup and declared-table emptiness assertion passed.
- Post-run test-database guard accepted the same guarded target.
- `git diff --check -- apps/api/test/ef232-commission.http.integration.test.mjs` exited `0` with no output.

No production source, schema, auth, OpenAPI, client, migration, install, commit, push, deploy, dotenv, or credential changes were made.
