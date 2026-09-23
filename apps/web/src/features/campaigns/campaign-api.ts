import { createApiClient } from "../../lib/api-client/index";
import { createSessionCsrfProvider } from "../../lib/api-client/session";
import {
  normalizeCampaignDetail,
  normalizeCampaignList,
  normalizeLeadAttribution,
  normalizeLeadTouches,
  normalizePerformanceEntries,
  type CampaignDetailResponse,
  type CampaignListPage,
  type LeadAttributionResponse,
  type LeadTouchPage,
  type PerformanceEntryPage,
} from "./campaign-contract";

/**
 * EF-401 — organization-scoped campaigns/attribution adapter. Reads are plain
 * GETs; every mutation posts through the session CSRF provider. Payloads are
 * strictly normalized before rendering.
 */

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

const apiClient = createApiClient();

function assertUuid(name: string, value: string): string {
  if (!UUID.test(value)) throw new TypeError(`Invalid ${name}`);
  return encodeURIComponent(value);
}

function assertInstant(name: string, value: string): string {
  if (typeof value !== "string" || !UTC.test(value))
    throw new TypeError(`Invalid ${name}`);
  return value;
}

async function csrfToken(): Promise<string> {
  return createSessionCsrfProvider(apiClient).getToken();
}

export function fetchCampaigns(context: {
  organizationId: string;
  status?: string;
}): Promise<CampaignListPage> {
  const organizationId = assertUuid("organization id", context.organizationId);
  const query = new URLSearchParams();
  if (context.status !== undefined) query.set("status", context.status);
  const suffix = query.toString() ? `?${query.toString()}` : "";
  return apiClient
    .request(`/organizations/${organizationId}/campaigns${suffix}`)
    .then(normalizeCampaignList);
}

export function fetchCampaignDetail(context: {
  organizationId: string;
  campaignId: string;
}): Promise<CampaignDetailResponse> {
  const organizationId = assertUuid("organization id", context.organizationId);
  const campaignId = assertUuid("campaign id", context.campaignId);
  return apiClient
    .request(`/organizations/${organizationId}/campaigns/${campaignId}`)
    .then(normalizeCampaignDetail);
}

export function fetchCampaignPerformanceEntries(context: {
  organizationId: string;
  campaignId: string;
}): Promise<PerformanceEntryPage> {
  const organizationId = assertUuid("organization id", context.organizationId);
  const campaignId = assertUuid("campaign id", context.campaignId);
  return apiClient
    .request(
      `/organizations/${organizationId}/campaigns/${campaignId}/performance-entries`,
    )
    .then(normalizePerformanceEntries);
}

export function fetchLeadTouches(context: {
  organizationId: string;
  leadId: string;
}): Promise<LeadTouchPage> {
  const organizationId = assertUuid("organization id", context.organizationId);
  const leadId = assertUuid("lead id", context.leadId);
  return apiClient
    .request(`/organizations/${organizationId}/leads/${leadId}/touches`)
    .then(normalizeLeadTouches);
}

export function fetchLeadAttribution(context: {
  organizationId: string;
  leadId: string;
}): Promise<LeadAttributionResponse> {
  const organizationId = assertUuid("organization id", context.organizationId);
  const leadId = assertUuid("lead id", context.leadId);
  return apiClient
    .request(`/organizations/${organizationId}/leads/${leadId}/attribution`)
    .then(normalizeLeadAttribution);
}

export type CampaignCreateInput = Readonly<{
  name: string;
  objective: string;
  channel: string;
  startsAt: string;
  endsAt: string;
  budgetPlannedMinor: string;
  currency: string;
  utm?: Readonly<{
    utmSource?: string;
    utmMedium?: string;
    utmCampaign?: string;
    utmContent?: string;
    utmTerm?: string;
  }>;
}>;

function assertAmount(value: string): string {
  if (!/^[1-9]\d*$/.test(value)) throw new TypeError("Invalid budget amount");
  return value;
}

export function createCampaign(
  context: { organizationId: string },
  input: CampaignCreateInput,
): Promise<unknown> {
  const organizationId = assertUuid("organization id", context.organizationId);
  const body: Record<string, unknown> = {
    name: input.name.trim(),
    objective: input.objective.trim(),
    channel: input.channel,
    startsAt: assertInstant("startsAt", input.startsAt),
    endsAt: assertInstant("endsAt", input.endsAt),
    budgetPlannedMinor: assertAmount(input.budgetPlannedMinor),
    currency: input.currency,
  };
  if (input.utm) {
    for (const key of [
      "utmSource",
      "utmMedium",
      "utmCampaign",
      "utmContent",
      "utmTerm",
    ] as const) {
      const value = input.utm[key];
      if (value !== undefined && value.trim().length > 0)
        body[key] = value.trim();
    }
  }
  return csrfToken().then((token) =>
    apiClient.request(`/organizations/${organizationId}/campaigns`, {
      method: "POST",
      csrfToken: token,
      body,
    }),
  );
}

