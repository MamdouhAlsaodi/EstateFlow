import { createRequire } from "node:module";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { format } from "prettier";
import { generateOpenApiClient } from "./openapi-client-template.mjs";
import { AppModule } from "../apps/api/dist/app.module.js";
import { buildOpenApiDocument } from "../apps/api/dist/openapi.js";

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
  await writeFile(
    resolve(outputDirectory, "src/generated.ts"),
    generatedClient,
  );
} finally {
  await app.close();
}
