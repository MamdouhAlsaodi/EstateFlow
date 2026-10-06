/**
 * EF-703 — bounded CSV property-import domain: a hand-rolled, dependency-free
 * RFC-4180-style parser (bounded: 100 rows, 512 KiB, no quoted newlines), a
 * bounded report builder that reuses the `createProperty` rules without ever
 * echoing cell contents into errors, and a local HMAC dry-run token signer
 * modeled on the EF-601 media intent signer but scoped to this feature.
 *
 * The signing secret is injected (process-random by default; tests inject a
 * fixed key for determinism). No credentials or environment files are read.
 */

import {
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";
import { createProperty, PropertyValidationError } from "./property.js";

export const CSV_IMPORT_LIMITS = Object.freeze({
  MAX_ROWS: 100,
  MAX_TOTAL_BYTES: 512 * 1024,
  TOKEN_TTL_SECONDS: 600,
});

export const CSV_IMPORT_HEADER = [
  "title",
  "propertyType",
  "addressText",
  "ownerReference",
  "latitude",
  "longitude",
] as const;

export type CsvFieldCode =
  | "ENCODING"
  | "HEADER"
  | "ROW_COUNT"
  | "ROW_FORMAT"
  | "TITLE"
  | "PROPERTY_TYPE"
  | "ADDRESS_TEXT"
  | "OWNER_REFERENCE"
  | "LATITUDE"
  | "LONGITUDE";

export type CsvIssue = Readonly<{ field: CsvFieldCode; row?: number }>;

export class CsvImportValidationError extends Error {
  readonly issues: readonly CsvIssue[];
  constructor(issues: readonly CsvIssue[]) {
    super("CSV import validation failed");
    this.name = "CsvImportValidationError";
    this.issues = issues;
  }
}

export type CsvRowInput = Readonly<{
  title: string;
  propertyType: string;
  addressText: string;
  ownerReference: string | null;
  latitude: number | null;
  longitude: number | null;
}>;

export type CsvImportReport = Readonly<{
  totalRows: number;
  validRows: number;
  errors: readonly { row: number; field: CsvFieldCode }[];
  previews: readonly {
    row: number;
    title: string;
    propertyType: string;
    hasOwnerReference: boolean;
  }[];
}>;

/**
 * Hand-rolled bounded RFC-4180 parser. Splits into quoted/unquoted fields,
 * supports `""` escapes, and rejects quoted newlines explicitly as a row
 * error (multi-line cell trickery is never silently accepted).
 */
function parseCsvDocument(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  let i = 0;
  const pushField = () => {
    row.push(field);
    field = "";
  };
  const pushRow = () => {
    pushField();
    rows.push(row);
    row = [];
  };
  while (i < text.length) {
    const char = text[i];
    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i += 1;
        continue;
      }
      if (char === "\n" || char === "\r")
        throw new CsvImportValidationError([{ field: "ROW_FORMAT" }]);
      field += char;
      i += 1;
      continue;
    }
    if (char === '"') {
      if (field.length > 0)
        throw new CsvImportValidationError([{ field: "ROW_FORMAT" }]);
      inQuotes = true;
      i += 1;
      continue;
    }
    if (char === ",") {
      pushField();
      i += 1;
      continue;
    }
    if (char === "\r") {
      if (text[i + 1] === "\n") i += 1;
      pushRow();
      i += 1;
      continue;
    }
    if (char === "\n") {
      pushRow();
      i += 1;
      continue;
    }
    field += char;
    i += 1;
  }
  if (inQuotes) throw new CsvImportValidationError([{ field: "ROW_FORMAT" }]);
  if (field.length > 0 || row.length > 0) pushRow();
  return rows;
}

function coordinateOrNull(
  value: string | null,
  field: "LATITUDE" | "LONGITUDE",
  row: number,
  min: number,
  max: number,
): number | null {
  if (value === null || value.trim() === "") return null;
  const parsed = Number(value);
  if (
    value.trim() === "" ||
    !Number.isFinite(parsed) ||
    parsed < min ||
    parsed > max
  )
    throw new CsvImportValidationError([{ field, row }]);
  return parsed;
}

function requiredCell(value: string, field: CsvFieldCode, row: number): string {
  if (value.trim().length === 0 || value.length > 500)
    throw new CsvImportValidationError([{ field, row }]);
  return value;
}

