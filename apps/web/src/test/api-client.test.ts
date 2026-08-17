import assert from "node:assert/strict";
import test from "node:test";
import {
  ApiError,
  createApiClient,
  normalizeLeadBoardListResponse,
  normalizeLeadWorkspaceResponse,
  normalizeLeadCloseWonResponse,
  normalizeLeadCloseLostResponse,
} from "../lib/api-client/index.js";
import {
  LeadStage,
  serializeLeadBoardListQuery,
} from "../lib/api-client/leads.js";
import { createCommissionAdapter } from "../lib/api-client/commission.js";

const workspaceResponse = {
  lead: {
    id: "lead/1",
    ownerId: "user-1",
    stage: "NEW",
    nextAction: "Call",
    source: "WEB",
    utm: {},
    version: 1,
    createdAt: "2026-08-04T00:00:00.000Z",
    updatedAt: "2026-08-04T00:00:00.000Z",
  },
  timeline: {
    items: [
      {
        id: "event-1",
        type: "LEAD_CREATED",
        occurredAt: "2026-08-04T00:00:00.000Z",
        data: { stage: "NEW" },
      },
    ],
    nextCursor: null,
  },
  notes: [
    {
      id: "note-1",
      body: "Private note",
      createdAt: "2026-08-04T00:00:00.000Z",
    },
  ],
  tasks: [
    {
      id: "task-1",
      title: "Call",
      dueAt: "2026-08-05T00:00:00.000Z",
      status: "OPEN",
      createdAt: "2026-08-04T00:00:00.000Z",
      completedAt: null,
      version: 1,
    },
  ],
};
import {
  createSessionCsrfProvider,
  createSessionHelper,
} from "../lib/api-client/session.js";

function response(body: unknown, init: ResponseInit = {}) {
  return new Response(body === undefined ? undefined : JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
    ...init,
  });
}

test("serializes supported lead board query values and rejects unsupported values", () => {
  assert.equal(
    serializeLeadBoardListQuery({
      stage: LeadStage.CONTACTED,
      cursor: "lead-2",
      limit: 25,
    }),
    "?stage=CONTACTED&cursor=lead-2&limit=25",
  );
  assert.equal(serializeLeadBoardListQuery({}), "");
  assert.throws(() =>
    serializeLeadBoardListQuery({ stage: "ARCHIVED" as never }),
  );
  assert.throws(() => serializeLeadBoardListQuery({ limit: 0 }));
  assert.throws(() => serializeLeadBoardListQuery({ cursor: "" }));
  assert.throws(() =>
    serializeLeadBoardListQuery({ unsupported: "x" } as never),
  );
});

test("uses a relative same-origin base, credentials include, request ID, and CSRF header", async () => {
  const calls: Request[] = [];
  const client = createApiClient({
    fetch: async (input, init) => {
      calls.push(
        new Request(new URL(input as string | URL, "http://localhost"), init),
      );
      return response({ ok: true });
    },
    requestId: () => "request-123",
  });

  await client.request("/organizations/org-1/leads", {
    method: "POST",
    csrfToken: "csrf-123",
    body: { name: "demo" },
  });

  assert.equal(calls[0]?.url, "http://localhost/api/organizations/org-1/leads");
  assert.equal(calls[0]?.credentials, "include");
  assert.equal(calls[0]?.headers.get("x-request-id"), "request-123");
  assert.equal(calls[0]?.headers.get("x-csrf-token"), "csrf-123");
  assert.equal(calls[0]?.headers.get("content-type"), "application/json");
});

test("refuses unsafe requests without a caller-supplied CSRF token", async () => {
  let called = false;
  const client = createApiClient({
    fetch: async () => {
      called = true;
      return response({});
    },
  });
  await assert.rejects(
    () => client.request("/organizations", { method: "POST" }),
    /CSRF token/,
  );
  assert.equal(called, false);
});

test("maps safe JSON errors into typed ApiError and preserves request ID", async () => {
  const client = createApiClient({
    fetch: async () =>
      response(
        {
          statusCode: 403,
          code: "FORBIDDEN",
          message: "Denied",
          details: { safe: true },
        },
        { status: 403 },
      ),
    requestId: () => "request-456",
  });
  await assert.rejects(
    () => client.request("/organizations/org-1"),
    (error: unknown) =>
      error instanceof ApiError &&
      error.status === 403 &&
      error.code === "FORBIDDEN" &&
      error.requestId === "request-456" &&
      error.details?.safe === true,
  );
});

