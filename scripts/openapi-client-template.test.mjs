import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { generateOpenApiClient } from "./openapi-client-template.mjs";

const documentPath = new globalThis.URL(
  "../packages/api-client/openapi.json",
  import.meta.url,
);

async function loadOpenApiDocument() {
  return JSON.parse(await readFile(documentPath, "utf8"));
}

test("derives health status literals, method names, and paths from OpenAPI", async () => {
  const document = await loadOpenApiDocument();
  const alteredDocument = globalThis.structuredClone(document);

  for (const path of Object.values(alteredDocument.paths)) {
    path.get.responses["200"].content[
      "application/json"
    ].schema.properties.status.enum = ["ok", "degraded"];
  }

  const generatedClient = generateOpenApiClient(alteredDocument);

  assert.match(generatedClient, /status: "ok" \| "degraded"/);
  assert.match(
    generatedClient,
    /getLiveHealth: \(\) => requestHealth\("health\/live"\)/,
  );
  assert.match(
    generatedClient,
    /getReadyHealth: \(\) => requestHealth\("health\/ready"\)/,
  );
});

test("rejects missing or unsupported health operation schemas", async () => {
  const document = await loadOpenApiDocument();
  const missingOperation = globalThis.structuredClone(document);
  delete missingOperation.paths["/health/live"].get;

  assert.throws(
    () => generateOpenApiClient(missingOperation),
    /Unsupported OpenAPI health operations/,
  );

  const missingStatusEnum = globalThis.structuredClone(document);
  delete missingStatusEnum.paths["/health/ready"].get.responses["200"].content[
    "application/json"
  ].schema.properties.status.enum;

  assert.throws(
    () => generateOpenApiClient(missingStatusEnum),
    /must define a non-empty string status enum/,
  );
});