function optionalCell(value: string | null, row: number): string | null {
  if (value === null || value === "") return null;
  if (value.length > 500)
    throw new CsvImportValidationError([{ field: "OWNER_REFERENCE", row }]);
  return value;
}

/**
 * Validates every row against the `createProperty` domain rules (the same
 * constructors and bounds; each row is run through `createProperty` itself so
 * the two can never drift) and returns a bounded report. Errors carry only a
 * 1-based data-row number and a field code — never cell contents, coordinate
 * values, or ownerReference values. Previews exist only for valid rows and
 * contain title + propertyType + a masked ownerReference presence flag.
 */
export function csvPropertyImportReport(input: {
  organizationId: string;
  csv: string;
  now?: Date;
}): CsvImportReport {
  const csv = input.csv;
  if (typeof csv !== "string" || csv.startsWith("\uFEFF"))
    throw new CsvImportValidationError([{ field: "ENCODING" }]);
  if (Buffer.byteLength(csv, "utf8") > CSV_IMPORT_LIMITS.MAX_TOTAL_BYTES)
    throw new CsvImportValidationError([{ field: "ENCODING" }]);
  const rows = parseCsvDocument(csv);
  const header = rows[0];
  if (
    !header ||
    header.length !== CSV_IMPORT_HEADER.length ||
    CSV_IMPORT_HEADER.some((name, index) => header[index] !== name)
  )
    throw new CsvImportValidationError([{ field: "HEADER" }]);
  const dataRows = rows.slice(1);
  if (dataRows.length > CSV_IMPORT_LIMITS.MAX_ROWS)
    throw new CsvImportValidationError([{ field: "ROW_COUNT" }]);
  const errors: { row: number; field: CsvFieldCode }[] = [];
  const previews: {
    row: number;
    title: string;
    propertyType: string;
    hasOwnerReference: boolean;
  }[] = [];
  const now = input.now ?? new Date();
  for (let index = 0; index < dataRows.length; index += 1) {
    const row = dataRows[index];
    const rowNumber = index + 1;
    if (row.length !== CSV_IMPORT_HEADER.length) {
      errors.push({ row: rowNumber, field: "ROW_FORMAT" });
      continue;
    }
    const [
      title,
      propertyType,
      addressText,
      ownerReference,
      latitude,
      longitude,
    ] = row;
    try {
      requiredCell(title, "TITLE", rowNumber);
      requiredCell(propertyType, "PROPERTY_TYPE", rowNumber);
      requiredCell(addressText, "ADDRESS_TEXT", rowNumber);
      const owner = optionalCell(ownerReference, rowNumber);
      const lat = coordinateOrNull(latitude, "LATITUDE", rowNumber, -90, 90);
      const lng = coordinateOrNull(
        longitude,
        "LONGITUDE",
        rowNumber,
        -180,
        180,
      );
      if ((lat === null) !== (lng === null))
        throw new CsvImportValidationError([
          lat === null
            ? { field: "LATITUDE", row: rowNumber }
            : { field: "LONGITUDE", row: rowNumber },
        ]);
      // Rule parity: the same domain constructor that the create route uses
      // must accept every row we are willing to import.
      createProperty({
        id: "00000000-0000-4000-8000-000000000000",
        organizationId: input.organizationId,
        title,
        propertyType,
        addressText,
        ownerReference: owner,
        latitude: lat,
        longitude: lng,
        now,
      });
      previews.push({
        row: rowNumber,
        title,
        propertyType,
        hasOwnerReference: owner !== null,
      });
    } catch (error) {
      if (error instanceof CsvImportValidationError) {
        errors.push(
          ...error.issues.flatMap((issue) =>
            issue.row === undefined
              ? []
              : [{ row: issue.row, field: issue.field }],
          ),
        );
        continue;
      }
      if (error instanceof PropertyValidationError) {
        errors.push({ row: rowNumber, field: "ROW_FORMAT" });
        continue;
      }
      throw error;
    }
  }
  return {
    totalRows: dataRows.length,
    validRows: previews.length,
    errors,
    previews,
  };
}

export type CsvRowForInsert = Readonly<{
  title: string;
  propertyType: string;
  addressText: string;
  ownerReference: string | null;
  latitude: number | null;
  longitude: number | null;
}>;

/**
 * Re-parses and returns the valid rows for insert. Only callable on input
 * that already passed `csvPropertyImportReport` with zero errors; commit
 * re-checks that invariant before calling this.
 */
