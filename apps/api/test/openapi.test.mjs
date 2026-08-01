import assert from "node:assert/strict";
import test from "node:test";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "../dist/app.module.js";
import { buildOpenApiDocument } from "../dist/openapi.js";

Object.assign(globalThis.process.env, {
  NODE_ENV: "test",
  ESTATEFLOW_BROWSER_ORIGIN: "https://app.estateflow.test",
  ESTATEFLOW_AUTH_HASH_KEY: "a".repeat(32),
  ESTATEFLOW_AUDIT_HASH_KEY: "b".repeat(32),
  ESTATEFLOW_AUTH_FAKE_DELIVERY: "true",
});

test("buildOpenApiDocument includes the composed auth and health paths", async () => {
  const app = await NestFactory.create(AppModule, { logger: false });

  try {
    const document = buildOpenApiDocument(app);

    assert.match(document.openapi, /^3\./);
    assert.equal(document.info.title, "EstateFlow API");
    assert.equal(document.info.version, "0.1.0");
    assert.deepEqual(Object.keys(document.paths).sort(), [
      "/auth/login",
      "/auth/logout",
      "/auth/password-recovery",
      "/auth/password-reset",
      "/auth/refresh",
      "/auth/register",
      "/auth/session",
      "/health/live",
      "/health/ready",
      "/organizations",
      "/organizations/{organizationId}",
      "/organizations/{organizationId}/memberships",
      "/organizations/{organizationId}/memberships/me",
      "/platform/broker-memberships/{membershipId}/approve",
    ]);
    assert.equal(
      JSON.stringify(document.components?.schemas ?? {}).includes("example"),
      false,
    );
    assert.equal(
      document.paths["/health/live"].get.operationId,
      "getLiveHealth",
    );
    assert.equal(
      document.paths["/health/ready"].get.operationId,
      "getReadyHealth",
    );
    assert.equal(
      document.paths["/health/live"].get.responses["200"].description,
      "Service is live",
    );
    assert.equal(
      document.paths["/health/ready"].get.responses["200"].description,
      "Service is ready",
    );
    assert.equal(
      document.paths["/health/ready"].get.responses["503"].description,
      "Dependencies are not ready",
    );
  } finally {
    await app.close();
  }
});
