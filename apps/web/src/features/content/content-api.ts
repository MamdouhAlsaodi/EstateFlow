import { createApiClient } from "../../lib/api-client/index";
import { createSessionCsrfProvider } from "../../lib/api-client/session";
import {
  normalizeCalendar,
  normalizeContentDetail,
  normalizeContentList,
  normalizeGeneratedDraft,
  normalizeGenerationTemplates,
  normalizePublishResults,
  normalizeScheduledDeliveries,
  normalizeReviewQueue,
  type CalendarResponse,
  type ContentDetailResponse,
  type ContentListPage,
  type GeneratedDraft,
  type GenerationTemplatesResponse,
  type PublishResultsResponse,
  type ReviewQueueResponse,
  type ScheduledDeliveriesResponse,
} from "./content-contract";

/**
 * EF-402 — organization-scoped content-workflow adapter. Reads are plain
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

export function fetchContentItems(context: {
  organizationId: string;
  status?: string;
}): Promise<ContentListPage> {
  const organizationId = assertUuid("organization id", context.organizationId);
  const query = new URLSearchParams();
  if (context.status !== undefined) query.set("status", context.status);
  const suffix = query.toString() ? `?${query.toString()}` : "";
  return apiClient
    .request(`/organizations/${organizationId}/content${suffix}`)
    .then(normalizeContentList);
}

export function fetchReviewQueue(context: {
  organizationId: string;
}): Promise<ReviewQueueResponse> {
  const organizationId = assertUuid("organization id", context.organizationId);
  return apiClient
    .request(`/organizations/${organizationId}/content/review-queue`)
    .then(normalizeReviewQueue);
}

export function fetchCalendar(context: {
  organizationId: string;
  from: string;
  to: string;
}): Promise<CalendarResponse> {
  const organizationId = assertUuid("organization id", context.organizationId);
  const from = assertInstant("calendar from", context.from);
  const to = assertInstant("calendar to", context.to);
  return apiClient
    .request(
      `/organizations/${organizationId}/content/calendar?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
    )
    .then(normalizeCalendar);
}

export function fetchContentDetail(context: {
  organizationId: string;
  contentItemId: string;
}): Promise<ContentDetailResponse> {
  const organizationId = assertUuid("organization id", context.organizationId);
  const contentItemId = assertUuid("content item id", context.contentItemId);
  return apiClient
    .request(`/organizations/${organizationId}/content/${contentItemId}`)
    .then(normalizeContentDetail);
}

export type ContentCreateInput = Readonly<{
  title: string;
  body: string;
  channel: string;
  campaignId?: string;
}>;

export function createContentItem(
  context: { organizationId: string },
  input: ContentCreateInput,
): Promise<unknown> {
  const organizationId = assertUuid("organization id", context.organizationId);
  const body: Record<string, unknown> = {
    title: input.title.trim(),
    body: input.body.trim(),
    channel: input.channel,
  };
  if (input.campaignId !== undefined && input.campaignId.trim().length > 0)
    body.campaignId = assertUuid("campaign id", input.campaignId.trim());
  return csrfToken().then((token) =>
    apiClient.request(`/organizations/${organizationId}/content`, {
      method: "POST",
      csrfToken: token,
      body,
    }),
  );
}

export type ContentEditInput = Readonly<{
  title: string;
  body: string;
  channel: string;
  campaignId?: string;
}>;

export function editContentItem(
  context: { organizationId: string; contentItemId: string },
  input: ContentEditInput,
): Promise<unknown> {
  const organizationId = assertUuid("organization id", context.organizationId);
  const contentItemId = assertUuid("content item id", context.contentItemId);
  const body: Record<string, unknown> = {
    title: input.title.trim(),
    body: input.body.trim(),
    channel: input.channel,
  };
  if (input.campaignId !== undefined && input.campaignId.trim().length > 0)
    body.campaignId = assertUuid("campaign id", input.campaignId.trim());
  return csrfToken().then((token) =>
    apiClient.request(
      `/organizations/${organizationId}/content/${contentItemId}/edit`,
      { method: "POST", csrfToken: token, body },
    ),
  );
}

export type ContentTransitionInput = Readonly<{
  toStatus: string;
  reason?: string;
  failureKind?: string;
  scheduledFor?: string;
}>;

export function transitionContentItem(
  context: { organizationId: string; contentItemId: string },
  input: ContentTransitionInput,
): Promise<unknown> {
  const organizationId = assertUuid("organization id", context.organizationId);
  const contentItemId = assertUuid("content item id", context.contentItemId);
  const body: Record<string, unknown> = { toStatus: input.toStatus };
  if (input.reason !== undefined && input.reason.trim().length > 0)
    body.reason = input.reason.trim();
  if (input.failureKind !== undefined && input.failureKind.length > 0)
    body.failureKind = input.failureKind;
  if (input.scheduledFor !== undefined)
    body.scheduledFor = assertInstant("scheduledFor", input.scheduledFor);
  return csrfToken().then((token) =>
    apiClient.request(
      `/organizations/${organizationId}/content/${contentItemId}/transition`,
      { method: "POST", csrfToken: token, body },
    ),
  );
}

export function createContentRevision(context: {
  organizationId: string;
  contentItemId: string;
}): Promise<unknown> {
  const organizationId = assertUuid("organization id", context.organizationId);
  const contentItemId = assertUuid("content item id", context.contentItemId);
  return csrfToken().then((token) =>
    apiClient.request(
      `/organizations/${organizationId}/content/${contentItemId}/revisions`,
      { method: "POST", csrfToken: token, body: {} },
    ),
  );
}

/**
 * EF-403 — deterministic listing-to-content generation. Reads the channel
 * template catalog, then generates a DRAFT from an allowlisted property
 * projection; missing facts arrive as visible placeholders.
 */
