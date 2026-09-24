import { randomUUID } from "node:crypto";
import {
  correctCampaignBudget,
  createCampaign,
  createCampaignPerformanceEntry,
  transitionCampaign,
  CampaignStateError,
  CampaignValidationError,
} from "../domain/campaign.js";
import type {
  Campaign,
  CampaignChannel,
  CampaignTargetStatus,
  CampaignUtm,
} from "../domain/campaign.js";
import {
  applyAttributionOverride,
  createAttributionCorrection,
  createLeadTouch,
  deriveTouchAttribution,
} from "../domain/attribution.js";
import type {
  EffectiveAttribution,
  LeadTouch,
  TouchChannel,
  TouchUtm,
} from "../domain/attribution.js";
import {
  analyticsMetricRows,
  type CampaignAnalyticsRollup,
  type OrganizationAnalyticsRollup,
} from "./campaign-analytics.js";
import type {
  CampaignCommandResult,
  CampaignCursor,
  CampaignDetail,
  CampaignListQuery,
  CampaignMembershipReader,
  CampaignPage,
  CampaignRepository,
  PerformanceEntryPage,
  TouchPage,
} from "./campaign-repository.js";

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CURSOR_DATE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const MAX_PAGE_LIMIT = 100;
const DEFAULT_PAGE_LIMIT = 50;
const DETAIL_HISTORY_LIMIT = 50;

export type CampaignActor = Readonly<{ verified: boolean }>;

type CommandBase = Readonly<{
  actor: CampaignActor;
  userId: string;
  organizationId: string;
}>;

export type CreateCampaignCommand = CommandBase &
  Readonly<{
    campaignId: string;
    name: string;
    objective: string;
    channel: CampaignChannel;
    startsAt: Date;
    endsAt: Date;
    budgetPlannedMinor: bigint;
    currency: string;
    utm: CampaignUtm;
    createdAt: Date;
  }>;

export type TransitionCampaignCommand = CommandBase &
  Readonly<{
    campaignId: string;
    toStatus: CampaignTargetStatus;
    reason?: string;
    at: Date;
  }>;

export type CorrectBudgetCommand = CommandBase &
  Readonly<{
    campaignId: string;
    correctedMinor: bigint;
    reason: string;
    at: Date;
  }>;

export type RecordPerformanceCommand = CommandBase &
  Readonly<{
    campaignId: string;
    entryId: string;
    occurredAt: Date;
    impressions: number;
    clicks: number;
    leadsCount: number;
    note?: string;
    createdAt: Date;
  }>;

export type RecordTouchCommand = CommandBase &
  Readonly<{
    leadId: string;
    touchId: string;
    channel: TouchChannel;
    source?: string;
    campaignId?: string;
    utm: TouchUtm;
    occurredAt: Date;
    createdAt: Date;
  }>;

export type CorrectAttributionCommand = CommandBase &
  Readonly<{
    leadId: string;
    correctedCampaignId?: string;
    reason: string;
    createdAt: Date;
  }>;

export type ListCampaignsCommand = CommandBase &
  Readonly<{ status?: Campaign["status"]; cursor?: string; limit?: number }>;

export type ListEntriesCommand = CommandBase &
  Readonly<{ campaignId: string; cursor?: string; limit?: number }>;

export type ListTouchesCommand = CommandBase &
  Readonly<{ leadId: string; cursor?: string; limit?: number }>;

export type CampaignAnalyticsResult = Readonly<{
  asOf: Date;
  analytics: CampaignAnalyticsRollup;
  metrics: ReturnType<typeof analyticsMetricRows>;
}>;

export type OrganizationAnalyticsResult = Readonly<{
  asOf: Date;
  analytics: OrganizationAnalyticsRollup;
  metrics: ReturnType<typeof analyticsMetricRows>;
}>;

export class CampaignApplication {
  constructor(
    private readonly repository: CampaignRepository,
    private readonly membershipReader: CampaignMembershipReader,
  ) {}

  async createCampaign(
    input: CreateCampaignCommand,
  ): Promise<CampaignCommandResult> {
    const access = await this.authorize(input);
    if (access.kind !== "authorized") return access.result;
    const campaign = createCampaign({
      id: input.campaignId,
      organizationId: input.organizationId,
      name: input.name,
      objective: input.objective,
      channel: input.channel,
      startsAt: input.startsAt,
      endsAt: input.endsAt,
      budgetPlannedMinor: input.budgetPlannedMinor,
      currency: input.currency,
      utm: input.utm,
      createdBy: input.userId,
      createdAt: input.createdAt,
    });
    await this.repository.createCampaign(campaign);
    return { kind: "created", campaign };
  }

