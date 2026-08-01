import assert from "node:assert/strict";
import test from "node:test";
import { loadRuntimeConfig, RuntimeConfigError } from "./config.js";

const authEnvironment = {
  ESTATEFLOW_BROWSER_ORIGIN: "https://app.estateflow.test",
  ESTATEFLOW_AUTH_HASH_KEY: "a".repeat(32),
  ESTATEFLOW_AUDIT_HASH_KEY: "b".repeat(32),
};

const productionEnvironment = {
  NODE_ENV: "production",
  ESTATEFLOW_API_SECRET: "api-secret",
  ...authEnvironment,
};

test("authentication configuration is explicit in every environment", () => {
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
  assert.throws(
    () =>
      loadRuntimeConfig({
        NODE_ENV: "test",
        ...authEnvironment,
        ESTATEFLOW_AUTH_HASH_KEY: "too-short",
      }),
    /at least 32 UTF-8 bytes/,
  );
});

test("production configuration requires canonical HTTPS origin and hash keys", () => {
  assert.deepEqual(loadRuntimeConfig(productionEnvironment), {
    environment: "production",
    port: 3001,
    apiSecret: "api-secret",
    browserOrigin: "https://app.estateflow.test",
    authHashKey: "a".repeat(32),
    auditHashKey: "b".repeat(32),
    authFakeDelivery: false,
  });

  assert.throws(
    () =>
      loadRuntimeConfig({
        ...productionEnvironment,
        ESTATEFLOW_BROWSER_ORIGIN: "http://app.estateflow.test",
      }),
    RuntimeConfigError,
  );
  assert.throws(
    () =>
      loadRuntimeConfig({
        ...productionEnvironment,
        ESTATEFLOW_BROWSER_ORIGIN: "https://*.estateflow.test",
      }),
    RuntimeConfigError,
  );
  assert.throws(() => {
    const withoutAuthHashKey: NodeJS.ProcessEnv = {
      ...productionEnvironment,
    };
    delete withoutAuthHashKey.ESTATEFLOW_AUTH_HASH_KEY;
    return loadRuntimeConfig(withoutAuthHashKey);
  }, RuntimeConfigError);
  assert.throws(
    () =>
      loadRuntimeConfig({
        ...productionEnvironment,
        ESTATEFLOW_AUTH_HASH_KEY: "too-short",
      }),
    /at least 32 UTF-8 bytes/,
  );
  assert.throws(
    () =>
      loadRuntimeConfig({
        ...productionEnvironment,
        ESTATEFLOW_AUDIT_HASH_KEY: "too-short",
      }),
    /at least 32 UTF-8 bytes/,
  );
});
