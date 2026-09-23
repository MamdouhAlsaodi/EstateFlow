import type {
  AutomationOccurrenceSource,
  AutomationSweepOccurrence,
  SchedulerRuleReader,
} from "./automation-action-port.js";
import type { FinanceReminderRepository } from "./finance-reminder-repository.js";
import {
  financeReminderOccurrenceId,
  reminderDays,
  reminderWindowReached,
  type FinanceReminderCandidate,
  type FinanceReminderType,
} from "../domain/finance-reminder.js";

const FINANCE_REMINDER_TYPES: readonly FinanceReminderType[] = [
  "receivable.due_soon",
  "receivable.overdue",
  "commission.due",
];

/** Produces finance occurrences for the same API-owned scheduler tick as Lead. */
export class FinanceReminderCoordinator implements AutomationOccurrenceSource {
  constructor(
    private readonly rules: SchedulerRuleReader,
    private readonly finance: FinanceReminderRepository,
  ) {}

  async listDueOccurrences(
    now: Date,
  ): Promise<readonly AutomationSweepOccurrence[]> {
    const occurrences: AutomationSweepOccurrence[] = [];
    for (const reminderType of FINANCE_REMINDER_TYPES) {
      const candidates =
        reminderType === "commission.due"
          ? await this.finance.listCommissionCandidates()
          : await this.finance.listReceivableCandidates();
      const rules = await this.rules.listEnabledDomainEventRules(reminderType);
      for (const loaded of rules) {
        const days = reminderDays(
          reminderType,
          loaded.definition.action.payload,
        );
        if (days === null) continue;
        for (const candidate of candidates) {
          if (candidate.organizationId !== loaded.rule.organizationId) continue;
          if (
            candidate.targetType !==
            (reminderType === "commission.due" ? "COMMISSION" : "RECEIVABLE")
          )
            continue;
          if (
            !reminderWindowReached({
              reminderType,
              dueAt: candidate.dueAt,
              now,
              days,
            })
          )
            continue;
          occurrences.push(
            Object.freeze({
              organizationId: candidate.organizationId,
              ruleId: loaded.rule.id,
              eventId: financeReminderOccurrenceId({
                organizationId: candidate.organizationId,
                targetType: candidate.targetType,
                targetId: candidate.targetId,
                reminderType,
                dueOccurrence: candidate.dueOccurrence,
              }),
              eventType: reminderType,
              targetType: candidate.targetType,
              targetId: candidate.targetId,
              subject: this.subject(candidate, reminderType),
              now,
            }),
          );
        }
      }
    }
    return Object.freeze(occurrences);
  }

  private subject(
    candidate: FinanceReminderCandidate,
    reminderType: FinanceReminderType,
  ): Readonly<Record<string, unknown>> {
    return Object.freeze({
      finance: Object.freeze({
        targetType: candidate.targetType,
        targetId: candidate.targetId,
        organizationId: candidate.organizationId,
        reminderType,
        dueAt: candidate.dueAt.toISOString(),
        status: candidate.status,
        dueOccurrence: candidate.dueOccurrence,
      }),
    });
  }
}