  async getCampaign(
    input: CommandBase & Readonly<{ campaignId: string }>,
  ): Promise<
    | CampaignDetail
    | { kind: "access-denied" }
    | { kind: "not-found"; resource: "campaign" }
  > {
    const access = await this.authorize(input);
    if (access.kind !== "authorized") return access.result;
    const campaign = await this.repository.findCampaign(
      input.organizationId,
      input.campaignId,
    );
    if (!campaign) return { kind: "not-found", resource: "campaign" };
    const [actualByCurrency, transitions, budgetCorrections] =
      await Promise.all([
        this.repository.campaignActualByCurrency(
          input.organizationId,
          input.campaignId,
        ),
        this.repository.listCampaignTransitions(
          input.organizationId,
          input.campaignId,
        ),
        this.repository.listBudgetCorrections(
          input.organizationId,
          input.campaignId,
        ),
      ]);
    return {
      campaign,
      actualByCurrency,
      transitions: transitions.slice(0, DETAIL_HISTORY_LIMIT),
      budgetCorrections: budgetCorrections.slice(0, DETAIL_HISTORY_LIMIT),
    };
  }

  async getCampaignAnalytics(
    input: CommandBase & Readonly<{ campaignId: string }>,
  ): Promise<
    | CampaignAnalyticsResult
    | { kind: "access-denied" }
    | { kind: "not-found"; resource: "campaign" }
  > {
    const access = await this.authorize(input);
    if (access.kind !== "authorized") return access.result;
    const campaign = await this.requireCampaign(
      input.organizationId,
      input.campaignId,
    );
    if (!campaign) return { kind: "not-found", resource: "campaign" };
    const asOf = new Date();
    const analytics = await this.repository.getCampaignAnalytics(
      input.organizationId,
      input.campaignId,
    );
    return Object.freeze({
      asOf,
      analytics,
      metrics: analyticsMetricRows(
        analytics.approvedSpend,
        analytics.attribution,
      ),
    });
  }

  async getOrganizationAnalytics(
    input: CommandBase,
  ): Promise<OrganizationAnalyticsResult | { kind: "access-denied" }> {
    const access = await this.authorize(input);
    if (access.kind !== "authorized") return access.result;
    const asOf = new Date();
    const analytics = await this.repository.getOrganizationAnalytics(
      input.organizationId,
    );
    return Object.freeze({
      asOf,
      analytics,
      metrics: analyticsMetricRows(
        analytics.approvedSpend,
        analytics.attribution,
      ),
    });
  }

  async listCampaigns(
    input: ListCampaignsCommand,
  ): Promise<CampaignPage | { kind: "access-denied" }> {
    const access = await this.authorize(input);
    if (access.kind !== "authorized") return access.result;
    const page = preparePage(input);
    const items = await this.repository.listCampaigns({
      organizationId: input.organizationId,
      ...(input.status === undefined ? {} : { status: input.status }),
      ...(page.after ? { after: page.after } : {}),
      limit: page.limit,
    } satisfies CampaignListQuery);
    const returned = items.slice(0, page.limit - 1);
    const hasMore = items.length >= page.limit;
    return {
      items: returned,
      ...(hasMore && returned.length > 0
        ? { nextCursor: encodeCursor(lastCursorOf(returned)) }
        : {}),
    };
  }

  async transitionCampaign(
    input: TransitionCampaignCommand,
  ): Promise<CampaignCommandResult> {
    const access = await this.authorize(input);
    if (access.kind !== "authorized") return access.result;
    const campaign = await this.requireCampaign(
      input.organizationId,
      input.campaignId,
    );
    if (!campaign) return { kind: "not-found", resource: "campaign" };
    let transitioned;
    try {
      transitioned = transitionCampaign(campaign, {
        toStatus: input.toStatus,
        ...(input.reason === undefined ? {} : { reason: input.reason }),
        actorId: input.userId,
        at: input.at,
      });
    } catch (error) {
      if (error instanceof CampaignStateError)
        return { kind: "conflict", reason: "campaign-state-conflict" };
      throw error;
    }
    const recorded = await this.repository.recordCampaignTransition({
      campaign: transitioned.campaign,
      transition: transitioned.transition,
    });
    if (!recorded)
      return { kind: "conflict", reason: "campaign-state-conflict" };
    return { kind: "transitioned", transition: recorded };
  }

  async correctCampaignBudget(
    input: CorrectBudgetCommand,
  ): Promise<CampaignCommandResult> {
    const access = await this.authorize(input);
    if (access.kind !== "authorized") return access.result;
    const campaign = await this.requireCampaign(
      input.organizationId,
      input.campaignId,
    );
    if (!campaign) return { kind: "not-found", resource: "campaign" };
    let corrected;
    try {
      corrected = correctCampaignBudget(campaign, {
        correctedMinor: input.correctedMinor,
        reason: input.reason,
        actorId: input.userId,
        at: input.at,
      });
    } catch (error) {
      if (error instanceof CampaignStateError)
        return { kind: "conflict", reason: "campaign-state-conflict" };
      throw error;
    }
    const recorded = await this.repository.recordBudgetCorrection({
      campaign: corrected.campaign,
      correction: corrected.correction,
    });
    if (!recorded)
      return { kind: "conflict", reason: "campaign-state-conflict" };
    return { kind: "corrected", correction: recorded };
  }

