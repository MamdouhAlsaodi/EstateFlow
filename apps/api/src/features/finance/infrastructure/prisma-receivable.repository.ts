import { Prisma, type PrismaClient } from "@prisma/client";
import {
  issueInvoice as issueDomainInvoice,
  ReceivableStateError,
  ReceivableValidationError,
  recordPayment as recordDomainPayment,
} from "../domain/receivable.js";
import type { Invoice, Receivable } from "../domain/receivable.js";
import type {
  InvoiceDraftCommand,
  InvoiceIssueCommand,
  PaymentCommand,
  PaymentIdempotencyCommand,
  PaymentIdempotencyResolution,
  ReceivableDeal,
  ReceivableMutationResult,
  ReceivableRepository,
  InvoiceCancellationCommand,
  OutstandingReceivablesQuery,
} from "../application/receivable-repository.js";

import {
  mapInvoice,
  mapPayment,
  mapReceivable,
  type PaymentRow,
  type ReceivableRow,
} from "./prisma-receivable-mappers.js";
import { cancelReceivableInTransaction } from "./prisma-receivable-cancellation.js";
import { listOutstandingReceivablesFromPrisma } from "./prisma-receivable-aging.js";

type Db = Prisma.TransactionClient;
const MAX_RETRIES = 6;
function isConstraint(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    (error.code === "P2002" || error.code === "P2003")
  );
}
function isSerialization(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  const directCode = "code" in error ? error.code : undefined;
  if (directCode === "P2034" || directCode === "40001") return true;
  if (
    !("meta" in error) ||
    typeof error.meta !== "object" ||
    error.meta === null
  )
    return false;
  return "code" in error.meta && error.meta.code === "40001";
}
function isPaymentIdempotencyUniqueConstraint(error: unknown): boolean {
  if (
    !(error instanceof Prisma.PrismaClientKnownRequestError) &&
    !(
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "P2002"
    )
  )
    return false;
  const target =
    typeof error === "object" &&
    error !== null &&
    "meta" in error &&
    error.meta &&
    typeof error.meta === "object" &&
    "target" in error.meta
      ? error.meta.target
      : undefined;
  return (
    Array.isArray(target) &&
    target.length === 3 &&
    new Set(target).size === 3 &&
    ["organizationId", "commandScope", "idempotencyKey"].every((field) =>
      target.includes(field),
    )
  );
}

