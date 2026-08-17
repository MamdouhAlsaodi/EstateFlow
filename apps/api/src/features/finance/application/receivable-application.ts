import { createHash } from "node:crypto";
import {
  createInvoiceDraft,
  issueInvoice,
  ReceivableValidationError,
  recordPayment,
} from "../domain/receivable.js";
import type { Invoice, Receivable } from "../domain/receivable.js";
import type {
  ReceivableDeal,
  ReceivableMutationResult,
  ReceivableNotFound,
  ReceivableRepository,
} from "./receivable-repository.js";

export type ReceivableActor = Readonly<{ verified: boolean }>;
export type ReceivableMembership = Readonly<{
  organizationId: string;
  role: "OWNER" | "MANAGER" | "BROKER" | "CLIENT";
  status: "ACTIVE" | "PENDING" | "SUSPENDED" | "REVOKED";
}>;
export interface ReceivableMembershipReader {
  findMembership(
    organizationId: string,
    userId: string,
  ): Promise<ReceivableMembership | null>;
}
type AccessDenied = Readonly<{ kind: "access-denied" }>;
type CommandBase = Readonly<{
  actor: ReceivableActor;
  userId: string;
  organizationId: string;
}>;
type DraftCommand = CommandBase &
  Readonly<{
    invoiceId: string;
    dealId: string;
    amountMinor: bigint;
    currency: string;
    createdAt: Date;
  }>;
type IssueCommand = CommandBase &
  Readonly<{
    invoiceId: string;
    receivableId: string;
    issuedAt: Date;
    dueAt: Date;
  }>;
type PaymentCommand = CommandBase &
  Readonly<{
    receivableId: string;
    paymentId: string;
    amountMinor: bigint;
    currency: string;
    recordedAt: Date;
    idempotencyKey: string;
  }>;

export class ReceivableApplication {
  constructor(
    private readonly repository: ReceivableRepository,
    private readonly membershipReader: ReceivableMembershipReader,
  ) {}

  async createInvoiceDraft(
    input: DraftCommand,
  ): Promise<ReceivableMutationResult | AccessDenied | ReceivableNotFound> {
    const access = await this.authorize(input);
    if (access.kind !== "authorized") return access.result;
    const deal = await this.repository.findDeal(
      input.organizationId,
      input.dealId,
    );
    if (!deal || !sameDeal(deal, input.organizationId, input.dealId))
      return { kind: "not-found", resource: "deal" };
    const invoice = createInvoiceDraft({
      id: input.invoiceId,
      organizationId: deal.organizationId,
      dealId: deal.id,
      amountMinor: input.amountMinor,
      currency: input.currency,
      createdBy: input.userId,
      createdAt: input.createdAt,
    });
    return this.repository.createInvoiceDraft({ invoice });
  }

  async issueInvoice(
    input: IssueCommand,
  ): Promise<ReceivableMutationResult | AccessDenied | ReceivableNotFound> {
    const access = await this.authorize(input);
    if (access.kind !== "authorized") return access.result;
    const invoice = await this.repository.findInvoice(
      input.organizationId,
      input.invoiceId,
    );
    if (
      !invoice ||
      !sameInvoice(invoice, input.organizationId, input.invoiceId)
    )
      return { kind: "not-found", resource: "invoice" };
    if (invoice.status === "ISSUED") {
      const persistedReceivable = await this.repository.findReceivableByInvoice(
        input.organizationId,
        input.invoiceId,
      );
      if (!persistedReceivable)
        return { kind: "not-found", resource: "receivable" };
      if (!sameIssuedSnapshot(invoice, persistedReceivable, input))
        return { kind: "conflict", reason: "invoice-ownership-or-id-conflict" };
      return { kind: "replayed", invoice, receivable: persistedReceivable };
    }
    const issued = issueInvoice(invoice, {
      issuedBy: input.userId,
      issuedAt: input.issuedAt,
      dueAt: input.dueAt,
      receivableId: input.receivableId,
    });
    return this.repository.issueInvoice(issued);
  }

