import { createRequire } from "node:module";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { format } from "prettier";
import { generateOpenApiClient } from "./openapi-client-template.mjs";

Object.assign(globalThis.process.env, {
  NODE_ENV: "test",
  ESTATEFLOW_BROWSER_ORIGIN: "https://app.estateflow.test",
  ESTATEFLOW_AUTH_HASH_KEY: "a".repeat(32),
  ESTATEFLOW_AUDIT_HASH_KEY: "b".repeat(32),
  ESTATEFLOW_AUTH_FAKE_DELIVERY: "true",
});
delete globalThis.process.env.DATABASE_URL;

const { AppModule } = await import("../apps/api/dist/app.module.js");
const { buildOpenApiDocument } = await import("../apps/api/dist/openapi.js");
const requireApi = createRequire(
  new globalThis.URL("../apps/api/package.json", import.meta.url),
);
const { NestFactory } = requireApi("@nestjs/core");
const outputDirectory = resolve(
  globalThis.process.argv[2] ?? "packages/api-client",
);

const app = await NestFactory.create(AppModule, { logger: false });

try {
  const document = buildOpenApiDocument(app);
  const generatedClient = generateOpenApiClient(document);

  await mkdir(resolve(outputDirectory, "src"), { recursive: true });
  await writeFile(
    resolve(outputDirectory, "openapi.json"),
    await format(JSON.stringify(document), { parser: "json" }),
  );
  const generatedPath = resolve(outputDirectory, "src/generated.ts");
  await writeFile(
    generatedPath,
    await format(generatedClient, { filepath: generatedPath }),
  );
} finally {
  await app.close();
}
