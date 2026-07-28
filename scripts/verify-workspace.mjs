import { readFile } from "node:fs/promises";

const requiredPackages = [
  "@estateflow/api",
  "@estateflow/web",
  "@estateflow/worker",
  "@estateflow/config",
];

const manifests = await Promise.all(
  [
    "apps/api/package.json",
    "apps/web/package.json",
    "apps/worker/package.json",
    "packages/config/package.json",
  ].map(async (path) => JSON.parse(await readFile(path, "utf8"))),
);

const packageNames = manifests.map(({ name }) => name).sort();
for (const packageName of requiredPackages) {
  if (!packageNames.includes(packageName)) {
    throw new Error(`Missing workspace package: ${packageName}`);
  }
}

const root = JSON.parse(await readFile("package.json", "utf8"));
if (root.packageManager !== "pnpm@10.33.2") {
  throw new Error("Root package manager must remain pinned to pnpm@10.33.2.");
}

console.log(
  `Workspace boundary check passed for ${packageNames.length} packages.`,
);
