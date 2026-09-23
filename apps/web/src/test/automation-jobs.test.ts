import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { ApiError } from "../lib/api-client/index";
import {
  canCancelAutomationJob,
  canRetryAutomationJob,
  jobErrorKindLabels,
  jobStatusLabels,
} from "../features/automation/automation-labels";
import {
  normalizeAutomationJobDetail,
  normalizeAutomationJobList,
  normalizeAutomationRuleDetail,
} from "../features/automation/automation-contract";
import { getAutomationActionError } from "../features/automation/automation-jobs-model";

const root = new URL("../", import.meta.url);

async function source(path: string): Promise<string> {
  return readFile(new URL(path, root), "utf8");
}

const validJob = {
  id: "44444444-4444-4444-8444-444444444444",
  ruleId: "33333333-3333-4333-8333-333333333333",
  ruleVersion: 2,
  triggerKind: "DOMAIN_EVENT",
  eventType: "lead.created",
  actionType: "CREATE_LEAD_TASK",
  targetType: "LEAD",
  targetId: "lead-1",
  status: "FAILED",
  attemptCount: 3,
  maxAttempts: 5,
  lastError: {
    kind: "action-permanent-failure",
    message: "executor rejected the action",
  },
  scheduledFor: "2026-09-28T09:01:00.000Z",
  startedAt: "2026-09-28T09:01:00.000Z",
  completedAt: "2026-09-28T09:02:00.000Z",
  createdAt: "2026-09-28T09:00:00.000Z",
  updatedAt: "2026-09-28T09:02:00.000Z",
};

test("normalizes a closed-world execution history page", () => {
  const page = normalizeAutomationJobList({ jobs: [validJob] });
  assert.equal(page.jobs.length, 1);
  assert.equal(page.jobs[0].status, "FAILED");
  assert.equal(page.jobs[0].lastError?.kind, "action-permanent-failure");
});

test("rejects job records that carry payloads, keys, or unknown fields", () => {
  assert.throws(
    () => normalizeAutomationJobList({ jobs: [{ ...validJob, payload: {} }] }),
    TypeError,
  );
  assert.throws(
    () =>
      normalizeAutomationJobList({
        jobs: [{ ...validJob, executionKey: "x" }],
      }),
    TypeError,
  );
  assert.throws(
    () =>
      normalizeAutomationJobList({ jobs: [{ ...validJob, status: "MAYBE" }] }),
    TypeError,
  );
  assert.throws(
    () =>
      normalizeAutomationJobList({
        jobs: [
          { ...validJob, lastError: { kind: "secret-leak", message: "x" } },
        ],
      }),
    TypeError,
  );
  assert.throws(
    () => normalizeAutomationJobDetail({ job: { ...validJob, extra: 1 } }),
    TypeError,
  );
});

test("normalizes rule detail with an append-only version timeline", () => {
  const detail = normalizeAutomationRuleDetail({
    rule: {
      id: "33333333-3333-4333-8333-333333333333",
      name: "قاعدة",
      enabled: true,
      currentVersion: 2,
      createdAt: "2026-09-28T08:00:00.000Z",
      updatedAt: "2026-09-28T08:30:00.000Z",
      definition: {
        trigger: { kind: "DOMAIN_EVENT", eventType: "lead.created" },
        conditions: [],
        action: { actionType: "CREATE_LEAD_TASK", payload: {} },
      },
    },
    versions: [
      {
        version: 1,
        definition: {
          trigger: { kind: "DOMAIN_EVENT", eventType: "lead.created" },
          conditions: [],
          action: { actionType: "CREATE_LEAD_TASK", payload: {} },
        },
        createdBy: "22222222-2222-4222-8222-222222222222",
        createdAt: "2026-09-28T08:00:00.000Z",
        supersedesVersion: null,
        note: null,
      },
    ],
  });
  assert.equal(detail.versions.length, 1);
  assert.equal(detail.rule.currentVersion, 2);
  assert.throws(
    () =>
      normalizeAutomationRuleDetail({
        rule: { nope: true },
        versions: [],
      }),
    TypeError,
  );
});

