import assert from "node:assert/strict";
import test from "node:test";
import { createAutomationWorkerLoop } from "../../../scripts/automation-worker-loop.mjs";
import { createAutomationWorker } from "../dist/index.js";

const flush = async () => {
  await Promise.resolve();
  await Promise.resolve();
};

function fakeTimers() {
  let nextId = 0;
  const timers = [];
  return {
    timers,
    setTimeoutFn(callback, delay) {
      const timer = { id: ++nextId, callback, delay };
      timers.push(timer);
      return timer;
    },
    clearTimeoutFn(timer) {
      const index = timers.indexOf(timer);
      if (index >= 0) timers.splice(index, 1);
    },
  };
}

test("worker loop starts with an immediate poll and schedules the interval", async () => {
  const clock = fakeTimers();
  let calls = 0;
  const loop = createAutomationWorkerLoop({
    tick: async () => {
      calls += 1;
    },
    intervalMs: 10,
    maxBackoffMs: 40,
    setTimeoutFn: clock.setTimeoutFn,
    clearTimeoutFn: clock.clearTimeoutFn,
  });

  loop.start();
  assert.equal(clock.timers[0].delay, 0);
  clock.timers.shift().callback();
  await flush();
  assert.equal(calls, 1);
  assert.equal(clock.timers[0].delay, 10);
  await loop.stop();
});

test("worker loop uses capped exponential backoff after a failed tick", async () => {
  const clock = fakeTimers();
  const errors = [];
  let calls = 0;
  const loop = createAutomationWorkerLoop({
    tick: async () => {
      calls += 1;
      if (calls < 3) throw new Error("temporary");
    },
    intervalMs: 5,
    maxBackoffMs: 12,
    setTimeoutFn: clock.setTimeoutFn,
    clearTimeoutFn: clock.clearTimeoutFn,
    logger: { error: (message) => errors.push(message) },
  });

  loop.start();
  clock.timers.shift().callback();
  await flush();
  assert.equal(clock.timers[0].delay, 10);
  clock.timers.shift().callback();
  await flush();
  assert.equal(clock.timers[0].delay, 12);
  clock.timers.shift().callback();
  await flush();
  assert.equal(clock.timers[0].delay, 5);
  assert.equal(errors.length, 2);
  await loop.stop();
});

test("worker loop stop waits for an active tick and prevents another poll", async () => {
  const clock = fakeTimers();
  let resolveTick;
  const loop = createAutomationWorkerLoop({
    tick: () =>
      new Promise((resolve) => {
        resolveTick = resolve;
      }),
    intervalMs: 5,
    maxBackoffMs: 20,
    setTimeoutFn: clock.setTimeoutFn,
    clearTimeoutFn: clock.clearTimeoutFn,
  });

  loop.start();
  clock.timers.shift().callback();
  await flush();
  const stopping = loop.stop();
  let completed = false;
  void stopping.then(() => {
    completed = true;
  });
  await flush();
  assert.equal(completed, false);
  resolveTick();
  await stopping;
  assert.equal(completed, true);
  assert.equal(clock.timers.length, 0);
});

const parseLog = (entries) => entries.map((entry) => JSON.parse(entry));

