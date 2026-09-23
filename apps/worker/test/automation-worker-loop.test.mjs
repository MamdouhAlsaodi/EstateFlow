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
