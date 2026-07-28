import assert from "node:assert/strict";
import test from "node:test";
import { createEstateFlowClient } from "../dist/generated.js";

test("client calls documented health endpoints through injected fetch", async () => {
  const requests = [];
  const client = createEstateFlowClient({
    baseUrl: "https://example.test/api/",
    fetch: async (input, init) => {
      requests.push({ input, init });
      return {
        ok: true,
        json: async () => ({ status: "ok" }),
      };
    },
  });

  assert.deepEqual(await client.getLiveHealth(), { status: "ok" });
  assert.deepEqual(await client.getReadyHealth(), { status: "ok" });
  assert.deepEqual(requests, [
    { input: "https://example.test/api/health/live", init: { method: "GET" } },
    { input: "https://example.test/api/health/ready", init: { method: "GET" } },
  ]);
});

test("client rejects non-OK responses without exposing response body", async () => {
  const client = createEstateFlowClient({
    baseUrl: "https://example.test",
    fetch: async () => ({
      ok: false,
      json: async () => ({ message: "private diagnostic" }),
    }),
  });

  await assert.rejects(client.getReadyHealth(), {
    message: "EstateFlow API request failed",
  });
});
