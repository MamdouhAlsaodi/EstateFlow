# EF-701 — request-log path privacy slice

This is one bounded privacy-minimization change, not EF-701 completion.

## Exact behavior

`apps/api/src/common/http/request-logging.middleware.ts` now logs `request.route?.path` (the developer-defined Express route template, e.g. `/api/properties/:propertyId`) in the single `request_completed` JSON event when it is a string. If no route matched, or `route.path` is not a string (object/number/null are not serialized), it logs the constant `<unmatched>` — there is no fallback to the raw request path, so concrete org/property/media IDs in URLs no longer reach the logs. `method`, `requestId`, `statusCode`, `durationMs`, and the single-event-per-request shape are unchanged; no query, body, headers, or IP were logged before or now.

Verification (TDD, RED then GREEN) is in `apps/api/test/request-logging.test.mjs`: a fake finish event with a synthetic UUID path asserts the template is logged and the UUID absent even when the route is assigned only by finish time; unmatched and non-string `route.path` cases log `<unmatched>`; an ephemeral loopback Express server (port 0, no DB, no real data) confirms `request.route.path` is present at finish time in real Express 5.

## Limitations

- Route templates still reach logs, which is intended (developer-defined, low linkage risk), but templates themselves are not reviewed here.
- Unmatched requests (404s, middleware-level aborts) lose path detail entirely; debugging them requires correlating via `requestId`.
- The middleware reads `request.route` at finish; Nest route metadata is assumed present via Express. If routing internals change, `<unmatched>` is the safe fallback.
- No `.env`/secrets read, no DB/Docker/migrations or production traffic. Local unit checks and an ephemeral loopback Express check verify the behavior; real PostgreSQL integration and production log pipelines remain untested. CI status must be verified on the PR head.