test("successful tick emits exactly one privacy-minimized worker_tick_completed event with allowlisted counter groups", async () => {
  const clock = fakeTimers();
  const info = [];
  const loop = createAutomationWorkerLoop({
    tick: async () => ({
      evaluatedRules: 3,
      scheduled: 2,
      alreadyScheduled: 1,
      secretLeadId: "lead_123",
      schedules: { evaluatedRules: 3, scheduled: 2, alreadyScheduled: 1 },
      jobs: { claimed: 2, succeeded: 1, retried: 1, failed: 0 },
      deliveries: {
        claimed: 2,
        delivered: 1,
        retried: 1,
        failed: 0,
        cancelled: 0,
      },
      media: { marked: 1, swept: 1, deletedStorageKeys: 3 },
    }),
    intervalMs: 5,
    maxBackoffMs: 20,
    setTimeoutFn: clock.setTimeoutFn,
    clearTimeoutFn: clock.clearTimeoutFn,
    logger: { info: (message) => info.push(message) },
  });

  loop.start();
  clock.timers.shift().callback();
  await flush();
  await loop.stop();

  assert.equal(info.length, 1);
  const event = JSON.parse(info[0]);
  assert.equal(event.event, "worker_tick_completed");
  assert.equal(typeof event.durationMs, "number");
  assert.ok(Number.isSafeInteger(event.durationMs));
  assert.ok(event.durationMs >= 0);
  assert.deepEqual(event.schedules, {
    evaluatedRules: 3,
    scheduled: 2,
    alreadyScheduled: 1,
  });
  assert.deepEqual(event.jobs, {
    claimed: 2,
    succeeded: 1,
    retried: 1,
    failed: 0,
  });
  assert.deepEqual(event.deliveries, {
    claimed: 2,
    delivered: 1,
    retried: 1,
    failed: 0,
    cancelled: 0,
  });
  assert.deepEqual(event.media, {
    marked: 1,
    swept: 1,
    deletedStorageKeys: 3,
  });
  assert.equal("secretLeadId" in event, false);
});

test("tick counter events omit unknown keys, invalid values, and groups with no object result", async () => {
  const clock = fakeTimers();
  const info = [];
  const loop = createAutomationWorkerLoop({
    tick: async () => ({
      schedules: {
        evaluatedRules: 2,
        extraKey: 9,
        negative: -1,
        fractional: 1.5,
      },
      jobs: 7,
      accessToken: "tok",
    }),
    intervalMs: 5,
    maxBackoffMs: 20,
    setTimeoutFn: clock.setTimeoutFn,
    clearTimeoutFn: clock.clearTimeoutFn,
    logger: { info: (message) => info.push(message) },
  });

  loop.start();
  clock.timers.shift().callback();
  await flush();
  await loop.stop();

  assert.equal(info.length, 1);
  const event = JSON.parse(info[0]);
  assert.deepEqual(event.schedules, { evaluatedRules: 2 });
  assert.equal("jobs" in event, false);
  assert.equal("deliveries" in event, false);
  assert.equal("media" in event, false);
  assert.equal("accessToken" in event, false);
});

test("tick without an object result emits the completion event with no counter groups", async () => {
  const clock = fakeTimers();
  const info = [];
  const loop = createAutomationWorkerLoop({
    tick: async () => undefined,
    intervalMs: 5,
    maxBackoffMs: 20,
    setTimeoutFn: clock.setTimeoutFn,
    clearTimeoutFn: clock.clearTimeoutFn,
    logger: { info: (message) => info.push(message) },
  });

  loop.start();
  clock.timers.shift().callback();
  await flush();
  await loop.stop();

  assert.equal(info.length, 1);
  const event = JSON.parse(info[0]);
  assert.equal(event.event, "worker_tick_completed");
  assert.deepEqual(Object.keys(event).sort(), ["durationMs", "event"]);
});

test("failed tick emits one worker_tick_failed event with fixed code and bounded backoff, leaking no error detail", async () => {
  const clock = fakeTimers();
  const errors = [];
  const sensitive = "private customer lead_42 cannot be processed";
  let calls = 0;
  const loop = createAutomationWorkerLoop({
    tick: async () => {
      calls += 1;
      if (calls < 3) throw new Error(sensitive);
    },
    intervalMs: 5,
    maxBackoffMs: 12,
    setTimeoutFn: clock.setTimeoutFn,
    clearTimeoutFn: clock.clearTimeoutFn,
    logger: { error: (message) => errors.push(message) },
  });

  loop.start();
  clock.timers.shift().callback();
  await flush();
  clock.timers.shift().callback();
  await flush();
  assert.equal(clock.timers[0].delay, 12);
  await loop.stop();

  assert.equal(errors.length, 2);
  const events = parseLog(errors);
  for (const event of events) {
    assert.equal(event.event, "worker_tick_failed");
    assert.equal(event.code, "TICK_FAILED");
    assert.equal(Number.isSafeInteger(event.backoffMs), true);
    assert.ok(event.backoffMs >= 5 && event.backoffMs <= 12);
    assert.equal(Object.keys(event).sort().length, 3);
  }
  assert.deepEqual(
    events.map((e) => e.backoffMs),
    [10, 12],
  );
  for (const message of [...errors, JSON.stringify(events)]) {
    assert.equal(message.includes(sensitive), false);
    assert.equal(message.includes("lead_42"), false);
    assert.equal(message.includes("Error"), false);
  }
});

