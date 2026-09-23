import type { SessionResponse } from "./session";
import {
  normalizeAutomationRules,
  type AutomationFailedJobsResponse,
  type AutomationRulesResponse,
} from "../../features/automation/automation-contract";
import { createReceivableAdapter, type ReceivableAdapter } from "./receivable";
import {
  createCommissionAdapter,
  type CommissionAccrualInput,
  type CommissionAdapter,
  type CommissionPlanInput,
  type CommissionValueInput,
} from "./commission";
import {
  normalizeLeadBoardListResponse,
  normalizeLeadCloseLostResponse,
  normalizeLeadCloseWonResponse,
  normalizeLeadNoteCommandResponse,
  normalizeLeadTaskCommandResponse,
  normalizeLeadTransitionResponse,
  normalizeLeadWorkspaceResponse,
  serializeLeadBoardListQuery,
  serializeLeadWorkspaceQuery,
  type LeadBoardListQuery,
  type LeadBoardListResponse,
  type LeadCloseLostResponse,
  type LeadCloseWonResponse,
  type LeadNoteCommandResponse,
  type LeadStage,
  type LeadTaskCommandResponse,
  type LeadTransitionResponse,
  type LeadWorkspaceQuery,
  type LeadWorkspaceResponse,
} from "./leads";

export {
  normalizeLeadBoardListResponse,
  normalizeLeadCloseLostResponse,
  normalizeLeadCloseWonResponse,
  normalizeLeadNoteCommandResponse,
  normalizeLeadTaskCommandResponse,
  normalizeLeadTransitionResponse,
  normalizeLeadWorkspaceResponse,
} from "./leads";

export type ApiErrorDetails = Readonly<Record<string, unknown>>;

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details: ApiErrorDetails | undefined;
  readonly requestId: string | undefined;

  constructor(input: {
    status: number;
    code: string;
    message: string;
    details?: ApiErrorDetails;
    requestId?: string;
  }) {
    super(input.message);
    this.name = "ApiError";
    this.status = input.status;
    this.code = input.code;
    this.details = input.details;
    this.requestId = input.requestId;
  }
}

type FetchLike = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;
type RequestIdFactory = () => string;
export type ApiRequestOptions = Omit<
  RequestInit,
  "body" | "credentials" | "headers" | "method"
> &
  Readonly<{
    method?: string;
    headers?: HeadersInit;
    body?: unknown;
    csrfToken?: string;
    idempotencyKey?: string;
  }>;

export type ApiClient = Readonly<{
  request<T = unknown>(path: string, options?: ApiRequestOptions): Promise<T>;
  getLeadBoard(input: {
    organizationId: string;
    query?: LeadBoardListQuery;
  }): Promise<LeadBoardListResponse>;
  getLeadWorkspace(input: {
    organizationId: string;
    leadId: string;
    query?: LeadWorkspaceQuery;
  }): Promise<LeadWorkspaceResponse>;
  transitionLead(input: {
    organizationId: string;
    leadId: string;
    to: LeadStage;
    expectedVersion: number;
    csrfToken: string;
  }): Promise<LeadTransitionResponse>;
  closeLeadWon(input: {
    organizationId: string;
    leadId: string;
    expectedVersion: number;
    csrfToken: string;
    propertyId: string;
    brokerId: string;
  }): Promise<LeadCloseWonResponse>;
  closeLeadLost(input: {
    organizationId: string;
    leadId: string;
    expectedVersion: number;
    csrfToken: string;
    reason: string;
  }): Promise<LeadCloseLostResponse>;
  createLeadNote(input: {
    organizationId: string;
    leadId: string;
    body: string;
    csrfToken: string;
  }): Promise<LeadNoteCommandResponse>;
  createLeadTask(input: {
    organizationId: string;
    leadId: string;
    title: string;
    dueAt: string;
    csrfToken: string;
  }): Promise<LeadTaskCommandResponse>;
  completeLeadTask(input: {
    organizationId: string;
    leadId: string;
    taskId: string;
    expectedVersion: number;
    csrfToken: string;
  }): Promise<LeadTaskCommandResponse>;
  rescheduleLeadTask(input: {
    organizationId: string;
    leadId: string;
    taskId: string;
    dueAt: string;
    expectedVersion: number;
    csrfToken: string;
  }): Promise<LeadTaskCommandResponse>;
  getSession(): Promise<SessionResponse>;
  getAutomationRules(input: {
    organizationId: string;
  }): Promise<AutomationRulesResponse>;
  getAutomationFailedJobs(input: {
    organizationId: string;
    limit?: number;
  }): Promise<AutomationFailedJobsResponse>;
  createCommissionPlanVersion(
    context: Readonly<{ organizationId: string; csrfToken: string }>,
    input: CommissionPlanInput,
  ): Promise<unknown>;
  captureCommissionableValue(
    context: Readonly<{
      organizationId: string;
      dealId: string;
      csrfToken: string;
    }>,
    input: CommissionValueInput,
  ): Promise<unknown>;
  createExpectedAccrual(
    context: Readonly<{
      organizationId: string;
      dealId: string;
      csrfToken: string;
    }>,
    input: CommissionAccrualInput,
  ): Promise<unknown>;
}> &
  ReceivableAdapter;

