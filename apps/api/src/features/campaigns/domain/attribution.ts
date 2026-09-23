import { CampaignValidationError } from "./campaign.js";

/**
 * EF-401 attribution domain. Lead touches are append-only facts about how a
 * lead arrived (channel/source/UTM, optionally bound to a campaign).
 * First-touch and last-touch attribution are derived by a deterministic total
 * order: (occurredAt, id). An append-only LeadAttributionCorrection may then
 * override the derived campaign for the lead, keeping the original touches
 * untouched and recording who corrected what, when, and why.
 */

export type TouchChannel =
  | "WEBSITE"
  | "WHATSAPP"
  | "PHONE_CALL"
  | "WALK_IN"
  | "REFERRAL"
  | "META"
  | "GOOGLE"
  | "SNAPCHAT"
  | "TIKTOK"
  | "X"
  | "OTHER";

export const TOUCH_CHANNELS: readonly TouchChannel[] = [
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
];

export type TouchUtm = Readonly<{
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  utmContent?: string;
  utmTerm?: string;
}>;

export type LeadTouch = Readonly<{
  id: string;
  organizationId: string;
  leadId: string;
  campaignId?: string;
  channel: TouchChannel;
  source?: string;
  utm: TouchUtm;
  occurredAt: Date;
  createdBy: string;
  createdAt: Date;
}>;

export type LeadAttributionCorrectionRecord = Readonly<{
  id: string;
  organizationId: string;
  leadId: string;
  previousCampaignId?: string;
  correctedCampaignId?: string;
  reason: string;
  createdBy: string;
  createdAt: Date;
}>;

export type TouchAttribution = Readonly<{
  firstTouch?: LeadTouch;
  lastTouch?: LeadTouch;
}>;

export type EffectiveAttribution = Readonly<{
  firstTouch?: LeadTouch;
  lastTouch?: LeadTouch;
  firstCampaignId?: string;
  lastCampaignId?: string;
  override?: LeadAttributionCorrectionRecord;
}>;

type TouchInput = Readonly<{
  id: string;
  organizationId: string;
  leadId: string;
  campaignId?: string;
  channel: TouchChannel;
  source?: string;
  utm: TouchUtm;
  occurredAt: Date;
  createdBy: string;
  createdAt: Date;
}>;

