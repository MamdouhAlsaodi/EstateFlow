// EF-703 — bounded unit tests for the hand-rolled CSV property-import parser
// and the dry-run token signer. No DB, no HTTP. Synthetic data only.

import test from "node:test";
import assert from "node:assert/strict";
import {
  CSV_IMPORT_LIMITS,
  CsvDryRunTokenError,
  CsvDryRunTokenSigner,
  CsvImportValidationError,
  csvPropertyImportReport,
} from "../dist/features/properties/domain/csv-import.js";

const HEADER =
  "title,propertyType,addressText,ownerReference,latitude,longitude";
const validRow = "Synthetic Villa,VILLA,1 Test Street,OWN-1,25.2,55.3";
const csv = (rows, { header = HEADER, crlf = false } = {}) =>
  [header, ...rows].join(crlf ? "\r\n" : "\n") + (crlf ? "\r\n" : "\n");

test("parses CRLF and LF documents and produces a bounded valid report", () => {
  for (const crlf of [false, true]) {
    const report = csvPropertyImportReport({
      organizationId: "22222222-2222-4222-8222-222222222222",
      csv: csv([validRow], { crlf }),
    });
    assert.equal(report.totalRows, 1);
    assert.equal(report.validRows, 1);
    assert.deepEqual(report.errors, []);
    assert.equal(report.previews.length, 1);
    assert.equal(report.previews[0].row, 1);
    assert.equal(report.previews[0].title, "Synthetic Villa");
    assert.equal(report.previews[0].propertyType, "VILLA");
    assert.equal(report.previews[0].hasOwnerReference, true);
  }
});

test("parses quoted fields containing commas", () => {
  const report = csvPropertyImportReport({
    organizationId: "22222222-2222-4222-8222-222222222222",
    csv: csv(['"Villa, West",VILLA,"1 Test Street, Block B",,25.2,55.3']),
  });
  assert.equal(report.validRows, 1);
  assert.equal(report.previews[0].title, "Villa, West");
  assert.equal(report.previews[0].hasOwnerReference, false);
});

test("parses escaped double quotes inside quoted fields", () => {
  const report = csvPropertyImportReport({
    organizationId: "22222222-2222-4222-8222-222222222222",
    csv: csv(['"Villa ""Al Noor""",VILLA,1 Test Street,,25.2,55.3']),
  });
  assert.equal(report.validRows, 1);
  assert.equal(report.previews[0].title, 'Villa "Al Noor"');
});

test("rejects a UTF-8 BOM outright", () => {
  assert.throws(
    () =>
      csvPropertyImportReport({
        organizationId: "22222222-2222-4222-8222-222222222222",
        csv: `\uFEFF${csv([validRow])}`,
      }),
    (error) =>
      error instanceof CsvImportValidationError &&
      error.issues.length === 1 &&
      error.issues[0].field === "ENCODING",
  );
});

test("rejects a header mismatch with a bounded error and no row echo", () => {
  assert.throws(
    () =>
      csvPropertyImportReport({
        organizationId: "22222222-2222-4222-8222-222222222222",
        csv: csv([validRow], { header: "title,propertyType,addressText" }),
      }),
    (error) => {
      assert.ok(error instanceof CsvImportValidationError);
      assert.deepEqual(error.issues, [{ field: "HEADER" }]);
      assert.ok(!JSON.stringify(error.issues).includes("VILLA"));
      return true;
    },
  );
});

test("rejects documents above the 512 KiB byte budget", () => {
  const big = "x".repeat(CSV_IMPORT_LIMITS.MAX_TOTAL_BYTES + 1);
  assert.throws(
    () =>
      csvPropertyImportReport({
        organizationId: "22222222-2222-4222-8222-222222222222",
        csv: big,
      }),
    (error) =>
      error instanceof CsvImportValidationError &&
      error.issues[0].field === "ENCODING",
  );
});

test("rejects documents above the 100-row budget", () => {
  const rows = Array.from(
    { length: CSV_IMPORT_LIMITS.MAX_ROWS + 1 },
    () => validRow,
  );
  assert.throws(
    () =>
      csvPropertyImportReport({
        organizationId: "22222222-2222-4222-8222-222222222222",
        csv: csv(rows),
      }),
    (error) =>
      error instanceof CsvImportValidationError &&
      error.issues[0].field === "ROW_COUNT",
  );
});