  async recordPayment(
    input: PaymentCommand,
  ): Promise<ReceivableMutationResult | AccessDenied | ReceivableNotFound> {
    const access = await this.authorize(input);
    if (access.kind !== "authorized") return access.result;
    const idempotencyKey = normalizeIdempotencyKey(input.idempotencyKey);
    const commandPayloadHash = canonicalPaymentPayloadHash(
      input,
      idempotencyKey,
    );
    const replay = await this.repository.resolvePaymentIdempotency({
      scope: "RECEIVABLE_PAYMENT_RECORD",
      organizationId: input.organizationId,
      receivableId: input.receivableId,
      idempotencyKey,
      commandPayloadHash,
    });
    if (replay.kind !== "absent") return replay;
    const receivable = await this.repository.findReceivable(
      input.organizationId,
      input.receivableId,
    );
    if (
      !receivable ||
      !sameReceivable(receivable, input.organizationId, input.receivableId)
    )
      return { kind: "not-found", resource: "receivable" };
    const result = recordPayment(receivable, {
      id: input.paymentId,
      amountMinor: input.amountMinor,
      currency: input.currency,
      recordedAt: input.recordedAt,
      recordedBy: input.userId,
      idempotencyKey,
      commandPayloadHash,
    });
    return this.repository.recordPayment({
      scope: "RECEIVABLE_PAYMENT_RECORD",
      payment: result.payment,
      receivable: result.receivable,
      commandPayloadHash,
    });
  }

  private async authorize(
    input: CommandBase,
  ): Promise<
    { kind: "authorized" } | { kind: "denied"; result: AccessDenied }
  > {
    if (!input.actor.verified || input.userId.trim().length === 0)
      return { kind: "denied", result: { kind: "access-denied" } };
    const membership = await this.membershipReader.findMembership(
      input.organizationId,
      input.userId,
    );
    if (
      !membership ||
      membership.organizationId !== input.organizationId ||
      membership.status !== "ACTIVE" ||
      (membership.role !== "OWNER" && membership.role !== "MANAGER")
    )
      return { kind: "denied", result: { kind: "access-denied" } };
    return { kind: "authorized" };
  }
}

function sameDeal(
  deal: ReceivableDeal,
  organizationId: string,
  dealId: string,
): boolean {
  return deal.organizationId === organizationId && deal.id === dealId;
}
function sameInvoice(
  invoice: Invoice,
  organizationId: string,
  invoiceId: string,
): boolean {
  return invoice.organizationId === organizationId && invoice.id === invoiceId;
}
function sameReceivable(
  receivable: Receivable,
  organizationId: string,
  receivableId: string,
): boolean {
  return (
    receivable.organizationId === organizationId &&
    receivable.id === receivableId
  );
}
function sameIssuedSnapshot(
  invoice: Invoice,
  receivable: Receivable,
  input: IssueCommand,
): boolean {
  return (
    invoice.issuedBy === input.userId &&
    invoice.issuedAt?.getTime() === input.issuedAt.getTime() &&
    invoice.dueAt?.getTime() === input.dueAt.getTime() &&
    invoice.id === input.invoiceId &&
    invoice.organizationId === input.organizationId &&
    invoice.dealId === receivable.dealId &&
    receivable.id === input.receivableId &&
    receivable.organizationId === input.organizationId &&
    receivable.invoiceId === invoice.id &&
    receivable.originalMoney.amountMinor === invoice.money.amountMinor &&
    receivable.originalMoney.currency === invoice.money.currency &&
    receivable.issuedAt.getTime() === input.issuedAt.getTime() &&
    receivable.dueAt.getTime() === input.dueAt.getTime()
  );
}
function normalizeIdempotencyKey(value: unknown): string {
  if (typeof value !== "string")
    throw new ReceivableValidationError("Invalid idempotency key");
  const canonical = value.trim();
  if (canonical.length === 0 || value.length > 200 || canonical.length > 200)
    throw new ReceivableValidationError("Invalid idempotency key");
  return canonical;
}

function canonicalPaymentPayloadHash(
  input: PaymentCommand,
  idempotencyKey: string,
): string {
  if (typeof input.amountMinor !== "bigint")
    throw new ReceivableValidationError("Invalid payment amount");
  if (
    typeof input.currency !== "string" ||
    !/^[A-Za-z]{3}$/.test(input.currency)
  )
    throw new ReceivableValidationError("Invalid currency");
  if (
    !(input.recordedAt instanceof Date) ||
    !Number.isFinite(input.recordedAt.getTime())
  )
    throw new ReceivableValidationError("Invalid recorded time");
  const canonicalPayload = JSON.stringify({
    organizationId: input.organizationId,
    receivableId: input.receivableId,
    paymentId: input.paymentId,
    amountMinor: input.amountMinor.toString(10),
    currency: input.currency.toUpperCase(),
    recordedAt: input.recordedAt.toISOString(),
    userId: input.userId,
    idempotencyKey,
  });
  return createHash("sha256").update(canonicalPayload, "utf8").digest("hex");
}