export function fetchGenerationTemplates(context: {
  organizationId: string;
}): Promise<GenerationTemplatesResponse> {
  const organizationId = assertUuid("organization id", context.organizationId);
  return apiClient
    .request(`/organizations/${organizationId}/content/generation-templates`)
    .then(normalizeGenerationTemplates);
}

export type ContentGenerateInput = Readonly<{
  propertyId: string;
  channel: string;
  templateVersion?: number;
}>;

export function fetchScheduledDeliveries(context: {
  organizationId: string;
}): Promise<ScheduledDeliveriesResponse> {
  const organizationId = assertUuid("organization id", context.organizationId);
  return apiClient
    .request(`/organizations/${organizationId}/content/publishing/scheduled`)
    .then(normalizeScheduledDeliveries);
}

export function fetchPublishResults(context: {
  organizationId: string;
}): Promise<PublishResultsResponse> {
  const organizationId = assertUuid("organization id", context.organizationId);
  return apiClient
    .request(`/organizations/${organizationId}/content/publishing/results`)
    .then(normalizePublishResults);
}

export function cancelScheduledPublishing(context: {
  organizationId: string;
  contentItemId: string;
  reason: string;
}): Promise<unknown> {
  const organizationId = assertUuid("organization id", context.organizationId);
  const contentItemId = assertUuid("content item id", context.contentItemId);
  const reason = context.reason.trim();
  if (reason.length === 0 || reason.length > 500)
    throw new TypeError("Invalid cancellation reason");
  return csrfToken().then((token) =>
    apiClient.request(
      `/organizations/${organizationId}/content/${contentItemId}/publishing/cancel`,
      { method: "POST", csrfToken: token, body: { reason } },
    ),
  );
}

export function generateContentDraft(
  context: { organizationId: string },
  input: ContentGenerateInput,
): Promise<GeneratedDraft> {
  const organizationId = assertUuid("organization id", context.organizationId);
  const propertyId = assertUuid("property id", input.propertyId);
  const body: Record<string, unknown> = {
    propertyId,
    channel: input.channel,
  };
  if (
    input.templateVersion !== undefined &&
    Number.isSafeInteger(input.templateVersion) &&
    input.templateVersion >= 1
  )
    body.templateVersion = input.templateVersion;
  return csrfToken().then((token) =>
    apiClient
      .request(`/organizations/${organizationId}/content/generate`, {
        method: "POST",
        csrfToken: token,
        body,
      })
      .then(normalizeGeneratedDraft),
  );
}
