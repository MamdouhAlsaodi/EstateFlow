# ADR-007 — Browser Authentication Session and CSRF

- **Status:** Accepted
- **Date:** 2026-07-29
- **Decision source:** EF-120-A records Mamdouh's explicit selection of a cookie session with CSRF and authorization to begin this prerequisite.

## Context

EF-120 needs an explicit browser authentication decision before its source implementation begins. The existing plan requires short-lived access, rotated sessions, password recovery, lockout/rate limits, cookie security, and CSRF. This ADR fixes those contracts; it does not claim that the endpoints or controls already exist.

## Decision

EF-120 is browser-only. It will use same-origin, HttpOnly cookie authentication with server-side opaque access and refresh-session records. It will not expose an authentication token to JavaScript. Mobile clients and API consumers using bearer credentials are deferred to a separately approved ADR and implementation task; they must not reuse this browser-cookie contract by default.

### Cookie and session contract

The implementation will issue these cookies only over HTTPS:

| Cookie | Attributes | Lifetime | Purpose |
| --- | --- | --- | --- |
| `__Host-estateflow_access` | `HttpOnly; Secure; SameSite=Lax; Path=/`; no `Domain` | 15 minutes | Opaque access credential for ordinary authenticated requests. |
| `__Host-estateflow_session` | `HttpOnly; Secure; SameSite=Lax; Path=/`; no `Domain` | 7 days absolute; 24 hours idle | Opaque rotating refresh-session credential. |
| `estateflow_csrf` | `Secure; SameSite=Lax; Path=/`; readable by same-origin JavaScript; no `HttpOnly` | Rotated with the refresh session | A non-secret CSRF value, never an authentication credential. |

The two HttpOnly values are at least 256 bits of cryptographically secure randomness. The database stores only a one-way token hash, never the raw cookie value. A refresh-session record includes an opaque record identifier, user identifier, session-family identifier, issued/last-used timestamps, absolute and idle expiry timestamps, revocation/consumption state, and the hash of the current CSRF value. Access records are short-lived, linked to their active session family, and invalid when that family is revoked.

No access, refresh, reset, or verification token may appear in JavaScript-readable storage, a URL, a response body, application logs, or audit metadata. The CSRF value is intentionally readable but is not sufficient to authenticate a request.

On login and refresh, the server atomically consumes the presented refresh-session credential, issues new access and refresh-session credentials, and rotates the CSRF value. A replay of a consumed refresh credential revokes its whole session family and requires a new login. Refresh does not extend the original seven-day absolute expiry; it may renew the 24-hour idle expiry only while the absolute expiry remains valid. Logout revokes the current session family and clears all three browser cookies. A successful password reset revokes every session family for that user before any new login is accepted.

### CSRF and same-origin contract

`SameSite=Lax` is defense in depth, not the CSRF control. For every unsafe (`POST`, `PUT`, `PATCH`, or `DELETE`) mutation authenticated by browser cookies, the server must require all of the following before executing the handler:

1. An exact `Origin` equal to the configured canonical browser origin; requests without it, with a different origin, or with an untrusted forwarded origin fail.
2. An `X-CSRF-Token` request header equal to the readable `estateflow_csrf` cookie and to the value bound to the active server-side session record, compared in constant time.
3. A valid, unexpired, non-revoked access credential from that same session family.

Credential-establishing or recovery mutations that are not yet cookie-authenticated still require the exact same-origin check. Cross-origin credentialed CORS is not permitted for this browser flow.

Failure posture is deliberate:

- Missing, expired, malformed, or revoked access credentials return `401`; a valid refresh session may obtain a new access credential only through refresh.
- Missing, mismatched, stale, or invalid CSRF data, or an absent/untrusted `Origin`, returns `403` with no handler side effect and no session rotation.
- A missing, expired, revoked, or replayed refresh session returns `401` and clears the browser cookies; refresh-token replay additionally revokes that session family.
- Invalid credentials, unknown accounts, and temporary account lockouts produce indistinguishable authentication responses; recovery requests always acknowledge acceptance without revealing account existence.

