# EF-701 — scoped session/CSRF HTTP regression packet

Base: `be52057578dbb8b0d76ccd3a2a7a82a71dcf6610` (`main`). This is one Phase 7 security test slice, not EF-701 acceptance or Pilot authorization.

## Goal and boundary

Extend the existing guarded, synthetic HTTP+PostgreSQL media flow to exercise actual authorization guards and logout revocation. Reuse only `apps/api/test/ef601-media.http.integration.test.mjs` and this packet. No production implementation, migrations, Docker locally, new services, env files, customer records, or live deployment. Preserve strict `estateflow_test` guard and post-test cleanup. `docs/DEVELOPMENT_PLAN.md` Phase 7 remains canonical.

## Acceptance

- With media A confirmed and both organization owners active, owner B cannot create an upload intent under A's organization even with a valid session, origin, and CSRF: 403; asset count unchanged.
- Owner A cannot create an upload intent with missing CSRF or wrong canonical Origin: 403; asset count unchanged. Ensure the denied requests use valid otherwise-intent payloads, so the failure is genuinely at the guard boundary. Test only the relevant request variants rather than inventing a full security matrix.
- Owner A can read an existing media byte route before logout; `POST /auth/logout` with valid canonical Origin, session and CSRF returns 204; the same prior access cookie then gets 401 on `GET /auth/session` and media bytes (including one generated variant). Previously confirmed media DB state remains unchanged. Assert the logout path actually revokes the family rather than relying on cookie deletion alone.
- Redaction: no auth credential, storage key, or file byte leaks in rejected JSON; don't print or commit tokens.
- The test must *run* in CI (pass=1, skipped=0 for this file). Local skip without CI target is not acceptance. Exact-head CI and read-only independent code review required before any merge.

## Verification / stop conditions

Use existing test helpers and CI workflow unchanged. Locally: `node --check`, Prettier, lint, typecheck, unit test suite, staged `security:check`. CI integration runs only against synthetic ephemeral PostgreSQL. If expected guard status differs, inspect code and CI and correct test/implementation through RED→GREEN; no weakening assertion or false-success skip. Stop rather than broadening to Pilot, security signoff, or real data. The separate EF-702 migration/metrics/retention work and EF-703–705 remain open.
