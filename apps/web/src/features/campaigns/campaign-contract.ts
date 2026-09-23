/**
 * EF-401 — typed campaign/attribution contract for the Arabic UI. Every API
 * payload is strictly normalized here; unknown fields, non-enum statuses, and
 * malformed values are rejected before they can reach a view.
 */

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const MONEY = /^[1-9]\d*$/;
const CURSOR = /^[A-Za-z0-9_-]+$/;

export const CAMPAIGN_STATUSES = [
  "DRAFT",
  "ACTIVE",
  "COMPLETED",
  "CANCELLED",
] as const;
export type CampaignStatus = (typeof CAMPAIGN_STATUSES)[number];

export const CAMPAIGN_CHANNELS = [
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
] as const;
export type CampaignChannel = (typeof CAMPAIGN_CHANNELS)[number];

export const TOUCH_CHANNELS = [
  "WEBSITE",
  "WHATSAPP",
  "PHONE_CALL",
  "WALK_IN",
  "REFERRAL",
  "META",
  "GOOGLE",
  "SNAPCHAT",
  "TIKTOK",
  "X",
  "OTHER",
] as const;
export type TouchChannel = (typeof TOUCH_CHANNELS)[number];

export type UtmTags = Readonly<{
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  utmContent?: string;
  utmTerm?: string;
}>;

export type CampaignSummary = Readonly<{
  id: string;
  name: string;
  objective: string;
  channel: CampaignChannel;
  status: CampaignStatus;
  startsAt: string;
  endsAt: string;
  budgetPlannedMinor: string;
  currency: string;
  budgetActualMinor?: string;
  touchCount: number;
  createdAt: string;
}>;

export type CampaignListPage = Readonly<{
  items: readonly CampaignSummary[];
  nextCursor?: string;
}>;

export type CampaignMoneyRow = Readonly<{
  currency: string;
  count: number;
  amountMinor: string;
}>;

export type CampaignTransition = Readonly<{
  id: string;
  campaignId: string;
  fromStatus: CampaignStatus;
  toStatus: CampaignStatus;
  reason?: string;
  actorId: string;
  createdAt: string;
}>;

export type BudgetCorrection = Readonly<{
  id: string;
  campaignId: string;
  previousMinor: string;
  correctedMinor: string;
  currency: string;
  reason: string;
  createdBy: string;
  createdAt: string;
}>;

export type CampaignRecord = Readonly<{
  id: string;
  organizationId: string;
  name: string;
  objective: string;
  channel: CampaignChannel;
  status: CampaignStatus;
  startsAt: string;
  endsAt: string;
  budgetPlannedMinor: string;
  currency: string;
  utm: UtmTags;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}>;

export type CampaignDetailResponse = Readonly<{
  campaign: CampaignRecord;
  actualByCurrency: readonly CampaignMoneyRow[];
  transitions: readonly CampaignTransition[];
  budgetCorrections: readonly BudgetCorrection[];
}>;

export type PerformanceEntry = Readonly<{
  id: string;
  campaignId: string;
  occurredAt: string;
  impressions: number;
  clicks: number;
  leadsCount: number;
  note?: string;
  createdBy: string;
  createdAt: string;
}>;

export type PerformanceEntryPage = Readonly<{
  items: readonly PerformanceEntry[];
  nextCursor?: string;
}>;

export type LeadTouch = Readonly<{
  id: string;
  leadId: string;
  campaignId?: string;
  channel: TouchChannel;
  source?: string;
  utm: UtmTags;
  occurredAt: string;
  createdBy: string;
  createdAt: string;
}>;

export type LeadTouchPage = Readonly<{
  items: readonly LeadTouch[];
  nextCursor?: string;
}>;

export type AttributionCorrection = Readonly<{
  id: string;
  leadId: string;
  previousCampaignId?: string;
  correctedCampaignId?: string;
  reason: string;
  createdBy: string;
  createdAt: string;
}>;

export type LeadAttribution = Readonly<{
  firstTouch?: LeadTouch;
  lastTouch?: LeadTouch;
  firstCampaignId?: string;
  lastCampaignId?: string;
  override?: AttributionCorrection;
}>;

export type LeadAttributionResponse = Readonly<{
  attribution: LeadAttribution;
}>;

function record(value: unknown, what: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    throw new TypeError(`Invalid ${what}`);
  return value as Record<string, unknown>;
}

function only(value: Record<string, unknown>, fields: readonly string[]): void {
  if (Object.keys(value).some((key) => !fields.includes(key)))
    throw new TypeError(`${whatOf(fields)} contains an unsupported field`);
}

