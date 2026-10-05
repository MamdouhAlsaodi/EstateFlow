import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import test from "node:test";
import { requestLoggingMiddleware } from "../dist/common/http/request-logging.middleware.js";

function createFakePair({ path, requestId }) {
  const request = {
    method: "GET",
    path,
    requestId,
    route: undefined,
  };
  const response = new EventEmitter();
  response.statusCode = 201;
  return { request, response };
}

async function captureLog(run) {
  const original = console.log;
  const lines = [];
  console.log = (...args) => {
    lines.push(args.join(" "));
  };
  try {
    await run();
  } finally {
    console.log = original;
  }
  return lines;
}

const SYNTHETIC_UUID = "f1d3a2c4-5b6e-4a7d-8c9f-0123456789ab";

test("logs developer-defined route template instead of concrete request path", async () => {
  const { request, response } = createFakePair({
    path: `/api/organizations/org_${SYNTHETIC_UUID}/properties/prop_99/media/${SYNTHETIC_UUID}`,
    requestId: "req-1",
  });
  const lines = await captureLog(async () => {
    requestLoggingMiddleware(request, response, () => {
      // Route becomes available only later (Express assigns it during routing,
      // before "finish" fires on the response).
      request.route = {
        path: "/api/organizations/:organizationId/properties/:propertyId/media/:mediaId",
      };
      response.emit("finish");
    });
  });
  assert.equal(lines.length, 1);
  const event = JSON.parse(lines[0]);
  assert.equal(event.event, "request_completed");
  assert.equal(
    event.path,
    "/api/organizations/:organizationId/properties/:propertyId/media/:mediaId",
  );
  assert.ok(!lines[0].includes(SYNTHETIC_UUID));
  assert.equal(event.method, "GET");
  assert.equal(event.requestId, "req-1");
  assert.equal(event.statusCode, 201);
  assert.equal(typeof event.durationMs, "number");
});

test("logs <unmatched> when no route is available, never falling back to the raw path", async () => {
  const { request, response } = createFakePair({
    path: `/api/unknown/${SYNTHETIC_UUID}`,
    requestId: "req-2",
  });
  const lines = await captureLog(() => {
    requestLoggingMiddleware(request, response, () => {
      response.emit("finish");
    });
  });
  assert.equal(lines.length, 1);
  const event = JSON.parse(lines[0]);
  assert.equal(event.path, "<unmatched>");
  assert.ok(!lines[0].includes(SYNTHETIC_UUID));
});

test("guards against non-string route.path by logging <unmatched>", async () => {
  const { request, response } = createFakePair({
    path: `/api/whatever/${SYNTHETIC_UUID}`,
    requestId: "req-3",
  });
  requestLoggingMiddleware(request, response, () => {});
  for (const bogus of [{ evil: true }, 42, null]) {
    request.route = { path: bogus };
    const lines = await captureLog(() => {
      response.emit("finish");
    });
    assert.equal(lines.length, 1);
    const event = JSON.parse(lines[0]);
    assert.equal(event.path, "<unmatched>");
    assert.ok(!lines[0].includes(SYNTHETIC_UUID));
  }
});

test("ephemeral Express server: request.route.path is set by finish time", async (t) => {
  // Express is a transitive dependency of @nestjs/platform-express; resolve
  // it without adding a new direct dependency to apps/api. Express is a
  // repository dependency and this test verifies our security assumption, so
  // resolution failure must fail transparently rather than skip.
  const { createRequire } = await import("node:module");
  const { dirname, join } = await import("node:path");
  const platformExpressDir = dirname(
    createRequire(import.meta.url).resolve(
      "@nestjs/platform-express/package.json",
    ),
  );
  const express = createRequire(join(platformExpressDir, "package.json"))(
    "express",
  );
  const app = express();
  let routePathAtFinish;
  let rawPath;
  let resolveFinish;
  const finishPromise = new Promise((resolve) => {
    resolveFinish = resolve;
  });
  app.get("/api/properties/:propertyId", (req, res) => {
    res.on("finish", () => {
      routePathAtFinish = req.route?.path;
      rawPath = req.path;
      resolveFinish();
    });
    res.status(200).json({ ok: true });
  });
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.on("listening", resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const { port } = server.address();
  const res = await fetch(`http://127.0.0.1:${port}/api/properties/123`);
  assert.equal(res.status, 200);
  await finishPromise;
  assert.equal(routePathAtFinish, "/api/properties/:propertyId");
  assert.equal(rawPath, "/api/properties/123");
});
