import type {
  Campaign,
  CampaignBudgetCorrectionRecord,
  CampaignChannel,
  CampaignPerformanceEntryRecord,
  CampaignStatus,
  CampaignTransitionRecord,
} from "../domain/campaign.js";
import type {
  EffectiveAttribution,
  LeadAttributionCorrectionRecord,
  LeadTouch,
} from "../domain/attribution.js";

export type CampaignMembership = Readonly<{
  organizationId: string;
  role: "OWNER" | "MANAGER" | "BROKER" | "CLIENT";
  status: "ACTIVE" | "PENDING" | "SUSPENDED" | "REVOKED";
}>;

export interface CampaignMembershipReader {
  findMembership(
    organizationId: string,
    userId: string,
  ): Promise<CampaignMembership | null>;
}

export type CampaignCursor = Readonly<{ at: Date; id: string }>;

export type CampaignMoneyRow = Readonly<{
  currency: string;
  count: number;
  amountMinor: bigint;
}>;

export type CampaignListItem = Readonly<{
  id: string;
  name: string;
  objective: string;
  channel: CampaignChannel;
  status: CampaignStatus;
  startsAt: Date;
  endsAt: Date;
  budgetPlannedMinor: bigint;
  currency: string;
  /** Approved expense total in the campaign's own currency; absent when none. */
  budgetActualMinor?: bigint;
  touchCount: number;
  createdAt: Date;
}>;

export type CampaignDetail = Readonly<{
  campaign: Campaign;
  actualByCurrency: readonly CampaignMoneyRow[];
  transitions: readonly CampaignTransitionRecord[];
  budgetCorrections: readonly CampaignBudgetCorrectionRecord[];
}>;

export type CampaignListQuery = Readonly<{
  organizationId: string;
  status?: CampaignStatus;
  after?: CampaignCursor;
  limit: number;
}>;

export type CampaignPage = Readonly<{
  items: readonly CampaignListItem[];
  nextCursor?: string;
}>;

export type PerformanceEntryPage = Readonly<{
  items: readonly CampaignPerformanceEntryRecord[];
  nextCursor?: string;
}>;

export type TouchPage = Readonly<{
  items: readonly LeadTouch[];
  nextCursor?: string;
}>;

export interface CampaignRepository {
  createCampaign(campaign: Campaign): Promise<void>;
  findCampaign(
    organizationId: string,
    campaignId: string,
  ): Promise<Campaign | null>;
  findCampaignRequired(
    organizationId: string,
    campaignId: string,
  ): Promise<Campaign | null>;
  listCampaigns(query: CampaignListQuery): Promise<readonly CampaignListItem[]>;
  campaignActualByCurrency(
    organizationId: string,
    campaignId: string,
  ): Promise<readonly CampaignMoneyRow[]>;
  campaignTouchCount(
    organizationId: string,
    campaignId: string,
  ): Promise<number>;
  /** Atomic guarded transition; returns null when the status moved first. */
  recordCampaignTransition(input: {
    campaign: Campaign;
    transition: CampaignTransitionRecord;
  }): Promise<CampaignTransitionRecord | null>;
  listCampaignTransitions(
    organizationId: string,
    campaignId: string,
  ): Promise<readonly CampaignTransitionRecord[]>;
  /** Append-only budget correction; returns null when the campaign moved on. */
  recordBudgetCorrection(input: {
    campaign: Campaign;
    correction: CampaignBudgetCorrectionRecord;
  }): Promise<CampaignBudgetCorrectionRecord | null>;
  listBudgetCorrections(
    organizationId: string,
    campaignId: string,
  ): Promise<readonly CampaignBudgetCorrectionRecord[]>;
  insertPerformanceEntry(entry: CampaignPerformanceEntryRecord): Promise<void>;
  listPerformanceEntries(input: {
    organizationId: string;
    campaignId: string;
    after?: CampaignCursor;
    limit: number;
  }): Promise<readonly CampaignPerformanceEntryRecord[]>;
  /** Append-only touch insert; null when the lead does not exist in the org. */
  insertLeadTouch(touch: LeadTouch): Promise<LeadTouch | null>;
  listLeadTouches(input: {
    organizationId: string;
    leadId: string;
    after?: CampaignCursor;
    limit: number;
  }): Promise<readonly LeadTouch[]>;
  leadExistsInOrganization(
    organizationId: string,
    leadId: string,
  ): Promise<boolean>;
  campaignExistsInOrganization(
    organizationId: string,
    campaignId: string,
  ): Promise<boolean>;
  listAttributionCorrections(
    organizationId: string,
    leadId: string,
  ): Promise<readonly LeadAttributionCorrectionRecord[]>;
  insertAttributionCorrection(
    correction: LeadAttributionCorrectionRecord,
  ): Promise<void>;
  getLeadAttribution(
    organizationId: string,
    leadId: string,
  ): Promise<EffectiveAttribution>;
}

export type CampaignCommandResult =
  | { kind: "created"; campaign: Campaign }
  | { kind: "updated"; campaign: Campaign }
  | { kind: "transitioned"; transition: CampaignTransitionRecord }
  | { kind: "corrected"; correction: CampaignBudgetCorrectionRecord }
  | { kind: "recorded"; entry: CampaignPerformanceEntryRecord }
  | { kind: "touched"; touch: LeadTouch }
  | {
      kind: "attribution-corrected";
      correction: LeadAttributionCorrectionRecord;
    }
  | { kind: "access-denied" }
  | { kind: "conflict"; reason: string }
  | { kind: "not-found"; resource: "campaign" | "lead" };