test("normalizes the typed lead board response and rejects unsupported DTO values", () => {
  const normalized = normalizeLeadBoardListResponse({
    items: [
      {
        id: "lead-1",
        organizationId: "org-1",
        ownerId: "user-1",
        stage: "NEW",
        nextAction: "Call",
        source: "WEB",
        utm: {},
        version: 1,
        createdAt: "2026-08-04T00:00:00.000Z",
        updatedAt: "2026-08-04T00:00:00.000Z",
      },
    ],
    nextCursor: null,
  });
  assert.equal(normalized.items[0]?.stage, LeadStage.NEW);
  assert.throws(() =>
    normalizeLeadBoardListResponse({ items: [], nextCursor: 42 }),
  );
  assert.throws(() =>
    normalizeLeadBoardListResponse({
      items: [{ stage: "ARCHIVED" }],
      nextCursor: null,
    }),
  );
});

test("rejects unknown root properties in lead board responses", () => {
  assert.throws(() =>
    normalizeLeadBoardListResponse({ items: [], nextCursor: null, total: 1 }),
  );
});

test("rejects unknown lead item properties in lead board responses", () => {
  assert.throws(() =>
    normalizeLeadBoardListResponse({
      items: [
        {
          id: "lead-1",
          organizationId: "org-1",
          ownerId: "user-1",
          stage: "NEW",
          nextAction: "Call",
          source: "WEB",
          utm: {},
          version: 1,
          createdAt: "2026-08-04T00:00:00.000Z",
          updatedAt: "2026-08-04T00:00:00.000Z",
          email: "lead@example.com",
        },
      ],
      nextCursor: null,
    }),
  );
});

test("rejects unknown UTM properties in lead board responses", () => {
  assert.throws(() =>
    normalizeLeadBoardListResponse({
      items: [
        {
          id: "lead-1",
          organizationId: "org-1",
          ownerId: "user-1",
          stage: "NEW",
          nextAction: "Call",
          source: "WEB",
          utm: { source: "newsletter", term: "spring", referrer: "unexpected" },
          version: 1,
          createdAt: "2026-08-04T00:00:00.000Z",
          updatedAt: "2026-08-04T00:00:00.000Z",
        },
      ],
      nextCursor: null,
    }),
  );
});

test("gets the session with credentials and retains only the current CSRF token in memory", async () => {
  const calls: Request[] = [];
  const client = createApiClient({
    fetch: async (input, init) => {
      calls.push(
        new Request(new URL(input as string | URL, "http://localhost"), init),
      );
      return response({ id: "user-1", verified: true, csrfToken: "csrf-123" });
    },
  });
  const session = createSessionHelper(client);

  assert.equal(session.getCsrfToken(), null);
  assert.deepEqual(await session.refresh(), {
    id: "user-1",
    verified: true,
    csrfToken: "csrf-123",
  });
  assert.equal(session.getCsrfToken(), "csrf-123");
  assert.equal(calls[0]?.url, "http://localhost/api/auth/session");
  assert.equal(calls[0]?.credentials, "include");
  assert.equal("localStorage" in session, false);
  assert.equal("sessionStorage" in session, false);

  session.clear();
  assert.equal(session.getCsrfToken(), null);
});

test("refresh propagates token acquisition errors without exposing a token", async () => {
  const client = createApiClient({
    fetch: async () => response({ message: "session denied" }, { status: 401 }),
  });
  const session = createSessionHelper(client);

  await assert.rejects(
    () => session.refresh(),
    (error: unknown) =>
      error instanceof ApiError &&
      error.status === 401 &&
      !error.message.includes("csrf-123"),
  );
  assert.equal(session.getCsrfToken(), null);
});

