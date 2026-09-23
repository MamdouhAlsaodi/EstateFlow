import { randomUUID } from "node:crypto";
import { createMoney } from "../../finance/domain/money.js";
import type { Money } from "../../finance/domain/money.js";
export { createMoney };
export { MoneyValidationError } from "../../finance/domain/money.js";

export class CampaignValidationError extends Error {
  readonly code = "CAMPAIGN_VALIDATION_ERROR" as const;
  constructor(message: string) {
    super(message);
    this.name = "CampaignValidationError";
  }
}

export class CampaignStateError extends Error {
  readonly code = "CAMPAIGN_STATE_ERROR" as const;
  constructor(message: string) {
    super(message);
    this.name = "CampaignStateError";
  }
}

export type CampaignStatus = "DRAFT" | "ACTIVE" | "COMPLETED" | "CANCELLED";
export type CampaignChannel =
  | "META"
  | "GOOGLE"
  | "SNAPCHAT"
  | "TIKTOK"
  | "X"
  | "LINKEDIN"
  | "PRINT"
  | "OUTDOOR"
  | "REFERRAL"
  | "OTHER";
export type CampaignTargetStatus = "ACTIVE" | "COMPLETED" | "CANCELLED";

export const CAMPAIGN_CHANNELS: readonly CampaignChannel[] = [
  "META",
  "GOOGLE",
  "SNAPCHAT",
  "TIKTOK",
  "X",
  "LINKEDIN",
  "PRINT",
  "OUTDOOR",
  "REFERRAL",
  "OTHER",
];
export const CAMPAIGN_TARGET_STATUSES: readonly CampaignTargetStatus[] = [
  "ACTIVE",
  "COMPLETED",
  "CANCELLED",
];

/**
 * Audited lifecycle: draft → active → completed/cancelled, plus a draft may be
 * cancelled directly. Every other transition is rejected; every accepted
 * transition produces an append-only CampaignTransition record.
 */
const ALLOWED_TRANSITIONS: Readonly<
  Record<CampaignStatus, readonly CampaignTargetStatus[]>
> = Object.freeze({
  DRAFT: ["ACTIVE", "CANCELLED"],
  ACTIVE: ["COMPLETED", "CANCELLED"],
  COMPLETED: [],
  CANCELLED: [],
});

export type CampaignUtm = Readonly<{
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  utmContent?: string;
  utmTerm?: string;
}>;

export type Campaign = Readonly<{
  id: string;
  organizationId: string;
  name: string;
  objective: string;
  channel: CampaignChannel;
  status: CampaignStatus;
  startsAt: Date;
  endsAt: Date;
  budget: Money;
  utm: CampaignUtm;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}>;

export type CampaignTransitionRecord = Readonly<{
  id: string;
  organizationId: string;
  campaignId: string;
  fromStatus: CampaignStatus;
  toStatus: CampaignStatus;
  reason?: string;
  actorId: string;
  createdAt: Date;
}>;

export type CampaignBudgetCorrectionRecord = Readonly<{
  id: string;
  organizationId: string;
  campaignId: string;
  previousMinor: bigint;
  correctedMinor: bigint;
  currency: string;
  reason: string;
  createdBy: string;
  createdAt: Date;
}>;

export type CampaignPerformanceEntryRecord = Readonly<{
  id: string;
  organizationId: string;
  campaignId: string;
  occurredAt: Date;
  impressions: number;
  clicks: number;
  leadsCount: number;
  note?: string;
  createdBy: string;
  createdAt: Date;
}>;

type CreateInput = Readonly<{
  id: string;
  organizationId: string;
  name: string;
  objective: string;
  channel: CampaignChannel;
  startsAt: Date;
  endsAt: Date;
  budgetPlannedMinor: bigint;
  currency: string;
  utm: CampaignUtm;
  createdBy: string;
  createdAt: Date;
}>;

type TransitionInput = Readonly<{
  toStatus: CampaignTargetStatus;
  reason?: string;
  actorId: string;
  at: Date;
}>;

type BudgetCorrectionInput = Readonly<{
  correctedMinor: bigint;
  reason: string;
  actorId: string;
  at: Date;
}>;

