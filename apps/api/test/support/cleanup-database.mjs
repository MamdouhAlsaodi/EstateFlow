const safeIdentifier = /^[a-z][a-z0-9_]*$/;

function quoteIdentifier(identifier) {
  if (!safeIdentifier.test(identifier)) {
    throw new Error(`Unsafe database identifier: ${identifier}`);
  }
  return `"${identifier}"`;
}

export async function cleanupDatabase(prisma, tableNames) {
  if (!Array.isArray(tableNames) || tableNames.length === 0) {
    throw new Error(
      "cleanupDatabase requires an explicit non-empty table allowlist.",
    );
  }

  const uniqueTables = [...new Set(tableNames)];
  const quotedList = uniqueTables.map(quoteIdentifier).join(", ");
  const literalList = uniqueTables
    .map((table) => `'${quoteIdentifier(table).slice(1, -1)}'`)
    .join(", ");
  const existingTables = await prisma.$queryRawUnsafe(
    `SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename IN (${literalList})`,
  );
  const existingNames = new Set(
    existingTables.map(({ tablename }) => tablename),
  );
  const missingTables = uniqueTables.filter(
    (table) => !existingNames.has(table),
  );

  if (missingTables.length > 0) {
    throw new Error(
      `Cleanup allowlist contains missing tables: ${missingTables.join(", ")}`,
    );
  }

  await prisma.$executeRawUnsafe(
    `TRUNCATE TABLE ${quotedList} RESTART IDENTITY CASCADE`,
  );
}
