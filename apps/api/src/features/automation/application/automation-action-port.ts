import type {
  AutomationJob,
  AutomationJobErrorKind,
} from "../domain/execution.js";
import type {
  AutomationRule,
  AutomationRuleDefinition,
  AutomationTriggerEventType,
} from "../domain/rule.js";

export type SchedulerRuleSnapshot = Readonly<{
  rule: AutomationRule;
  definition: AutomationRuleDefinition;
  version: number;
}>;

/**
 * Read-side port the scheduler uses to resolve rules. Implemented by the
 * EF-301 rule repository; kept narrow so the runner never depends on the
 * whole rule CRUD surface.
 */
export interface SchedulerRuleReader {
  findRuleWithCurrentDefinition(
    organizationId: string,
    ruleId: string,
  ): Promise<SchedulerRuleSnapshot | null>;
  findRuleVersion(
    organizationId: string,
    ruleId: string,
    version: number,
  ): Promise<Readonly<{ definition: AutomationRuleDefinition }> | null>;
  listEnabledScheduleRules(): Promise<SchedulerRuleSnapshot[]>;
  listEnabledDomainEventRules(
    eventType: AutomationTriggerEventType,
  ): Promise<SchedulerRuleSnapshot[]>;
}

export type AutomationSweepOccurrence = Readonly<{
  organizationId: string;
  ruleId: string;
  eventId: string;
  eventType: AutomationTriggerEventType;
  targetType: string;
  targetId: string;
  subject: Readonly<Record<string, unknown>>;
  now: Date;
}>;

export interface AutomationOccurrenceSource {
  listDueOccurrences(now: Date): Promise<readonly AutomationSweepOccurrence[]>;
}

export type AutomationActionExecutionRequest = Readonly<{
  job: AutomationJob;
}>;

export type AutomationActionExecutionOutcome =
  | Readonly<{ kind: "succeeded" }>
  | Readonly<{
      kind: "failed";
      retryable: boolean;
      errorKind: AutomationJobErrorKind;
      message: string;
    }>;

/**
 * Port the scheduler calls to perform the action's effect. Concrete executors
 * (lead tasks, notifications, ...) arrive with EF-303; until then the API
 * module wires a conservative executor that fails jobs with a typed error
 * instead of silently dropping them.
 */
export interface AutomationActionPort {
  executeAction(
    request: AutomationActionExecutionRequest,
  ): Promise<AutomationActionExecutionOutcome>;
}

export type EnqueueOccurrenceResult =
  | Readonly<{ kind: "scheduled"; job: AutomationJob }>
  | Readonly<{ kind: "already-scheduled"; executionKey: string }>
  | Readonly<{
      kind: "skipped";
      reason:
        | "rule-not-found"
        | "rule-disabled"
        | "trigger-mismatch"
        | "conditions-not-met";
    }>;

export type EvaluateSchedulesResult = Readonly<{
  evaluatedRules: number;
  scheduled: number;
  alreadyScheduled: number;
}>;

export type RunDueJobsResult = Readonly<{
  claimed: number;
  succeeded: number;
  retried: number;
  failed: number;
}>;
