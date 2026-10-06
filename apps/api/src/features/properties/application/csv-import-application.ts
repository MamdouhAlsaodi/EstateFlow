/**
 * EF-703 — application boundary for reviewed CSV property import. Dry-run
 * parses and validates a bounded CSV without writing anything and issues an
 * HMAC dry-run token bound to the organization and the exact CSV bytes.
 * Commit verifies the token (single-use), re-validates everything
 * server-side, and inserts through the repository in one transaction.
 *
 * Role enforcement matches the property slice: only active OWNER/MANAGER
 * memberships of verified actors may import; everyone else receives the
 * standard typed access-denied error. No PII is ever logged.
 */

import {
  CSV_IMPORT_LIMITS,
  CsvDryRunTokenError,
  CsvDryRunTokenSigner,
  CsvImportValidationError,
  csvPropertyImportReport,
  csvPropertyRowsForInsert,
  csvSha256,
} from "../domain/csv-import.js";
import type { CsvImportReport } from "../domain/csv-import.js";
import type {
  CsvImportOutcome,
  CsvImportRepository,
} from "./csv-import-repository.js";
import {
  PropertyAccessDeniedError,
  type ActorContext,
  type PropertyRole,
} from "./property-application.js";

const MANAGEMENT_ROLES = new Set<PropertyRole>(["OWNER", "MANAGER"]);

export class CsvImportRejectedError extends Error {
  constructor() {
    super("CSV import rows did not validate");
    this.name = "CsvImportRejectedError";
  }
}

export type CsvImportApplicationOptions = Readonly<{
  repository: CsvImportRepository;
  signer?: CsvDryRunTokenSigner;
}>;

export class CsvImportApplication {
  /** Process-local single-use registry: token → expiry (epoch seconds). */
  private readonly consumedTokens = new Map<string, number>();

  private readonly repository: CsvImportRepository;

  private readonly signer: CsvDryRunTokenSigner;

  constructor(options: CsvImportApplicationOptions) {
    this.repository = options.repository;
    this.signer = options.signer ?? new CsvDryRunTokenSigner();
  }

  async dryRun(input: {
    actor: ActorContext;
    organizationId: string;
    csv: string;
    now?: Date;
  }): Promise<{
    report: CsvImportReport;
    dryRunToken: string;
    expiresAtEpochSeconds: number;
  }> {
    this.requireManagement(input.actor, input.organizationId);
    this.requireBoundedCsv(input.csv);
    const report = csvPropertyImportReport({
      organizationId: input.organizationId,
      csv: input.csv,
      now: input.now,
    });
    const expiresAtEpochSeconds =
      Math.floor((input.now ?? new Date()).getTime() / 1000) +
      CSV_IMPORT_LIMITS.TOKEN_TTL_SECONDS;
    const dryRunToken = this.signer.sign({
      organizationId: input.organizationId,
      csvSha256: csvSha256(input.csv),
      expiresAtEpochSeconds,
    });
    return { report, dryRunToken, expiresAtEpochSeconds };
  }

  async commit(input: {
    actor: ActorContext;
    organizationId: string;
    csv: string;
    dryRunToken: string;
    now?: Date;
  }): Promise<CsvImportOutcome & { totalRows: number }> {
    this.requireManagement(input.actor, input.organizationId);
    this.requireBoundedCsv(input.csv);
    const binding = {
      organizationId: input.organizationId,
      csvSha256: csvSha256(input.csv),
    };
    const { expiresAtEpochSeconds } = this.signer.verify(input.dryRunToken, {
      ...binding,
      // The parsed expiry is compared inside verify; -1 never matches a
      // well-formed token, so a malformed token still fails verify with a
      // typed error rather than reaching this comparison.
      expiresAtEpochSeconds: -1,
    });
    const report = csvPropertyImportReport({
      organizationId: input.organizationId,
      csv: input.csv,
      now: input.now,
    });
    if (report.totalRows === 0 || report.validRows !== report.totalRows)
      throw new CsvImportRejectedError();
    // The token is only consumed once the full validation passes, so an
    // invalid-row commit does not burn the single-use token.
    this.consumeToken(input.dryRunToken, expiresAtEpochSeconds);
    const rows = csvPropertyRowsForInsert({
      organizationId: input.organizationId,
      csv: input.csv,
      now: input.now,
    });
    const outcome = await this.repository.importProperties(
      rows,
      input.organizationId,
      input.now ?? new Date(),
    );
    return { ...outcome, totalRows: report.totalRows };
  }

  private consumeToken(token: string, expiry: number): void {
    const nowEpochSeconds = Math.floor(Date.now() / 1000);
    for (const [key, expiryAt] of this.consumedTokens)
      if (expiryAt < nowEpochSeconds) this.consumedTokens.delete(key);
    if (this.consumedTokens.has(token))
      throw new CsvDryRunTokenError("TOKEN_MISMATCH");
    if (expiry >= nowEpochSeconds) this.consumedTokens.set(token, expiry);
  }

  private requireBoundedCsv(csv: string): void {
    if (
      typeof csv !== "string" ||
      Buffer.byteLength(csv, "utf8") > CSV_IMPORT_LIMITS.MAX_TOTAL_BYTES
    )
      throw new CsvImportValidationError([{ field: "ENCODING" }]);
  }

  private requireManagement(actor: ActorContext, organizationId: string): void {
    if (!actor?.verified) throw new PropertyAccessDeniedError();
    const membership = actor.memberships.find(
      (entry) => entry.organizationId === organizationId && entry.active,
    );
    if (!membership || !MANAGEMENT_ROLES.has(membership.role))
      throw new PropertyAccessDeniedError();
  }
}
