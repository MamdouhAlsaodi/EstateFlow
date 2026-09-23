import assert from "node:assert/strict";
import test from "node:test";
import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
  ParseUUIDPipe,
  RequestMethod,
} from "@nestjs/common";
import {
  GUARDS_METADATA,
  METHOD_METADATA,
  MODULE_METADATA,
  PATH_METADATA,
  ROUTE_ARGS_METADATA,
} from "@nestjs/common/constants.js";
import { AppModule } from "../dist/app.module.js";
import { BrowserSessionGuard } from "../dist/features/auth/http/browser-session.guard.js";
import { CsrfGuard } from "../dist/features/auth/http/csrf.guard.js";
import { RequireCanonicalOriginGuard } from "../dist/features/auth/http/origin.guard.js";
import { AutomationModule } from "../dist/features/automation/automation.module.js";
import { AutomationRuleController } from "../dist/features/automation/http/automation-rule.controller.js";

const unsafe = [RequireCanonicalOriginGuard, BrowserSessionGuard, CsrfGuard];
const organizationId = "22222222-2222-4222-8222-222222222222";
const ruleId = "33333333-3333-4333-8333-333333333333";
const jobId = "44444444-4444-4444-8444-444444444444";

const route = (method) => [
  Reflect.getMetadata(
    PATH_METADATA,
    AutomationRuleController.prototype[method],
  ),
  Reflect.getMetadata(
    METHOD_METADATA,
    AutomationRuleController.prototype[method],
  ),
];

function jobFixture(overrides = {}) {
  const instant = new Date("2026-09-28T10:00:00.000Z");
  return {
    id: jobId,
    organizationId,
    ruleId,
    ruleVersion: 2,
    executionKey: "key-should-never-leave-the-api",
    triggerKind: "DOMAIN_EVENT",
    eventType: "lead.created",
    eventId: "55555555-5555-4555-8555-555555555555",
    actionType: "CREATE_LEAD_TASK",
    targetType: "LEAD",
    targetId: "lead-1",
    scheduleBucket: null,
    scheduledFor: instant,
    status: "FAILED",
    attemptCount: 3,
    maxAttempts: 5,
    nextAttemptAt: null,
    lastError: {
      kind: "action-permanent-failure",
      message: "executor rejected",
    },
    startedAt: instant,
    completedAt: instant,
    createdAt: instant,
    updatedAt: instant,
    ...overrides,
  };
}

function controllerWith(stub) {
  return new AutomationRuleController(stub);
}
const request = { auth: { verified: true, userId: "user-1" } };

test("AppModule keeps the automation module with the rule/jobs controller", () => {
  assert.ok(
    Reflect.getMetadata(MODULE_METADATA.IMPORTS, AppModule).includes(
      AutomationModule,
    ),
  );
  assert.ok(
    Reflect.getMetadata(MODULE_METADATA.CONTROLLERS, AutomationModule).includes(
      AutomationRuleController,
    ),
  );
});

test("EF-306 exposes exactly five guarded job endpoints", () => {
  assert.deepEqual(
    ["listJobs", "listRuleJobs", "findJob", "retryJob", "cancelJob"].map(route),
    [
      ["organizations/:organizationId/automation/jobs", RequestMethod.GET],
      [
        "organizations/:organizationId/automation/rules/:ruleId/jobs",
        RequestMethod.GET,
      ],
      [
        "organizations/:organizationId/automation/jobs/:jobId",
        RequestMethod.GET,
      ],
      [
        "organizations/:organizationId/automation/jobs/:jobId/retry",
        RequestMethod.POST,
      ],
      [
        "organizations/:organizationId/automation/jobs/:jobId/cancel",
        RequestMethod.POST,
      ],
    ],
  );
  for (const method of ["listJobs", "listRuleJobs", "findJob"])
    assert.deepEqual(
      Reflect.getMetadata(
        GUARDS_METADATA,
        AutomationRuleController.prototype[method],
      ),
      [BrowserSessionGuard],
      method,
    );
  for (const method of ["retryJob", "cancelJob"])
    assert.deepEqual(
      Reflect.getMetadata(
        GUARDS_METADATA,
        AutomationRuleController.prototype[method],
      ),
      unsafe,
      method,
    );
});