type PerformanceInput = Readonly<{
  id: string;
  organizationId: string;
  campaignId: string;
  occurredAt: Date;
  impressions: number;
  clicks: number;
  leadsCount: number;
  note?: string;
  createdBy: string;
  createdAt: Date;
}>;

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_METRIC = 1_000_000_000;

function text(value: string, field: string, limit: number): string {
  if (typeof value !== "string")
    throw new CampaignValidationError(`Invalid ${field}`);
  const canonical = value.trim();
  if (canonical.length === 0 || canonical.length > limit)
    throw new CampaignValidationError(`Invalid ${field}`);
  return canonical;
}
function optionalText(
  value: string | undefined,
  field: string,
  limit: number,
): string | undefined {
  if (value === undefined) return undefined;
  return text(value, field, limit);
}
function identifier(value: string, field: string): string {
  const canonical = text(value, field, 64);
  if (!UUID.test(canonical))
    throw new CampaignValidationError(`Invalid ${field}`);
  return canonical.toLowerCase();
}
function date(value: Date, field: string): Date {
  if (!(value instanceof Date) || !Number.isFinite(value.getTime()))
    throw new CampaignValidationError(`Invalid ${field}`);
  return Object.freeze(new Date(value.getTime()));
}
function channel(value: CampaignChannel): CampaignChannel {
  if (
    typeof value !== "string" ||
    !CAMPAIGN_CHANNELS.includes(value as CampaignChannel)
  )
    throw new CampaignValidationError("Invalid campaign channel");
  return value;
}
function utm(input: CampaignUtm): CampaignUtm {
  const result: {
    utmSource?: string;
    utmMedium?: string;
    utmCampaign?: string;
    utmContent?: string;
    utmTerm?: string;
  } = {};
  if (input.utmSource !== undefined)
    result.utmSource = text(input.utmSource, "utmSource", 100);
  if (input.utmMedium !== undefined)
    result.utmMedium = text(input.utmMedium, "utmMedium", 100);
  if (input.utmCampaign !== undefined)
    result.utmCampaign = text(input.utmCampaign, "utmCampaign", 100);
  if (input.utmContent !== undefined)
    result.utmContent = text(input.utmContent, "utmContent", 100);
  if (input.utmTerm !== undefined)
    result.utmTerm = text(input.utmTerm, "utmTerm", 100);
  return Object.freeze(result);
}
function metric(value: number, field: string): number {
  if (!Number.isInteger(value) || value < 0 || value > MAX_METRIC)
    throw new CampaignValidationError(`Invalid ${field}`);
  return value;
}

export function createCampaign(input: CreateInput): Campaign {
  const startsAt = date(input.startsAt, "campaign start");
  const endsAt = date(input.endsAt, "campaign end");
  if (endsAt.getTime() <= startsAt.getTime())
    throw new CampaignValidationError("Campaign end must be after its start");
  return Object.freeze({
    id: identifier(input.id, "campaign id"),
    organizationId: identifier(input.organizationId, "organization"),
    name: text(input.name, "campaign name", 200),
    objective: text(input.objective, "campaign objective", 500),
    channel: channel(input.channel),
    status: "DRAFT" as const,
    startsAt,
    endsAt,
    budget: createMoney(input.budgetPlannedMinor, input.currency),
    utm: utm(input.utm),
    createdBy: identifier(input.createdBy, "campaign actor"),
    createdAt: date(input.createdAt, "campaign creation time"),
    updatedAt: date(input.createdAt, "campaign creation time"),
  });
}

export function campaignTransitionIsAllowed(
  from: CampaignStatus,
  to: CampaignTargetStatus,
): boolean {
  return ALLOWED_TRANSITIONS[from].includes(to);
}

/**
 * Validates a lifecycle transition and returns the append-only audit record
 * the caller must persist together with the status change. Cancelling a
 * campaign requires an explicit reason; nothing is ever silently abandoned.
 */