export class PrismaReceivableRepository implements ReceivableRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findDeal(
    organizationId: string,
    dealId: string,
  ): Promise<ReceivableDeal | null> {
    return this.prisma.deal.findUnique({
      where: { organizationId_id: { organizationId, id: dealId } },
      select: { id: true, organizationId: true },
    });
  }
  async findInvoice(
    organizationId: string,
    invoiceId: string,
  ): Promise<Invoice | null> {
    const row = await this.prisma.invoice.findUnique({
      where: { organizationId_id: { organizationId, id: invoiceId } },
    });
    return row ? mapInvoice(row) : null;
  }
  async findReceivable(
    organizationId: string,
    receivableId: string,
  ): Promise<Receivable | null> {
    const row = await this.prisma.receivable.findUnique({
      where: { organizationId_id: { organizationId, id: receivableId } },
    });
    return row ? mapReceivable(row) : null;
  }
  async findReceivableByInvoice(
    organizationId: string,
    invoiceId: string,
  ): Promise<Receivable | null> {
    const row = await this.prisma.receivable.findUnique({
      where: { organizationId_invoiceId: { organizationId, invoiceId } },
    });
    return row ? mapReceivable(row) : null;
  }

  async resolvePaymentIdempotency(
    input: PaymentIdempotencyCommand,
  ): Promise<PaymentIdempotencyResolution> {
    const row = await this.prisma.paymentRecord.findUnique({
      where: {
        organizationId_commandScope_idempotencyKey: {
          organizationId: input.organizationId,
          commandScope: input.scope,
          idempotencyKey: input.idempotencyKey,
        },
      },
    });
    if (!row) return { kind: "absent" };
    if (row.commandPayloadHash !== input.commandPayloadHash)
      return { kind: "conflict", reason: "idempotency-payload-conflict" };
    if (row.receivableId !== input.receivableId)
      return { kind: "conflict", reason: "idempotency-payload-conflict" };
    const receivable = await this.findReceivable(
      input.organizationId,
      row.receivableId,
    );
    if (!receivable) throw new Error("Persisted payment has no receivable");
    return { kind: "replayed", payment: mapPayment(row), receivable };
  }

  async createInvoiceDraft(
    input: InvoiceDraftCommand,
  ): Promise<ReceivableMutationResult> {
    try {
      const deal = await this.prisma.deal.findUnique({
        where: {
          organizationId_id: {
            organizationId: input.invoice.organizationId,
            id: input.invoice.dealId,
          },
        },
        select: { id: true },
      });
      if (!deal)
        return { kind: "conflict", reason: "invoice-ownership-or-id-conflict" };
      await this.prisma.invoice.create({
        data: {
          id: input.invoice.id,
          organizationId: input.invoice.organizationId,
          dealId: input.invoice.dealId,
          amountMinor: input.invoice.money.amountMinor,
          currency: input.invoice.money.currency,
          status: input.invoice.status,
          draftCreatedBy: input.invoice.draftCreatedBy,
          draftCreatedAt: input.invoice.draftCreatedAt,
        },
      });
      return { kind: "created", invoice: input.invoice };
    } catch (error) {
      if (isConstraint(error))
        return { kind: "conflict", reason: "invoice-ownership-or-id-conflict" };
      throw error;
    }
  }

  async issueInvoice(
    input: InvoiceIssueCommand,
  ): Promise<ReceivableMutationResult> {
    return this.withRetry(() =>
      this.prisma.$transaction((tx) => this.issueInTransaction(tx, input), {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      }),
    );
  }

  private async issueInTransaction(
    tx: Db,
    input: InvoiceIssueCommand,
  ): Promise<ReceivableMutationResult> {
    const existing = await tx.invoice.findUnique({
      where: {
        organizationId_id: {
          organizationId: input.invoice.organizationId,
          id: input.invoice.id,
        },
      },
    });
    if (!existing)
      return { kind: "conflict", reason: "invoice-ownership-or-id-conflict" };
    const current = mapInvoice(existing);
    if (current.status === "ISSUED") {
      const receivable = await tx.receivable.findUnique({
        where: {
          organizationId_invoiceId: {
            organizationId: input.invoice.organizationId,
            invoiceId: input.invoice.id,
          },
        },
      });
      if (!receivable)
        return {
          kind: "conflict",
          reason: "receivable-ownership-or-id-conflict",
        };
      const mapped = mapReceivable(receivable);
      return current.issuedBy === input.invoice.issuedBy &&
        current.issuedAt?.getTime() === input.invoice.issuedAt?.getTime() &&
        current.dueAt?.getTime() === input.invoice.dueAt?.getTime() &&
        mapped.id === input.receivable.id
        ? { kind: "replayed", invoice: current, receivable: mapped }
        : { kind: "conflict", reason: "invoice-ownership-or-id-conflict" };
    }
    if (current.status !== "DRAFT")
      return { kind: "conflict", reason: "invoice-ownership-or-id-conflict" };
    const issued = issueDomainInvoice(current, {
      issuedBy: input.invoice.issuedBy ?? "",
      issuedAt: input.invoice.issuedAt ?? new Date(0),
      dueAt: input.invoice.dueAt ?? new Date(0),
      receivableId: input.receivable.id,
    });
    await tx.invoice.update({
      where: {
        organizationId_id: {
          organizationId: issued.invoice.organizationId,
          id: issued.invoice.id,
        },
      },
      data: {
        status: "ISSUED",
        issuedBy: issued.invoice.issuedBy,
        issuedAt: issued.invoice.issuedAt,
        dueAt: issued.invoice.dueAt,
      },
    });
    await tx.receivable.create({
      data: {
        id: issued.receivable.id,
        organizationId: issued.receivable.organizationId,
        invoiceId: issued.receivable.invoiceId,
        dealId: issued.receivable.dealId,
        originalAmountMinor: issued.receivable.originalMoney.amountMinor,
        outstandingMinor: issued.receivable.outstandingMinor,
        currency: issued.receivable.originalMoney.currency,
        status: issued.receivable.status,
        issuedAt: issued.receivable.issuedAt,
        dueAt: issued.receivable.dueAt,
      },
    });
    return {
      kind: "issued",
      invoice: issued.invoice,
      receivable: issued.receivable,
    };
  }

  async recordPayment(
    input: PaymentCommand,
  ): Promise<ReceivableMutationResult> {
    try {
      return await this.withRetry(() =>
        this.prisma.$transaction((tx) => this.recordInTransaction(tx, input), {
          isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
        }),
      );
    } catch (error) {
      if (
        (error instanceof ReceivableValidationError &&
          error.message === "Payment exceeds outstanding amount") ||
        error instanceof ReceivableStateError
      )
        return {
          kind: "conflict",
          reason: "receivable-ownership-or-id-conflict",
        };
      if (isSerialization(error) || isPaymentIdempotencyUniqueConstraint(error))
        return this.resolvePaymentRace(input, error);
      throw error;
    }
  }

  private async resolvePaymentRace(
    input: PaymentCommand,
    race: unknown,
  ): Promise<ReceivableMutationResult> {
    const resolution = await this.resolvePaymentIdempotency({
      organizationId: input.payment.organizationId,
      receivableId: input.payment.receivableId,
      scope: input.scope,
      idempotencyKey: input.payment.idempotencyKey,
      commandPayloadHash: input.commandPayloadHash,
    });
    if (resolution.kind === "replayed" || resolution.kind === "conflict")
      return resolution;
    if (isSerialization(race))
      return {
        kind: "conflict",
        reason: "receivable-ownership-or-id-conflict",
      };
    throw race;
  }

  private async recordInTransaction(
    tx: Db,
    input: PaymentCommand,
  ): Promise<ReceivableMutationResult> {
    const prior = await tx.paymentRecord.findUnique({
      where: {
        organizationId_commandScope_idempotencyKey: {
          organizationId: input.payment.organizationId,
          commandScope: input.scope,
          idempotencyKey: input.payment.idempotencyKey,
        },
      },
    });
    if (prior)
      return prior.commandPayloadHash === input.commandPayloadHash &&
        prior.receivableId === input.payment.receivableId
        ? this.replayPayment(tx, prior)
        : { kind: "conflict", reason: "idempotency-payload-conflict" };
    const locked = await tx.$queryRaw<
      ReceivableRow[]
    >`SELECT "id", "organizationId", "invoiceId", "dealId", "originalAmountMinor", "outstandingMinor", "currency", "status", "issuedAt", "dueAt" FROM "Receivable" WHERE "organizationId" = ${input.payment.organizationId}::uuid AND "id" = ${input.payment.receivableId}::uuid FOR UPDATE`;
    if (locked.length !== 1)
      return {
        kind: "conflict",
        reason: "receivable-ownership-or-id-conflict",
      };
    const authoritative = mapReceivable(locked[0]);
    const lockedPrior = await tx.paymentRecord.findUnique({
      where: {
        organizationId_commandScope_idempotencyKey: {
          organizationId: input.payment.organizationId,
          commandScope: input.scope,
          idempotencyKey: input.payment.idempotencyKey,
        },
      },
    });
    if (lockedPrior)
      return lockedPrior.commandPayloadHash === input.commandPayloadHash &&
        lockedPrior.receivableId === input.payment.receivableId
        ? this.replayPayment(tx, lockedPrior)
        : { kind: "conflict", reason: "idempotency-payload-conflict" };
    const result = recordDomainPayment(authoritative, {
      id: input.payment.id,
      amountMinor: input.payment.money.amountMinor,
      currency: input.payment.money.currency,
      recordedAt: input.payment.recordedAt,
      recordedBy: input.payment.recordedBy,
      idempotencyKey: input.payment.idempotencyKey,
      commandPayloadHash: input.commandPayloadHash,
    });
    await tx.paymentRecord.create({
      data: {
        id: result.payment.id,
        organizationId: result.payment.organizationId,
        receivableId: result.payment.receivableId,
        amountMinor: result.payment.money.amountMinor,
        currency: result.payment.money.currency,
        recordedAt: result.payment.recordedAt,
        recordedBy: result.payment.recordedBy,
        commandScope: input.scope,
        idempotencyKey: result.payment.idempotencyKey,
        commandPayloadHash: result.payment.commandPayloadHash,
      },
    });
    await tx.receivable.update({
      where: {
        organizationId_id: {
          organizationId: authoritative.organizationId,
          id: authoritative.id,
        },
      },
      data: {
        outstandingMinor: result.receivable.outstandingMinor,
        status: result.receivable.status,
      },
    });
    return {
      kind: "recorded",
      payment: result.payment,
      receivable: result.receivable,
    };
  }

  private async replayPayment(
    tx: Db,
    prior: PaymentRow,
  ): Promise<ReceivableMutationResult> {
    const receivable = await tx.receivable.findUnique({
      where: {
        organizationId_id: {
          organizationId: prior.organizationId,
          id: prior.receivableId,
        },
      },
    });
    if (!receivable) throw new Error("Persisted payment has no receivable");
    return {
      kind: "replayed",
      payment: mapPayment(prior),
      receivable: mapReceivable(receivable),
    };
  }
  async hasPayments(
    organizationId: string,
    receivableId: string,
  ): Promise<boolean> {
    const payment = await this.prisma.paymentRecord.findFirst({
      where: { organizationId, receivableId },
      select: { id: true },
    });
    return payment !== null;
  }

  async cancelInvoice(
    input: InvoiceCancellationCommand,
  ): Promise<ReceivableMutationResult> {
    try {
      return await this.withRetry(() =>
        this.prisma.$transaction(
          (tx) => cancelReceivableInTransaction(tx, input),
          {
            isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
          },
        ),
      );
    } catch (error) {
      if (isSerialization(error) || error instanceof ReceivableStateError)
        return { kind: "conflict", reason: "invoice-not-cancellable" };
      throw error;
    }
  }

  async listOutstandingReceivables(
    query: OutstandingReceivablesQuery,
  ): Promise<readonly Receivable[]> {
    return listOutstandingReceivablesFromPrisma(this.prisma, query);
  }

  private async withRetry<T>(
    operation: () => Promise<T>,
    onSerializationExhausted?: () => T,
  ): Promise<T> {
    for (let attempt = 0; attempt < MAX_RETRIES; attempt += 1) {
      try {
        return await operation();
      } catch (error) {
        if (!isSerialization(error) || attempt === MAX_RETRIES - 1) {
          if (isSerialization(error) && onSerializationExhausted)
            return onSerializationExhausted();
          throw error;
        }
        await new Promise((resolve) => setTimeout(resolve, 10 * (attempt + 1)));
      }
    }
    throw new Error("Serializable transaction retries exhausted");
  }
}