### Passwords, recovery, and abuse controls

Passwords use Argon2id with a unique random salt and at least 19 MiB (19,456 KiB) memory, two iterations, and parallelism of one. The implementation must retain parameters with the hash and rehash on a successful login when the approved policy increases. Plaintext passwords, password-derived values, reset secrets, and verification secrets are never logged or audited.

Password-recovery and verification secrets are single-use, server-side hashed values with a maximum 15-minute expiry. A password-recovery request always returns the same accepted response whether or not an account exists. The external email delivery provider and device binding/fingerprinting are explicitly deferred: EF-120 may define an internal delivery boundary and test it with a fake, but it must not claim provider delivery or bind sessions to a device.

Login failures are counted against both a normalized account key and a client-source key. Ten failed attempts for an account in a rolling 15-minute period create a 15-minute temporary lockout; there is no permanent automatic lockout. Login, registration, recovery, reset, and refresh endpoints also have independently configured per-account and per-client-source rate limits. Limits and lockouts must preserve the generic response posture and must create security audit events without recording raw credentials, session values, CSRF values, reset/verification values, email addresses, phone numbers, precise locations, or unredacted IP addresses. Audit events use an opaque subject identifier where available, an outcome, a reason category, and minimal timestamped correlation data.

## Consequences

- Browser clients make authenticated requests with cookies and add `X-CSRF-Token` from `estateflow_csrf` on unsafe requests; they never construct an `Authorization: Bearer` header for this flow.
- Session lookup/revocation is a server-side persistence responsibility and must be transactional with refresh rotation and replay detection.
- Cookie authentication is intentionally same-origin. A later mobile or partner API design requires a separate credential, CORS, rotation, and revocation decision.
- The final cookie domain/origin configuration must be fail-closed: production cannot start with a wildcard credentialed origin or without the HTTPS cookie requirements.

## EF-120 endpoint and test contract

These are planned EF-120 contracts, not implemented endpoints or provider integrations:

| Endpoint | Contract |
| --- | --- |
| `POST /auth/register` | Validates registration input; applies same-origin and rate-limit controls; never returns secrets. |
| `POST /auth/login` | On valid credentials, returns `204`, sets the three cookies, and rotates to a new session family. Invalid/unknown/locked accounts use the generic failure posture. |
| `POST /auth/refresh` | Requires the refresh-session cookie plus same-origin and CSRF checks; atomically rotates the session/access/CSRF values and returns `204`. |
| `POST /auth/logout` | Requires an authenticated access cookie, same-origin, and CSRF checks; revokes the current family, clears cookies, and returns `204`. |
| `GET /auth/session` | With a valid access cookie returns the minimal authenticated principal; otherwise returns `401`; it never returns cookie or token values. |
| `POST /auth/password-recovery` | Applies same-origin and rate limits, accepts an account identifier, and always returns `202` without account enumeration. |
| `POST /auth/password-reset` | Applies same-origin and rate limits, accepts a valid single-use recovery secret and replacement password, revokes all user session families, and returns `204`; invalid or expired secrets return a generic validation failure. |

Later EF-120 tests must at minimum prove the exact `Set-Cookie` attributes and lifetimes; absence of token values from JSON, browser storage, URLs, and logs; successful login/refresh rotation; rejection and family revocation on refresh replay; access/session expiry, idle expiry, logout, and password-reset revocation; generic recovery and credential responses; Argon2id parameter use and upgrade handling; temporary lockout and rate-limit behavior; and `403` with no mutation for missing, stale, mismatched, or cross-origin CSRF requests. API integration tests must cover every unsafe cookie-authenticated endpoint, not only the authentication controller.

## Deferred decisions

- Mobile application and external/API bearer-client credentials.
- Device binding, device recognition, and session-management UX beyond current-family logout.
- Selection and operation of an external email delivery provider.
- Email-verification delivery and retry operations beyond an internal, testable delivery boundary.