type CorrectionInput = Readonly<{
  id: string;
  organizationId: string;
  leadId: string;
  previousCampaignId?: string;
  correctedCampaignId?: string;
  reason: string;
  createdBy: string;
  createdAt: Date;
}>;

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function text(value: string, field: string, limit: number): string {
  if (typeof value !== "string")
    throw new CampaignValidationError(`Invalid ${field}`);
  const canonical = value.trim();
  if (canonical.length === 0 || canonical.length > limit)
    throw new CampaignValidationError(`Invalid ${field}`);
  return canonical;
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
function touchChannel(value: TouchChannel): TouchChannel {
  if (
    typeof value !== "string" ||
    !TOUCH_CHANNELS.includes(value as TouchChannel)
  )
    throw new CampaignValidationError("Invalid touch channel");
  return value;
}
function touchUtm(input: TouchUtm): TouchUtm {
  const result: {
    utmSource?: string;
    utmMedium?: string;
    utmCampaign?: string;
    utmContent?: string;
    utmTerm?: string;
  } = {};
  if (input.utmSource !== undefined)
    result.utmSource = text(input.utmSource, "touch utmSource", 100);
  if (input.utmMedium !== undefined)
    result.utmMedium = text(input.utmMedium, "touch utmMedium", 100);
  if (input.utmCampaign !== undefined)
    result.utmCampaign = text(input.utmCampaign, "touch utmCampaign", 100);
  if (input.utmContent !== undefined)
    result.utmContent = text(input.utmContent, "touch utmContent", 100);
  if (input.utmTerm !== undefined)
    result.utmTerm = text(input.utmTerm, "touch utmTerm", 100);
  return Object.freeze(result);
}

export function createLeadTouch(input: TouchInput): LeadTouch {
  const occurredAt = date(input.occurredAt, "touch time");
  const createdAt = date(input.createdAt, "touch creation time");
  return Object.freeze({
    id: identifier(input.id, "touch id"),
    organizationId: identifier(input.organizationId, "organization"),
    leadId: identifier(input.leadId, "lead id"),
    ...(input.campaignId === undefined
      ? {}
      : { campaignId: identifier(input.campaignId, "touch campaign") }),
    channel: touchChannel(input.channel),
    ...(input.source === undefined
      ? {}
      : { source: text(input.source, "touch source", 200) }),
    utm: touchUtm(input.utm),
    occurredAt,
    createdBy: identifier(input.createdBy, "touch actor"),
    createdAt,
  });
}

export function createAttributionCorrection(
  input: CorrectionInput,
): LeadAttributionCorrectionRecord {
  const createdAt = date(input.createdAt, "correction time");
  const reason = text(input.reason, "correction reason", 500);
  const corrected =
    input.correctedCampaignId === undefined
      ? undefined
      : identifier(input.correctedCampaignId, "corrected campaign");
  const previous =
    input.previousCampaignId === undefined
      ? undefined
      : identifier(input.previousCampaignId, "previous campaign");
  if (
    corrected !== undefined &&
    previous !== undefined &&
    corrected === previous
  )
    throw new CampaignValidationError(
      "An attribution correction must change the attributed campaign",
    );
  return Object.freeze({
    id: identifier(input.id, "correction id"),
    organizationId: identifier(input.organizationId, "organization"),
    leadId: identifier(input.leadId, "lead id"),
    ...(previous === undefined ? {} : { previousCampaignId: previous }),
    ...(corrected === undefined ? {} : { correctedCampaignId: corrected }),
    reason,
    createdBy: identifier(input.createdBy, "correction actor"),
    createdAt,
  });
}

/** Deterministic total order for attribution: (occurredAt, id). */
export function compareTouches(left: LeadTouch, right: LeadTouch): number {
  return (
    left.occurredAt.getTime() - right.occurredAt.getTime() ||
    (left.id < right.id ? -1 : left.id > right.id ? 1 : 0)
  );
}

/**
 * First-touch / last-touch derivation over a lead's touches. Touches without a
 * campaign never attribute; the first (or last) campaign-bound touch wins.
 */
export function deriveTouchAttribution(
  touches: readonly LeadTouch[],
): TouchAttribution {
  const attributed = touches
    .filter((touch) => touch.campaignId !== undefined)
    .sort(compareTouches);
  return Object.freeze({
    ...(attributed.length > 0 ? { firstTouch: attributed[0] } : {}),
    ...(attributed.length > 0
      ? { lastTouch: attributed[attributed.length - 1] }
      : {}),
  });
}

/**
 * Applies the latest append-only correction (if any) on top of the derived
 * attribution. A correction with no correctedCampaignId clears attribution.
 */
export function applyAttributionOverride(
  attribution: TouchAttribution,
  override: LeadAttributionCorrectionRecord | undefined,
): EffectiveAttribution {
  if (!override)
    return Object.freeze({
      ...attribution,
      firstCampaignId: attribution.firstTouch?.campaignId,
      lastCampaignId: attribution.lastTouch?.campaignId,
    });
  return Object.freeze({
    firstTouch: attribution.firstTouch,
    lastTouch: attribution.lastTouch,
    ...(override.correctedCampaignId === undefined
      ? {}
      : { firstCampaignId: override.correctedCampaignId }),
    ...(override.correctedCampaignId === undefined
      ? {}
      : { lastCampaignId: override.correctedCampaignId }),
    override,
  });
}

/** Latest correction by (createdAt, id); undefined when none exist. */
export function latestCorrection(
  corrections: readonly LeadAttributionCorrectionRecord[],
): LeadAttributionCorrectionRecord | undefined {
  if (corrections.length === 0) return undefined;
  return [...corrections].sort(
    (left, right) =>
      left.createdAt.getTime() - right.createdAt.getTime() ||
      (left.id < right.id ? -1 : left.id > right.id ? 1 : 0),
  )[corrections.length - 1];
}