test("sends the exact lead transition DTO and fresh idempotency key", async () => {
  const calls: Request[] = [];
  let key = 0;
  const client = createApiClient({
    fetch: async (input, init) => {
      calls.push(
        new Request(new URL(input as string | URL, "http://localhost"), init),
      );
      return response({
        kind: "ok",
        lead: {
          id: "lead-1",
          organizationId: "org-1",
          ownerId: "user-1",
          stage: "CONTACTED",
          nextAction: "Call",
          source: "WEB",
          utm: {},
          version: 2,
          createdAt: "2026-08-04T00:00:00.000Z",
          updatedAt: "2026-08-04T00:00:00.000Z",
        },
        timelineEvents: [],
      });
    },
    idempotencyKey: () => `key-${++key}`,
  });

  await client.transitionLead({
    organizationId: "org-1",
    leadId: "lead-1",
    to: LeadStage.CONTACTED,
    expectedVersion: 1,
    csrfToken: "csrf-1",
  });
  await client.transitionLead({
    organizationId: "org-1",
    leadId: "lead-1",
    to: LeadStage.NEW,
    expectedVersion: 2,
    csrfToken: "csrf-1",
  });

  assert.equal(
    calls[0]?.url,
    "http://localhost/api/organizations/org-1/leads/lead-1/transition",
  );
  assert.deepEqual(await calls[0]?.json(), {
    to: "CONTACTED",
    expectedVersion: 1,
  });
  assert.equal(calls[0]?.headers.get("idempotency-key"), "key-1");
  assert.equal(calls[0]?.headers.get("x-csrf-token"), "csrf-1");
  assert.notEqual(
    calls[0]?.headers.get("idempotency-key"),
    calls[1]?.headers.get("idempotency-key"),
  );
});

test("SessionCsrfProvider clears rejected tokens and reacquires only after explicit action", async () => {
  let sessionRequests = 0;
  const client = createApiClient({
    fetch: async () => {
      sessionRequests += 1;
      return response({
        id: "user-1",
        verified: true,
        csrfToken: `csrf-memory-${sessionRequests}`,
      });
    },
  });
  const provider = createSessionCsrfProvider(client);
  assert.equal(await provider.getToken(), "csrf-memory-1");
  assert.equal(await provider.getToken(), "csrf-memory-1");
  assert.equal(sessionRequests, 1);
  provider.clear();
  assert.equal(sessionRequests, 1);
  assert.equal(await provider.getToken(), "csrf-memory-2");
  assert.equal(sessionRequests, 2);

  const denied = createSessionCsrfProvider(
    createApiClient({
      fetch: async () => response({ message: "denied" }, { status: 403 }),
    }),
  );
  await assert.rejects(
    () => denied.getToken(),
    (error: unknown) =>
      error instanceof ApiError &&
      error.status === 403 &&
      !error.message.includes("csrf"),
  );
});

test("normalizes the closed lead workspace DTO without organizationId", () => {
  assert.deepEqual(
    normalizeLeadWorkspaceResponse(workspaceResponse),
    workspaceResponse,
  );
  assert.throws(() =>
    normalizeLeadWorkspaceResponse({
      ...workspaceResponse,
      organizationId: "org-1",
    }),
  );
  assert.throws(() =>
    normalizeLeadWorkspaceResponse({
      ...workspaceResponse,
      lead: { ...workspaceResponse.lead, organizationId: "org-1" },
    }),
  );
  assert.throws(() =>
    normalizeLeadWorkspaceResponse({
      ...workspaceResponse,
      timeline: { ...workspaceResponse.timeline, extra: true },
    }),
  );
  assert.throws(() =>
    normalizeLeadWorkspaceResponse({
      ...workspaceResponse,
      timeline: {
        items: [
          {
            ...workspaceResponse.timeline.items[0],
            data: { stage: "NEW", extra: "unexpected" },
          },
        ],
        nextCursor: null,
      },
    }),
  );
  assert.throws(() =>
    normalizeLeadWorkspaceResponse({
      ...workspaceResponse,
      notes: [{ ...workspaceResponse.notes[0], extra: true }],
    }),
  );
  assert.throws(() =>
    normalizeLeadWorkspaceResponse({
      ...workspaceResponse,
      tasks: [{ ...workspaceResponse.tasks[0], status: "DONE" }],
    }),
  );
  assert.throws(() =>
    normalizeLeadWorkspaceResponse({
      ...workspaceResponse,
      tasks: [{ ...workspaceResponse.tasks[0], version: 0 }],
    }),
  );
  assert.throws(() =>
    normalizeLeadWorkspaceResponse({
      ...workspaceResponse,
      lead: { ...workspaceResponse.lead, createdAt: "not-a-date" },
    }),
  );
});

