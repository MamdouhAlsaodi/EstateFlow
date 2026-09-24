import { createApiClient, ApiError } from "../../lib/api-client";
import { createSessionCsrfProvider } from "../../lib/api-client/session";
import {
  normalizeAuditPage,
  normalizeBrokerDecision,
  normalizeFailedJobs,
  normalizeModerationDecision,
  normalizeModerationQueue,
  normalizePendingBrokers,
  serializeAdminQuery,
  type AdminAuditPage,
  type AdminAuditAction,
  type AdminFailedJobsPage,
  type BrokerDecision,
  type ModerationDecision,
  type ModerationQueuePage,
  type PendingBrokersPage,
} from "./admin-contract";

/**
 * EF-620 — platform-admin API adapter. Reads are GETs without CSRF; every
 * privileged command posts through the session CSRF provider. The step-up
 * password re-confirmation is a separate POST: the UI calls it when a
 * sensitive command answers 403, then retries the command once.
 */

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const apiClient = createApiClient();

function assertUuid(name: string, value: string): string {
  if (!UUID.test(value)) throw new TypeError(`Invalid ${name}`);
  return encodeURIComponent(value);
}

async function csrfToken(): Promise<string> {
  return createSessionCsrfProvider(apiClient).getToken();
}

// --- reads ---------------------------------------------------------------

export function fetchPendingBrokers(query: {
  cursor?: string | null;
  limit?: number;
}): Promise<PendingBrokersPage> {
  return apiClient
    .request(`/admin/brokers/pending${serializeAdminQuery(query)}`)
    .then(normalizePendingBrokers);
}

export function fetchModerationQueue(query: {
  cursor?: string | null;
  limit?: number;
}): Promise<ModerationQueuePage> {
  return apiClient
    .request(`/admin/listings/moderation-queue${serializeAdminQuery(query)}`)
    .then(normalizeModerationQueue);
}

export function fetchAuditEvents(query: {
  cursor?: string | null;
  limit?: number;
  organizationId?: string;
  action?: AdminAuditAction;
}): Promise<AdminAuditPage> {
  if (query.organizationId !== undefined && !UUID.test(query.organizationId))
    return Promise.reject(new TypeError("Invalid organization id"));
  return apiClient
    .request(`/admin/audit/events${serializeAdminQuery(query)}`)
    .then(normalizeAuditPage);
}

export function fetchFailedJobs(query: {
  cursor?: string | null;
  limit?: number;
  organizationId?: string;
}): Promise<AdminFailedJobsPage> {
  if (query.organizationId !== undefined && !UUID.test(query.organizationId))
    return Promise.reject(new TypeError("Invalid organization id"));
  return apiClient
    .request(`/admin/automation/failed-jobs${serializeAdminQuery(query)}`)
    .then(normalizeFailedJobs);
}

// --- commands ---------------------------------------------------------------

async function postJson<T>(
  path: string,
  body: unknown,
  normalize: (value: unknown) => T,
): Promise<T> {
  return csrfToken().then((token) =>
    apiClient
      .request(path, {
        method: "POST",
        csrfToken: token,
        body,
      })
      .then(normalize),
  );
}

export function approveBroker(input: {
  organizationId: string;
  membershipId: string;
  reason?: string;
}): Promise<BrokerDecision> {
  const organizationId = assertUuid("organization id", input.organizationId);
  const membershipId = assertUuid("membership id", input.membershipId);
  return postJson(
    `/admin/organizations/${organizationId}/brokers/${membershipId}/approve`,
    input.reason ? { reason: input.reason } : {},
    normalizeBrokerDecision,
  );
}

export function suspendBroker(input: {
  organizationId: string;
  membershipId: string;
  reason: string;
}): Promise<BrokerDecision> {
  const organizationId = assertUuid("organization id", input.organizationId);
  const membershipId = assertUuid("membership id", input.membershipId);
  return postJson(
    `/admin/organizations/${organizationId}/brokers/${membershipId}/suspend`,
    { reason: input.reason },
    normalizeBrokerDecision,
  );
}

export function reinstateBroker(input: {
  organizationId: string;
  membershipId: string;
  reason: string;
}): Promise<BrokerDecision> {
  const organizationId = assertUuid("organization id", input.organizationId);
  const membershipId = assertUuid("membership id", input.membershipId);
  return postJson(
    `/admin/organizations/${organizationId}/brokers/${membershipId}/reinstate`,
    { reason: input.reason },
    normalizeBrokerDecision,
  );
}

export function approveListingModeration(input: {
  organizationId: string;
  listingId: string;
  reason?: string;
}): Promise<ModerationDecision> {
  const organizationId = assertUuid("organization id", input.organizationId);
  const listingId = assertUuid("listing id", input.listingId);
  return postJson(
    `/admin/organizations/${organizationId}/listings/${listingId}/moderation/approve`,
    input.reason ? { reason: input.reason } : {},
    normalizeModerationDecision,
  );
}

export function rejectListingModeration(input: {
  organizationId: string;
  listingId: string;
  reason: string;
}): Promise<ModerationDecision> {
  const organizationId = assertUuid("organization id", input.organizationId);
  const listingId = assertUuid("listing id", input.listingId);
  return postJson(
    `/admin/organizations/${organizationId}/listings/${listingId}/moderation/reject`,
    { reason: input.reason },
    normalizeModerationDecision,
  );
}

export function takedownListing(input: {
  organizationId: string;
  listingId: string;
  reason: string;
}): Promise<ModerationDecision> {
  const organizationId = assertUuid("organization id", input.organizationId);
  const listingId = assertUuid("listing id", input.listingId);
  return postJson(
    `/admin/organizations/${organizationId}/listings/${listingId}/moderation/takedown`,
    { reason: input.reason },
    normalizeModerationDecision,
  );
}

/**
 * Step-up re-authentication: confirms the account password for the current
 * access session. Returns true when the confirmation succeeded.
 */
export async function confirmStepUp(password: string): Promise<boolean> {
  try {
    await csrfToken().then((token) =>
      apiClient.request("/admin/auth/step-up", {
        method: "POST",
        csrfToken: token,
        body: { password },
      }),
    );
    return true;
  } catch (error) {
    if (
      error instanceof ApiError &&
      (error.status === 400 || error.status === 403)
    )
      return false;
    throw error;
  }
}

/**
 * A sensitive command answered 403: either the step-up window lapsed (retry
 * after re-confirmation) or the session lacks platform authority.
 */
export function isStepUpRequiredError(error: unknown): boolean {
  return error instanceof ApiError && error.status === 403;
}
