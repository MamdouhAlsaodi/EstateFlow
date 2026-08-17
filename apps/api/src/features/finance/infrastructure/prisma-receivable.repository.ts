import { Prisma, type PrismaClient } from "@prisma/client";
import {
  issueInvoice as issueDomainInvoice,
  ReceivableValidationError,
  recordPayment as recordDomainPayment,
} from "../domain/receivable.js";
import type {
  Invoice,
  PaymentRecord,
  Receivable,
} from "../domain/receivable.js";
import type {
  InvoiceDraftCommand,
  InvoiceIssueCommand,
  PaymentCommand,
  PaymentIdempotencyCommand,
  PaymentIdempotencyResolution,
  ReceivableDeal,
  ReceivableMutationResult,
  ReceivableRepository,
} from "../application/receivable-repository.js";

type Db = Prisma.TransactionClient;
type InvoiceRow = {
  id: string;
  organizationId: string;
  dealId: string;
  amountMinor: bigint;
  currency: string;
  status: string;
  draftCreatedBy: string;
  draftCreatedAt: Date;
  issuedBy: string | null;
  issuedAt: Date | null;
  dueAt: Date | null;
};
type ReceivableRow = {
  id: string;
  organizationId: string;
  invoiceId: string;
  dealId: string;
  originalAmountMinor: bigint;
  outstandingMinor: bigint;
  currency: string;
  status: string;
  issuedAt: Date;
  dueAt: Date;
};
type PaymentRow = {
  id: string;
  organizationId: string;
  receivableId: string;
  amountMinor: bigint;
  currency: string;
  recordedAt: Date;
  recordedBy: string;
  commandScope: string;
  idempotencyKey: string;
  commandPayloadHash: string;
};
const MAX_RETRIES = 6;
const PAYMENT_SCOPE = "RECEIVABLE_PAYMENT_RECORD";

function invoiceStatus(value: string): Invoice["status"] {
  if (value === "DRAFT" || value === "ISSUED" || value === "CANCELLED")
    return value;
  throw new Error("Persisted invoice status is invalid");
}
function receivableStatus(value: string): Receivable["status"] {
  if (
    value === "OPEN" ||
    value === "PARTIALLY_PAID" ||
    value === "PAID" ||
    value === "CANCELLED"
  )
    return value;
  throw new Error("Persisted receivable status is invalid");
}
function money(
  amountMinor: bigint,
  currency: string,
): { amountMinor: bigint; currency: string } {
  if (amountMinor <= 0n || !/^[A-Za-z]{3}$/.test(currency))
    throw new Error("Persisted receivable money is invalid");
  return { amountMinor, currency: currency.toUpperCase() };
}
function mapInvoice(row: InvoiceRow): Invoice {
  const m = money(row.amountMinor, row.currency);
  if (row.status !== "DRAFT" && (!row.issuedBy || !row.issuedAt || !row.dueAt))
    throw new Error("Persisted issued invoice facts are invalid");
  return Object.freeze({
    id: row.id,
    organizationId: row.organizationId,
    dealId: row.dealId,
    money: Object.freeze(m),
    status: invoiceStatus(row.status),
    draftCreatedBy: row.draftCreatedBy,
    draftCreatedAt: new Date(row.draftCreatedAt.getTime()),
    ...(row.issuedBy ? { issuedBy: row.issuedBy } : {}),
    ...(row.issuedAt ? { issuedAt: new Date(row.issuedAt.getTime()) } : {}),
    ...(row.dueAt ? { dueAt: new Date(row.dueAt.getTime()) } : {}),
  });
}
function mapReceivable(row: ReceivableRow): Receivable {
  const original = money(row.originalAmountMinor, row.currency);
  if (
    row.outstandingMinor < 0n ||
    row.outstandingMinor > row.originalAmountMinor
  )
    throw new Error("Persisted receivable balance is invalid");
  return Object.freeze({
    id: row.id,
    organizationId: row.organizationId,
    invoiceId: row.invoiceId,
    dealId: row.dealId,
    originalMoney: Object.freeze(original),
    outstandingMinor: row.outstandingMinor,
    status: receivableStatus(row.status),
    issuedAt: new Date(row.issuedAt.getTime()),
    dueAt: new Date(row.dueAt.getTime()),
  });
}
function mapPayment(row: PaymentRow): PaymentRecord {
  const m = money(row.amountMinor, row.currency);
  if (row.commandScope !== PAYMENT_SCOPE)
    throw new Error("Persisted payment command scope is invalid");
  return Object.freeze({
    id: row.id,
    organizationId: row.organizationId,
    receivableId: row.receivableId,
    money: Object.freeze(m),
    recordedAt: new Date(row.recordedAt.getTime()),
    recordedBy: row.recordedBy,
    idempotencyKey: row.idempotencyKey,
    commandPayloadHash: row.commandPayloadHash,
  });
}
function isConstraint(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    (error.code === "P2002" || error.code === "P2003")
  );
}
function isSerialization(error: unknown): boolean {
  return (
    (error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2034") ||
    (typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "P2034")
  );
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
        error instanceof ReceivableValidationError &&
        error.message === "Payment exceeds outstanding amount"
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
