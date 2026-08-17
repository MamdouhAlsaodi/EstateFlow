import {
  createCommissionPlanVersion,
  createCommissionableValue,
  createDefaultCommissionPlanVersion,
  createExpectedAccrual,
} from "../domain/commission.js";
import type {
  CommissionRecipient,
  CommissionableValue,
  PersistedDeal,
  PersistedDealClosedWonEvent,
} from "../domain/commission.js";
import type {
  CommissionMutationResult,
  CommissionNotFound,
  CommissionPlanVersionMutationResult,
  CommissionRepository,
} from "./commission-repository.js";

export type CommissionActor = Readonly<{ verified: boolean }>;
export type CommissionMembership = Readonly<{
  organizationId: string;
  role: "OWNER" | "MANAGER" | "BROKER" | "CLIENT";
  status: "ACTIVE" | "PENDING" | "SUSPENDED" | "REVOKED";
}>;
export interface CommissionMembershipReader {
  findMembership(
    organizationId: string,
    userId: string,
  ): Promise<CommissionMembership | null>;
}
type AccessDenied = Readonly<{ kind: "access-denied" }>;
type CommandBase = Readonly<{
  actor: CommissionActor;
  userId: string;
  organizationId: string;
}>;
type CaptureCommand = CommandBase &
  Readonly<{
    valueId: string;
    dealId: string;
    amountMinor: bigint;
    currency: string;
    capturedAt: Date;
  }>;
type AccrualCommand = CommandBase &
  Readonly<{
    accrualId: string;
    dealId: string;
    commissionableValueId: string;
    commissionPlanVersionId: string;
    dealClosedWonEventId: string;
    createdAt?: Date;
    [ignored: string]: unknown;
  }>;
type PlanCommand = CommandBase &
  Readonly<{ id: string; version: number }> &
  (
    | Readonly<{ rateBps?: undefined; recipients?: undefined }>
    | Readonly<{ rateBps: number; recipients: readonly CommissionRecipient[] }>
  );

export class CommissionApplication {
  constructor(
    private readonly repository: CommissionRepository,
    private readonly membershipReader: CommissionMembershipReader,
  ) {}

  async createPlanVersion(
    input: PlanCommand,
  ): Promise<CommissionPlanVersionMutationResult | AccessDenied> {
    const access = await this.authorize(input);
    if (access.kind !== "authorized") return access.result;
    const plan =
      input.rateBps === undefined && input.recipients === undefined
        ? createDefaultCommissionPlanVersion({
            id: input.id,
            organizationId: input.organizationId,
            version: input.version,
          })
        : hasExplicitPlanPolicy(input)
          ? createCommissionPlanVersion({
              id: input.id,
              organizationId: input.organizationId,
              version: input.version,
              rateBps: input.rateBps,
              recipients: input.recipients,
            })
          : throwMalformedPlanPolicy();
    return this.repository.createPlanVersion({ plan });
  }

  async captureCommissionableValue(
    input: CaptureCommand,
  ): Promise<CommissionMutationResult | AccessDenied | CommissionNotFound> {
    const access = await this.authorize(input);
    if (access.kind !== "authorized") return access.result;
    const deal = await this.repository.findDeal(
      input.organizationId,
      input.dealId,
    );
    if (
      !deal ||
      !sameDealOrganization(deal, input.organizationId, input.dealId)
    )
      return { kind: "not-found", resource: "deal" };
    const value = createCommissionableValue({
      id: input.valueId,
      dealId: deal.id,
      organizationId: deal.organizationId,
      amountMinor: input.amountMinor,
      currency: input.currency,
      capturedBy: input.userId,
      capturedAt: input.capturedAt,
    });
    return this.repository.captureCommissionableValue({ value });
  }

  async createExpectedAccrual(
    input: AccrualCommand,
  ): Promise<CommissionMutationResult | AccessDenied | CommissionNotFound> {
    const access = await this.authorize(input);
    if (access.kind !== "authorized") return access.result;
    const deal = await this.repository.findDeal(
      input.organizationId,
      input.dealId,
    );
    if (
      !deal ||
      !sameDealOrganization(deal, input.organizationId, input.dealId)
    )
      return { kind: "not-found", resource: "deal" };
    const event = await this.repository.findDealClosedWonEvent(
      input.organizationId,
      input.dealClosedWonEventId,
    );
    if (
      !event ||
      !sameEventOrganization(event, input.organizationId, input.dealId)
    )
      return { kind: "not-found", resource: "event" };
    const value = await this.repository.findCommissionableValue(
      input.organizationId,
      input.commissionableValueId,
    );
    if (
      !value ||
      !sameValueAuthority(value, input.organizationId, input.dealId)
    )
      return { kind: "not-found", resource: "value" };
    const plan = await this.repository.findPlanVersion(
      input.organizationId,
      input.commissionPlanVersionId,
    );
    if (!plan || plan.organizationId !== input.organizationId)
      return { kind: "not-found", resource: "plan" };
    const accrual = createExpectedAccrual({
      id: input.accrualId,
      deal,
      event,
      value,
      plan,
      createdAt: input.createdAt ?? new Date(),
    });
    return this.repository.createExpectedAccrual({ accrual });
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
function hasExplicitPlanPolicy(
  input: PlanCommand,
): input is PlanCommand &
  Readonly<{ rateBps: number; recipients: readonly CommissionRecipient[] }> {
  return input.rateBps !== undefined && input.recipients !== undefined;
}
function throwMalformedPlanPolicy(): never {
  throw new Error(
    "Commission plan rate and recipients must be provided together",
  );
}
function sameDealOrganization(
  deal: PersistedDeal,
  organizationId: string,
  dealId: string,
): boolean {
  return deal.organizationId === organizationId && deal.id === dealId;
}
function sameEventOrganization(
  event: PersistedDealClosedWonEvent,
  organizationId: string,
  dealId: string,
): boolean {
  return (
    event.organizationId === organizationId &&
    event.dealId === dealId &&
    event.schemaVersion === 1 &&
    event.type === "DEAL_CLOSED_WON"
  );
}
function sameValueAuthority(
  value: CommissionableValue,
  organizationId: string,
  dealId: string,
): boolean {
  return value.organizationId === organizationId && value.dealId === dealId;
}
