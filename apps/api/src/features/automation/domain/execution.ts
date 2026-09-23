/**
 * EF-302 — durable automation execution model.
 *
 * A due occurrence of a rule action becomes exactly one durable job row keyed
 * by a deterministic execution key (unique per organization). Schedule
 * evaluation only ever inserts jobs; action execution claims due jobs
 * atomically, so a replayed evaluation or a concurrent tick can never
 * double-fire an action. Retries use exponential backoff with bounded
 * attempts; exhausted jobs land in a visible FAILED state carrying a typed
 * last error.
 */

import { createHash } from "node:crypto";

export type AutomationJobStatus =
  "QUEUED" | "RUNNING" | "RETRYING" | "SUCCEEDED" | "FAILED" | "CANCELLED";

export const AUTOMATION_JOB_STATUSES: readonly AutomationJobStatus[] = [
  "QUEUED",
  "RUNNING",
  "RETRYING",
  "SUCCEEDED",
  "FAILED",
  "CANCELLED",
];

export type AutomationJobTerminalStatus = "SUCCEEDED" | "FAILED" | "CANCELLED";

export const DEFAULT_AUTOMATION_JOB_MAX_ATTEMPTS = 5;
export const AUTOMATION_JOB_MAX_ATTEMPTS_CEILING = 10;
export const AUTOMATION_BACKOFF_BASE_SECONDS = 30;
export const AUTOMATION_BACKOFF_MAX_SECONDS = 3600;
export const AUTOMATION_LAST_ERROR_MESSAGE_MAX_LENGTH = 500;

export type AutomationJobErrorKind =
  | "action-executor-not-configured"
  | "action-permanent-failure"
  | "action-transient-failure"
  | "unexpected-executor-error";

export type AutomationJobLastError = Readonly<{
  kind: AutomationJobErrorKind;
  message: string;
}>;

export type AutomationJob = Readonly<{
  id: string;
  organizationId: string;
  ruleId: string;
  ruleVersion: number;
  executionKey: string;
  triggerKind: "DOMAIN_EVENT" | "SCHEDULE";
  eventType: string | null;
  eventId: string | null;
  actionType: string;
  targetType: string;
  targetId: string;
  scheduleBucket: string | null;
  scheduledFor: Date;
  status: AutomationJobStatus;
  attemptCount: number;
  maxAttempts: number;
  nextAttemptAt: Date | null;
  lastError: AutomationJobLastError | null;
  startedAt: Date | null;
  completedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}>;

export class AutomationJobStateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AutomationJobStateError";
  }
}

export type ExecutionKeyInput = Readonly<{
  organizationId: string;
  ruleId: string;
  ruleVersion: number;
  eventId: string | null;
  actionType: string;
  targetType: string;
  targetId: string;
  scheduleBucket: string | null;
}>;

/**
 * Deterministic execution key over organization / rule / rule version /
 * event / action / target / schedule bucket, per the automation ADR. The key
 * is content-addressed: the same due occurrence always derives the same key,
 * and the database unique constraint on (organizationId, executionKey) makes
 * duplicate scheduling impossible.
 */
export function deriveExecutionKey(input: ExecutionKeyInput): string {
  const canonical = JSON.stringify({
    actionType: input.actionType,
    eventId: input.eventId,
    organizationId: input.organizationId,
    ruleId: input.ruleId,
    ruleVersion: input.ruleVersion,
    scheduleBucket: input.scheduleBucket,
    targetId: input.targetId,
    targetType: input.targetType,
  });
  return createHash("sha256").update(canonical, "utf8").digest("hex");
}

/**
 * Exponential backoff after the given failed attempt: 30s, 60s, 120s, 240s,
 * 480s, ... capped at one hour. Pure so tests can assert the exact schedule.
 */
export function computeBackoffDelaySeconds(failedAttempt: number): number {
  if (!Number.isInteger(failedAttempt) || failedAttempt < 1)
    throw new RangeError("failedAttempt must be a positive integer");
  return Math.min(
    AUTOMATION_BACKOFF_BASE_SECONDS * 2 ** (failedAttempt - 1),
    AUTOMATION_BACKOFF_MAX_SECONDS,
  );
}

function backoffFrom(failedAttempt: number, now: Date): Date {
  return new Date(
    now.getTime() + computeBackoffDelaySeconds(failedAttempt) * 1000,
  );
}