function whatOf(fields: readonly string[]): string {
  return fields[0] ?? "response";
}

function uuid(value: unknown, what: string): string {
  if (typeof value !== "string" || !UUID.test(value))
    throw new TypeError(`Invalid ${what}`);
  return value;
}

function utc(value: unknown, what: string): string {
  if (typeof value !== "string" || !UTC.test(value))
    throw new TypeError(`Invalid ${what}`);
  return value;
}

function money(value: unknown, what: string): string {
  if (typeof value !== "string" || !MONEY.test(value))
    throw new TypeError(`Invalid ${what}`);
  return value;
}

function currencyCode(value: unknown, what: string): string {
  if (typeof value !== "string" || !/^[A-Z]{3}$/.test(value))
    throw new TypeError(`Invalid ${what}`);
  return value;
}

function text(value: unknown, what: string): string {
  if (typeof value !== "string" || value.trim().length === 0)
    throw new TypeError(`Invalid ${what}`);
  return value;
}

function optionalCursor(value: unknown): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string" || !CURSOR.test(value))
    throw new TypeError("Invalid campaign cursor");
  return value;
}

function count(value: unknown, what: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0)
    throw new TypeError(`Invalid ${what}`);
  return value;
}

function inEnum<T extends string>(
  value: unknown,
  values: readonly T[],
  what: string,
): T {
  if (typeof value !== "string" || !values.includes(value as T))
    throw new TypeError(`Invalid ${what}`);
  return value as T;
}

function normalizeUtm(value: unknown): UtmTags {
  const utm = record(value, "utm tags");
  only(utm, ["utmSource", "utmMedium", "utmCampaign", "utmContent", "utmTerm"]);
  return {
    ...(utm.utmSource === undefined
      ? {}
      : { utmSource: text(utm.utmSource, "utmSource") }),
    ...(utm.utmMedium === undefined
      ? {}
      : { utmMedium: text(utm.utmMedium, "utmMedium") }),
    ...(utm.utmCampaign === undefined
      ? {}
      : { utmCampaign: text(utm.utmCampaign, "utmCampaign") }),
    ...(utm.utmContent === undefined
      ? {}
      : { utmContent: text(utm.utmContent, "utmContent") }),
    ...(utm.utmTerm === undefined
      ? {}
      : { utmTerm: text(utm.utmTerm, "utmTerm") }),
  };
}

const CAMPAIGN_ITEM_FIELDS = [
  "id",
  "name",
  "objective",
  "channel",
  "status",
  "startsAt",
  "endsAt",
  "budgetPlannedMinor",
  "currency",
  "budgetActualMinor",
  "touchCount",
  "createdAt",
] as const;

function normalizeCampaignSummary(value: unknown): CampaignSummary {
  const row = record(value, "campaign");
  only(row, CAMPAIGN_ITEM_FIELDS);
  const budgetActualMinor =
    row.budgetActualMinor === undefined
      ? undefined
      : money(row.budgetActualMinor, "budgetActualMinor");
  return {
    id: uuid(row.id, "campaign id"),
    name: text(row.name, "campaign name"),
    objective: text(row.objective, "campaign objective"),
    channel: inEnum(row.channel, CAMPAIGN_CHANNELS, "campaign channel"),
    status: inEnum(row.status, CAMPAIGN_STATUSES, "campaign status"),
    startsAt: utc(row.startsAt, "campaign start"),
    endsAt: utc(row.endsAt, "campaign end"),
    budgetPlannedMinor: money(row.budgetPlannedMinor, "budgetPlannedMinor"),
    currency: currencyCode(row.currency, "campaign currency"),
    ...(budgetActualMinor === undefined ? {} : { budgetActualMinor }),
    touchCount: count(row.touchCount, "touchCount"),
    createdAt: utc(row.createdAt, "campaign createdAt"),
  };
}

export function normalizeCampaignList(value: unknown): CampaignListPage {
  const body = record(value, "campaign list");
  only(body, ["items", "nextCursor"]);
  if (!Array.isArray(body.items)) throw new TypeError("Invalid campaign list");
  return {
    items: body.items.map(normalizeCampaignSummary),
    ...optionalCursorRecord(body.nextCursor),
  };
}

function optionalCursorRecord(value: unknown): { nextCursor?: string } {
  const nextCursor = optionalCursor(value);
  return nextCursor === undefined ? {} : { nextCursor };
}

