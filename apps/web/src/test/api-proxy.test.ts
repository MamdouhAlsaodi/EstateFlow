import assert from "node:assert/strict";
import test from "node:test";
import {
  createApiRewrite,
  resolveApiOrigin,
} from "../lib/api-client/api-origin.js";

test("accepts an absolute API origin and maps same-origin API paths without duplication", () => {
  const origin = resolveApiOrigin("https://api.example.test:8443/");

  assert.equal(origin, "https://api.example.test:8443");
  assert.deepEqual(createApiRewrite(origin), {
    source: "/api/:path*",
    destination: "https://api.example.test:8443/:path*",
  });
});

test("rejects missing or malformed API origins", () => {
  for (const value of [undefined, "", "   ", "api.example.test", "ftp://api.example.test"]) {
    assert.throws(() => resolveApiOrigin(value), /API_ORIGIN/);
  }
});

test("rejects API origins that could leak credentials or duplicate the API path", () => {
  for (const value of [
    "https://user:password@api.example.test",
    "https://api.example.test?token=secret",
    "https://api.example.test/#fragment",
    "https://api.example.test/api",
    "https://api.example.test/v1",
  ]) {
    assert.throws(() => resolveApiOrigin(value), /API_ORIGIN/);
  }
});