test("sends exact workspace paths, query, and command DTOs with fresh browser headers", async () => {
  const calls: Request[] = [];
  let key = 0;
  const client = createApiClient({
    fetch: async (input, init) => {
      calls.push(
        new Request(new URL(input as string | URL, "http://localhost"), init),
      );
      const url = String(input);
      if (url.endsWith("/notes"))
        return response({
          kind: "ok",
          note: workspaceResponse.notes[0],
          timelineEvent: workspaceResponse.timeline.items[0],
        });
      if (url.endsWith("/tasks"))
        return response({
          kind: "ok",
          task: workspaceResponse.tasks[0],
          timelineEvent: workspaceResponse.timeline.items[0],
        });
      if (url.endsWith("/complete") || url.endsWith("/reschedule"))
        return response({
          kind: "ok",
          task: workspaceResponse.tasks[0],
          timelineEvent: workspaceResponse.timeline.items[0],
        });
      return response(workspaceResponse);
    },
    idempotencyKey: () => `fresh-${++key}`,
  });
  await client.getLeadWorkspace({
    organizationId: "org/1",
    leadId: "lead/1",
    query: { cursor: "next page", limit: 25 },
  });
  await client.createLeadNote({
    organizationId: "org/1",
    leadId: "lead/1",
    body: "Note",
    csrfToken: "csrf-1",
  });
  await client.createLeadTask({
    organizationId: "org/1",
    leadId: "lead/1",
    title: "Call",
    dueAt: "2026-08-05T00:00:00.000Z",
    csrfToken: "csrf-1",
  });
  await client.completeLeadTask({
    organizationId: "org/1",
    leadId: "lead/1",
    taskId: "task/1",
    expectedVersion: 1,
    csrfToken: "csrf-1",
  });
  await client.rescheduleLeadTask({
    organizationId: "org/1",
    leadId: "lead/1",
    taskId: "task/1",
    dueAt: "2026-08-06T00:00:00.000Z",
    expectedVersion: 2,
    csrfToken: "csrf-1",
  });
  assert.deepEqual(
    calls.map((call) => [call.url, call.method]),
    [
      [
        "http://localhost/api/organizations/org%2F1/leads/lead%2F1?cursor=next+page&limit=25",
        "GET",
      ],
      [
        "http://localhost/api/organizations/org%2F1/leads/lead%2F1/notes",
        "POST",
      ],
      [
        "http://localhost/api/organizations/org%2F1/leads/lead%2F1/tasks",
        "POST",
      ],
      [
        "http://localhost/api/organizations/org%2F1/leads/lead%2F1/tasks/task%2F1/complete",
        "POST",
      ],
      [
        "http://localhost/api/organizations/org%2F1/leads/lead%2F1/tasks/task%2F1/reschedule",
        "POST",
      ],
    ],
  );
  assert.deepEqual(await calls[1]?.json(), { body: "Note" });
  assert.deepEqual(await calls[2]?.json(), {
    title: "Call",
    dueAt: "2026-08-05T00:00:00.000Z",
  });
  assert.deepEqual(await calls[3]?.json(), { expectedVersion: 1 });
  assert.deepEqual(await calls[4]?.json(), {
    dueAt: "2026-08-06T00:00:00.000Z",
    expectedVersion: 2,
  });
  for (const [index, call] of calls.entries()) {
    assert.equal(call.credentials, "include");
    assert.equal(
      call.headers.get("x-csrf-token"),
      index === 0 ? null : "csrf-1",
    );
    assert.equal(
      call.headers.get("idempotency-key"),
      index === 0 ? null : `fresh-${index}`,
    );
  }
});

const closedLead = {
  ...workspaceResponse.lead,
  organizationId: "org-1",
  stage: "CLOSED_WON",
  version: 2,
};
const closeWonResponse = {
  kind: "ok",
  lead: closedLead,
  deal: {
    id: "deal-1",
    organizationId: "org-1",
    leadId: "lead-1",
    propertyId: "property-1",
    brokerId: "broker-1",
    status: "OPEN",
    version: 1,
    createdAt: "2026-08-04T00:00:00.000Z",
    updatedAt: "2026-08-04T00:00:00.000Z",
  },
  timelineEvent: {
    type: "LEAD_CLOSED_WON",
    leadId: "lead-1",
    organizationId: "org-1",
    occurredAt: "2026-08-04T00:00:00.000Z",
    data: { dealId: "deal-1", propertyId: "property-1", brokerId: "broker-1" },
  },
  event: {
    schemaVersion: 1,
    organizationId: "org-1",
    dealId: "deal-1",
    leadId: "lead-1",
    propertyId: "property-1",
    brokerId: "broker-1",
    occurredAt: "2026-08-04T00:00:00.000Z",
  },
};
const closeLostResponse = {
  kind: "ok",
  lead: {
    ...workspaceResponse.lead,
    organizationId: "org-1",
    stage: "CLOSED_LOST",
    version: 2,
  },
  timelineEvent: {
    type: "LEAD_CLOSED_LOST",
    leadId: "lead-1",
    organizationId: "org-1",
    occurredAt: "2026-08-04T00:00:00.000Z",
    data: { reason: "No budget" },
  },
};