export function normalizeCampaignDetail(
  value: unknown,
): CampaignDetailResponse {
  const body = record(value, "campaign detail");
  only(body, [
    "campaign",
    "actualByCurrency",
    "transitions",
    "budgetCorrections",
  ]);
  const campaignRow = record(body.campaign, "campaign");
  only(campaignRow, [
    "id",
    "organizationId",
    "name",
    "objective",
    "channel",
    "status",
    "startsAt",
    "endsAt",
    "budget",
    "utm",
    "createdBy",
    "createdAt",
    "updatedAt",
  ]);
  const budget = record(campaignRow.budget, "campaign budget");
  only(budget, ["amountMinor", "currency"]);
  if (!Array.isArray(body.actualByCurrency))
    throw new TypeError("Invalid actualByCurrency");
  if (!Array.isArray(body.transitions))
    throw new TypeError("Invalid transitions");
  if (!Array.isArray(body.budgetCorrections))
    throw new TypeError("Invalid budgetCorrections");
  return {
    campaign: {
      id: uuid(campaignRow.id, "campaign id"),
      organizationId: uuid(campaignRow.organizationId, "organization id"),
      name: text(campaignRow.name, "campaign name"),
      objective: text(campaignRow.objective, "campaign objective"),
      channel: inEnum(
        campaignRow.channel,
        CAMPAIGN_CHANNELS,
        "campaign channel",
      ),
      status: inEnum(campaignRow.status, CAMPAIGN_STATUSES, "campaign status"),
      startsAt: utc(campaignRow.startsAt, "campaign start"),
      endsAt: utc(campaignRow.endsAt, "campaign end"),
      budgetPlannedMinor: money(budget.amountMinor, "budget amountMinor"),
      currency: currencyCode(budget.currency, "budget currency"),
      utm: normalizeUtm(campaignRow.utm),
      createdBy: uuid(campaignRow.createdBy, "campaign actor"),
      createdAt: utc(campaignRow.createdAt, "campaign createdAt"),
      updatedAt: utc(campaignRow.updatedAt, "campaign updatedAt"),
    },
    actualByCurrency: body.actualByCurrency.map((entry) => {
      const row = record(entry, "actual row");
      only(row, ["currency", "count", "amountMinor"]);
      return {
        currency: currencyCode(row.currency, "actual currency"),
        count: count(row.count, "actual count"),
        amountMinor: money(row.amountMinor, "actual amountMinor"),
      };
    }),
    transitions: body.transitions.map((entry) => {
      const row = record(entry, "transition");
      only(row, [
        "id",
        "organizationId",
        "campaignId",
        "fromStatus",
        "toStatus",
        "reason",
        "actorId",
        "createdAt",
      ]);
      return {
        id: uuid(row.id, "transition id"),
        campaignId: uuid(row.campaignId, "transition campaign"),
        fromStatus: inEnum(row.fromStatus, CAMPAIGN_STATUSES, "fromStatus"),
        toStatus: inEnum(row.toStatus, CAMPAIGN_STATUSES, "toStatus"),
        ...(row.reason === undefined
          ? {}
          : { reason: text(row.reason, "reason") }),
        actorId: uuid(row.actorId, "transition actor"),
        createdAt: utc(row.createdAt, "transition createdAt"),
      };
    }),
    budgetCorrections: body.budgetCorrections.map((entry) => {
      const row = record(entry, "budget correction");
      only(row, [
        "id",
        "organizationId",
        "campaignId",
        "previousMinor",
        "correctedMinor",
        "currency",
        "reason",
        "createdBy",
        "createdAt",
      ]);
      return {
        id: uuid(row.id, "correction id"),
        campaignId: uuid(row.campaignId, "correction campaign"),
        previousMinor: money(row.previousMinor, "previousMinor"),
        correctedMinor: money(row.correctedMinor, "correctedMinor"),
        currency: currencyCode(row.currency, "correction currency"),
        reason: text(row.reason, "correction reason"),
        createdBy: uuid(row.createdBy, "correction actor"),
        createdAt: utc(row.createdAt, "correction createdAt"),
      };
    }),
  };
}

