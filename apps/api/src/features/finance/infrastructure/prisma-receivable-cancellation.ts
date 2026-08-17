import { Prisma } from "@prisma/client";
import {
  cancelInvoice as cancelDomainInvoice,
  ReceivableStateError,
} from "../domain/receivable.js";
import type {
  InvoiceCancellationCommand,
  ReceivableMutationResult,
} from "../application/receivable-repository.js";
import {
  mapInvoice,
  mapReceivable,
  type InvoiceRow,
  type ReceivableRow,
} from "./prisma-receivable-mappers.js";

type Db = Prisma.TransactionClient;

export async function cancelReceivableInTransaction(
  tx: Db,
  input: InvoiceCancellationCommand,
): Promise<ReceivableMutationResult> {
  const invoices = await tx.$queryRaw<InvoiceRow[]>`
      SELECT "id", "organizationId", "dealId", "amountMinor", "currency", "status",
        "draftCreatedBy", "draftCreatedAt", "issuedBy", "issuedAt", "dueAt",
        "cancelledBy", "cancelledAt", "cancellationReason"
      FROM "Invoice"
      WHERE "organizationId" = ${input.invoice.organizationId}::uuid
        AND "id" = ${input.invoice.id}::uuid
      FOR UPDATE`;
  if (invoices.length !== 1)
    return { kind: "conflict", reason: "invoice-ownership-or-id-conflict" };
  const invoice = mapInvoice(invoices[0]);
  const receivables = await tx.$queryRaw<ReceivableRow[]>`
      SELECT "id", "organizationId", "invoiceId", "dealId", "originalAmountMinor",
        "outstandingMinor", "currency", "status", "issuedAt", "dueAt"
      FROM "Receivable"
      WHERE "organizationId" = ${invoice.organizationId}::uuid
        AND "invoiceId" = ${invoice.id}::uuid
      FOR UPDATE`;
  if (receivables.length !== 1)
    return {
      kind: "conflict",
      reason: "receivable-ownership-or-id-conflict",
    };
  const receivable = mapReceivable(receivables[0]);
  const payments = await tx.paymentRecord.findFirst({
    where: {
      organizationId: receivable.organizationId,
      receivableId: receivable.id,
    },
    select: { id: true },
  });
  if (invoice.status === "CANCELLED") {
    return invoice.cancelledBy === input.invoice.cancelledBy &&
      invoice.cancelledAt?.getTime() === input.invoice.cancelledAt?.getTime() &&
      invoice.cancellationReason === input.invoice.cancellationReason &&
      receivable.status === "CANCELLED"
      ? { kind: "replayed", invoice, receivable }
      : { kind: "conflict", reason: "cancellation-replay-conflict" };
  }
  if (payments || invoice.status !== "ISSUED")
    return {
      kind: "conflict",
      reason: payments ? "payments-exist" : "invoice-not-cancellable",
    };
  let result: Readonly<{
    invoice: typeof invoice;
    receivable: typeof receivable;
  }>;
  try {
    result = cancelDomainInvoice({
      invoice,
      receivable,
      cancelledBy: input.invoice.cancelledBy ?? "",
      cancelledAt: input.invoice.cancelledAt ?? new Date(0),
      reason: input.invoice.cancellationReason ?? "",
      hasPayments: false,
    });
  } catch (error) {
    if (error instanceof ReceivableStateError)
      return { kind: "conflict", reason: "invoice-not-cancellable" };
    throw error;
  }
  await tx.invoice.update({
    where: {
      organizationId_id: {
        organizationId: invoice.organizationId,
        id: invoice.id,
      },
    },
    data: {
      status: "CANCELLED",
      cancelledBy: result.invoice.cancelledBy,
      cancelledAt: result.invoice.cancelledAt,
      cancellationReason: result.invoice.cancellationReason,
    },
  });
  await tx.receivable.update({
    where: {
      organizationId_id: {
        organizationId: receivable.organizationId,
        id: receivable.id,
      },
    },
    data: { status: "CANCELLED" },
  });
  return { kind: "cancelled", ...result };
}