export function createApiClient(
  options: Readonly<{
    baseUrl?: string;
    fetch?: FetchLike;
    requestId?: RequestIdFactory;
    idempotencyKey?: RequestIdFactory;
  }> = {},
): ApiClient {
  const baseUrl = options.baseUrl ?? "/api";
  const fetcher = options.fetch ?? globalThis.fetch;
  if (!fetcher) throw new Error("A fetch implementation is required");
  const requestId = options.requestId ?? (() => crypto.randomUUID());
  const idempotencyKey = options.idempotencyKey ?? (() => crypto.randomUUID());

  async function request<T>(
    path: string,
    requestOptions: ApiRequestOptions = {},
  ): Promise<T> {
    const method = (requestOptions.method ?? "GET").toUpperCase();
    const unsafe = !["GET", "HEAD", "OPTIONS"].includes(method);
    if (
      unsafe &&
      (!requestOptions.csrfToken ||
        requestOptions.csrfToken.trim().length === 0)
    )
      throw new TypeError("CSRF token is required for unsafe requests");

    const headers = new Headers(requestOptions.headers);
    headers.set("accept", "application/json");
    const correlationId = requestId();
    headers.set("x-request-id", correlationId);
    if (unsafe) headers.set("x-csrf-token", requestOptions.csrfToken as string);
    if (requestOptions.idempotencyKey)
      headers.set("idempotency-key", requestOptions.idempotencyKey);
    let body: BodyInit | undefined;
    if (requestOptions.body !== undefined) {
      body = JSON.stringify(requestOptions.body);
      headers.set("content-type", "application/json");
    }

    const response = await fetcher(resolveUrl(baseUrl, path), {
      ...requestOptions,
      method,
      headers,
      body,
      credentials: "include",
    });
    const payload = await readJson(response);
    if (!response.ok) throw toApiError(response, payload, correlationId);
    return payload as T;
  }

  const commission: CommissionAdapter = createCommissionAdapter({ request });
  const receivables: ReceivableAdapter = createReceivableAdapter({ request });
  return {
    request,
    ...commission,
    ...receivables,
    getLeadBoard: ({ organizationId, query = {} }) =>
      request<LeadBoardListResponse>(
        `/organizations/${encodeURIComponent(organizationId)}/leads${serializeLeadBoardListQuery(query)}`,
      ).then(normalizeLeadBoardListResponse),
    getLeadWorkspace: ({ organizationId, leadId, query = {} }) =>
      request<LeadWorkspaceResponse>(
        `/organizations/${encodeURIComponent(organizationId)}/leads/${encodeURIComponent(leadId)}${serializeLeadWorkspaceQuery(query)}`,
      ).then(normalizeLeadWorkspaceResponse),
    closeLeadWon: ({
      organizationId,
      leadId,
      expectedVersion,
      csrfToken,
      propertyId,
      brokerId,
    }) =>
      request<unknown>(
        `/organizations/${encodeURIComponent(organizationId)}/leads/${encodeURIComponent(leadId)}/close-won`,
        {
          method: "POST",
          csrfToken,
          idempotencyKey: idempotencyKey(),
          body: { propertyId, brokerId, expectedVersion },
        },
      ).then(normalizeLeadCloseWonResponse),
    closeLeadLost: ({
      organizationId,
      leadId,
      expectedVersion,
      csrfToken,
      reason,
    }) =>
      request<unknown>(
        `/organizations/${encodeURIComponent(organizationId)}/leads/${encodeURIComponent(leadId)}/close-lost`,
        {
          method: "POST",
          csrfToken,
          idempotencyKey: idempotencyKey(),
          body: { reason, expectedVersion },
        },
      ).then(normalizeLeadCloseLostResponse),
    transitionLead: ({
      organizationId,
      leadId,
      to,
      expectedVersion,
      csrfToken,
    }) =>
      request<unknown>(
        `/organizations/${encodeURIComponent(organizationId)}/leads/${encodeURIComponent(leadId)}/transition`,
        {
          method: "POST",
          csrfToken,
          idempotencyKey: idempotencyKey(),
          body: { to, expectedVersion },
        },
      ).then(normalizeLeadTransitionResponse),
    createLeadNote: ({ organizationId, leadId, body, csrfToken }) =>
      request<unknown>(
        `/organizations/${encodeURIComponent(organizationId)}/leads/${encodeURIComponent(leadId)}/notes`,
        {
          method: "POST",
          csrfToken,
          idempotencyKey: idempotencyKey(),
          body: { body },
        },
      ).then(normalizeLeadNoteCommandResponse),
    createLeadTask: ({ organizationId, leadId, title, dueAt, csrfToken }) =>
      request<unknown>(
        `/organizations/${encodeURIComponent(organizationId)}/leads/${encodeURIComponent(leadId)}/tasks`,
        {
          method: "POST",
          csrfToken,
          idempotencyKey: idempotencyKey(),
          body: { title, dueAt },
        },
      ).then(normalizeLeadTaskCommandResponse),
    completeLeadTask: ({
      organizationId,
      leadId,
      taskId,
      expectedVersion,
      csrfToken,
    }) =>
      request<unknown>(
        `/organizations/${encodeURIComponent(organizationId)}/leads/${encodeURIComponent(leadId)}/tasks/${encodeURIComponent(taskId)}/complete`,
        {
          method: "POST",
          csrfToken,
          idempotencyKey: idempotencyKey(),
          body: { expectedVersion },
        },
      ).then(normalizeLeadTaskCommandResponse),
    rescheduleLeadTask: ({
      organizationId,
      leadId,
      taskId,
      dueAt,
      expectedVersion,
      csrfToken,
    }) =>
      request<unknown>(
        `/organizations/${encodeURIComponent(organizationId)}/leads/${encodeURIComponent(leadId)}/tasks/${encodeURIComponent(taskId)}/reschedule`,
        {
          method: "POST",
          csrfToken,
          idempotencyKey: idempotencyKey(),
          body: { dueAt, expectedVersion },
        },
      ).then(normalizeLeadTaskCommandResponse),
    getSession: () => request<SessionResponse>("/auth/session"),
    getAutomationRules: ({ organizationId }) =>
      request<unknown>(
        `/organizations/${encodeURIComponent(organizationId)}/automation/rules`,
      ).then(normalizeAutomationRules),
    getAutomationFailedJobs: ({ organizationId }) =>
      request<unknown>(
        `/organizations/${encodeURIComponent(organizationId)}/automation/rules`,
      )
        .then(normalizeAutomationRules)
        .then(({ failedJobs }) => ({ jobs: failedJobs })),
  };
}

function resolveUrl(baseUrl: string, path: string): string {
  if (/^https?:\/\//i.test(path)) return path;
  return `${baseUrl.replace(/\/$/, "")}/${path.replace(/^\//, "")}`;
}

async function readJson(response: Response): Promise<unknown> {
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().includes("application/json")) return undefined;
  try {
    return await response.json();
  } catch {
    return undefined;
  }
}

function toApiError(
  response: Response,
  payload: unknown,
  requestId: string,
): ApiError {
  const body = isRecord(payload) ? payload : {};
  const message =
    typeof body.message === "string"
      ? body.message
      : "The request could not be completed";
  const code =
    typeof body.code === "string" ? body.code : `HTTP_${response.status}`;
  const details = isRecord(body.details) ? body.details : undefined;
  return new ApiError({
    status: response.status,
    code,
    message,
    details,
    requestId,
  });
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