export function csvPropertyRowsForInsert(
  input: Parameters<typeof csvPropertyImportReport>[0],
): CsvRowForInsert[] {
  const report = csvPropertyImportReport(input);
  if (report.totalRows === 0 || report.validRows !== report.totalRows)
    throw new CsvImportValidationError([{ field: "ROW_COUNT" }]);
  const rows = parseCsvDocument(input.csv).slice(1);
  return rows.map((row) => ({
    title: row[0],
    propertyType: row[1],
    addressText: row[2],
    ownerReference: row[3] === "" ? null : row[3],
    latitude: row[4] === "" ? null : Number(row[4]),
    longitude: row[5] === "" ? null : Number(row[5]),
  }));
}

export function csvSha256(csv: string): string {
  return createHash("sha256").update(csv, "utf8").digest("hex");
}

export type CsvDryRunBinding = Readonly<{
  organizationId: string;
  csvSha256: string;
  expiresAtEpochSeconds: number;
}>;

export type CsvDryRunTokenErrorCode =
  "TOKEN_INVALID_SIGNATURE" | "TOKEN_EXPIRED" | "TOKEN_MISMATCH";

export class CsvDryRunTokenError extends Error {
  readonly code: CsvDryRunTokenErrorCode;
  constructor(code: CsvDryRunTokenErrorCode) {
    super(code);
    this.name = "CsvDryRunTokenError";
    this.code = code;
  }
}

const TOKEN_VERSION = "EF703-CSV-DRYRUN-V1";

export class CsvDryRunTokenSigner {
  private readonly secret: Buffer;

  constructor(secret?: Buffer) {
    this.secret = secret ?? randomBytes(32);
  }

  sign(binding: CsvDryRunBinding): string {
    const payload = JSON.stringify([
      TOKEN_VERSION,
      binding.organizationId,
      binding.csvSha256,
      binding.expiresAtEpochSeconds,
    ]);
    const signature = createHmac("sha256", this.secret)
      .update(payload)
      .digest("base64url");
    return `${Buffer.from(payload, "utf8").toString("base64url")}.${signature}`;
  }

  /** Verifies signature, expiry, and organization/bytes binding fields. */
  verify(token: string, expected: CsvDryRunBinding): CsvDryRunBinding {
    const binding = this.parse(token);
    if (binding.expiresAtEpochSeconds < Math.floor(Date.now() / 1000))
      throw new CsvDryRunTokenError("TOKEN_EXPIRED");
    if (
      binding.organizationId !== expected.organizationId ||
      binding.csvSha256 !== expected.csvSha256
    )
      throw new CsvDryRunTokenError("TOKEN_MISMATCH");
    return binding;
  }

  private parse(token: string): CsvDryRunBinding {
    if (typeof token !== "string" || !token.includes("."))
      throw new CsvDryRunTokenError("TOKEN_INVALID_SIGNATURE");
    const [payloadPart, signaturePart] = token.split(".");
    let payload: string;
    try {
      payload = Buffer.from(payloadPart, "base64url").toString("utf8");
    } catch {
      throw new CsvDryRunTokenError("TOKEN_INVALID_SIGNATURE");
    }
    const expectedSignature = createHmac("sha256", this.secret)
      .update(payload)
      .digest("base64url");
    const a = Buffer.from(signaturePart);
    const b = Buffer.from(expectedSignature);
    if (a.length !== b.length || !timingSafeEqual(a, b))
      throw new CsvDryRunTokenError("TOKEN_INVALID_SIGNATURE");
    let parsed: unknown;
    try {
      parsed = JSON.parse(payload) as unknown;
    } catch {
      throw new CsvDryRunTokenError("TOKEN_INVALID_SIGNATURE");
    }
    if (!Array.isArray(parsed) || parsed.length !== 4)
      throw new CsvDryRunTokenError("TOKEN_INVALID_SIGNATURE");
    const [version, organizationId, csvSha, expiresAtEpochSeconds] =
      parsed as unknown[];
    if (
      version !== TOKEN_VERSION ||
      typeof organizationId !== "string" ||
      typeof csvSha !== "string" ||
      csvSha.length !== 64 ||
      typeof expiresAtEpochSeconds !== "number" ||
      !Number.isSafeInteger(expiresAtEpochSeconds)
    )
      throw new CsvDryRunTokenError("TOKEN_INVALID_SIGNATURE");
    return { organizationId, csvSha256: csvSha, expiresAtEpochSeconds };
  }
}