export function transitionCampaign(
  campaign: Campaign,
  input: TransitionInput,
): { campaign: Campaign; transition: CampaignTransitionRecord } {
  if (typeof input.actorId !== "string" || input.actorId.trim().length === 0)
    throw new CampaignValidationError("Invalid transition actor");
  const actorId = identifier(input.actorId, "transition actor");
  const at = date(input.at, "transition time");
  if (at.getTime() < campaign.createdAt.getTime())
    throw new CampaignValidationError(
      "Transition time cannot precede campaign creation",
    );
  if (
    typeof input.toStatus !== "string" ||
    !CAMPAIGN_TARGET_STATUSES.includes(input.toStatus)
  )
    throw new CampaignValidationError("Invalid campaign target status");
  if (!campaignTransitionIsAllowed(campaign.status, input.toStatus))
    throw new CampaignStateError(
      `Campaign lifecycle forbids ${campaign.status} → ${input.toStatus}`,
    );
  const reason = optionalText(input.reason, "transition reason", 500);
  if (
    input.toStatus === "CANCELLED" &&
    (reason === undefined || reason.length === 0)
  )
    throw new CampaignValidationError(
      "Cancelling a campaign requires a reason",
    );
  const transition: CampaignTransitionRecord = Object.freeze({
    id: randomUUID(),
    organizationId: campaign.organizationId,
    campaignId: campaign.id,
    fromStatus: campaign.status,
    toStatus: input.toStatus,
    ...(reason === undefined ? {} : { reason }),
    actorId,
    createdAt: at,
  });
  return {
    campaign: Object.freeze({
      ...campaign,
      status: input.toStatus,
      updatedAt: at,
    }),
    transition,
  };
}

/**
 * Planned-budget corrections are append-only adjustments: the caller persists
 * the returned record (with its mandatory audit reason) and then reflects the
 * corrected amount on the campaign. The correction never destroys history.
 */
export function correctCampaignBudget(
  campaign: Campaign,
  input: BudgetCorrectionInput,
): {
  campaign: Campaign;
  correction: CampaignBudgetCorrectionRecord;
} {
  const actorId = identifier(input.actorId, "correction actor");
  const at = date(input.at, "correction time");
  const reason = text(input.reason, "correction reason", 500);
  if (typeof input.correctedMinor !== "bigint" || input.correctedMinor <= 0n)
    throw new CampaignValidationError(
      "Corrected budget must be a positive bigint",
    );
  if (input.correctedMinor === campaign.budget.amountMinor)
    throw new CampaignValidationError(
      "A budget correction must change the planned budget",
    );
  if (campaign.status === "CANCELLED")
    throw new CampaignStateError(
      "A cancelled campaign no longer accepts budget corrections",
    );
  const correction: CampaignBudgetCorrectionRecord = Object.freeze({
    id: randomUUID(),
    organizationId: campaign.organizationId,
    campaignId: campaign.id,
    previousMinor: campaign.budget.amountMinor,
    correctedMinor: input.correctedMinor,
    currency: campaign.budget.currency,
    reason,
    createdBy: actorId,
    createdAt: at,
  });
  return {
    campaign: Object.freeze({
      ...campaign,
      budget: Object.freeze({
        amountMinor: input.correctedMinor,
        currency: campaign.budget.currency,
      }),
      updatedAt: at,
    }),
    correction,
  };
}

/**
 * Manual channel-metric performance entry (impressions/clicks/leads). Money
 * never enters here: campaign spend truth stays in Finance Core through
 * expenses bound to the campaign, so totals always reconcile.
 */
export function createCampaignPerformanceEntry(
  input: PerformanceInput,
): CampaignPerformanceEntryRecord {
  return Object.freeze({
    id: identifier(input.id, "performance entry id"),
    organizationId: identifier(input.organizationId, "organization"),
    campaignId: identifier(input.campaignId, "campaign id"),
    occurredAt: date(input.occurredAt, "performance entry time"),
    impressions: metric(input.impressions, "impressions"),
    clicks: metric(input.clicks, "clicks"),
    leadsCount: metric(input.leadsCount, "leadsCount"),
    ...(input.note === undefined
      ? {}
      : { note: text(input.note, "performance note", 500) }),
    createdBy: identifier(input.createdBy, "performance actor"),
    createdAt: date(input.createdAt, "performance creation time"),
  });
}