  async recordPerformanceEntry(
    input: RecordPerformanceCommand,
  ): Promise<CampaignCommandResult> {
    const access = await this.authorize(input);
    if (access.kind !== "authorized") return access.result;
    const campaign = await this.requireCampaign(
      input.organizationId,
      input.campaignId,
    );
    if (!campaign) return { kind: "not-found", resource: "campaign" };
    if (campaign.status === "CANCELLED")
      return { kind: "conflict", reason: "campaign-state-conflict" };
    const entry = createCampaignPerformanceEntry({
      id: input.entryId,
      organizationId: input.organizationId,
      campaignId: input.campaignId,
      occurredAt: input.occurredAt,
      impressions: input.impressions,
      clicks: input.clicks,
      leadsCount: input.leadsCount,
      ...(input.note === undefined ? {} : { note: input.note }),
      createdBy: input.userId,
      createdAt: input.createdAt,
    });
    await this.repository.insertPerformanceEntry(entry);
    return { kind: "recorded", entry };
  }

  async listPerformanceEntries(
    input: ListEntriesCommand,
  ): Promise<
    | PerformanceEntryPage
    | { kind: "access-denied" }
    | { kind: "not-found"; resource: "campaign" }
  > {
    const access = await this.authorize(input);
    if (access.kind !== "authorized") return access.result;
    const campaign = await this.requireCampaign(
      input.organizationId,
      input.campaignId,
    );
    if (!campaign) return { kind: "not-found", resource: "campaign" };
    const page = preparePage(input);
    const items = await this.repository.listPerformanceEntries({
      organizationId: input.organizationId,
      campaignId: input.campaignId,
      ...(page.after ? { after: page.after } : {}),
      limit: page.limit,
    });
    const returned = items.slice(0, page.limit - 1);
    const hasMore = items.length >= page.limit;
    return {
      items: returned,
      ...(hasMore && returned.length > 0
        ? {
            nextCursor: encodeCursor({
              at: returned[returned.length - 1].createdAt,
              id: returned[returned.length - 1].id,
            }),
          }
        : {}),
    };
  }

  async recordLeadTouch(
    input: RecordTouchCommand,
  ): Promise<CampaignCommandResult> {
    const access = await this.authorize(input);
    if (access.kind !== "authorized") return access.result;
    if (
      !(await this.repository.leadExistsInOrganization(
        input.organizationId,
        input.leadId,
      ))
    )
      return { kind: "not-found", resource: "lead" };
    if (
      input.campaignId !== undefined &&
      !(await this.repository.campaignExistsInOrganization(
        input.organizationId,
        input.campaignId,
      ))
    )
      return { kind: "not-found", resource: "campaign" };
    const touch = createLeadTouch({
      id: input.touchId,
      organizationId: input.organizationId,
      leadId: input.leadId,
      ...(input.campaignId === undefined
        ? {}
        : { campaignId: input.campaignId }),
      channel: input.channel,
      ...(input.source === undefined ? {} : { source: input.source }),
      utm: input.utm,
      occurredAt: input.occurredAt,
      createdBy: input.userId,
      createdAt: input.createdAt,
    });
    const inserted = await this.repository.insertLeadTouch(touch);
    if (!inserted) return { kind: "not-found", resource: "lead" };
    return { kind: "touched", touch: inserted };
  }

  async listLeadTouches(
    input: ListTouchesCommand,
  ): Promise<
    | TouchPage
    | { kind: "access-denied" }
    | { kind: "not-found"; resource: "lead" }
  > {
    const access = await this.authorize(input);
    if (access.kind !== "authorized") return access.result;
    if (
      !(await this.repository.leadExistsInOrganization(
        input.organizationId,
        input.leadId,
      ))
    )
      return { kind: "not-found", resource: "lead" };
    const page = preparePage(input);
    const items = await this.repository.listLeadTouches({
      organizationId: input.organizationId,
      leadId: input.leadId,
      ...(page.after ? { after: page.after } : {}),
      limit: page.limit,
    });
    const returned = items.slice(0, page.limit - 1);
    const hasMore = items.length >= page.limit;
    return {
      items: returned,
      ...(hasMore && returned.length > 0
        ? {
            nextCursor: encodeCursor({
              at: returned[returned.length - 1].occurredAt,
              id: returned[returned.length - 1].id,
            }),
          }
        : {}),
    };
  }

