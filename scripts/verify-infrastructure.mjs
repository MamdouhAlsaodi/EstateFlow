import { readFileSync } from "node:fs";

const localCompose = readFileSync(
  "infra/compose/docker-compose.local.yml",
  "utf8",
);
const testCompose = readFileSync(
  "infra/compose/docker-compose.test.yml",
  "utf8",
);

const expectations = [
  ["local compose project", localCompose, "name: estateflow-local"],
  ["test compose project", testCompose, "name: estateflow-test"],
  [
    "local loopback PostgreSQL port",
    localCompose,
    "127.0.0.1:${POSTGRES_LOCAL_PORT:-55432}:5432",
  ],
  [
    "test loopback PostgreSQL port",
    testCompose,
    "127.0.0.1:${POSTGRES_TEST_PORT:-55433}:5432",
  ],
  [
    "local loopback Redis port",
    localCompose,
    "127.0.0.1:${REDIS_LOCAL_PORT:-56379}:6379",
  ],
  [
    "test loopback Redis port",
    testCompose,
    "127.0.0.1:${REDIS_TEST_PORT:-56380}:6379",
  ],
  ["local database name", localCompose, "estateflow_local"],
  ["test database name", testCompose, "estateflow_test"],
  ["test ephemeral PostgreSQL storage", testCompose, "tmpfs:"],
  ["PostGIS init script", localCompose, "../postgres/init.sql"],
  ["PostGIS init script", testCompose, "../postgres/init.sql"],
];

const missing = expectations
  .filter(([, content, expected]) => !content.includes(expected))
  .map(([name]) => name);

if (missing.length > 0) {
  throw new Error(
    `Infrastructure contract is incomplete: ${missing.join(", ")}`,
  );
}

console.log(
  "Infrastructure contract check passed: local and test stacks are isolated.",
);
