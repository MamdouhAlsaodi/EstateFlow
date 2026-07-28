import { readFileSync } from "node:fs";

const workflowPath = globalThis.process.argv[2];

if (!workflowPath) {
  throw new Error("Usage: node scripts/verify-ci-workflow.mjs <workflow-path>");
}

const workflow = readFileSync(workflowPath, "utf8");
const errors = [];

function requireContract(condition, message) {
  if (!condition) {
    errors.push(message);
  }
}

function contains(command) {
  return workflow.includes(command);
}

requireContract(
  /^on:\s*\n[\s\S]*?^\s+push:/m.test(workflow),
  "missing push trigger",
);
requireContract(
  /^on:\s*\n[\s\S]*?^\s+pull_request:/m.test(workflow),
  "missing pull_request trigger",
);
requireContract(
  /^permissions:\s*\n\s+contents:\s*read\s*$/m.test(workflow),
  "missing read-only contents permission",
);
requireContract(
  /runs-on:\s*ubuntu-latest/.test(workflow),
  "missing ubuntu-latest runner",
);

const actionReferences = [
  ...workflow.matchAll(/^\s*-\s+uses:\s*[^\s@]+@([^\s#]+)/gm),
];
requireContract(
  actionReferences.length >= 2,
  "missing required checkout and Node setup actions",
);
requireContract(
  actionReferences.every(([, reference]) => /^[a-f0-9]{40}$/.test(reference)),
  "actions must be pinned to a full commit SHA",
);

for (const command of [
  "pnpm install --frozen-lockfile",
  "pnpm lint",
  "pnpm typecheck",
  "pnpm test",
  "pnpm generate:openapi",
  "pnpm check:openapi-drift",
  "pnpm build",
  "pnpm format:check",
  "docker compose -f infra/compose/docker-compose.test.yml up -d --wait",
  "ALLOW_DESTRUCTIVE_TESTS=1 pnpm test:integration",
  "pnpm infra:test:down",
]) {
  requireContract(contains(command), `missing required command: ${command}`);
}

requireContract(/if:\s*always\(\)/.test(workflow), "missing always cleanup");
requireContract(
  !/secrets\s*\./i.test(workflow),
  "workflow must not access secrets context",
);
requireContract(
  !/postgres(?:ql)?:\/\//i.test(workflow),
  "unsafe database target literal",
);
requireContract(
  !/DATABASE_URL:\s*[^$\n]/.test(workflow),
  "unsafe database target literal",
);
requireContract(
  !/PASSWORD:\s*[^$\n]/.test(workflow),
  "workflow contains a credential literal",
);
requireContract(
  contains("new URL('postgresql:')"),
  "missing ephemeral test DATABASE_URL construction",
);
requireContract(
  contains("databaseUrl.pathname = 'estateflow_test'"),
  "integration database must target estateflow_test",
);

if (errors.length > 0) {
  globalThis.process.stderr.write(`${errors.join("\n")}\n`);
  globalThis.process.exitCode = 1;
} else {
  globalThis.process.stdout.write("CI workflow contract verified\n");
}
