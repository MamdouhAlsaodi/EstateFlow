import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { arMessages, enMessages } from "../i18n/catalog";
import {
  MAX_CSV_BYTES,
  MAX_CSV_ROWS,
  csvInputError,
  describeCsvImportError,
} from "../features/properties/csv-import-workspace";

const root = new URL("../", import.meta.url);

async function source(path: string): Promise<string> {
  return readFile(new URL(path, root), "utf8");
}

test("import route is organization-scoped without fallback identity", async () => {
  const route = await source(
    "app/ar/organizations/[organizationId]/properties/import/page.tsx",
  );
  assert.match(route, /params/);
  assert.match(route, /organizationId/);
  assert.match(route, /CsvImportWorkspace/);
  assert.doesNotMatch(
    route,
    /fallback|demo-org|defaultOrganization|organizationId\s*\|\|/i,
  );
});

test("workspace calls only the two documented csv-import routes via the api client", async () => {
  const workspace = await source(
    "features/properties/csv-import-workspace.tsx",
  );
  assert.match(workspace, /createSessionCsrfProvider/);
  assert.match(workspace, /createApiClient/);
  assert.match(workspace, /csv-import\/\$\{route\}/);
  assert.match(workspace, /"dry-run" \| "commit"/);
  assert.match(workspace, /"dry-run"/);
  assert.match(workspace, /"commit"/);
  assert.match(workspace, /dryRunToken/);
  assert.doesNotMatch(workspace, /fetch\s*\(/);
  assert.doesNotMatch(
    workspace,
    /\bDELETE\b|deleteProperty|updateProperty|archive/i,
  );
});

test("workspace report renders totalRows, validRows, errors, and API previews verbatim", async () => {
  const workspace = await source(
    "features/properties/csv-import-workspace.tsx",
  );
  assert.match(workspace, /totalRows/);
  assert.match(workspace, /validRows/);
  assert.match(workspace, /errors/);
  assert.match(workspace, /previews/);
  assert.match(workspace, /hasOwnerReference/);
  assert.match(workspace, /properties\.csvImport\.report\.totalRows/);
  assert.match(workspace, /properties\.csvImport\.report\.validRows/);
  assert.match(workspace, /properties\.csvImport\.errorRowsAria/);
  assert.match(workspace, /properties\.csvImport\.previewsAria/);
  // Error rows show only the row number and a localized field label — never
  // raw cell content.
  assert.match(workspace, /properties\.csvImport\.field\./);
  assert.doesNotMatch(workspace, /error\.message|String\(error\)/);
});

test("arabic catalog keys for the csv import flow are complete in ar and en", () => {
  const keys = Object.keys(arMessages).filter((key) =>
    key.startsWith("properties.csvImport."),
  );
  assert.ok(
    keys.length >= 10,
    `expected a real catalog set, got ${keys.length}`,
  );
  for (const key of keys) {
    assert.ok(key in enMessages, `missing en catalog key for ${key}`);
    assert.ok(arMessages[key] && arMessages[key].length > 0);
    assert.ok(enMessages[key] && enMessages[key].length > 0);
  }
  assert.equal(
    arMessages["properties.csvImport.forbidden"],
    "لا تملك صلاحية استيراد العقارات لهذه المؤسسة.",
  );
  assert.match(String(arMessages["properties.csvImport.conflict"]), /رمز/);
  // Denial copy never leaks cell contents.
  assert.doesNotMatch(
    Object.values(arMessages)
      .filter((value) => typeof value === "string")
      .join(" "),
    /ownerReference|propertyType/,
  );
});

test("client-side bounds reject oversized or too-long csv input before any request", () => {
  assert.equal(MAX_CSV_BYTES, 512 * 1024);
  assert.equal(MAX_CSV_ROWS, 100);
  assert.equal(csvInputError(""), "properties.csvImport.tooFewRows");
  const oversized = "a".repeat(MAX_CSV_BYTES + 1);
  assert.equal(csvInputError(oversized), "properties.csvImport.tooLarge");
  const tooManyRows = Array.from(
    { length: MAX_CSV_ROWS + 2 },
    (_, index) => `row-${index},x`,
  ).join("\n");
  assert.equal(csvInputError(tooManyRows), "properties.csvImport.tooManyRows");
  const header = "title,propertyType\n";
  assert.equal(csvInputError(header + "villa,RESIDENTIAL"), null);
});

test("error mapping surfaces typed arabic messages for 403 and 409 without echoing cells", () => {
  const forbidden = describeCsvImportError({ status: 403 } as unknown as Error);
  const conflict = describeCsvImportError({ status: 409 } as unknown as Error);
  const generic = describeCsvImportError(new Error("boom"));
  const session = describeCsvImportError({ status: 401 } as unknown as Error);
  assert.equal(forbidden, "properties.csvImport.forbidden");
  assert.equal(conflict, "properties.csvImport.conflict");
  assert.equal(session, "properties.csvImport.session");
  assert.equal(generic, "properties.csvImport.generic");
  for (const key of [forbidden, conflict, session, generic]) {
    assert.match(arMessages[key], /[\u0600-\u06FF]/);
  }
});

test("workspace styles stay global-class based without new css files", async () => {
  const workspace = await source(
    "features/properties/csv-import-workspace.tsx",
  );
  assert.match(workspace, /button button-primary/);
  assert.doesNotMatch(workspace, /\.module\.css/);
});