test("EF-306 route ids use ParseUUIDPipe", () => {
  for (const method of [
    "listJobs",
    "listRuleJobs",
    "findJob",
    "retryJob",
    "cancelJob",
  ]) {
    const argumentsMetadata = Reflect.getMetadata(
      ROUTE_ARGS_METADATA,
      AutomationRuleController,
      method,
    );
    assert.ok(argumentsMetadata, method);
    assert.ok(
      Object.values(argumentsMetadata).some(({ pipes }) =>
        pipes.some((pipe) => pipe instanceof ParseUUIDPipe),
      ),
      method,
    );
  }
});

test("job history renders closed typed records without payloads or keys", async () => {
  const stub = {
    listOrganizationJobs: async () => ({
      kind: "found",
      jobs: [jobFixture()],
    }),
  };
  const body = await controllerWith(stub).listJobs(organizationId, request);
  assert.deepEqual(body, {
    jobs: [
      {
        id: jobId,
        ruleId,
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
          message: "executor rejected",
        },
        scheduledFor: "2026-09-28T10:00:00.000Z",
        startedAt: "2026-09-28T10:00:00.000Z",
        completedAt: "2026-09-28T10:00:00.000Z",
        createdAt: "2026-09-28T10:00:00.000Z",
        updatedAt: "2026-09-28T10:00:00.000Z",
      },
    ],
  });
  assert.ok(!JSON.stringify(body).includes("executionKey"));
  assert.ok(!JSON.stringify(body).includes("eventId"));
});

test("retry returns the NEW queued occurrence created by the application", async () => {
  const newOccurrence = jobFixture({
    id: "66666666-6666-4666-8666-666666666666",
    status: "QUEUED",
    attemptCount: 0,
    lastError: null,
    completedAt: null,
    startedAt: null,
    executionKey: "retry-key",
  });
  const stub = {
    retryJob: async (input) => {
      assert.equal(input.organizationId, organizationId);
      assert.equal(input.jobId, jobId);
      assert.equal(input.userId, "user-1");
      return { kind: "retried", job: newOccurrence };
    },
  };
  const body = await controllerWith(stub).retryJob(
    organizationId,
    jobId,
    request,
  );
  assert.equal(body.job.id, newOccurrence.id);
  assert.equal(body.job.status, "QUEUED");
  assert.ok(!JSON.stringify(body).includes("retry-key"));
});

test("typed outcomes map to 403/404/409 without leaking internals", async () => {
  const controller = controllerWith({
    cancelJob: async () => ({ kind: "access-denied" }),
  });
  await assert.rejects(
    controller.cancelJob(organizationId, jobId, request),
    ForbiddenException,
  );

  const missing = controllerWith({
    cancelJob: async () => ({ kind: "not-found", resource: "job" }),
  });
  await assert.rejects(
    missing.cancelJob(organizationId, jobId, request),
    NotFoundException,
  );

  const stale = controllerWith({
    retryJob: async () => ({ kind: "invalid-state", status: "SUCCEEDED" }),
  });
  await assert.rejects(
    stale.retryJob(organizationId, jobId, request),
    ConflictException,
  );

  const duplicate = controllerWith({
    retryJob: async () => ({ kind: "duplicate" }),
  });
  await assert.rejects(
    duplicate.retryJob(organizationId, jobId, request),
    ConflictException,
  );

  const raced = controllerWith({
    cancelJob: async () => ({ kind: "conflict" }),
  });
  await assert.rejects(
    raced.cancelJob(organizationId, jobId, request),
    ConflictException,
  );
});