test("throwing info logger after a successful tick does not emit a failure event, re-poll, or back off", async () => {
  const clock = fakeTimers();
  const errors = [];
  let calls = 0;
  const loop = createAutomationWorkerLoop({
    tick: async () => {
      calls += 1;
    },
    intervalMs: 10,
    maxBackoffMs: 40,
    setTimeoutFn: clock.setTimeoutFn,
    clearTimeoutFn: clock.clearTimeoutFn,
    logger: {
      info: () => {
        throw new Error("logger exploded");
      },
      error: (message) => errors.push(message),
    },
  });

  loop.start();
  clock.timers.shift().callback();
  await flush();
  assert.equal(calls, 1);
  assert.equal(errors.length, 0);
  assert.equal(clock.timers.length, 1);
  assert.equal(clock.timers[0].delay, 10);
  clock.timers.shift().callback();
  await flush();
  assert.equal(calls, 2);
  assert.equal(errors.length, 0);
  await loop.stop();
});

test("throwing error logger after a failed tick still schedules the capped backoff and stop resolves", async () => {
  const clock = fakeTimers();
  const loop = createAutomationWorkerLoop({
    tick: async () => {
      throw new Error("boom");
    },
    intervalMs: 5,
    maxBackoffMs: 12,
    setTimeoutFn: clock.setTimeoutFn,
    clearTimeoutFn: clock.clearTimeoutFn,
    logger: {
      error: () => {
        throw new Error("logger exploded");
      },
    },
  });

  loop.start();
  clock.timers.shift().callback();
  await flush();
  clock.timers.shift().callback();
  await flush();
  assert.equal(clock.timers.length, 1);
  assert.equal(clock.timers[0].delay, 12);
  await loop.stop();
  assert.equal(clock.timers.length, 0);
});

test("event emission does not throw when injected logger lacks the method", async () => {
  const clock = fakeTimers();
  const loop = createAutomationWorkerLoop({
    tick: async () => ({ schedules: { scheduled: 1 } }),
    intervalMs: 5,
    maxBackoffMs: 20,
    setTimeoutFn: clock.setTimeoutFn,
    clearTimeoutFn: clock.clearTimeoutFn,
    logger: {},
  });

  loop.start();
  clock.timers.shift().callback();
  await flush();
  await loop.stop();

  const failing = createAutomationWorkerLoop({
    tick: async () => {
      throw new Error("boom");
    },
    intervalMs: 5,
    maxBackoffMs: 20,
    setTimeoutFn: clock.setTimeoutFn,
    clearTimeoutFn: clock.clearTimeoutFn,
    logger: {},
  });
  failing.start();
  clock.timers.shift().callback();
  await flush();
  await failing.stop();
});

test("worker wiring passes the EF-302 batch tick to the loop", async () => {
  const clock = fakeTimers();
  const calls = [];
  const worker = createAutomationWorker({
    scheduler: {
      async tick(input) {
        calls.push(input);
      },
    },
    jobBatchSize: 7,
    intervalMs: 5,
    maxBackoffMs: 20,
    setTimeoutFn: clock.setTimeoutFn,
    clearTimeoutFn: clock.clearTimeoutFn,
  });

  worker.start();
  clock.timers.shift().callback();
  await flush();
  assert.equal(calls.length, 1);
  assert.equal(calls[0].limit, 7);
  assert.ok(calls[0].now instanceof Date);
  await worker.stop();
});
