const safeIdentifier = /^[A-Za-z][A-Za-z0-9_]*$/;

function quoteIdentifier(identifier) {
  if (!safeIdentifier.test(identifier)) {
    throw new Error(`Unsafe database identifier: ${identifier}`);
  }
  return `"${identifier}"`;
}

function validateTableNames(tableNames) {
  if (!Array.isArray(tableNames) || tableNames.length === 0) {
    throw new Error(
      "cleanupDatabase requires an explicit non-empty table allowlist.",
    );
  }
  return [...new Set(tableNames)].map((tableName) => {
    quoteIdentifier(tableName);
    return tableName;
  });
}

export async function cleanupDatabase(prisma, tableNames) {
  const uniqueTables = validateTableNames(tableNames);
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

export async function assertTablesAreEmpty(prisma, tableNames) {
  const uniqueTables = validateTableNames(tableNames);
  const counts = await Promise.all(
    uniqueTables.map(async (tableName) => {
      const [result] = await prisma.$queryRawUnsafe(
        `SELECT COUNT(*)::integer AS count FROM ${quoteIdentifier(tableName)}`,
      );
      return [tableName, result.count];
    }),
  );
  const remaining = counts.filter(([, count]) => count !== 0);
  if (remaining.length > 0) {
    throw new Error(
      `Expected empty test tables; found records in: ${remaining
        .map(([tableName, count]) => `${tableName}=${count}`)
        .join(", ")}`,
    );
  }
}