test("typed retry/cancel gating mirrors the API states", () => {
  assert.equal(canRetryAutomationJob("FAILED"), true);
  assert.equal(canRetryAutomationJob("SUCCEEDED"), false);
  assert.equal(canRetryAutomationJob("CANCELLED"), false);
  assert.equal(canCancelAutomationJob("QUEUED"), true);
  assert.equal(canCancelAutomationJob("RETRYING"), true);
  assert.equal(canCancelAutomationJob("RUNNING"), false);
  assert.equal(canCancelAutomationJob("FAILED"), false);
  assert.equal(jobStatusLabels.FAILED, "فاشلة");
  assert.equal(jobStatusLabels.QUEUED, "في الانتظار");
  assert.equal(jobErrorKindLabels["action-permanent-failure"], "فشل دائم");
});

test("action errors surface the authority matrix in Arabic", () => {
  const forbidden = getAutomationActionError(
    new ApiError({ status: 403, code: "HTTP_403", message: "Forbidden" }),
  );
  assert.match(forbidden.message, /صاحب المؤسسة أو المدير/);
  const stale = getAutomationActionError(
    new ApiError({ status: 409, code: "HTTP_409", message: "Conflict" }),
  );
  assert.match(stale.message, /تغيرت حالة الوظيفة/);
});

test("rule detail view is organization-scoped and exposes no editor beyond enable/disable", async () => {
  const page = await source(
    "app/ar/organizations/[organizationId]/automation/rules/[ruleId]/page.tsx",
  );
  assert.match(page, /organizationId/);
  assert.match(page, /ruleId/);
  assert.doesNotMatch(
    page,
    /fallback|demo-org|defaultOrganization|organizationId\s*\|\|/i,
  );

  const view = await source("features/automation/rule-detail-view.tsx");
  assert.match(view, /setAutomationRuleEnabled/);
  assert.match(view, /تفعيل القاعدة/);
  assert.match(view, /إيقاف القاعدة/);
  assert.match(view, /سجل الإصدارات/);
  // No rule name/definition editor inputs anywhere.
  assert.doesNotMatch(view, /<input|<textarea|window\.prompt/);
  assert.doesNotMatch(view, /fetch\s*\(/);
});

test("execution history views stay typed, Arabic-first, and mobile-responsive", async () => {
  const jobList = await source("features/automation/automation-job-list.tsx");
  assert.match(jobList, /canRetryAutomationJob/);
  assert.match(jobList, /canCancelAutomationJob/);
  assert.match(jobList, /retryAutomationJob/);
  assert.match(jobList, /cancelAutomationJob/);
  assert.match(jobList, /سبب الفشل/);
  assert.doesNotMatch(jobList, /job\.executionKey|job\.eventId|\.payload/);

  const history = await source("features/automation/jobs-history-view.tsx");
  assert.match(history, /fetchAutomationJobs/);
  assert.match(history, /سجل تنفيذ الأتمتة/);
  assert.match(history, /role="status"/);
  assert.match(history, /role="alert"/);

  const jobsPage = await source(
    "app/ar/organizations/[organizationId]/automation/jobs/page.tsx",
  );
  assert.match(jobsPage, /organizationId/);
  assert.doesNotMatch(
    jobsPage,
    /fallback|demo-org|defaultOrganization|organizationId\s*\|\|/i,
  );

  const styles = await source(
    "features/automation/automation-visibility.module.css",
  );
  assert.match(styles, /@media/);
  assert.match(styles, /\.timeline/);
  assert.match(styles, /\.actions/);
});

test("mutations flow through the session CSRF provider with idempotency keys", async () => {
  const api = await source("features/automation/automation-jobs-api.ts");
  assert.match(api, /createSessionCsrfProvider/);
  assert.match(api, /crypto\.randomUUID\(\)/);
  assert.match(api, /csrfToken/);
  for (const route of [
    "/automation/jobs",
    "/automation/rules/${ruleId}/jobs",
    "/automation/jobs/${jobId}/retry",
    "/automation/jobs/${jobId}/cancel",
    "/automation/rules/${ruleId}/",
  ])
    assert.ok(api.includes(route), route);
  assert.match(api, /"enable" : "disable"/);
});