export function normalizePerformanceEntries(
  value: unknown,
): PerformanceEntryPage {
  const body = record(value, "performance entries");
  only(body, ["items", "nextCursor"]);
  if (!Array.isArray(body.items))
    throw new TypeError("Invalid performance entries");
  return {
    items: body.items.map((entry) => {
      const row = record(entry, "performance entry");
      only(row, [
        "id",
        "organizationId",
        "campaignId",
        "occurredAt",
        "impressions",
        "clicks",
        "leadsCount",
        "note",
        "createdBy",
        "createdAt",
      ]);
      return {
        id: uuid(row.id, "entry id"),
        campaignId: uuid(row.campaignId, "entry campaign"),
        occurredAt: utc(row.occurredAt, "entry occurredAt"),
        impressions: count(row.impressions, "impressions"),
        clicks: count(row.clicks, "clicks"),
        leadsCount: count(row.leadsCount, "leadsCount"),
        ...(row.note === undefined ? {} : { note: text(row.note, "note") }),
        createdBy: uuid(row.createdBy, "entry actor"),
        createdAt: utc(row.createdAt, "entry createdAt"),
      };
    }),
    ...optionalCursorRecord(body.nextCursor),
  };
}

export function normalizeLeadTouches(value: unknown): LeadTouchPage {
  const body = record(value, "lead touches");
  only(body, ["items", "nextCursor"]);
  if (!Array.isArray(body.items)) throw new TypeError("Invalid lead touches");
  return {
    items: body.items.map(normalizeLeadTouch),
    ...optionalCursorRecord(body.nextCursor),
  };
}

function normalizeLeadTouch(value: unknown): LeadTouch {
  const row = record(value, "lead touch");
  only(row, [
    "id",
    "organizationId",
    "leadId",
    "campaignId",
    "channel",
    "source",
    "utm",
    "occurredAt",
    "createdBy",
    "createdAt",
  ]);
  return {
    id: uuid(row.id, "touch id"),
    leadId: uuid(row.leadId, "touch lead"),
    ...(row.campaignId === undefined
      ? {}
      : { campaignId: uuid(row.campaignId, "touch campaign") }),
    channel: inEnum(row.channel, TOUCH_CHANNELS, "touch channel"),
    ...(row.source === undefined
      ? {}
      : { source: text(row.source, "touch source") }),
    utm: normalizeUtm(row.utm),
    occurredAt: utc(row.occurredAt, "touch occurredAt"),
    createdBy: uuid(row.createdBy, "touch actor"),
    createdAt: utc(row.createdAt, "touch createdAt"),
  };
}

export function normalizeLeadAttribution(
  value: unknown,
): LeadAttributionResponse {
  const body = record(value, "lead attribution");
  only(body, ["attribution"]);
  const attribution = record(body.attribution, "attribution");
  only(attribution, [
    "firstTouch",
    "lastTouch",
    "firstCampaignId",
    "lastCampaignId",
    "override",
  ]);
  const overrideRow =
    attribution.override === undefined
      ? undefined
      : normalizeCorrectionRecord(attribution.override);
  return {
    attribution: {
      ...(attribution.firstTouch === undefined
        ? {}
        : { firstTouch: normalizeLeadTouch(attribution.firstTouch) }),
      ...(attribution.lastTouch === undefined
        ? {}
        : { lastTouch: normalizeLeadTouch(attribution.lastTouch) }),
      ...(attribution.firstCampaignId === undefined
        ? {}
        : {
            firstCampaignId: uuid(
              attribution.firstCampaignId,
              "firstCampaignId",
            ),
          }),
      ...(attribution.lastCampaignId === undefined
        ? {}
        : {
            lastCampaignId: uuid(attribution.lastCampaignId, "lastCampaignId"),
          }),
      ...(overrideRow === undefined ? {} : { override: overrideRow }),
    },
  };
}

function normalizeCorrectionRecord(value: unknown): AttributionCorrection {
  const row = record(value, "attribution correction");
  only(row, [
    "id",
    "organizationId",
    "leadId",
    "previousCampaignId",
    "correctedCampaignId",
    "reason",
    "createdBy",
    "createdAt",
  ]);
  return {
    id: uuid(row.id, "correction id"),
    leadId: uuid(row.leadId, "correction lead"),
    ...(row.previousCampaignId === undefined
      ? {}
      : {
          previousCampaignId: uuid(
            row.previousCampaignId,
            "previousCampaignId",
          ),
        }),
    ...(row.correctedCampaignId === undefined
      ? {}
      : {
          correctedCampaignId: uuid(
            row.correctedCampaignId,
            "correctedCampaignId",
          ),
        }),
    reason: text(row.reason, "correction reason"),
    createdBy: uuid(row.createdBy, "correction actor"),
    createdAt: utc(row.createdAt, "correction createdAt"),
  };
}
