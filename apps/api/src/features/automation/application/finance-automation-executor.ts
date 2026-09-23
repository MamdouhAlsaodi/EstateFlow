import type {
  AutomationActionExecutionOutcome,
  AutomationActionExecutionRequest,
  AutomationActionPort,
  SchedulerRuleReader,
} from "./automation-action-port.js";
import type { AutomationOutboundDelivery } from "./lead-automation-executor.js";
import type { FinanceReminderRepository } from "./finance-reminder-repository.js";
import {
  financeReminderOccurrenceId,
  type FinanceReminderType,
} from "../domain/finance-reminder.js";

function reminderType(value: string | null): FinanceReminderType | null {
  return value === "receivable.due_soon" ||
    value === "receivable.overdue" ||
    value === "commission.due"
    ? value
    : null;
}

/** Internal-only finance executor; it never calls an email or SMS provider. */
export class FinanceAutomationActionExecutor implements AutomationActionPort {
  constructor(
    private readonly finance: FinanceReminderRepository,
    private readonly rules: SchedulerRuleReader,
    private readonly delivery: AutomationOutboundDelivery,
  ) {}

  async executeAction(
    request: AutomationActionExecutionRequest,
  ): Promise<AutomationActionExecutionOutcome> {
    const job = request.job;
    if (job.targetType !== "RECEIVABLE" && job.targetType !== "COMMISSION")
      return this.permanent("automation action target is not finance");
    if (job.actionType !== "CREATE_INTERNAL_NOTIFICATION")
      return this.permanent("finance reminder action is not supported");
    const type = reminderType(job.eventType);
    if (!type) return this.permanent("finance reminder event type is invalid");
    const loaded = await this.rules.findRuleVersion(
      job.organizationId,
      job.ruleId,
      job.ruleVersion,
    );
    if (!loaded) return this.permanent("automation rule version is missing");
    const target = await this.finance.findCurrentTarget(
      job.organizationId,
      job.targetType,
      job.targetId,
    );
    if (!target) return { kind: "succeeded" };
    const currentEventId = financeReminderOccurrenceId({
      organizationId: target.organizationId,
      targetType: target.targetType,
      targetId: target.targetId,
      reminderType: type,
      dueOccurrence: target.dueOccurrence,
    });
    if (currentEventId !== job.eventId) return { kind: "succeeded" };
    const template = loaded.definition.action.payload.template;
    if (!template)
      return this.permanent("finance notification template is missing");
    try {
      await this.delivery.deliver({
        organizationId: target.organizationId,
        recipientUserId: target.recipientUserId,
        template,
        idempotencyKey: `automation:${job.executionKey}`,
      });
      return { kind: "succeeded" };
    } catch {
      return {
        kind: "failed",
        retryable: true,
        errorKind: "action-transient-failure",
        message: "finance reminder delivery failed; retry is safe",
      };
    }
  }

  private permanent(message: string): AutomationActionExecutionOutcome {
    return {
      kind: "failed",
      retryable: false,
      errorKind: "action-permanent-failure",
      message,
    };
  }
}
