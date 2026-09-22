const databaseUrl = globalThis.process.env.DATABASE_URL;
const destructiveTestsAllowed =
  globalThis.process.env.ALLOW_DESTRUCTIVE_TESTS === "1";

if (!databaseUrl) {
  throw new Error(
    "DATABASE_URL is required before destructive integration tests can run.",
  );
}

if (!destructiveTestsAllowed) {
  throw new Error(
    "Set ALLOW_DESTRUCTIVE_TESTS=1 to opt in to destructive integration tests.",
  );
}

const parsed = new globalThis.URL(databaseUrl);
const acceptedProtocols = new Set(["postgres:", "postgresql:"]);
const acceptedHosts = new Set(["127.0.0.1", "localhost", "::1"]);

if (!acceptedProtocols.has(parsed.protocol)) {
  throw new Error(
    "Destructive integration tests require a PostgreSQL connection URL.",
  );
}

if (!acceptedHosts.has(parsed.hostname)) {
  throw new Error(
    "Destructive integration tests may only target a loopback database host.",
  );
}

const expectedPort = globalThis.process.env.ESTATEFLOW_TEST_DB_PORT ?? "55433";

if (parsed.port !== expectedPort) {
  throw new Error(
    `Destructive integration tests may only target port ${expectedPort}.`,
  );
}

if (parsed.username !== "estateflow_test") {
  throw new Error(
    "Destructive integration tests require the estateflow_test database user.",
  );
}

if (parsed.pathname !== "/estateflow_test") {
  throw new Error(
    "Destructive integration tests require the estateflow_test database.",
  );
}

console.log(
  `Destructive test database target accepted: estateflow_test on loopback:${expectedPort}.`,
);
