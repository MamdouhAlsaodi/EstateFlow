import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { ApiError } from "../lib/api-client/index.js";
import { LeadStage } from "../lib/api-client/leads.js";
import {
  appendLeadBoardPage,
  getLeadBoardErrorState,
  isLeadMutationSessionRejection,
  getAllowedLeadTransitions,
  replaceLeadAfterTransition,
  groupLeadsByStage,
  LEAD_STAGE_LABELS,
} from "../features/leads/lead-board-model.js";

test("groups leads into exactly the four approved stages", () => {
  const grouped = groupLeadsByStage([
    { id: "1", organizationId: "org", ownerId: "u", stage: LeadStage.QUALIFIED, nextAction: "عرض", source: "WEB", utm: {}, version: 1, createdAt: "2026-08-04T00:00:00Z", updatedAt: "2026-08-04T00:00:00Z" },
    { id: "2", organizationId: "org", ownerId: "u", stage: LeadStage.NEW, nextAction: "اتصال", source: "WEB", utm: {}, version: 1, createdAt: "2026-08-04T00:00:00Z", updatedAt: "2026-08-04T00:00:00Z" },
  ]);

  assert.deepEqual(Object.keys(grouped), ["NEW", "CONTACTED", "QUALIFIED", "NURTURING"]);
  assert.equal(grouped.NEW.length, 1);
  assert.equal(grouped.QUALIFIED.length, 1);
  assert.equal(LEAD_STAGE_LABELS.NEW, "جديد");
});

test("appends a paginated page without changing lead fields", () => {
  const first = { id: "1", organizationId: "org", ownerId: "u", stage: LeadStage.NEW, nextAction: "اتصال", source: "WEB", utm: {}, version: 1, createdAt: "2026-08-04T00:00:00Z", updatedAt: "2026-08-04T00:00:00Z" };
  const second = { ...first, id: "2", stage: LeadStage.CONTACTED };
  assert.deepEqual(appendLeadBoardPage([first], [second]), [first, second]);
});

test("accepts only a matching organization-scoped returned lead after transition", () => {
  const current = { id: "lead-1", organizationId: "org-1", ownerId: "u", stage: LeadStage.NEW, nextAction: "اتصال", source: "WEB", utm: {}, version: 1, createdAt: "2026-08-04T00:00:00Z", updatedAt: "2026-08-04T00:00:00Z" };
  const returned = { ...current, stage: LeadStage.CONTACTED, version: 2 };
  assert.deepEqual(replaceLeadAfterTransition([current], "org-1", "lead-1", returned), [returned]);
  assert.deepEqual(replaceLeadAfterTransition([current], "other-org", "lead-1", returned), [current]);
});

test("maps read errors safely and gives mutation session errors precedence", () => {
  const unauthorized = new ApiError({ status: 401, code: "UNAUTHORIZED", message: "secret" });
  const forbidden = new ApiError({ status: 403, code: "FORBIDDEN", message: "secret" });
  assert.equal(getLeadBoardErrorState(unauthorized).kind, "unauthorized");
  assert.equal(getLeadBoardErrorState(forbidden).kind, "forbidden");
  assert.equal(getLeadBoardErrorState(unauthorized, { mutation: true }).kind, "csrf");
  assert.equal(getLeadBoardErrorState(forbidden, { mutation: true }).kind, "csrf");
  assert.equal(isLeadMutationSessionRejection(new ApiError({ status: 422, code: "CSRF_REJECTED", message: "secret" })), true);
  assert.equal(getLeadBoardErrorState(new ApiError({ status: 404, code: "NOT_FOUND", message: "secret" })).kind, "not-found");
  assert.equal(getLeadBoardErrorState(new ApiError({ status: 409, code: "CONFLICT", message: "secret" })).kind, "stale");
  assert.equal(getLeadBoardErrorState(new Error("secret")).kind, "error");
});

test("route is organization-scoped and provides context without a fallback ID", async () => {
  const source = await readFile(new URL("../app/ar/organizations/[organizationId]/leads/page.tsx", import.meta.url), "utf8");
  assert.match(source, /params/);
  assert.match(source, /OrganizationProvider/);
  assert.match(source, /organizationId/);
  assert.doesNotMatch(source, /organizationId\s*\|\|/);
  assert.doesNotMatch(source, /fallback|demo-org|defaultOrganization/i);
});

test("derives only the exact policy transitions and no generic stage setter", () => {
  assert.deepEqual(getAllowedLeadTransitions(LeadStage.NEW), [LeadStage.CONTACTED]);
  assert.deepEqual(getAllowedLeadTransitions(LeadStage.CONTACTED), [LeadStage.QUALIFIED, LeadStage.NEW]);
  assert.deepEqual(getAllowedLeadTransitions(LeadStage.QUALIFIED), [LeadStage.NURTURING, LeadStage.CONTACTED]);
  assert.deepEqual(getAllowedLeadTransitions(LeadStage.NURTURING), [LeadStage.CONTACTED]);
});

test("board exposes explicit transition commands with pending and safe conflict handling", async () => {
  const source = await readFile(new URL("../features/leads/lead-board.tsx", import.meta.url), "utf8");
  assert.match(source, /getLeadBoard/);
  assert.match(source, /setLoading/);
  assert.match(source, /setRetryKey/);
  assert.match(source, /nextCursor/);
  assert.match(source, /تحميل المزيد/);
  assert.match(source, /transitionLead/);
  assert.match(source, /sessionCsrfProvider\.clear\(\)/);
  assert.match(source, /getLeadBoardErrorState\(actionError, \{ mutation: true \}\)/);
  assert.match(source, /onReacquireSession/);
  assert.match(source, /getToken\(\)/);
  assert.match(source, /SessionCsrfProvider/);
  assert.match(source, /expectedVersion/);
  assert.match(source, /إعادة تحميل/);
  assert.match(source, /disabled=.*pending|pending.*disabled/si);
  assert.doesNotMatch(source, /onDrop|dragStart|dragOver/);
  assert.doesNotMatch(source, /catch \([^)]*\)[\s\S]{0,180}transitionLead/);
  assert.doesNotMatch(source, /setStage|stageSetter|stage\s*:/i);
});
