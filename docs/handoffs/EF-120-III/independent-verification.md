# EF-120-III Independent Verification

- **Date:** 2026-07-30
- **Status:** PASS
- **Project:** EstateFlow
- **Branch:** `main`
- **Baseline HEAD:** `a6149bf`
- **Scope:** email-verification challenge issuance, password recovery/reset, generic anti-enumeration responses, multi-dimensional abuse controls, login lockout, security audit events, HTTP composition, isolated PostgreSQL/runtime verification.

## Outcome

EF-120-III satisfies its approved scope. One-time verification/recovery credentials are 256-bit opaque values and only HMAC hashes are persisted. Recovery responses remain generic. Registration, login, recovery, reset, and refresh consume endpoint/account/direct-client limits. Login reservations and fixed lock markers are atomic under deterministically ordered PostgreSQL transaction advisory locks. Successful security mutations persist narrow audit events in the same transaction. No raw account identifier, direct IP, password, cookie, CSRF, refresh, verification, or reset secret is accepted by the audit event contract.

The public email-verification endpoint and a real mail provider remain explicitly outside EF-120 under the approved implementation plan. Test delivery is opt-in, test-environment-only, and the application fails closed when no real provider is configured outside that mode.

## Fresh static and unit evidence

After runtime teardown, with `DATABASE_URL` and destructive opt-in unset:

- `pnpm --dir apps/api run test` — **100/100 PASS**, exit 0.
- `node --test apps/api/dist/bootstrap/config.test.js` — **2/2 PASS**, exit 0.
- `pnpm --dir apps/api run typecheck` — PASS, exit 0.
- `pnpm lint` — PASS; workspace and infrastructure contracts passed.
- `git diff --check` — PASS.

## Isolated database evidence

Preflight:

- Compose configuration validation — PASS.
- Ports `3101`, `55433`, and `56380` were free before startup.
- Negative database guard rejected a wrong database name — PASS.
- Positive guard accepted only `estateflow_test` on loopback port `55433` with destructive opt-in — PASS.
- PostgreSQL/PostGIS TCP readiness and explicit database query — PASS.
- Redis `PING` — `PONG`.
- Bindings were loopback-only.

Final guarded database run:

- `pnpm --dir apps/api run test:integration` — **10/10 PASS**, exit 0.
- `prisma validate` — schema valid.
- `prisma migrate status` — two migrations found; schema up to date.

The integration suite proves:

1. Identity/session persistence stores hashes rather than presented credentials.
2. Concurrent refresh replay permits one rotation and revokes the family on replay.
3. Recovery/reset secrets are one-use; reset updates the Argon2id credential and revokes all active families.
4. Endpoint and account/client rate dimensions remain isolated.
5. Eight concurrent rate consumptions permit exactly the configured account limit.
6. Ten concurrent login reservations create one fixed lock marker.
7. Reset/refresh subject resolution does not expose raw identifiers.
8. Audit persistence uses only the approved narrow fields.
9. A forced transactional audit-write failure rolls back identity creation.
10. PostGIS baseline and FK-safe cleanup are valid.

## Runtime HTTP evidence

A real Nest application context listened temporarily on `127.0.0.1:3101` with the opt-in in-memory delivery fake and isolated PostgreSQL. Observed behavior:

- Register — `202`, generic accepted JSON, no credential output.
- Login — `204`, exactly three secure cookies.
- Session — `200`, minimal principal with `verified=false`.
- Known and unknown recovery — identical `202` response.
- Password reset — `204`; old session revoked.
- Reset replay — generic `400`.
- Refresh rotation — `204`.
- Refresh replay — `401` and family revocation.
- Logout — `204`; subsequent session — `401`.
- Recovery account limit — `202, 202, 202, 429`.
- Eleven valid-shape wrong-login requests — generic `401`; database showed ten invalid-attempt rows, one fixed lock marker, and one rate-limited row.
- Runtime database assertions for consumed reset, revoked families, safe audit reasons, HMAC-shaped secrets/keys, and absence of raw account values in rate rows — PASS.

## Defects found and repaired during verification

1. An executor accidentally replaced an existing repository unit-test file. The full prior regression suite was restored and new abuse tests retained separately.
2. `Serializable` transactions combined with advisory-lock waiting produced stale snapshots and exhausted three retries under real concurrency. A one-variable diagnostic changed only isolation to `ReadCommitted`; both failing concurrency reproductions passed. The production repair now uses bounded-retry `ReadCommitted` transactions with deterministically ordered transaction advisory locks for abuse counters/reservations, while reset and refresh retain their required `Serializable` transactions.
3. Unbounded audit writes for malformed login/session inputs could amplify unauthenticated database writes. Malformed inputs now fail before audit persistence; valid, rate-protected denials remain audited.
4. One integration fixture referenced the removed `SESSION_DENIED` reason. It was corrected to the strict approved `LOGIN_DENIED` reason without widening the product allowlist.

## Cleanup evidence

`docker compose down --volumes --remove-orphans` completed. Independent checks confirmed:

- no EstateFlow test containers;
- no EstateFlow test network;
- no EstateFlow test volumes;
- no listeners on `3101`, `55433`, or `56380`;
- no temporary runtime/diagnostic/recovery artifacts.

The full no-database suite was rerun after cleanup and remained green.

## Scope and publication posture

Changed-path audit observed 87 paths across the complete uncommitted EF-120 worktree. No dependency manifests, lockfile, environment files, or infrastructure definitions changed. No commit, push, deployment, migration against a shared/live database, or external delivery occurred.
