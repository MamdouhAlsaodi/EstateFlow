import assert from "node:assert/strict";
import test from "node:test";
import { cleanupDatabase } from "./support/cleanup-database.mjs";

test("database cleanup requires an explicit table allowlist", async () => {
  await assert.rejects(
    () => cleanupDatabase({}, []),
    /explicit non-empty table allowlist/,
  );
});

test("database cleanup rejects unsafe identifiers before issuing SQL", async () => {
  let queryCalled = false;
  const prisma = {
    $queryRawUnsafe: async () => {
      queryCalled = true;
      return [];
    },
  };

  await assert.rejects(
    () => cleanupDatabase(prisma, ["safe_table; DROP SCHEMA public"]),
    /Unsafe database identifier/,
  );
  assert.equal(queryCalled, false);
});

test("database cleanup truncates the allowlist with FK-safe CASCADE", async () => {
  const statements = [];
  const prisma = {
    $queryRawUnsafe: async () => [
      { tablename: "child_table" },
      { tablename: "parent_table" },
    ],
    $executeRawUnsafe: async (statement) => statements.push(statement),
  };

  await cleanupDatabase(prisma, ["child_table", "parent_table"]);

  assert.deepEqual(statements, [
    'TRUNCATE TABLE "child_table", "parent_table" RESTART IDENTITY CASCADE',
  ]);
});
