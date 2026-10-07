"use client";

import { useState } from "react";
import { createApiClient, type ApiError } from "../../lib/api-client/index";
import { createSessionCsrfProvider } from "../../lib/api-client/session";
import { labelFromKey, useT } from "../../i18n";
import type { MessageKey } from "../../i18n/catalog";
import { useOrganizationContext } from "../organization-context/organization-context";

/**
 * EF-703 — Arabic-first CSV property import over the already-merged dry-run /
 * commit API. The UI is bounded client-side to the same limits the API
 * enforces (512 KiB body, 100 data rows) and never echoes raw cell contents
 * outside the API-provided previews.
 */

export const MAX_CSV_BYTES = 512 * 1024;
export const MAX_CSV_ROWS = 100;

const apiClient = createApiClient();
const sessionCsrfProvider = createSessionCsrfProvider(apiClient);

type ImportReport = Readonly<{
  totalRows: number;
  validRows: number;
  errors: ReadonlyArray<{ row: number; field: string }>;
  previews: ReadonlyArray<{
    row: number;
    title: string;
    propertyType: string;
    hasOwnerReference: boolean;
  }>;
}>;

type CommitResult = Readonly<{
  imported: number;
  skippedDuplicate: number;
  totalRows: number;
}>;

/** Client-side bound guard, shared with the tests. */
export function csvInputError(csv: string): MessageKey | null {
  if (csv.trim().length === 0) return "properties.csvImport.tooFewRows";
  if (new TextEncoder().encode(csv).length > MAX_CSV_BYTES) {
    return "properties.csvImport.tooLarge";
  }
  const dataRows = csv.trimEnd().split(/\r?\n/).length - 1;
  if (dataRows < 1) return "properties.csvImport.tooFewRows";
  if (dataRows > MAX_CSV_ROWS) return "properties.csvImport.tooManyRows";
  return null;
}

/** Typed error mapping — statuses only, never the response body. */
export function describeCsvImportError(error: unknown): MessageKey {
  const status = (error as ApiError | undefined)?.status;
  if (status === 401 || status === 403) {
    return status === 403
      ? "properties.csvImport.forbidden"
      : "properties.csvImport.session";
  }
  if (status === 409) return "properties.csvImport.conflict";
  return "properties.csvImport.generic";
}

function isSessionError(error: unknown): boolean {
  const status = (error as ApiError | undefined)?.status;
  return status === 401 || status === 403;
}

