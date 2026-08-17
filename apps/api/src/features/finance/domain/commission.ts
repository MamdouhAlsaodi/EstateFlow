import { createMoney } from "./money.js";
import type { Money } from "./money.js";
export { createMoney };
export { MoneyValidationError } from "./money.js";

export class CommissionValidationError extends Error {
  readonly code = "COMMISSION_VALIDATION_ERROR" as const;
  constructor(message: string) {
    super(message);
    this.name = "CommissionValidationError";
  }
}
export class CommissionStateError extends Error {
  readonly code = "COMMISSION_STATE_ERROR" as const;
  constructor(message: string) {
    super(message);
    this.name = "CommissionStateError";
  }
}

export type CommissionRecipientKind = "BROKER" | "OFFICE";
export type CommissionRecipient = Readonly<{
  order: number;
  kind: CommissionRecipientKind;
  splitBps: number;
}>;
export type CommissionPlanVersion = Readonly<{
  id: string;
  organizationId: string;
  version: number;
  rateBps: number;
  recipients: readonly CommissionRecipient[];
}>;
export type CommissionableValue = Readonly<{
  id: string;
  dealId: string;
  organizationId: string;
  money: Money;
  capturedBy: string;
  capturedAt: Date;
}>;
export type PersistedDeal = Readonly<{ id: string; organizationId: string }>;
export type PersistedDealClosedWonEvent = Readonly<{
  id: string;
  schemaVersion: 1;
  type: "DEAL_CLOSED_WON";
  organizationId: string;
  dealId: string;
}>;
export type CommissionSplit = Readonly<{
  order: number;
  kind: CommissionRecipientKind;
  money: Money;
}>;
export type CommissionStatus =
  "EXPECTED" | "CONFIRMED" | "DUE" | "PAID" | "CANCELLED";
export type CommissionAccrual = Readonly<{
  id: string;
  organizationId: string;
  dealId: string;
  dealClosedWonEventId: string;
  plan: CommissionPlanVersion;
  value: CommissionableValue;
  totalMoney: Money;
  splits: readonly CommissionSplit[];
  status: CommissionStatus;
  createdAt: Date;
  dueTriggerId?: string;
  confirmedBy?: string;
  paidTriggerId?: string;
  cancelledBy?: string;
}>;
export type MakerCheckerPolicy = Readonly<{ enabled: boolean }>;

function text(value: string, field: string): string {
  if (
    typeof value !== "string" ||
    value.trim().length === 0 ||
    value.length > 200
  )
    throw new CommissionValidationError(`Invalid ${field}`);
  return value.trim();
}
function positiveInteger(value: number, field: string): number {
  if (!Number.isInteger(value) || value <= 0)
    throw new CommissionValidationError(`Invalid ${field}`);
  return value;
}
function validDate(value: Date, field: string): Date {
  if (!(value instanceof Date) || !Number.isFinite(value.getTime()))
    throw new CommissionValidationError(`Invalid ${field}`);
  return new Date(value.getTime());
}
function freezeDate(value: Date): Date {
  return Object.freeze(new Date(value.getTime()));
}
function createAllocationMoney(amountMinor: bigint, currency: string): Money {
  if (
    typeof amountMinor !== "bigint" ||
    amountMinor < 0n ||
    !/^[A-Za-z]{3}$/.test(currency)
  )
    throw new CommissionValidationError("Invalid allocation money");
  return Object.freeze({ amountMinor, currency: currency.toUpperCase() });
}

export function createCommissionPlanVersion(input: {
  id: string;
  organizationId: string;
  version: number;
  rateBps: number;
  recipients: readonly CommissionRecipient[];
}): CommissionPlanVersion {
  const recipients = [...input.recipients]
    .map((recipient) => {
      if (
        !Number.isInteger(recipient.order) ||
        recipient.order <= 0 ||
        (recipient.kind !== "BROKER" && recipient.kind !== "OFFICE") ||
        !Number.isInteger(recipient.splitBps) ||
        recipient.splitBps <= 0
      )
        throw new CommissionValidationError("Invalid commission recipient");
      return Object.freeze({
        order: recipient.order,
        kind: recipient.kind,
        splitBps: recipient.splitBps,
      });
    })
    .sort((a, b) => a.order - b.order);
  if (
    recipients.length === 0 ||
    new Set(recipients.map((recipient) => recipient.order)).size !==
      recipients.length ||
    recipients.reduce((sum, recipient) => sum + recipient.splitBps, 0) !== 10000
  )
    throw new CommissionValidationError(
      "Commission recipients must total 10000 basis points with unique order",
    );
  const plan = {
    id: text(input.id, "plan id"),
    organizationId: text(input.organizationId, "organization"),
    version: positiveInteger(input.version, "plan version"),
    rateBps: positiveInteger(input.rateBps, "rate basis points"),
    recipients: Object.freeze(recipients),
  };
  if (plan.rateBps > 10000)
    throw new CommissionValidationError(
      "Rate basis points cannot exceed 10000",
    );
  return Object.freeze(plan);
}
export function createDefaultCommissionPlanVersion(input: {
  id: string;
  organizationId: string;
  version: number;
}): CommissionPlanVersion {
  return createCommissionPlanVersion({
    ...input,
    rateBps: 500,
    recipients: [
      { order: 1, kind: "BROKER", splitBps: 6000 },
      { order: 2, kind: "OFFICE", splitBps: 4000 },
    ],
  });
}

