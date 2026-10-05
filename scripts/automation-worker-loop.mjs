import { performance } from "node:perf_hooks";

const DEFAULT_INTERVAL_MS = 5_000;
const DEFAULT_MAX_BACKOFF_MS = 60_000;

/**
 * Long-lived EF-303 runner primitive. The transport is injected so the worker
 * can consume the API-side EF-302 tick callable without knowing Nest/Prisma.
 * Polls never overlap, errors back off with a bounded delay, and stop() waits
 * for the active tick before returning.
 */
// EF-702 observability: allowlisted counters per known scheduler shape.
// Anything outside these groups/keys (IDs, tokens, freeform fields) is never
// serialized. Groups without an object result are omitted, never synthesized.
const TICK_COUNTER_GROUPS = Object.freeze({
  schedules: Object.freeze(["evaluatedRules", "scheduled", "alreadyScheduled"]),
  jobs: Object.freeze(["claimed", "succeeded", "retried", "failed"]),
  deliveries: Object.freeze([
    "claimed",
    "delivered",
    "retried",
    "failed",
    "cancelled",
  ]),
  media: Object.freeze(["marked", "swept", "deletedStorageKeys"]),
});

const isNonnegativeSafeInteger = (value) =>
  typeof value === "number" && Number.isSafeInteger(value) && value >= 0;

const extractTickCounterGroups = (result) => {
  if (typeof result !== "object" || result === null) return {};
  const groups = {};
  for (const [group, keys] of Object.entries(TICK_COUNTER_GROUPS)) {
    const source = result[group];
    if (typeof source !== "object" || source === null) continue;
    const counters = {};
    for (const key of keys) {
      if (isNonnegativeSafeInteger(source[key])) counters[key] = source[key];
    }
    if (Object.keys(counters).length > 0) groups[group] = counters;
  }
  return groups;
};

export function createAutomationWorkerLoop({
  tick,
  intervalMs = DEFAULT_INTERVAL_MS,
  maxBackoffMs = DEFAULT_MAX_BACKOFF_MS,
  setTimeoutFn = globalThis.setTimeout,
  clearTimeoutFn = globalThis.clearTimeout,
  logger = console,
}) {
  if (typeof tick !== "function") throw new TypeError("tick is required");
  if (!Number.isInteger(intervalMs) || intervalMs < 1)
    throw new RangeError("intervalMs must be a positive integer");
  if (!Number.isInteger(maxBackoffMs) || maxBackoffMs < intervalMs)
    throw new RangeError("maxBackoffMs must be >= intervalMs");

  let stopped = false;
  let timer = null;
  let running = null;
  let backoffMs = intervalMs;
  let resolveStopped;
  const stoppedPromise = new Promise((resolve) => {
    resolveStopped = resolve;
  });

  const schedule = (delay) => {
    if (stopped) {
      if (!running) resolveStopped();
      return;
    }
    timer = setTimeoutFn(() => {
      timer = null;
      void poll();
    }, delay);
  };

  const poll = async () => {
    if (stopped || running) return;
    running = (async () => {
      const startedAtMs = performance.now();
      try {
        const result = await tick();
        backoffMs = intervalMs;
        // One structured, privacy-minimized event per successful tick using
        // the existing console JSON convention (no wall-clock timestamps,
        // no raw scheduler fields). Logging must never affect tick outcome
        // classification, so its side effects are isolated here.
        try {
          logger.info?.(
            JSON.stringify({
              event: "worker_tick_completed",
              durationMs: Math.max(
                0,
                Math.round(performance.now() - startedAtMs),
              ),
              ...extractTickCounterGroups(result),
            }),
          );
        } catch {
          // swallow: a throwing logger must not change the tick outcome
        }
      } catch (error) {
        // Fixed code only: raw messages, stacks, names, and identifiers are
        // deliberately never serialized. Logging must never reject the poll
        // (which would escape as an unhandled rejection and race stop()).
        void error;
        backoffMs = Math.min(backoffMs * 2, maxBackoffMs);
        try {
          logger.error?.(
            JSON.stringify({
              event: "worker_tick_failed",
              code: "TICK_FAILED",
              backoffMs,
            }),
          );
        } catch {
          // swallow: a throwing logger must not change the tick outcome
        }
      } finally {
        running = null;
        schedule(backoffMs);
      }
    })();
    await running;
  };

  return {
    start() {
      if (stopped) throw new Error("worker loop is stopped");
      if (!timer && !running) schedule(0);
      return stoppedPromise;
    },
    async stop() {
      stopped = true;
      if (timer !== null) {
        clearTimeoutFn(timer);
        timer = null;
      }
      if (running) await running;
      resolveStopped();
      return stoppedPromise;
    },
    get backoffMs() {
      return backoffMs;
    },
  };
}

export const automationWorkerDefaults = Object.freeze({
  intervalMs: DEFAULT_INTERVAL_MS,
  maxBackoffMs: DEFAULT_MAX_BACKOFF_MS,
});