async function csvImport(
  organizationId: string,
  route: "dry-run" | "commit",
  body: { csv: string; dryRunToken?: string },
): Promise<unknown> {
  const csrfToken = await sessionCsrfProvider.getToken();
  return apiClient.request(
    `/organizations/${encodeURIComponent(organizationId)}/properties/csv-import/${route}`,
    { method: "POST", csrfToken, body },
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

const fieldLabels: Readonly<Record<string, MessageKey>> = {
  title: "properties.csvImport.field.title",
  propertyType: "properties.csvImport.field.propertyType",
  ownerReference: "properties.csvImport.field.ownerReference",
};

function normalizeReport(value: unknown): ImportReport {
  if (!isRecord(value) || !isRecord(value.report)) {
    throw new TypeError("Invalid dry-run report");
  }
  const report = value.report;
  return {
    totalRows: Number(report.totalRows),
    validRows: Number(report.validRows),
    errors: Array.isArray(report.errors)
      ? report.errors.flatMap((item) =>
          isRecord(item) &&
          Number.isFinite(Number(item.row)) &&
          typeof item.field === "string"
            ? [{ row: Number(item.row), field: item.field }]
            : [],
        )
      : [],
    previews: Array.isArray(report.previews)
      ? report.previews.flatMap((item) =>
          isRecord(item) &&
          Number.isFinite(Number(item.row)) &&
          typeof item.title === "string" &&
          typeof item.propertyType === "string" &&
          typeof item.hasOwnerReference === "boolean"
            ? [
                {
                  row: Number(item.row),
                  title: item.title,
                  propertyType: item.propertyType,
                  hasOwnerReference: item.hasOwnerReference,
                },
              ]
            : [],
        )
      : [],
  };
}

export function CsvImportWorkspace() {
  const t = useT();
  const { organizationId } = useOrganizationContext();
  const [csv, setCsv] = useState("");
  const [stage, setStage] = useState<"idle" | "dryRun" | "commit">("idle");
  const [report, setReport] = useState<ImportReport | null>(null);
  const [dryRunToken, setDryRunToken] = useState<string | null>(null);
  const [result, setResult] = useState<CommitResult | null>(null);
  const [message, setMessage] = useState<Readonly<{
    kind: "success" | "error" | "validation";
    text: string;
  }> | null>(null);

  const charCount = csv.length;

  function update(next: string): void {
    setCsv(next);
    setReport(null);
    setDryRunToken(null);
    setResult(null);
    setMessage(null);
  }

  async function runDryRun(): Promise<void> {
    if (stage !== "idle") return;
    const bound = csvInputError(csv);
    if (bound) {
      setMessage({ kind: "validation", text: t(bound) });
      return;
    }
    setStage("dryRun");
    setMessage(null);
    try {
      const value = (await csvImport(organizationId, "dry-run", { csv })) as {
        dryRunToken: string;
      };
      setReport(normalizeReport(value));
      setDryRunToken(
        typeof value.dryRunToken === "string" ? value.dryRunToken : null,
      );
      if (!value.dryRunToken) {
        setMessage({ kind: "error", text: t("properties.csvImport.generic") });
      }
    } catch (error) {
      if (isSessionError(error)) sessionCsrfProvider.clear();
      setMessage({
        kind: "error",
        text: t(describeCsvImportError(error)),
      });
    } finally {
      setStage("idle");
    }
  }

  async function runCommit(): Promise<void> {
    if (stage !== "idle" || !dryRunToken) return;
    setStage("commit");
    setMessage(null);
    try {
      const value = (await csvImport(organizationId, "commit", {
        csv,
        dryRunToken,
      })) as CommitResult;
      setResult(value);
      setReport(null);
      setDryRunToken(null);
      setCsv("");
      setMessage({
        kind: "success",
        text: t("properties.csvImport.commitSuccess"),
      });
    } catch (error) {
      if (isSessionError(error)) sessionCsrfProvider.clear();
      setDryRunToken(null);
      setMessage({
        kind: "error",
        text: t(describeCsvImportError(error)),
      });
    } finally {
      setStage("idle");
    }
  }

  return (
    <section aria-labelledby="csv-import-title">
      <header>
        <p className="eyebrow">{t("properties.csvImport.eyebrow")}</p>
        <h1 id="csv-import-title">{t("properties.csvImport.title")}</h1>
        <p>{t("properties.csvImport.description")}</p>
      </header>
      <label htmlFor="csv-import-input">
        {t("properties.csvImport.inputLabel")}
      </label>
      <textarea
        id="csv-import-input"
        dir="ltr"
        rows={12}
        value={csv}
        onChange={(event) => update(event.target.value)}
        aria-describedby="csv-import-bounds"
      />
      <p id="csv-import-bounds">
        {t("properties.csvImport.boundsHint", {
          rows: String(MAX_CSV_ROWS),
        })}{" "}
        {charCount}/{MAX_CSV_BYTES}
      </p>
      <button
        className="button button-primary"
        type="button"
        disabled={stage !== "idle"}
        onClick={() => void runDryRun()}
      >
        {stage === "dryRun"
          ? t("properties.csvImport.pending")
          : t("properties.csvImport.dryRunButton")}
      </button>
      <button
        className="button button-secondary"
        type="button"
        disabled={stage !== "idle" || dryRunToken === null}
        onClick={() => void runCommit()}
      >
        {stage === "commit"
          ? t("properties.csvImport.pending")
          : t("properties.csvImport.commitButton")}
      </button>

      {report && (
        <>
          <dl aria-label={t("properties.csvImport.reportAria")}>
            <div>
              <dt>{t("properties.csvImport.report.totalRows")}</dt>
              <dd>{report.totalRows}</dd>
            </div>
            <div>
              <dt>{t("properties.csvImport.report.validRows")}</dt>
              <dd>{report.validRows}</dd>
            </div>
          </dl>
          {report.errors.length > 0 && (
            <table aria-label={t("properties.csvImport.errorRowsAria")}>
              <thead>
                <tr>
                  <th scope="col">{t("properties.csvImport.column.row")}</th>
                  <th scope="col">{t("properties.csvImport.column.field")}</th>
                </tr>
              </thead>
              <tbody>
                {report.errors.map((item) => (
                  <tr key={`${item.row}-${item.field}`}>
                    <td>{item.row}</td>
                    <td>
                      {labelFromKey(
                        fieldLabels,
                        t,
                        item.field,
                        "properties.csvImport.field.other",
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {report.previews.length > 0 && (
            <table aria-label={t("properties.csvImport.previewsAria")}>
              <thead>
                <tr>
                  <th scope="col">{t("properties.csvImport.column.row")}</th>
                  <th scope="col">{t("properties.csvImport.column.title")}</th>
                  <th scope="col">
                    {t("properties.csvImport.column.propertyType")}
                  </th>
                  <th scope="col">
                    {t("properties.csvImport.column.ownerReference")}
                  </th>
                </tr>
              </thead>
              <tbody>
                {report.previews.map((item) => (
                  <tr key={item.row}>
                    <td>{item.row}</td>
                    <td>{item.title}</td>
                    <td>{item.propertyType}</td>
                    <td>
                      {item.hasOwnerReference
                        ? t("properties.csvImport.ownerReferenceLinked")
                        : t("properties.csvImport.ownerReferenceNone")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      )}

      {result && (
        <dl aria-label={t("properties.csvImport.resultAria")}>
          <div>
            <dt>{t("properties.csvImport.result.imported")}</dt>
            <dd>{result.imported}</dd>
          </div>
          <div>
            <dt>{t("properties.csvImport.result.skippedDuplicate")}</dt>
            <dd>{result.skippedDuplicate}</dd>
          </div>
          <div>
            <dt>{t("properties.csvImport.result.totalRows")}</dt>
            <dd>{result.totalRows}</dd>
          </div>
        </dl>
      )}

      {message && (
        <div
          role={message.kind === "success" ? "status" : "alert"}
          aria-live="polite"
        >
          {message.text}
        </div>
      )}
    </section>
  );
}
