const DEFAULT_INTERVAL_MS = 5_000;
const DEFAULT_MAX_BACKOFF_MS = 60_000;

/**
 * Long-lived EF-303 runner primitive. The transport is injected so the worker
 * can consume the API-side EF-302 tick callable without knowing Nest/Prisma.
 * Polls never overlap, errors back off with a bounded delay, and stop() waits
 * for the active tick before returning.
 */
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
      try {
        await tick();
        backoffMs = intervalMs;
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "unknown worker error";
        logger.error?.(`automation worker tick failed: ${message}`);
        backoffMs = Math.min(backoffMs * 2, maxBackoffMs);
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
