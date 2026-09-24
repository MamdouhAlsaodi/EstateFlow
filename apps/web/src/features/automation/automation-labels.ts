/**
 * EF-306/EF-630 — automation presentation label maps hold translation-catalog
 * keys; the written Arabic/English text lives in
 * `src/i18n/messages/automation.ts`. Pure data so tests can assert the exact
 * catalog wording and the views stay free of inline conditional text.
 */

import type { MessageKey } from "../../i18n";
import type { AutomationJobStatus } from "./automation-contract";

export const jobStatusLabels: Record<AutomationJobStatus, MessageKey> = {
  QUEUED: "automation.jobStatus.QUEUED",
  RUNNING: "automation.jobStatus.RUNNING",
  RETRYING: "automation.jobStatus.RETRYING",
  SUCCEEDED: "automation.jobStatus.SUCCEEDED",
  FAILED: "automation.jobStatus.FAILED",
  CANCELLED: "automation.jobStatus.CANCELLED",
};

export const jobErrorKindLabels: Record<string, MessageKey> = {
  "action-executor-not-configured":
    "automation.errorKind.action-executor-not-configured",
  "action-permanent-failure": "automation.errorKind.action-permanent-failure",
  "action-transient-failure": "automation.errorKind.action-transient-failure",
  "unexpected-executor-error": "automation.errorKind.unexpected-executor-error",
};

export const jobTriggerKindLabels: Record<string, MessageKey> = {
  DOMAIN_EVENT: "automation.trigger.DOMAIN_EVENT",
  SCHEDULE: "automation.trigger.SCHEDULE",
};

export const jobActionLabels: Record<string, MessageKey> = {
  CREATE_LEAD_TASK: "automation.action.CREATE_LEAD_TASK",
  CREATE_INTERNAL_NOTIFICATION:
    "automation.action.CREATE_INTERNAL_NOTIFICATION",
  ADD_LEAD_TIMELINE_NOTE: "automation.action.ADD_LEAD_TIMELINE_NOTE",
};

export const jobTargetLabels: Record<string, MessageKey> = {
  LEAD: "automation.target.LEAD",
  RECEIVABLE: "automation.target.RECEIVABLE",
  COMMISSION: "automation.target.COMMISSION",
  RULE_SELF: "automation.target.RULE_SELF",
};

export const conditionOperatorLabels: Record<string, MessageKey> = {
  equals: "automation.operator.equals",
  not_equals: "automation.operator.not_equals",
  in: "automation.operator.in",
  not_in: "automation.operator.not_in",
  is_empty: "automation.operator.is_empty",
  is_not_empty: "automation.operator.is_not_empty",
};

/** Retry is offered only for terminally failed jobs — never for successes. */
export function canRetryAutomationJob(status: AutomationJobStatus): boolean {
  return status === "FAILED";
}

/** Cancel is offered only for jobs that have not started running yet. */
export function canCancelAutomationJob(status: AutomationJobStatus): boolean {
  return status === "QUEUED" || status === "RETRYING";
}