test("strictly normalizes the accepted close command response and terminal stage", () => {
  assert.equal(
    normalizeLeadCloseWonResponse(closeWonResponse).lead.stage,
    "CLOSED_WON",
  );
  assert.equal(
    normalizeLeadCloseLostResponse(closeLostResponse).lead.stage,
    "CLOSED_LOST",
  );
  assert.throws(() =>
    normalizeLeadCloseWonResponse({ ...closeWonResponse, persistence: true }),
  );
  assert.throws(() =>
    normalizeLeadCloseLostResponse({
      ...closeLostResponse,
      lead: { ...closeLostResponse.lead, stage: "QUALIFIED" },
    }),
  );
  assert.throws(() =>
    normalizeLeadCloseWonResponse({
      ...closeWonResponse,
      deal: { ...closeWonResponse.deal, secret: true },
    }),
  );
});

test("sends exact close command paths, bodies, and fresh browser headers", async () => {
  const calls: Request[] = [];
  let key = 0;
  const client = createApiClient({
    fetch: async (input, init) => {
      calls.push(
        new Request(new URL(input as string | URL, "http://localhost"), init),
      );
      return response(
        calls.length === 1 ? closeWonResponse : closeLostResponse,
      );
    },
    requestId: () => "request-close",
    idempotencyKey: () => `close-${++key}`,
  });
  await client.closeLeadWon({
    organizationId: "org/1",
    leadId: "lead?2",
    expectedVersion: 1,
    csrfToken: "csrf-1",
    propertyId: "property/1",
    brokerId: "broker/2",
  });
  await client.closeLeadLost({
    organizationId: "org/1",
    leadId: "lead?2",
    expectedVersion: 2,
    csrfToken: "csrf-1",
    reason: "No budget",
  });
  assert.deepEqual(
    calls.map((call) => [
      call.url,
      call.method,
      call.headers.get("idempotency-key"),
    ]),
    [
      [
        "http://localhost/api/organizations/org%2F1/leads/lead%3F2/close-won",
        "POST",
        "close-1",
      ],
      [
        "http://localhost/api/organizations/org%2F1/leads/lead%3F2/close-lost",
        "POST",
        "close-2",
      ],
    ],
  );
  assert.deepEqual(await calls[0]?.json(), {
    propertyId: "property/1",
    brokerId: "broker/2",
    expectedVersion: 1,
  });
  assert.deepEqual(await calls[1]?.json(), {
    reason: "No budget",
    expectedVersion: 2,
  });
  for (const call of calls) {
    assert.equal(call.credentials, "include");
    assert.equal(call.headers.get("x-csrf-token"), "csrf-1");
    assert.equal(call.headers.get("x-request-id"), "request-close");
  }
});

