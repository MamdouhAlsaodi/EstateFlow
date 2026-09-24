import type {
  AutomationOccurrenceSource,
  AutomationSweepOccurrence,
  SchedulerRuleReader,
} from "./automation-action-port.js";
import type { FinanceReminderCoordinator } from "./finance-reminder-coordinator.js";
import type { ViewingAutomationRepository } from "./viewing-automation-repository.js";
import {
  viewingOutcomeEventType,
  viewingReminderEventType,
  type ViewingAutomationKind,
} from "../domain/viewing-automation.js";

const VIEWING_EVENTS = [
  "viewing.reminder_24h",
  "viewing.reminder_1h",
  "viewing.outcome_requested",
] as const;

/** Combines domain occurrence sources while preserving one scheduler tick. */
export class AutomationOccurrenceCoordinator implements AutomationOccurrenceSource {
  constructor(
    private readonly rules: SchedulerRuleReader,
    private readonly finance: FinanceReminderCoordinator,
    private readonly viewings: ViewingAutomationRepository,
  ) {}

  async listDueOccurrences(
    now: Date,
  ): Promise<readonly AutomationSweepOccurrence[]> {
    const [finance, viewingRows] = await Promise.all([
      this.finance.listDueOccurrences(now),
      this.viewings.listDueOccurrences(now),
    ]);
    const viewing: AutomationSweepOccurrence[] = [];
    for (const row of viewingRows) {
      const eventType = eventTypeFor(row.kind);
      const rules = await this.rules.listEnabledDomainEventRules(eventType);
      for (const loaded of rules) {
        if (loaded.rule.organizationId !== row.organizationId) continue;
        viewing.push({
          organizationId: row.organizationId,
          ruleId: loaded.rule.id,
          eventId: row.eventId,
          eventType,
          targetType: "VIEWING",
          targetId: row.viewingId,
          subject: {
            viewing: {
              id: row.viewingId,
              leadId: row.leadId,
              brokerId: row.brokerId,
              startAt: row.startAt.toISOString(),
              endAt: row.endAt.toISOString(),
              kind: row.kind,
              suggestedLeadStage: row.suggestedLeadStage,
            },
          },
          now,
        });
      }
    }
    return Object.freeze([...finance, ...viewing]);
  }
}

function eventTypeFor(kind: ViewingAutomationKind) {
  if (kind === "OUTCOME_REQUEST") return viewingOutcomeEventType();
  return viewingReminderEventType(kind);
}

export function isViewingAutomationEvent(
  value: string,
): value is (typeof VIEWING_EVENTS)[number] {
  return (VIEWING_EVENTS as readonly string[]).includes(value);
}
