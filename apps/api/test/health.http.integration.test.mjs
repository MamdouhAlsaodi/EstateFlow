import assert from "node:assert/strict";
import process from "node:process";
import { URL } from "node:url";
import test from "node:test";

const TEST_BROWSER_ORIGIN = "https://app.estateflow.test";
const TEST_HASH_KEY = "a".repeat(32);
const TEST_AUDIT_KEY = "b".repeat(32);

// Synthetic test environment for the composed AppModule; no real secrets read.
Object.assign(process.env, {
  NODE_ENV: "test",
  ESTATEFLOW_BROWSER_ORIGIN: TEST_BROWSER_ORIGIN,
  ESTATEFLOW_AUTH_HASH_KEY: TEST_HASH_KEY,
  ESTATEFLOW_AUDIT_HASH_KEY: TEST_AUDIT_KEY,
  ESTATEFLOW_AUTH_FAKE_DELIVERY: "true",
});

/**
 * Strict test-only guard mirroring scripts/assert-test-database.mjs: the
 * readiness HTTP integration test may only ever run against the isolated CI
 * PostgreSQL test database (estateflow_test on loopback port 55433) with an
 * explicit destructive-tests opt-in. Locally, without that guarded target,
 * the test reports as skipped and never touches a real database.
 */
function hasGuardedTestTarget() {
  if (process.env.ALLOW_DESTRUCTIVE_TESTS !== "1" || !process.env.DATABASE_URL)
    return false;
  try {
    const configured = new URL(process.env.DATABASE_URL);
    return (
      ["postgres:", "postgresql:"].includes(configured.protocol) &&
      ["127.0.0.1", "localhost", "::1"].includes(configured.hostname) &&
      configured.port === (process.env.ESTATEFLOW_TEST_DB_PORT ?? "55433") &&
      configured.username === "estateflow_test" &&
      configured.pathname === "/estateflow_test"
    );
  } catch {
    return false;
  }
}

test(
  "EF-702 readiness HTTP endpoints answer over real HTTP against the guarded test database",
  { skip: !hasGuardedTestTarget() },
  async () => {
    const [{ NestFactory }, { AppModule }, { PrismaService }] =
      await Promise.all([
        import("@nestjs/core"),
        import("../dist/app.module.js"),
        import("../dist/database/prisma.service.js"),
      ]);

    const app = await NestFactory.create(AppModule, { logger: false });
    const prisma = app.get(PrismaService);
    let baseUrl;
    const priorReadyFlag = process.env.ESTATEFLOW_READY;
    try {
      // Connect the shared Prisma singleton to the already-migrated,
      // isolated CI test database. Read-only usage only: SELECT 1 probes,
      // no records created, written, or cleaned up.
      await prisma.$connect();
      await prisma.$queryRaw`SELECT 1`;

      await app.listen(0, "127.0.0.1");
      baseUrl = `http://127.0.0.1:${app.getHttpServer().address().port}`;

      // Live: process is up, no dependency involvement.
      const live = await fetch(`${baseUrl}/health/live`);
      assert.equal(live.status, 200);
      assert.deepEqual(await live.json(), { status: "ok" });

      // Ready: SELECT 1 succeeds through the Prisma-backed probe.
      const ready = await fetch(`${baseUrl}/health/ready`);
      assert.equal(ready.status, 200);
      assert.deepEqual(await ready.json(), { status: "ok" });

      // Flip the ready flag off: ready must degrade to a generic 503 while
      // live stays 200. Flag is restored in the finally block below.
      process.env.ESTATEFLOW_READY = "false";
      const notReady = await fetch(`${baseUrl}/health/ready`);
      assert.equal(notReady.status, 503);
      assert.deepEqual(await notReady.json(), {
        message: "Dependencies are not ready",
        error: "Service Unavailable",
        statusCode: 503,
      });
      const liveWhileNotReady = await fetch(`${baseUrl}/health/live`);
      assert.equal(liveWhileNotReady.status, 200);
      assert.deepEqual(await liveWhileNotReady.json(), { status: "ok" });
    } finally {
      if (priorReadyFlag === undefined) delete process.env.ESTATEFLOW_READY;
      else process.env.ESTATEFLOW_READY = priorReadyFlag;
      await app.close();
    }
  },
);