test("sends exact commission commands with CSRF and no idempotency header", async () => {
  const calls: Request[] = [];
  const client = createApiClient({
    fetch: async (input, init) => {
      calls.push(
        new Request(new URL(input as string | URL, "http://localhost"), init),
      );
      return response({ kind: "ok" });
    },
    requestId: () => "commission-request",
  });
  const commission = createCommissionAdapter(client);
  await commission.createCommissionPlanVersion(
    {
      organizationId: "11111111-1111-4111-8111-111111111101",
      csrfToken: "csrf-1",
    },
    { version: 1 },
  );
  await commission.captureCommissionableValue(
    {
      organizationId: "11111111-1111-4111-8111-111111111101",
      dealId: "11111111-1111-4111-8111-111111111102",
      csrfToken: "csrf-1",
    },
    {
      valueId: "11111111-1111-4111-8111-111111111111",
      amountMinor: "1",
      currency: "USD",
      capturedAt: "2026-08-14T12:00:00.000Z",
    },
  );
  await commission.createExpectedAccrual(
    {
      organizationId: "11111111-1111-4111-8111-111111111101",
      dealId: "11111111-1111-4111-8111-111111111102",
      csrfToken: "csrf-1",
    },
    {
      accrualId: "11111111-1111-4111-8111-111111111112",
      commissionableValueId: "11111111-1111-4111-8111-111111111113",
      commissionPlanVersionId: "11111111-1111-4111-8111-111111111114",
      dealClosedWonEventId: "11111111-1111-4111-8111-111111111115",
    },
  );
  assert.deepEqual(
    calls.map((call) => [call.url, call.method]),
    [
      [
        "http://localhost/api/organizations/11111111-1111-4111-8111-111111111101/finance/commission-plan-versions",
        "POST",
      ],
      [
        "http://localhost/api/organizations/11111111-1111-4111-8111-111111111101/finance/deals/11111111-1111-4111-8111-111111111102/commissionable-values",
        "POST",
      ],
      [
        "http://localhost/api/organizations/11111111-1111-4111-8111-111111111101/finance/deals/11111111-1111-4111-8111-111111111102/expected-commissions",
        "POST",
      ],
    ],
  );
  assert.deepEqual(await calls[0]?.json(), { version: 1 });
  assert.deepEqual(await calls[1]?.json(), {
    valueId: "11111111-1111-4111-8111-111111111111",
    amountMinor: "1",
    currency: "USD",
    capturedAt: "2026-08-14T12:00:00.000Z",
  });
  assert.equal(calls[0]?.headers.get("x-csrf-token"), "csrf-1");
  assert.equal(calls[0]?.headers.get("idempotency-key"), null);
});

test("rejects invalid commission DTOs before fetch", async () => {
  let called = false;
  const client = createApiClient({
    fetch: async () => {
      called = true;
      return response({});
    },
  });
  const commission = createCommissionAdapter(client);
  assert.throws(() =>
    commission.createCommissionPlanVersion(
      { organizationId: "org", csrfToken: "csrf" },
      { version: 1, rateBps: 500 } as never,
    ),
  );
  assert.throws(() =>
    commission.captureCommissionableValue(
      { organizationId: "org", dealId: "deal", csrfToken: "csrf" },
      { valueId: "bad", amountMinor: "1", currency: "USD", capturedAt: "bad" },
    ),
  );
  assert.throws(() =>
    commission.createExpectedAccrual(
      { organizationId: "org", dealId: "deal", csrfToken: "csrf" },
      {
        accrualId: "bad",
        commissionableValueId: "bad",
        commissionPlanVersionId: "bad",
        dealClosedWonEventId: "bad",
      },
    ),
  );
  assert.equal(called, false);
});

test("rejects invalid commission contexts before fetch", async () => {
  let called = false;
  const client = createApiClient({
    fetch: async () => {
      called = true;
      return response({});
    },
  });
  const commission = createCommissionAdapter(client);
  assert.throws(
    () =>
      commission.createCommissionPlanVersion(
        { organizationId: "not-a-uuid", csrfToken: "csrf" },
        { version: 1 },
      ),
    TypeError,
  );
  assert.throws(
    () =>
      commission.captureCommissionableValue(
        {
          organizationId: "11111111-1111-4111-8111-111111111101",
          dealId: "not-a-uuid",
          csrfToken: "csrf",
        },
        {
          valueId: "11111111-1111-4111-8111-111111111111",
          amountMinor: "1",
          currency: "USD",
          capturedAt: "2026-08-14T12:00:00.000Z",
        },
      ),
    TypeError,
  );
  assert.throws(
    () =>
      commission.createExpectedAccrual(
        {
          organizationId: "not-a-uuid",
          dealId: "11111111-1111-4111-8111-111111111102",
          csrfToken: "csrf",
        },
        {
          accrualId: "11111111-1111-4111-8111-111111111112",
          commissionableValueId: "11111111-1111-4111-8111-111111111113",
          commissionPlanVersionId: "11111111-1111-4111-8111-111111111114",
          dealClosedWonEventId: "11111111-1111-4111-8111-111111111115",
        },
      ),
    TypeError,
  );
  assert.equal(called, false);
});

test("does not persist tokens in browser storage", () => {
  const client = createApiClient({ fetch: async () => response({}) });
  assert.equal("localStorage" in client, false);
  assert.equal("sessionStorage" in client, false);
});
