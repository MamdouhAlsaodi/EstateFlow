/**
 * EF-703 — Prisma adapter for the CSV import port. All inserts happen in a
 * single transaction; duplicate addressText+title pairs within the
 * organization are skipped and counted. A failure anywhere in the batch
 * rolls back everything.
 */

import { randomUUID } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import type {
  CsvImportOutcome,
  CsvImportRepository,
} from "../application/csv-import-repository.js";
import type { CsvRowForInsert } from "../domain/csv-import.js";

export class PrismaCsvImportRepository implements CsvImportRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async importProperties(
    rows: readonly CsvRowForInsert[],
    organizationId: string,
    now: Date,
  ): Promise<CsvImportOutcome> {
    return this.prisma.$transaction(async (tx) => {
      if (rows.length === 0) return { imported: 0, skippedDuplicate: 0 };
      // Structured (addressText, title) pairs: intra-batch duplicates are
      // dropped here so only one row per pair is queried and inserted.
      // Case-sensitive, matching stored values exactly.
      const batchKeys = new Set<string>();
      const distinct: CsvRowForInsert[] = [];
      for (const row of rows) {
        const key = duplicateKey(row.addressText, row.title);
        if (batchKeys.has(key)) continue;
        batchKeys.add(key);
        distinct.push(row);
      }
      const existing = await tx.property.findMany({
        where: {
          organizationId,
          OR: distinct.map((row) => ({
            AND: [{ addressText: row.addressText }, { title: row.title }],
          })),
        },
        select: { title: true, addressText: true },
      });
      const existingKeys = new Set(
        existing.map((row) => duplicateKey(row.addressText, row.title)),
      );
      const fresh = distinct.filter(
        (row) => !existingKeys.has(duplicateKey(row.addressText, row.title)),
      );
      if (fresh.length > 0) {
        await tx.property.createMany({
          data: fresh.map((row) => ({
            id: randomUUID(),
            organizationId,
            title: row.title,
            propertyType: row.propertyType,
            addressText: row.addressText,
            ownerReference: row.ownerReference,
            latitude: row.latitude,
            longitude: row.longitude,
            status: "ACTIVE",
            version: 1,
            createdAt: now,
            updatedAt: now,
          })),
        });
      }
      return {
        imported: fresh.length,
        skippedDuplicate: rows.length - fresh.length,
      };
    });
  }
}

/** Unambiguous structured key: JSON-encodes the pair so values containing
 * `::` (or any other separator) can never mis-split. Case-sensitive. */
function duplicateKey(addressText: string, title: string): string {
  return JSON.stringify([addressText, title]);
}
