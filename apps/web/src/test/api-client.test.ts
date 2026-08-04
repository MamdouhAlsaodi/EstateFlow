import assert from "node:assert/strict";
import test from "node:test";
import {
  ApiError,
  createApiClient,
  normalizeLeadBoardListResponse,
} from "../lib/api-client/index.js";
import {
  LeadStage,
  serializeLeadBoardListQuery,
} from "../lib/api-client/leads.js";
import { createSessionCsrfProvider, createSessionHelper } from "../lib/api-client/session.js";

function response(body: unknown, init: ResponseInit = {}) {
  return new Response(body === undefined ? undefined : JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
    ...init,
  });
}

test("serializes supported lead board query values and rejects unsupported values", () => {
  assert.equal(
    serializeLeadBoardListQuery({ stage: LeadStage.CONTACTED, cursor: "lead-2", limit: 25 }),
    "?stage=CONTACTED&cursor=lead-2&limit=25",
  );
  assert.equal(serializeLeadBoardListQuery({}), "");
  assert.throws(() => serializeLeadBoardListQuery({ stage: "ARCHIVED" as never }));
  assert.throws(() => serializeLeadBoardListQuery({ limit: 0 }));
  assert.throws(() => serializeLeadBoardListQuery({ cursor: "" }));
  assert.throws(() => serializeLeadBoardListQuery({ unsupported: "x" } as never));
});

test("uses a relative same-origin base, credentials include, request ID, and CSRF header", async () => {
  const calls: Request[] = [];
  const client = createApiClient({
    fetch: async (input, init) => {
      calls.push(new Request(new URL(input as string | URL, "http://localhost"), init));
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
  const client = createApiClient({ fetch: async () => { called = true; return response({}); } });
  await assert.rejects(() => client.request("/organizations", { method: "POST" }), /CSRF token/);
  assert.equal(called, false);
});

test("maps safe JSON errors into typed ApiError and preserves request ID", async () => {
  const client = createApiClient({
    fetch: async () => response({ statusCode: 403, code: "FORBIDDEN", message: "Denied", details: { safe: true } }, { status: 403 }),
    requestId: () => "request-456",
  });
  await assert.rejects(
    () => client.request("/organizations/org-1"),
    (error: unknown) => error instanceof ApiError && error.status === 403 && error.code === "FORBIDDEN" && error.requestId === "request-456" && error.details?.safe === true,
  );
});

test("normalizes the typed lead board response and rejects unsupported DTO values", () => {
  const normalized = normalizeLeadBoardListResponse({
    items: [{ id: "lead-1", organizationId: "org-1", ownerId: "user-1", stage: "NEW", nextAction: "Call", source: "WEB", utm: {}, version: 1, createdAt: "2026-08-04T00:00:00.000Z", updatedAt: "2026-08-04T00:00:00.000Z" }],
    nextCursor: null,
  });
  assert.equal(normalized.items[0]?.stage, LeadStage.NEW);
  assert.throws(() => normalizeLeadBoardListResponse({ items: [], nextCursor: 42 }));
  assert.throws(() => normalizeLeadBoardListResponse({ items: [{ stage: "ARCHIVED" }], nextCursor: null }));
});

test("rejects unknown root properties in lead board responses", () => {
  assert.throws(() => normalizeLeadBoardListResponse({ items: [], nextCursor: null, total: 1 }));
});

test("rejects unknown lead item properties in lead board responses", () => {
  assert.throws(() => normalizeLeadBoardListResponse({
    items: [{ id: "lead-1", organizationId: "org-1", ownerId: "user-1", stage: "NEW", nextAction: "Call", source: "WEB", utm: {}, version: 1, createdAt: "2026-08-04T00:00:00.000Z", updatedAt: "2026-08-04T00:00:00.000Z", email: "lead@example.com" }],
    nextCursor: null,
  }));
});

test("rejects unknown UTM properties in lead board responses", () => {
  assert.throws(() => normalizeLeadBoardListResponse({
    items: [{ id: "lead-1", organizationId: "org-1", ownerId: "user-1", stage: "NEW", nextAction: "Call", source: "WEB", utm: { source: "newsletter", term: "spring", referrer: "unexpected" }, version: 1, createdAt: "2026-08-04T00:00:00.000Z", updatedAt: "2026-08-04T00:00:00.000Z" }],
    nextCursor: null,
  }));
});

test("gets the session with credentials and retains only the current CSRF token in memory", async () => {
  const calls: Request[] = [];
  const client = createApiClient({
    fetch: async (input, init) => {
      calls.push(new Request(new URL(input as string | URL, "http://localhost"), init));
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
    (error: unknown) => error instanceof ApiError && error.status === 401 && !error.message.includes("csrf-123"),
  );
  assert.equal(session.getCsrfToken(), null);
});

test("sends the exact lead transition DTO and fresh idempotency key", async () => {
  const calls: Request[] = [];
  let key = 0;
  const client = createApiClient({
    fetch: async (input, init) => {
      calls.push(new Request(new URL(input as string | URL, "http://localhost"), init));
      return response({ kind: "ok", lead: { id: "lead-1", organizationId: "org-1", ownerId: "user-1", stage: "CONTACTED", nextAction: "Call", source: "WEB", utm: {}, version: 2, createdAt: "2026-08-04T00:00:00.000Z", updatedAt: "2026-08-04T00:00:00.000Z" }, timelineEvents: [] });
    },
    idempotencyKey: () => `key-${++key}`,
  });

  await client.transitionLead({ organizationId: "org-1", leadId: "lead-1", to: LeadStage.CONTACTED, expectedVersion: 1, csrfToken: "csrf-1" });
  await client.transitionLead({ organizationId: "org-1", leadId: "lead-1", to: LeadStage.NEW, expectedVersion: 2, csrfToken: "csrf-1" });

  assert.equal(calls[0]?.url, "http://localhost/api/organizations/org-1/leads/lead-1/transition");
  assert.deepEqual(await calls[0]?.json(), { to: "CONTACTED", expectedVersion: 1 });
  assert.equal(calls[0]?.headers.get("idempotency-key"), "key-1");
  assert.equal(calls[0]?.headers.get("x-csrf-token"), "csrf-1");
  assert.notEqual(calls[0]?.headers.get("idempotency-key"), calls[1]?.headers.get("idempotency-key"));
});

test("SessionCsrfProvider clears rejected tokens and reacquires only after explicit action", async () => {
  let sessionRequests = 0;
  const client = createApiClient({ fetch: async () => { sessionRequests += 1; return response({ id: "user-1", verified: true, csrfToken: `csrf-memory-${sessionRequests}` }); } });
  const provider = createSessionCsrfProvider(client);
  assert.equal(await provider.getToken(), "csrf-memory-1");
  assert.equal(await provider.getToken(), "csrf-memory-1");
  assert.equal(sessionRequests, 1);
  provider.clear();
  assert.equal(sessionRequests, 1);
  assert.equal(await provider.getToken(), "csrf-memory-2");
  assert.equal(sessionRequests, 2);

  const denied = createSessionCsrfProvider(createApiClient({ fetch: async () => response({ message: "denied" }, { status: 403 }) }));
  await assert.rejects(() => denied.getToken(), (error: unknown) => error instanceof ApiError && error.status === 403 && !error.message.includes("csrf"));
});

test("does not persist tokens in browser storage", () => {
  const client = createApiClient({ fetch: async () => response({}) });
  assert.equal("localStorage" in client, false);
  assert.equal("sessionStorage" in client, false);
});
