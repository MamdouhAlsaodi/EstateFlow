import assert from "node:assert/strict";
import test from "node:test";
import { ServiceUnavailableException } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "../dist/app.module.js";
import { HealthController } from "../dist/features/health/health.controller.js";
import { PrismaReadinessProbe } from "../dist/features/health/readiness-probe.port.js";

const GENERIC_MESSAGE = "Dependencies are not ready";
const READINESS_TIMEOUT_MS = 1000;
const TIMEBOX_TOLERANCE_MS = 500;

function fakeProbe(implementation) {
  const calls = [];
  return {
    calls,
    check() {
      calls.push([]);
      return implementation();
    },
  };
}

function readinessError(error) {
  assert.ok(error instanceof ServiceUnavailableException);
  assert.equal(error.getStatus(), 503);
  assert.equal(error.message, GENERIC_MESSAGE);
  const body = error.getResponse();
  assert.equal(body.message, GENERIC_MESSAGE);
  return body;
}

async function rejectsReadiness(promise) {
  await assert.rejects(promise, (error) => {
    readinessError(error);
    return true;
  });
}

function withReadyFlag(value, run) {
  const prior = globalThis.process.env.ESTATEFLOW_READY;
  if (value === undefined) delete globalThis.process.env.ESTATEFLOW_READY;
  else globalThis.process.env.ESTATEFLOW_READY = value;
  return Promise.resolve()
    .then(run)
    .finally(() => {
      if (prior === undefined) delete globalThis.process.env.ESTATEFLOW_READY;
      else globalThis.process.env.ESTATEFLOW_READY = prior;
    });
}

test("ready returns ok only when the readiness probe succeeds", async () => {
  const controller = new HealthController(fakeProbe(() => Promise.resolve()));
  assert.deepEqual(await controller.ready(), { status: "ok" });
});

test("ready fails closed with a generic 503 when the probe rejects", async () => {
  const controller = new HealthController(
    fakeProbe(() => Promise.reject(new Error("P1001: postgres://secret-host"))),
  );
  await rejectsReadiness(controller.ready());
});

test("ready maps a synchronously throwing probe to the same generic 503", async () => {
  const controller = new HealthController(
    fakeProbe(() => {
      throw new Error("connection refused");
    }),
  );
  await rejectsReadiness(controller.ready());
});

test("a never-settling probe answers within the strict timeout and admits a single flight", async () => {
  const controller = new HealthController(
    fakeProbe(() => new Promise(() => {})),
  );
  const startedAt = Date.now();
  await Promise.all([
    rejectsReadiness(controller.ready()),
    rejectsReadiness(controller.ready()),
    rejectsReadiness(controller.ready()),
  ]);
  const elapsed = Date.now() - startedAt;
  assert.ok(
    elapsed >= READINESS_TIMEOUT_MS - TIMEBOX_TOLERANCE_MS,
    `readiness answered too early: ${elapsed}ms`,
  );
  assert.ok(
    elapsed < READINESS_TIMEOUT_MS + TIMEBOX_TOLERANCE_MS,
    `readiness exceeded the strict timeout: ${elapsed}ms`,
  );
  assert.equal(controller.readinessProbe.calls.length, 1);
});

test("readiness admits a fresh probe once the outstanding probe settles", async () => {
  let settleProbe;
  const controller = new HealthController(
    fakeProbe(() =>
      controller.readinessProbe.calls.length === 1
        ? new Promise((resolve) => {
            settleProbe = resolve;
          })
        : Promise.resolve(),
    ),
  );
  await rejectsReadiness(controller.ready());
  settleProbe();
  await new Promise((resolve) => globalThis.setImmediate(resolve));
  assert.deepEqual(await controller.ready(), { status: "ok" });
  assert.equal(controller.readinessProbe.calls.length, 2);
});

test("live stays synchronous, independent, and probe-free while readiness fails", async () => {
  const controller = new HealthController(
    fakeProbe(() => new Promise(() => {})),
  );
  assert.deepEqual(controller.live(), { status: "ok" });
  assert.equal(controller.live().status, "ok");
  await rejectsReadiness(controller.ready());
  assert.deepEqual(controller.live(), { status: "ok" });
  assert.equal(controller.readinessProbe.calls.length, 1);
});

test("ESTATEFLOW_READY=false forces a generic 503 without probing", async () => {
  const controller = new HealthController(fakeProbe(() => Promise.resolve()));
  await withReadyFlag("false", async () => {
    await rejectsReadiness(controller.ready());
  });
  assert.equal(controller.readinessProbe.calls.length, 0);
});

test("composed AppModule wires the Prisma-backed probe behind the port", async () => {
  const envKeys = [
    "NODE_ENV",
    "ESTATEFLOW_BROWSER_ORIGIN",
    "ESTATEFLOW_AUTH_HASH_KEY",
    "ESTATEFLOW_AUDIT_HASH_KEY",
    "ESTATEFLOW_AUTH_FAKE_DELIVERY",
    "DATABASE_URL",
  ];
  const priorEnv = Object.fromEntries(
    envKeys.map((key) => [key, globalThis.process.env[key]]),
  );
  Object.assign(globalThis.process.env, {
    NODE_ENV: "test",
    ESTATEFLOW_BROWSER_ORIGIN: "https://app.estateflow.test",
    ESTATEFLOW_AUTH_HASH_KEY: "a".repeat(32),
    ESTATEFLOW_AUDIT_HASH_KEY: "b".repeat(32),
    ESTATEFLOW_AUTH_FAKE_DELIVERY: "true",
  });
  delete globalThis.process.env.DATABASE_URL;
  let app;
  try {
    app = await NestFactory.create(AppModule, { logger: false });
    const controller = app.get(HealthController);
    assert.ok(controller.readinessProbe instanceof PrismaReadinessProbe);
    assert.deepEqual(controller.live(), { status: "ok" });
    await withReadyFlag("false", async () => {
      await rejectsReadiness(controller.ready());
    });
    assert.equal(controller.readinessProbe, app.get(PrismaReadinessProbe));
  } finally {
    if (app) await app.close();
    for (const [key, value] of Object.entries(priorEnv)) {
      if (value === undefined) delete globalThis.process.env[key];
      else globalThis.process.env[key] = value;
    }
  }
});
