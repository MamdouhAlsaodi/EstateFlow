/**
 * EF-703 — repository port for the CSV import slice. The Prisma adapter
 * implements this with a single transaction so a failure mid-batch persists
 * nothing; duplicates (addressText+title within the organization) are skipped
 * and counted, never erroring.
 */

import type { CsvRowForInsert } from "../domain/csv-import.js";

export type CsvImportOutcome = Readonly<{
  imported: number;
  skippedDuplicate: number;
}>;

export interface CsvImportRepository {
  importProperties(
    rows: readonly CsvRowForInsert[],
    organizationId: string,
    now: Date,
  ): Promise<CsvImportOutcome>;
}

export const CSV_IMPORT_REPOSITORY = Symbol("CSV_IMPORT_REPOSITORY");
