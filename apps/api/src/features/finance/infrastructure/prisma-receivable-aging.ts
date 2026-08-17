import type { PrismaClient } from "@prisma/client";
import type { OutstandingReceivablesQuery } from "../application/receivable-repository.js";
import {
  mapReceivable,
  type ReceivableRow,
} from "./prisma-receivable-mappers.js";
import type { Receivable } from "../domain/receivable.js";

function validateAgingQuery(query: OutstandingReceivablesQuery): void {
  if (!Number.isInteger(query.limit) || query.limit < 1 || query.limit > 101)
    throw new RangeError(
      "Receivable aging limit must be an integer from 1 to 101",
    );
  if (query.after && !Number.isFinite(query.after.dueAt.getTime()))
    throw new RangeError("Receivable aging cursor date is invalid");
}

export async function listOutstandingReceivablesFromPrisma(
  prisma: PrismaClient,
  query: OutstandingReceivablesQuery,
): Promise<readonly Receivable[]> {
  validateAgingQuery(query);
  const rows = query.after
    ? await prisma.$queryRaw<ReceivableRow[]>`
          SELECT "id", "organizationId", "invoiceId", "dealId", "originalAmountMinor",
            "outstandingMinor", "currency", "status", "issuedAt", "dueAt"
          FROM "Receivable"
          WHERE "organizationId" = ${query.organizationId}::uuid
            AND "status" IN ('OPEN', 'PARTIALLY_PAID')
            AND ("dueAt" > ${query.after.dueAt} OR ("dueAt" = ${query.after.dueAt} AND "id" > ${query.after.receivableId}::uuid))
          ORDER BY "dueAt" ASC, "id" ASC
          LIMIT ${query.limit}`
    : await prisma.$queryRaw<ReceivableRow[]>`
          SELECT "id", "organizationId", "invoiceId", "dealId", "originalAmountMinor",
            "outstandingMinor", "currency", "status", "issuedAt", "dueAt"
          FROM "Receivable"
          WHERE "organizationId" = ${query.organizationId}::uuid
            AND "status" IN ('OPEN', 'PARTIALLY_PAID')
          ORDER BY "dueAt" ASC, "id" ASC
          LIMIT ${query.limit}`;
  return Object.freeze(rows.map(mapReceivable));
}
