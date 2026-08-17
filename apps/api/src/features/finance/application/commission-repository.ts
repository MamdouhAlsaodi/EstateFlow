import type {
  CommissionAccrual,
  CommissionPlanVersion,
  CommissionableValue,
  PersistedDeal,
  PersistedDealClosedWonEvent,
} from "../domain/commission.js";

export type CommissionRepositoryNotFoundResource =
  "deal" | "event" | "value" | "plan";
export type CommissionNotFound = Readonly<{
  kind: "not-found";
  resource: CommissionRepositoryNotFoundResource;
}>;
export type CommissionPersistenceConflictReason =
  | "plan-ownership-or-version-conflict"
  | "value-ownership-or-deal-conflict"
  | "accrual-ownership-or-event-conflict";
export type CommissionPersistenceConflict = Readonly<{
  kind: "conflict";
  reason: CommissionPersistenceConflictReason;
}>;
export type CommissionCaptureCommand = Readonly<{ value: CommissionableValue }>;
export type CommissionAccrualCommand = Readonly<{ accrual: CommissionAccrual }>;
export type CommissionPlanVersionCommand = Readonly<{
  plan: CommissionPlanVersion;
}>;
export type CommissionMutationResult =
  | Readonly<{ kind: "captured"; value: CommissionableValue }>
  | Readonly<{ kind: "created"; accrual: CommissionAccrual }>
  | Readonly<{ kind: "replayed"; accrual: CommissionAccrual }>
  | CommissionPersistenceConflict;
export type CommissionPlanVersionMutationResult =
  | Readonly<{ kind: "created-plan"; plan: CommissionPlanVersion }>
  | CommissionPersistenceConflict;

export interface CommissionRepository {
  findDeal(
    organizationId: string,
    dealId: string,
  ): Promise<PersistedDeal | null>;
  findDealClosedWonEvent(
    organizationId: string,
    eventId: string,
  ): Promise<PersistedDealClosedWonEvent | null>;
  findCommissionableValue(
    organizationId: string,
    valueId: string,
  ): Promise<CommissionableValue | null>;
  findPlanVersion(
    organizationId: string,
    planVersionId: string,
  ): Promise<CommissionPlanVersion | null>;
  captureCommissionableValue(
    input: CommissionCaptureCommand,
  ): Promise<CommissionMutationResult>;
  createExpectedAccrual(
    input: CommissionAccrualCommand,
  ): Promise<CommissionMutationResult>;
  createPlanVersion(
    input: CommissionPlanVersionCommand,
  ): Promise<CommissionPlanVersionMutationResult>;
}