export function createCommissionableValue(input: {
  id: string;
  dealId: string;
  organizationId: string;
  amountMinor: bigint;
  currency: string;
  capturedBy: string;
  capturedAt: Date;
}): CommissionableValue {
  const capturedAt = validDate(input.capturedAt, "capture time");
  const result = {
    id: text(input.id, "value id"),
    dealId: text(input.dealId, "deal id"),
    organizationId: text(input.organizationId, "organization"),
    money: createMoney(input.amountMinor, input.currency),
    capturedBy: text(input.capturedBy, "capture actor"),
    capturedAt: freezeDate(capturedAt),
  };
  return Object.freeze(result);
}

export function createExpectedAccrual(input: {
  id: string;
  deal: PersistedDeal;
  event: PersistedDealClosedWonEvent;
  value: CommissionableValue;
  plan: CommissionPlanVersion;
  createdAt: Date;
  [ignored: string]: unknown;
}): CommissionAccrual {
  const { id, deal, event, value, plan, createdAt } = input;
  if (
    text(id, "accrual id") &&
    (deal.organizationId !== event.organizationId ||
      deal.organizationId !== value.organizationId ||
      deal.organizationId !== plan.organizationId ||
      deal.id !== event.dealId ||
      deal.id !== value.dealId ||
      event.schemaVersion !== 1 ||
      event.type !== "DEAL_CLOSED_WON")
  )
    throw new CommissionValidationError(
      "Persisted commission authority does not align",
    );
  const totalMinor = (value.money.amountMinor * BigInt(plan.rateBps)) / 10000n;
  const preliminary = plan.recipients.map((recipient) => ({
    recipient,
    amountMinor: (totalMinor * BigInt(recipient.splitBps)) / 10000n,
  }));
  const allocated = preliminary.reduce(
    (sum, item) => sum + item.amountMinor,
    0n,
  );
  const splits = preliminary.map((item, index) =>
    Object.freeze({
      order: item.recipient.order,
      kind: item.recipient.kind,
      money: createAllocationMoney(
        item.amountMinor +
          (index === preliminary.length - 1 ? totalMinor - allocated : 0n),
        value.money.currency,
      ),
    }),
  );
  return Object.freeze({
    id: text(id, "accrual id"),
    organizationId: deal.organizationId,
    dealId: deal.id,
    dealClosedWonEventId: event.id,
    plan,
    value,
    totalMoney: createAllocationMoney(totalMinor, value.money.currency),
    splits: Object.freeze(splits),
    status: "EXPECTED",
    createdAt: freezeDate(validDate(createdAt, "createdAt")),
  });
}

function actor(actorId: string): string {
  return text(actorId, "actor");
}
export function confirmCommission(
  accrual: CommissionAccrual,
  input: { actorId: string; policy: MakerCheckerPolicy },
): CommissionAccrual {
  if (accrual.status !== "EXPECTED")
    throw new CommissionStateError(
      "Only expected commissions can be confirmed",
    );
  const approver = actor(input.actorId);
  if (input.policy.enabled && approver === accrual.value.capturedBy)
    throw new CommissionStateError(
      "Maker-checker requires an independent approver",
    );
  return Object.freeze({
    ...accrual,
    status: "CONFIRMED",
    confirmedBy: approver,
  });
}
export function markCommissionDue(
  accrual: CommissionAccrual,
  input: { triggerId: string },
): CommissionAccrual {
  if (accrual.status !== "CONFIRMED")
    throw new CommissionStateError("Only confirmed commissions can become due");
  return Object.freeze({
    ...accrual,
    status: "DUE",
    dueTriggerId: actor(input.triggerId),
  });
}
export function markCommissionPaid(
  accrual: CommissionAccrual,
  input: { triggerId: string },
): CommissionAccrual {
  if (accrual.status !== "DUE")
    throw new CommissionStateError("Only due commissions can be paid");
  return Object.freeze({
    ...accrual,
    status: "PAID",
    paidTriggerId: actor(input.triggerId),
  });
}
export function cancelCommission(
  accrual: CommissionAccrual,
  input: { actorId: string } = { actorId: "system" },
): CommissionAccrual {
  if (accrual.status !== "EXPECTED" && accrual.status !== "CONFIRMED")
    throw new CommissionStateError(
      "Only expected or confirmed commissions can be cancelled",
    );
  return Object.freeze({
    ...accrual,
    status: "CANCELLED",
    cancelledBy: actor(input.actorId),
  });
}