export function createAutomationJob(input: {
  id: string;
  organizationId: string;
  ruleId: string;
  ruleVersion: number;
  executionKey: string;
  triggerKind: "DOMAIN_EVENT" | "SCHEDULE";
  eventType: string | null;
  eventId: string | null;
  actionType: string;
  targetType: string;
  targetId: string;
  scheduleBucket: string | null;
  scheduledFor: Date;
  maxAttempts?: number;
  now: Date;
}): AutomationJob {
  const maxAttempts = input.maxAttempts ?? DEFAULT_AUTOMATION_JOB_MAX_ATTEMPTS;
  if (
    !Number.isInteger(maxAttempts) ||
    maxAttempts < 1 ||
    maxAttempts > AUTOMATION_JOB_MAX_ATTEMPTS_CEILING
  )
    throw new RangeError(
      `maxAttempts must be an integer between 1 and ${AUTOMATION_JOB_MAX_ATTEMPTS_CEILING}`,
    );
  if (input.triggerKind === "DOMAIN_EVENT" && input.eventId === null)
    throw new RangeError("domain-event jobs require an eventId");
  if (input.triggerKind === "SCHEDULE" && input.scheduleBucket === null)
    throw new RangeError("schedule jobs require a scheduleBucket");
  return Object.freeze({
    id: input.id,
    organizationId: input.organizationId,
    ruleId: input.ruleId,
    ruleVersion: input.ruleVersion,
    executionKey: input.executionKey,
    triggerKind: input.triggerKind,
    eventType: input.eventType,
    eventId: input.eventId,
    actionType: input.actionType,
    targetType: input.targetType,
    targetId: input.targetId,
    scheduleBucket: input.scheduleBucket,
    scheduledFor: input.scheduledFor,
    status: "QUEUED",
    attemptCount: 0,
    maxAttempts,
    nextAttemptAt: input.scheduledFor,
    lastError: null,
    startedAt: null,
    completedAt: null,
    createdAt: input.now,
    updatedAt: input.now,
  });
}

function requireTransition(
  job: AutomationJob,
  expected: readonly AutomationJobStatus[],
  action: string,
): void {
  if (!expected.includes(job.status))
    throw new AutomationJobStateError(
      `cannot ${action} job in status ${job.status}`,
    );
}

/** Claim a due queued/retrying job for one bounded run attempt. */
export function claimDueAutomationJob(
  job: AutomationJob,
  now: Date,
): AutomationJob {
  requireTransition(job, ["QUEUED", "RETRYING"], "claim");
  if (!job.nextAttemptAt || job.nextAttemptAt.getTime() > now.getTime())
    throw new AutomationJobStateError("job is not yet due");
  return Object.freeze({
    ...job,
    status: "RUNNING",
    attemptCount: job.attemptCount + 1,
    startedAt: job.startedAt ?? now,
    updatedAt: now,
  });
}

export function succeedAutomationJob(
  job: AutomationJob,
  now: Date,
): AutomationJob {
  requireTransition(job, ["RUNNING"], "succeed");
  return Object.freeze({
    ...job,
    status: "SUCCEEDED",
    nextAttemptAt: null,
    lastError: null,
    completedAt: now,
    updatedAt: now,
  });
}

/**
 * Record a retryable failure: reschedule with exponential backoff, or move to
 * the terminal FAILED state once attempts are exhausted.
 */
export function retryAutomationJob(
  job: AutomationJob,
  now: Date,
  lastError: AutomationJobLastError,
): AutomationJob {
  requireTransition(job, ["RUNNING"], "retry");
  if (job.attemptCount >= job.maxAttempts)
    return Object.freeze({
      ...job,
      status: "FAILED",
      nextAttemptAt: null,
      lastError: lastError,
      completedAt: now,
      updatedAt: now,
    });
  return Object.freeze({
    ...job,
    status: "RETRYING",
    nextAttemptAt: backoffFrom(job.attemptCount, now),
    lastError,
    updatedAt: now,
  });
}

/** Terminal failure for permanent (non-retryable) errors. */
export function failAutomationJob(
  job: AutomationJob,
  now: Date,
  lastError: AutomationJobLastError,
): AutomationJob {
  requireTransition(job, ["RUNNING"], "fail");
  return Object.freeze({
    ...job,
    status: "FAILED",
    nextAttemptAt: null,
    lastError,
    completedAt: now,
    updatedAt: now,
  });
}

export function cancelAutomationJob(
  job: AutomationJob,
  now: Date,
): AutomationJob {
  requireTransition(job, ["QUEUED", "RETRYING"], "cancel");
  return Object.freeze({
    ...job,
    status: "CANCELLED",
    nextAttemptAt: null,
    lastError: null,
    completedAt: now,
    updatedAt: now,
  });
}

// ---------------------------------------------------------------------------
// Condition evaluation over event subjects
// ---------------------------------------------------------------------------

export type AutomationEventSubject = Readonly<Record<string, unknown>>;

function lookupField(subject: AutomationEventSubject, field: string): unknown {
  let current: unknown = subject;
  for (const segment of field.split(".")) {
    if (typeof current !== "object" || current === null) return undefined;
    current = (current as Record<string, unknown>)[segment];
  }
  return current;
}

function isEmptyValue(value: unknown): boolean {
  return value === undefined || value === null || value === "";
}

/** Every condition must pass (logical AND) for the action to be scheduled. */
export function evaluateAutomationConditions(
  conditions: readonly {
    field: string;
    op: string;
    value?: unknown;
  }[],
  subject: AutomationEventSubject,
): boolean {
  return conditions.every((condition) => {
    const actual = lookupField(subject, condition.field);
    switch (condition.op) {
      case "equals":
        return actual === condition.value;
      case "not_equals":
        return actual !== condition.value;
      case "in":
        return (
          Array.isArray(condition.value) &&
          condition.value.includes(actual as never)
        );
      case "not_in":
        return (
          Array.isArray(condition.value) &&
          !condition.value.includes(actual as never)
        );
      case "is_empty":
        return isEmptyValue(actual);
      case "is_not_empty":
        return !isEmptyValue(actual);
      default:
        return false;
    }
  });
}
