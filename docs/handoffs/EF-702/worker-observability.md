# EF-702 — Worker tick observability slice (implementation)

Packet: bounded EF-702 worker observability slice · branch
`feat/ef702-worker-observability` (base `main` `c07b7ec`)

## What was built

Structured, privacy-minimized worker tick events on the existing console JSON
convention (same style as the API `request_completed` log line). One event per
tick; no metrics service, alerting, or dashboard is implemented or claimed.

### `scripts/automation-worker-loop.mjs`

- Success path: emits one `{"event":"worker_tick_completed","durationMs":N}`
  line via `logger.info` (default `console`). `durationMs` is a nonnegative
  safe integer; no wall-clock timestamps are added.
- Counter groups: extracted only from known scheduler shapes, only allowlisted
  nonnegative safe-integer keys:
  `schedules` (evaluatedRules/scheduled/alreadyScheduled), `jobs`
  (claimed/succeeded/retried/failed), `deliveries`
  (claimed/delivered/retried/failed/cancelled), `media`
  (marked/swept/deletedStorageKeys). A group is present only when the tick
  returned an object for it with at least one valid counter; arbitrary
  tick-return fields (IDs, tokens, unknown keys) are never serialized. No
  object result → no counter groups, never synthesized.
- Failure path: emits one `{"event":"worker_tick_failed","code":"TICK_FAILED","backoffMs":N}`
  line via `logger.error`. The raw error message, stack, `error.name`, and any
  identifiers are deliberately dropped (the previous freeform
  `automation worker tick failed: ${message}` log leaked raw messages).
  Capped exponential backoff, no-overlap polling, and stop semantics are
  unchanged.
- `logger.info` / `logger.error` are optional injections; missing methods are
  skipped with `?.`. A throwing logger is isolated with an internal guard so
  logging side effects can never be misclassified as a tick outcome (a
  throwing `info` cannot trigger spurious backoff/retry, a throwing `error`
  cannot reject the poll or escape to `stop()`).

### `apps/worker/src/index.ts`

- The composed scheduler tick result is no longer discarded
  (`.then(() => undefined)` removed); it is passed through so the loop can
  emit completion counter events. No API source was touched; the worker
  runtime remains free of API/Nest dependencies.

### `scripts/automation-worker-loop.d.mts`

- Type surface updated: `tick: () => Promise<unknown>`, logger accepts
  optional `info`/`error`.

## Tests (fake-timer, TDD RED→GREEN)

`apps/worker/test/automation-worker-loop.test.mjs` grew from 4 to 11 tests.
Items 1–5 below are the original EF-702 behavior tests; 6–7 are the
logger-isolation correction tests:

1. Success tick with a full scheduler-shaped result → exactly one
   `worker_tick_completed` event, nonnegative `durationMs`, all four groups
   preserved exactly, injected unknown key (`secretLeadId`) absent.
2. Unknown/invalid counter values (`extraKey`, negative, fractional,
   non-object `jobs`) → omitted; no `accessToken` leak; absent groups
   omitted.
3. Tick returning `undefined` → event with only `event` + `durationMs`.
4. Failed ticks → exactly one `worker_tick_failed` per failure, fixed code
   `TICK_FAILED`, `backoffMs` within `[intervalMs, maxBackoffMs]`
   (10 then capped 12), pending timer stays bounded, and a synthetic
   sensitive message (`private customer lead_42 cannot be processed`)
   plus `Error` name are asserted absent from all serialized output.
5. Missing logger methods → no throw on both success and failure paths.
6. Successful tick with a throwing `info` logger → no `worker_tick_failed`
   event, no extra poll, next timer stays at the regular interval.
7. Failed tick with a throwing `error` logger → capped backoff timer still
   scheduled and `stop()` resolves; no unhandled rejection.

## Verification

- `node --test apps/worker/test/automation-worker-loop.test.mjs`: 11/11 pass
  (RED first confirmed: the two logger-isolation tests failed before the
  guard was added — one with a spurious failure event, one with unhandled
  rejections — not from harness errors).
- `tsc --project apps/worker/tsconfig.json` build + worker
  `eslint src --max-warnings=0`: pass.
- Root eslint on touched scripts: pass.
- Dependencies, DB, Docker, network, `.env`: untouched.

## Explicit non-goals

No metrics backend, no alerting, no queue dashboard, no production
readiness claim — local console JSON only. Runbook section added under
"Worker tick observability (EF-702, local console JSON only)".