  async getLeadAttribution(
    input: CommandBase & Readonly<{ leadId: string }>,
  ): Promise<
    | { kind: "attribution"; attribution: EffectiveAttribution }
    | { kind: "access-denied" }
    | { kind: "not-found"; resource: "lead" }
  > {
    const access = await this.authorize(input);
    if (access.kind !== "authorized") return access.result;
    if (
      !(await this.repository.leadExistsInOrganization(
        input.organizationId,
        input.leadId,
      ))
    )
      return { kind: "not-found", resource: "lead" };
    const attribution = await this.repository.getLeadAttribution(
      input.organizationId,
      input.leadId,
    );
    return { kind: "attribution", attribution };
  }

  async correctLeadAttribution(
    input: CorrectAttributionCommand,
  ): Promise<CampaignCommandResult> {
    const access = await this.authorize(input);
    if (access.kind !== "authorized") return access.result;
    if (
      !(await this.repository.leadExistsInOrganization(
        input.organizationId,
        input.leadId,
      ))
    )
      return { kind: "not-found", resource: "lead" };
    if (
      input.correctedCampaignId !== undefined &&
      !(await this.repository.campaignExistsInOrganization(
        input.organizationId,
        input.correctedCampaignId,
      ))
    )
      return { kind: "not-found", resource: "campaign" };
    const derived = await this.repository.getLeadAttribution(
      input.organizationId,
      input.leadId,
    );
    const previousCampaignId =
      derived.lastCampaignId ?? derived.firstCampaignId;
    const correction = createAttributionCorrection({
      id: randomUUID(),
      organizationId: input.organizationId,
      leadId: input.leadId,
      ...(previousCampaignId === undefined ? {} : { previousCampaignId }),
      ...(input.correctedCampaignId === undefined
        ? {}
        : { correctedCampaignId: input.correctedCampaignId }),
      reason: input.reason,
      createdBy: input.userId,
      createdAt: input.createdAt,
    });
    await this.repository.insertAttributionCorrection(correction);
    return { kind: "attribution-corrected", correction };
  }

  private async requireCampaign(
    organizationId: string,
    campaignId: string,
  ): Promise<Campaign | null> {
    if (!UUID.test(campaignId)) return null;
    return this.repository.findCampaign(organizationId, campaignId);
  }

  private async authorize(
    input: CommandBase,
  ): Promise<
    | { kind: "authorized" }
    | { kind: "denied"; result: { kind: "access-denied" } }
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

function preparePage(input: { cursor?: string; limit?: number }): {
  after?: CampaignCursor;
  limit: number;
} {
  const limit = input.limit ?? DEFAULT_PAGE_LIMIT;
  if (
    !Number.isInteger(limit) ||
    limit < 1 ||
    limit > MAX_PAGE_LIMIT ||
    !Number.isSafeInteger(limit)
  )
    throw new CampaignValidationError("Invalid campaign page limit");
  return {
    limit: limit + 1,
    ...(input.cursor === undefined
      ? {}
      : { after: decodeCursor(input.cursor) }),
  };
}

function lastCursorOf(
  items: readonly { createdAt: Date; id: string }[],
): CampaignCursor {
  const last = items[items.length - 1];
  return { at: last.createdAt, id: last.id };
}

export function encodeCursor(cursor: CampaignCursor): string {
  return Buffer.from(
    JSON.stringify({ v: 1, at: cursor.at.toISOString(), id: cursor.id }),
  ).toString("base64url");
}

export function decodeCursor(value: string): CampaignCursor {
  if (
    value.length === 0 ||
    value.length > 512 ||
    value.length % 4 === 1 ||
    !/^[A-Za-z0-9_-]+$/.test(value)
  )
    throw new CampaignValidationError("Invalid campaign cursor");
  const bytes = Buffer.from(value, "base64url");
  if (bytes.toString("base64url") !== value)
    throw new CampaignValidationError("Invalid campaign cursor");
  let parsed: unknown;
  try {
    parsed = JSON.parse(bytes.toString("utf8"));
  } catch (error) {
    if (error instanceof SyntaxError)
      throw new CampaignValidationError("Invalid campaign cursor");
    throw error;
  }
  const record = parsed as Record<string, unknown> | null;
  const at = record?.at;
  const id = record?.id;
  if (
    !record ||
    Object.keys(record).length !== 3 ||
    record.v !== 1 ||
    typeof at !== "string" ||
    !CURSOR_DATE.test(at) ||
    typeof id !== "string" ||
    !UUID.test(id) ||
    Buffer.from(JSON.stringify(record)).toString("base64url") !== value
  )
    throw new CampaignValidationError("Invalid campaign cursor");
  return { at: new Date(at), id };
}

export function touchHistorySummary(
  touches: readonly LeadTouch[],
): EffectiveAttribution {
  const derived = deriveTouchAttribution(touches);
  return applyAttributionOverride(derived, undefined);
}
