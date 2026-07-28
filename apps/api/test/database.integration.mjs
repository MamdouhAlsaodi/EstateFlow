import assert from "node:assert/strict";
import test from "node:test";
import { PrismaService } from "../dist/database/prisma.service.js";
import { cleanupDatabase } from "./support/cleanup-database.mjs";

const fixtureTables = ["ef104_test_child", "ef104_test_parent"];

test("database baseline enables PostGIS and cleanup is FK-safe", async () => {
  const prisma = new PrismaService();

  try {
    await prisma.$connect();

    const extensions = await prisma.$queryRawUnsafe(
      "SELECT extname FROM pg_extension WHERE extname IN ('postgis', 'pgcrypto') ORDER BY extname",
    );
    assert.deepEqual(
      extensions.map(({ extname }) => extname),
      ["pgcrypto", "postgis"],
    );

    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS ef104_test_parent (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid()
      )
    `);
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS ef104_test_child (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        parent_id uuid NOT NULL REFERENCES ef104_test_parent(id)
      )
    `);
    await prisma.$executeRawUnsafe(
      "INSERT INTO ef104_test_parent DEFAULT VALUES",
    );
    await prisma.$executeRawUnsafe(`
      INSERT INTO ef104_test_child (parent_id)
      SELECT id FROM ef104_test_parent LIMIT 1
    `);

    await cleanupDatabase(prisma, fixtureTables);

    const [parentCount] = await prisma.$queryRawUnsafe(
      "SELECT COUNT(*)::integer AS count FROM ef104_test_parent",
    );
    const [childCount] = await prisma.$queryRawUnsafe(
      "SELECT COUNT(*)::integer AS count FROM ef104_test_child",
    );
    assert.equal(parentCount.count, 0);
    assert.equal(childCount.count, 0);
  } finally {
    await prisma
      .$executeRawUnsafe(
        "DROP TABLE IF EXISTS ef104_test_child, ef104_test_parent CASCADE",
      )
      .catch(() => undefined);
    await prisma.$disconnect();
  }
});