export function transitionCampaign(context: {
  organizationId: string;
  campaignId: string;
  toStatus: "ACTIVE" | "COMPLETED" | "CANCELLED";
  reason?: string;
}): Promise<unknown> {
  const organizationId = assertUuid("organization id", context.organizationId);
  const campaignId = assertUuid("campaign id", context.campaignId);
  const body: Record<string, unknown> = { toStatus: context.toStatus };
  if (context.reason !== undefined && context.reason.trim().length > 0)
    body.reason = context.reason.trim();
  return csrfToken().then((token) =>
    apiClient.request(
      `/organizations/${organizationId}/campaigns/${campaignId}/transition`,
      { method: "POST", csrfToken: token, body },
    ),
  );
}

export function correctCampaignBudget(context: {
  organizationId: string;
  campaignId: string;
  correctedMinor: string;
  reason: string;
}): Promise<unknown> {
  const organizationId = assertUuid("organization id", context.organizationId);
  const campaignId = assertUuid("campaign id", context.campaignId);
  return csrfToken().then((token) =>
    apiClient.request(
      `/organizations/${organizationId}/campaigns/${campaignId}/budget-corrections`,
      {
        method: "POST",
        csrfToken: token,
        body: {
          correctedMinor: assertAmount(context.correctedMinor),
          reason: context.reason.trim(),
        },
      },
    ),
  );
}

export type PerformanceEntryInput = Readonly<{
  occurredAt: string;
  impressions: number;
  clicks: number;
  leadsCount: number;
  note?: string;
}>;

export function recordCampaignPerformance(
  context: { organizationId: string; campaignId: string },
  input: PerformanceEntryInput,
): Promise<unknown> {
  const organizationId = assertUuid("organization id", context.organizationId);
  const campaignId = assertUuid("campaign id", context.campaignId);
  const body: Record<string, unknown> = {
    occurredAt: assertInstant("occurredAt", input.occurredAt),
    impressions: input.impressions,
    clicks: input.clicks,
    leadsCount: input.leadsCount,
  };
  if (input.note !== undefined && input.note.trim().length > 0)
    body.note = input.note.trim();
  return csrfToken().then((token) =>
    apiClient.request(
      `/organizations/${organizationId}/campaigns/${campaignId}/performance-entries`,
      { method: "POST", csrfToken: token, body },
    ),
  );
}

export type TouchInput = Readonly<{
  channel: string;
  source?: string;
  campaignId?: string;
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  utmContent?: string;
  utmTerm?: string;
  occurredAt?: string;
}>;

export function recordLeadTouch(
  context: { organizationId: string; leadId: string },
  input: TouchInput,
): Promise<unknown> {
  const organizationId = assertUuid("organization id", context.organizationId);
  const leadId = assertUuid("lead id", context.leadId);
  const body: Record<string, unknown> = { channel: input.channel };
  if (input.source !== undefined && input.source.trim().length > 0)
    body.source = input.source.trim();
  if (input.campaignId !== undefined)
    body.campaignId = assertUuid("campaign id", input.campaignId);
  for (const key of [
    "utmSource",
    "utmMedium",
    "utmCampaign",
    "utmContent",
    "utmTerm",
  ] as const) {
    const value = input[key];
    if (value !== undefined && value.trim().length > 0)
      body[key] = value.trim();
  }
  if (input.occurredAt !== undefined)
    body.occurredAt = assertInstant("occurredAt", input.occurredAt);
  return csrfToken().then((token) =>
    apiClient.request(
      `/organizations/${organizationId}/leads/${leadId}/touches`,
      { method: "POST", csrfToken: token, body },
    ),
  );
}

export function correctLeadAttribution(context: {
  organizationId: string;
  leadId: string;
  correctedCampaignId?: string;
  reason: string;
}): Promise<unknown> {
  const organizationId = assertUuid("organization id", context.organizationId);
  const leadId = assertUuid("lead id", context.leadId);
  const body: Record<string, unknown> = { reason: context.reason.trim() };
  if (context.correctedCampaignId !== undefined)
    body.correctedCampaignId = assertUuid(
      "campaign id",
      context.correctedCampaignId,
    );
  return csrfToken().then((token) =>
    apiClient.request(
      `/organizations/${organizationId}/leads/${leadId}/attribution-corrections`,
      { method: "POST", csrfToken: token, body },
    ),
  );
}
