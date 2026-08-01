import assert from "node:assert/strict";
import test from "node:test";
import {
  loadRuntimeConfig,
  RuntimeConfigError,
} from "../dist/bootstrap/config.js";
import { requestIdMiddleware } from "../dist/common/http/request-id.middleware.js";
import { HealthController } from "../dist/features/health/health.controller.js";

const authEnvironment = {
  ESTATEFLOW_BROWSER_ORIGIN: "https://app.estateflow.test",
  ESTATEFLOW_AUTH_HASH_KEY: "a".repeat(32),
  ESTATEFLOW_AUDIT_HASH_KEY: "b".repeat(32),
};

test("configuration requires explicit authentication settings in development", () => {
  assert.deepEqual(loadRuntimeConfig(authEnvironment), {
    environment: "development",
    port: 3001,
    apiSecret: null,
    browserOrigin: "https://app.estateflow.test",
    authHashKey: "a".repeat(32),
    auditHashKey: "b".repeat(32),
    authFakeDelivery: false,
  });
  assert.throws(() => loadRuntimeConfig({}), RuntimeConfigError);
});

test("configuration rejects invalid ports and production without secret", () => {
  assert.throws(
    () => loadRuntimeConfig({ ...authEnvironment, PORT: "0" }),
    RuntimeConfigError,
  );
  assert.throws(
    () => loadRuntimeConfig({ NODE_ENV: "production", ...authEnvironment }),
    RuntimeConfigError,
  );
});

test("request ID middleware preserves a valid UUID and generates a replacement", () => {
  const valid = "9a30f920-575f-4bdb-884c-227109705728";
  const preserved = { header: () => valid };
  const preservedResponse = {
    setHeader: (key, value) => {
      preservedResponse[key] = value;
    },
  };
  requestIdMiddleware(preserved, preservedResponse, () => {});
  assert.equal(preserved.requestId, valid);
  assert.equal(preservedResponse["x-request-id"], valid);

  const generated = { header: () => "not-a-uuid" };
  const generatedResponse = {
    setHeader: (key, value) => {
      generatedResponse[key] = value;
    },
  };
  requestIdMiddleware(generated, generatedResponse, () => {});
  assert.match(generated.requestId, /^[0-9a-f-]{36}$/i);
});

test("health liveness remains independent from readiness", () => {
  const controller = new HealthController();
  assert.deepEqual(controller.live(), { status: "ok" });
  const prior = globalThis.process.env.ESTATEFLOW_READY;
  globalThis.process.env.ESTATEFLOW_READY = "false";
  assert.throws(() => controller.ready());
  if (prior === undefined) delete globalThis.process.env.ESTATEFLOW_READY;
  else globalThis.process.env.ESTATEFLOW_READY = prior;
  assert.deepEqual(controller.ready(), { status: "ok" });
});

test("test-only fake auth delivery is opt-in and rejected outside test", () => {
  assert.equal(loadRuntimeConfig({ ...authEnvironment }).authFakeDelivery, false);
  assert.equal(
    loadRuntimeConfig({
      NODE_ENV: "test",
      ESTATEFLOW_AUTH_FAKE_DELIVERY: "true",
      ...authEnvironment,
    }).authFakeDelivery,
    true,
  );
  assert.throws(
    () => loadRuntimeConfig({ ESTATEFLOW_AUTH_FAKE_DELIVERY: "true", ...authEnvironment }),
    RuntimeConfigError,
  );
  assert.throws(
    () => loadRuntimeConfig({
      NODE_ENV: "production",
      ESTATEFLOW_API_SECRET: "present",
      ESTATEFLOW_AUTH_FAKE_DELIVERY: "true",
      ...authEnvironment,
    }),
    RuntimeConfigError,
  );
});
