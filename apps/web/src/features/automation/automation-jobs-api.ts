import { createApiClient } from "../../lib/api-client/index";
import { createSessionCsrfProvider } from "../../lib/api-client/session";
import {
  normalizeAutomationJobDetail,
  normalizeAutomationJobList,
  normalizeAutomationRuleDetail,
  type AutomationJobDetailResponse,
  type AutomationJobListResponse,
  type AutomationRuleDetailResponse,
} from "./automation-contract";

/**
 * EF-306 — organization-scoped automation read/action adapter. Reads are GETs
 * without CSRF; every mutation posts through the session CSRF provider with a
 * fresh idempotency key, exactly like the other Arabic workspaces. All
 * payloads are strictly normalized before they reach the UI.
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

/** Organization-wide execution history (typed records only). */
export function fetchAutomationJobs(context: {
  organizationId: string;
}): Promise<AutomationJobListResponse> {
  const organizationId = assertUuid("organization id", context.organizationId);
  return apiClient
    .request(`/organizations/${organizationId}/automation/jobs`)
    .then(normalizeAutomationJobList);
}

/** Execution history for one rule. */
export function fetchAutomationRuleJobs(context: {
  organizationId: string;
  ruleId: string;
}): Promise<AutomationJobListResponse> {
  const organizationId = assertUuid("organization id", context.organizationId);
  const ruleId = assertUuid("rule id", context.ruleId);
  return apiClient
    .request(`/organizations/${organizationId}/automation/rules/${ruleId}/jobs`)
    .then(normalizeAutomationJobList);
}

/** Rule definition, current state, and the immutable version timeline. */
export function fetchAutomationRuleDetail(context: {
  organizationId: string;
  ruleId: string;
}): Promise<AutomationRuleDetailResponse> {
  const organizationId = assertUuid("organization id", context.organizationId);
  const ruleId = assertUuid("rule id", context.ruleId);
  return apiClient
    .request(`/organizations/${organizationId}/automation/rules/${ruleId}`)
    .then(normalizeAutomationRuleDetail);
}

export function fetchAutomationJob(context: {
  organizationId: string;
  jobId: string;
}): Promise<AutomationJobDetailResponse> {
  const organizationId = assertUuid("organization id", context.organizationId);
  const jobId = assertUuid("job id", context.jobId);
  return apiClient
    .request(`/organizations/${organizationId}/automation/jobs/${jobId}`)
    .then(normalizeAutomationJobDetail);
}

/** Enable/disable is the only rule editor action this UI exposes. */
export function setAutomationRuleEnabled(context: {
  organizationId: string;
  ruleId: string;
  enabled: boolean;
}): Promise<unknown> {
  const organizationId = assertUuid("organization id", context.organizationId);
  const ruleId = assertUuid("rule id", context.ruleId);
  const action = context.enabled ? "enable" : "disable";
  return csrfToken().then((token) =>
    apiClient.request(
      `/organizations/${organizationId}/automation/rules/${ruleId}/${action}`,
      { method: "POST", csrfToken: token, idempotencyKey: crypto.randomUUID() },
    ),
  );
}

/**
 * Retry a FAILED job. The API always creates a NEW job occurrence; a repeated
 * retry resolves to 409 so side effects can never be duplicated.
 */
export function retryAutomationJob(context: {
  organizationId: string;
  jobId: string;
}): Promise<AutomationJobDetailResponse> {
  const organizationId = assertUuid("organization id", context.organizationId);
  const jobId = assertUuid("job id", context.jobId);
  return csrfToken().then((token) =>
    apiClient
      .request(
        `/organizations/${organizationId}/automation/jobs/${jobId}/retry`,
        {
          method: "POST",
          csrfToken: token,
          idempotencyKey: crypto.randomUUID(),
        },
      )
      .then(normalizeAutomationJobDetail),
  );
}

/** Cancel a queued/retrying job before the scheduler claims it. */
export function cancelAutomationJob(context: {
  organizationId: string;
  jobId: string;
}): Promise<AutomationJobDetailResponse> {
  const organizationId = assertUuid("organization id", context.organizationId);
  const jobId = assertUuid("job id", context.jobId);
  return csrfToken().then((token) =>
    apiClient
      .request(
        `/organizations/${organizationId}/automation/jobs/${jobId}/cancel`,
        {
          method: "POST",
          csrfToken: token,
          idempotencyKey: crypto.randomUUID(),
        },
      )
      .then(normalizeAutomationJobDetail),
  );
}
