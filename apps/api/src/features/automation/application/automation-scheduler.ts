import type {
  AutomationActionPort,
  EvaluateSchedulesResult,
  EnqueueOccurrenceResult,
  RunDueJobsResult,
  SchedulerRuleReader,
} from "./automation-action-port.js";
import type { AutomationJobRepository } from "./job-repository.js";
import {
  claimDueAutomationJob,
  createAutomationJob,
  deriveExecutionKey,
  evaluateAutomationConditions,
  failAutomationJob,
  retryAutomationJob,
  succeedAutomationJob,
  AUTOMATION_LAST_ERROR_MESSAGE_MAX_LENGTH,
  type AutomationJob,
  type AutomationJobErrorKind,
} from "../domain/execution.js";
import { dailyBucketsDueUtc } from "../domain/rule.js";
import type { AutomationRule } from "../domain/rule.js";

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const TARGET_TYPE_PATTERN = /^[A-Za-z][A-Za-z0-9_]{0,59}$/;

function assertUuid(value: string, label: string): void {
  if (!UUID.test(value)) throw new RangeError(`${label} must be a UUID`);
}

function truncateMessage(message: string): string {
  const cleaned = message.replace(/[\r\n]+/g, " ").trim();
  return cleaned.length <= AUTOMATION_LAST_ERROR_MESSAGE_MAX_LENGTH
    ? cleaned
    : `${cleaned.slice(0, AUTOMATION_LAST_ERROR_MESSAGE_MAX_LENGTH - 3)}...`;
}

/**
 * EF-302 — api-side durable scheduler.
 *
 * Schedule evaluation (deriving due occurrences and inserting jobs) is fully
 * separated from action execution (claiming due jobs and running them through
 * the action port). Both halves are plain callables: this packet ships no
 * long-lived worker loop — EF-303 must register the concrete action executors
 * and drive `evaluateScheduleTriggers` / `runDueJobs` from apps/worker.
 */
export class AutomationScheduler {
  constructor(
    private readonly jobs: AutomationJobRepository,
    private readonly rules: SchedulerRuleReader,
    private readonly actionPort: AutomationActionPort,
  ) {}

  /**
   * Enqueue the single due occurrence of a domain-event trigger. Replaying
   * the same event resolves to "already-scheduled" via the execution key.
   */
  async enqueueDomainEventOccurrence(input: {
    organizationId: string;
    ruleId: string;
    eventId: string;
    eventType: string;
    targetType: string;
    targetId: string;
    subject: Readonly<Record<string, unknown>>;
    now: Date;
  }): Promise<EnqueueOccurrenceResult> {
    assertUuid(input.organizationId, "organizationId");
    assertUuid(input.ruleId, "ruleId");
    assertUuid(input.eventId, "eventId");
    if (!TARGET_TYPE_PATTERN.test(input.targetType))
      throw new RangeError(
        "targetType must match ^[A-Za-z][A-Za-z0-9_]{0,59}$",
      );
    if (input.targetId.trim().length === 0 || input.targetId.length > 200)
      throw new RangeError(
        "targetId must be a non-blank string of <= 200 characters",
      );

    const loaded = await this.rules.findRuleWithCurrentDefinition(
      input.organizationId,
      input.ruleId,
    );
    if (!loaded) return { kind: "skipped", reason: "rule-not-found" };
    const { rule, definition, version } = loaded;
    if (!rule.enabled) return { kind: "skipped", reason: "rule-disabled" };
    if (
      definition.trigger.kind !== "DOMAIN_EVENT" ||
      definition.trigger.eventType !== input.eventType
    )
      return { kind: "skipped", reason: "trigger-mismatch" };
    if (!evaluateAutomationConditions(definition.conditions, input.subject))
      return { kind: "skipped", reason: "conditions-not-met" };

    return this.insertDedupedJob({
      rule,
      ruleVersion: version,
      triggerKind: "DOMAIN_EVENT",
      eventType: input.eventType,
      eventId: input.eventId,
      actionType: definition.action.actionType,
      targetType: input.targetType,
      targetId: input.targetId,
      scheduleBucket: null,
      scheduledFor: input.now,
      now: input.now,
    });
  }

  /**
   * Sweep every enabled SCHEDULE rule and enqueue each due daily bucket at
   * most once. Safe to call repeatedly at any cadence.
   */
  async evaluateScheduleTriggers(input: {
    now: Date;
  }): Promise<EvaluateSchedulesResult> {
    const result = {
      evaluatedRules: 0,
      scheduled: 0,
      alreadyScheduled: 0,
    };
    const rules = await this.rules.listEnabledScheduleRules();
    for (const { rule, definition, version } of rules) {
      result.evaluatedRules++;
      if (definition.trigger.kind !== "SCHEDULE" || !rule.enabledAt) continue;
      const occurrences = dailyBucketsDueUtc(
        definition.trigger.timeOfDayUtc,
        input.now,
        rule.enabledAt,
      );
      for (const occurrence of occurrences) {
        const outcome = await this.insertDedupedJob({
          rule,
          ruleVersion: version,
          triggerKind: "SCHEDULE",
          eventType: null,
          eventId: null,
          actionType: definition.action.actionType,
          targetType: "RULE_SELF",
          targetId: rule.id,
          scheduleBucket: occurrence.bucket,
          scheduledFor: occurrence.scheduledFor,
          now: input.now,
        });
        if (outcome.kind === "scheduled") result.scheduled++;
        else if (outcome.kind === "already-scheduled")
          result.alreadyScheduled++;
      }
    }
    return result;
  }

