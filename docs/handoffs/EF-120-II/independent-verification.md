# EF-120-II Independent Verification

**Date:** 2026-07-30
**Status:** PASS

## Scope

EF-120-II implements and composes the authentication HTTP/session boundary:

- `POST /auth/register`
- `POST /auth/login`
- `POST /auth/refresh`
- `POST /auth/logout`
- `GET /auth/session`
- strict cookie parsing and approved cookie attributes
- exact canonical-Origin enforcement on unsafe routes
- browser-session authentication
- double-submit and server-bound CSRF verification
- refresh rotation/replay handling
- generic authentication failures

## Independent source and no-database verification

Fresh verification after the final repair and after infrastructure teardown:

```text
pnpm --dir apps/api run test                           PASS — 53/53
node --test apps/api/dist/bootstrap/config.test.js    PASS — 2/2
pnpm --dir apps/api run typecheck                     PASS
pnpm lint                                             PASS
git diff --check                                      PASS
```

The test suite includes a Nest application-context regression proving that every guard enhancer receives its required dependency.

## Isolated database verification

Target was limited by the destructive-test guard to:

```text
database: estateflow_test
host: 127.0.0.1
port: 55433
opt-in: ALLOW_DESTRUCTIVE_TESTS=1
```

Evidence:

```text
Compose config                                      PASS
Ports 55433, 56380, 3101 initially free             PASS
PostgreSQL/PostGIS TCP readiness                     PASS
Redis PING                                           PONG
Negative guard against wrong database               PASS
Positive guard against estateflow_test              PASS
Prisma migrations                                    PASS — 2 applied
Integration tests                                    PASS — 3/3
Prisma migrate status                                Database schema is up to date
```

No development, shared, or production database was targeted.

## Runtime defect found and repaired

The first real HTTP smoke exposed a Nest dependency-injection defect: class-based guard enhancer instances were created without the dependencies supplied by custom factory providers. An exact configured Origin therefore returned `403`.

The repair changed guards to injectable constructor-token dependencies and direct class providers. A compiled application-context regression was added. Fresh no-database checks passed afterward.

## Real HTTP runtime verification

The repaired API was started temporarily on `127.0.0.1:3101` against `estateflow_test` only.

```text
GET  /auth/session without session                  401
POST /auth/register without Origin                  403
POST /auth/register with wrong Origin               403
POST /auth/register with exact Origin               202
POST /auth/register duplicate                       202 generic
POST /auth/login wrong password                     401 generic, no cookies
POST /auth/login valid                              204, three cookies
GET  /auth/session valid                            200, {id, verified:false}
POST /auth/logout missing CSRF                      403
POST /auth/refresh mismatched CSRF                  403, no rotation cookies
POST /auth/refresh valid                            204, three rotated cookies
POST /auth/refresh replay                           401, three clearing cookies
GET  /auth/session after replay                     401
POST /auth/logout valid                             204, three clearing cookies
GET  /auth/session after logout                     401
```

Cookie assertions verified `Secure`, `SameSite=Lax`, `Path=/`, HttpOnly on access/refresh, and a readable CSRF cookie. No credential was returned in a JSON response.

## Persistence assertions

After runtime smoke:

```text
users=1
credentials=1
session families=2
active session families=0
access sessions=3
refresh sessions=3
unverified users=1
```

All access/refresh token and CSRF values persisted as canonical HMAC-SHA-256 base64url hashes only; no raw opaque credential shape was stored. The password credential used the approved Argon2id representation. Replay and logout left no active session family.

## Teardown

```text
API listener 3101 absent                            PASS
PostgreSQL listener 55433 absent                    PASS
Redis listener 56380 absent                         PASS
EstateFlow test containers absent                   PASS
EstateFlow test network absent                      PASS
Temporary smoke/health/guard files removed          PASS
Post-cleanup no-DB verification                     PASS
```

No commit, push, deployment, dependency change, or environment-file write was performed.