test("quoted-newline trickery is an explicit row error, never silent multi-line data", () => {
  assert.throws(
    () =>
      csvPropertyImportReport({
        organizationId: "22222222-2222-4222-8222-222222222222",
        csv: csv(['"Villa\nWest",VILLA,1 Test Street,,25.2,55.3']),
      }),
    (error) =>
      error instanceof CsvImportValidationError &&
      error.issues.length === 1 &&
      error.issues[0].field === "ROW_FORMAT",
  );
});

test("per-row validation errors carry 1-based rows and bounded field codes only", () => {
  const report = csvPropertyImportReport({
    organizationId: "22222222-2222-4222-8222-222222222222",
    csv: csv([
      "No Coords Villa,VILLA,1 Test Street,,,55.3",
      "Bad Lat Villa,VILLA,1 Test Street,,95,55.3",
      "Bad Lng Villa,VILLA,1 Test Street,,25.2,-999",
      "Overlong " + "y".repeat(500) + ",VILLA,1 Test Street,,,",
      ",VILLA,1 Test Street,,,",
    ]),
  });
  assert.equal(report.totalRows, 5);
  assert.equal(report.validRows, 0);
  assert.deepEqual(
    report.errors.map((e) => [e.row, e.field]),
    [
      [1, "LATITUDE"],
      [2, "LATITUDE"],
      [3, "LONGITUDE"],
      [4, "TITLE"],
      [5, "TITLE"],
    ],
  );
  assert.deepEqual(report.previews, []);
});

test("coordinate pairing and empty ownerReference behave like createProperty", () => {
  const report = csvPropertyImportReport({
    organizationId: "22222222-2222-4222-8222-222222222222",
    csv: csv(["Only Lat Villa,VILLA,1 Test Street,,25.2,"]),
  });
  assert.deepEqual(report.errors, [{ row: 1, field: "LONGITUDE" }]);
});

test("the report never echoes addressText or ownerReference values", () => {
  const report = csvPropertyImportReport({
    organizationId: "22222222-2222-4222-8222-222222222222",
    csv: csv([validRow]),
  });
  const serialized = JSON.stringify(report);
  assert.ok(!serialized.includes("1 Test Street"));
  assert.ok(!serialized.includes("OWN-1"));
});

test("token signer binds organization and exact-bytes hash; tampering is rejected", () => {
  const signer = new CsvDryRunTokenSigner(Buffer.alloc(32, 7));
  const expiresAtEpochSeconds = Math.floor(Date.now() / 1000) + 600;
  const token = signer.sign({
    organizationId: "org-a",
    csvSha256: "a".repeat(64),
    expiresAtEpochSeconds,
  });
  signer.verify(token, {
    organizationId: "org-a",
    csvSha256: "a".repeat(64),
    expiresAtEpochSeconds,
  });
  assert.throws(
    () =>
      signer.verify(token, {
        organizationId: "org-b",
        csvSha256: "a".repeat(64),
        expiresAtEpochSeconds,
      }),
    (error) =>
      error instanceof CsvDryRunTokenError && error.code === "TOKEN_MISMATCH",
  );
  assert.throws(
    () =>
      signer.verify(token, {
        organizationId: "org-a",
        csvSha256: "b".repeat(64),
        expiresAtEpochSeconds,
      }),
    (error) =>
      error instanceof CsvDryRunTokenError && error.code === "TOKEN_MISMATCH",
  );
  assert.throws(
    () =>
      signer.verify(`${token}x`, {
        organizationId: "org-a",
        csvSha256: "a".repeat(64),
        expiresAtEpochSeconds,
      }),
    (error) =>
      error instanceof CsvDryRunTokenError &&
      error.code === "TOKEN_INVALID_SIGNATURE",
  );
  const expired = signer.sign({
    organizationId: "org-a",
    csvSha256: "a".repeat(64),
    expiresAtEpochSeconds: Math.floor(Date.now() / 1000) - 1,
  });
  assert.throws(
    () =>
      signer.verify(expired, {
        organizationId: "org-a",
        csvSha256: "a".repeat(64),
        expiresAtEpochSeconds: Math.floor(Date.now() / 1000) - 1,
      }),
    (error) =>
      error instanceof CsvDryRunTokenError && error.code === "TOKEN_EXPIRED",
  );
});