  /**
   * Execute due jobs: claim → run action through the port → record the
   * outcome (success, bounded backoff retry, or terminal failure). At most
   * `limit` claims per call.
   */
  async runDueJobs(input: {
    now: Date;
    limit: number;
  }): Promise<RunDueJobsResult> {
    if (!Number.isInteger(input.limit) || input.limit < 1 || input.limit > 100)
      throw new RangeError("limit must be an integer between 1 and 100");
    const result = {
      claimed: 0,
      succeeded: 0,
      retried: 0,
      failed: 0,
    };
    for (let index = 0; index < input.limit; index++) {
      const claimed = await this.jobs.claimNextDueJob(input.now);
      if (!claimed) break;
      result.claimed++;
      // The SQL repository atomically transitions the row to RUNNING before
      // returning it. Narrow in-memory repositories may return the due row
      // unchanged, so preserve the domain transition for that contract too.
      const due =
        claimed.status === "RUNNING"
          ? claimed
          : claimDueAutomationJob(claimed, input.now);
      const outcome = await this.executeSafely(due);
      const settled =
        outcome.kind === "succeeded"
          ? succeedAutomationJob(due, input.now)
          : outcome.retryable
            ? retryAutomationJob(due, input.now, {
                kind: outcome.errorKind,
                message: outcome.message,
              })
            : failAutomationJob(due, input.now, {
                kind: outcome.errorKind,
                message: outcome.message,
              });
      const persisted = await this.jobs.saveJobOutcome(settled);
      if (!persisted) continue; // lost a claim race; the row stays consistent
      if (settled.status === "SUCCEEDED") result.succeeded++;
      else if (settled.status === "RETRYING") result.retried++;
      else if (settled.status === "FAILED") result.failed++;
    }
    return result;
  }

  /**
   * One EF-302 scheduler tick: enqueue due schedule occurrences, then claim
   * and execute due jobs through the API-owned action port.
   */
  async runTick(input: { now: Date; limit: number }): Promise<
    Readonly<{
      schedules: EvaluateSchedulesResult;
      jobs: RunDueJobsResult;
    }>
  > {
    const schedules = await this.evaluateScheduleTriggers({ now: input.now });
    const jobs = await this.runDueJobs({
      now: input.now,
      limit: input.limit,
    });
    return { schedules, jobs };
  }

  /** Failed-job visibility: typed last error, newest first, org-scoped. */
  async listFailedJobs(input: {
    organizationId: string;
    limit: number;
  }): Promise<AutomationJob[]> {
    return this.jobs.listJobsByStatus({
      organizationId: input.organizationId,
      status: "FAILED",
      limit: input.limit,
    });
  }

  async listJobsForRule(input: {
    organizationId: string;
    ruleId: string;
    limit: number;
  }): Promise<AutomationJob[]> {
    return this.jobs.listJobsForRule({
      organizationId: input.organizationId,
      ruleId: input.ruleId,
      limit: input.limit,
    });
  }

  private async executeSafely(job: AutomationJob): Promise<
    | Readonly<{ kind: "succeeded" }>
    | Readonly<{
        kind: "failed";
        retryable: boolean;
        errorKind: AutomationJobErrorKind;
        message: string;
      }>
  > {
    try {
      const outcome = await this.actionPort.executeAction({ job });
      return outcome.kind === "succeeded"
        ? outcome
        : { ...outcome, message: truncateMessage(outcome.message) };
    } catch {
      // Raw executor errors may contain secrets or PII; only a typed,
      // bounded placeholder is persisted.
      return {
        kind: "failed",
        retryable: true,
        errorKind: "unexpected-executor-error",
        message: "automation action executor threw an unexpected error",
      };
    }
  }

  private async insertDedupedJob(input: {
    rule: AutomationRule;
    ruleVersion: number;
    triggerKind: "DOMAIN_EVENT" | "SCHEDULE";
    eventType: string | null;
    eventId: string | null;
    actionType: string;
    targetType: string;
    targetId: string;
    scheduleBucket: string | null;
    scheduledFor: Date;
    now: Date;
  }): Promise<EnqueueOccurrenceResult> {
    const executionKey = deriveExecutionKey({
      organizationId: input.rule.organizationId,
      ruleId: input.rule.id,
      ruleVersion: input.ruleVersion,
      eventId: input.eventId,
      actionType: input.actionType,
      targetType: input.targetType,
      targetId: input.targetId,
      scheduleBucket: input.scheduleBucket,
    });
    const existing = await this.jobs.findJobByExecutionKey(
      input.rule.organizationId,
      executionKey,
    );
    if (existing) return { kind: "already-scheduled", executionKey };
    const job = createAutomationJob({
      id: crypto.randomUUID(),
      organizationId: input.rule.organizationId,
      ruleId: input.rule.id,
      ruleVersion: input.ruleVersion,
      executionKey,
      triggerKind: input.triggerKind,
      eventType: input.eventType,
      eventId: input.eventId,
      actionType: input.actionType,
      targetType: input.targetType,
      targetId: input.targetId,
      scheduleBucket: input.scheduleBucket,
      scheduledFor: input.scheduledFor,
      now: input.now,
    });
    const inserted = await this.jobs.insertJob(job);
    return inserted.kind === "inserted"
      ? { kind: "scheduled", job }
      : { kind: "already-scheduled", executionKey };
  }
}
