import assert from "node:assert/strict";
import test from "node:test";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "../dist/app.module.js";
import { buildOpenApiDocument } from "../dist/openapi.js";

test("buildOpenApiDocument describes only the health endpoints", async () => {
  const app = await NestFactory.create(AppModule, { logger: false });

  try {
    const document = buildOpenApiDocument(app);

    assert.match(document.openapi, /^3\./);
    assert.equal(document.info.title, "EstateFlow API");
    assert.equal(document.info.version, "0.1.0");
    assert.deepEqual(Object.keys(document.paths).sort(), [
      "/health/live",
      "/health/ready",
    ]);
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
