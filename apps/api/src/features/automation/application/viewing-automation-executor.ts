import { createLeadTask } from "../../leads/domain/lead.js";
import type { LeadRepository } from "../../leads/application/lead-repository.js";
import type {
  AutomationActionExecutionOutcome,
  AutomationActionExecutionRequest,
  AutomationActionPort,
  SchedulerRuleReader,
} from "./automation-action-port.js";
import type { AutomationOutboundDelivery } from "./lead-automation-executor.js";
import type { ViewingAutomationRepository } from "./viewing-automation-repository.js";

function executionUuid(executionKey: string): string {
  return `${executionKey.slice(0, 8)}-${executionKey.slice(8, 12)}-4${executionKey.slice(13, 16)}-8${executionKey.slice(17, 20)}-${executionKey.slice(20, 32)}`;
}

function payloadText(
  payload: Readonly<Record<string, string>>,
  key: string,
): string | undefined {
  const value = payload[key];
  return value?.trim() || undefined;
}

function dueInMinutes(payload: Readonly<Record<string, string>>): number {
  const value = Number(payload.dueInMinutes ?? "1440");
  if (!Number.isSafeInteger(value) || value < 0 || value > 60 * 24 * 30)
    throw new Error(
      "viewing follow-up dueInMinutes is outside the supported bound",
    );
  return value;
}

/** EF-502 actions stay in the API; the worker only drives runTick. */
export class ViewingAutomationActionExecutor implements AutomationActionPort {
  constructor(
    private readonly viewings: ViewingAutomationRepository,
    private readonly rules: SchedulerRuleReader,
    private readonly leads: LeadRepository,
    private readonly delivery: AutomationOutboundDelivery,
  ) {}

  async executeAction(
    request: AutomationActionExecutionRequest,
  ): Promise<AutomationActionExecutionOutcome> {
    const job = request.job;
    if (job.targetType !== "VIEWING")
      return this.permanent("automation action target is not a viewing");
    if (!job.eventId)
      return this.permanent("viewing automation occurrence is missing");
    const occurrence = await this.viewings.findPendingOccurrence(
      job.organizationId,
      job.eventId,
    );
    if (!occurrence) return { kind: "succeeded" };
    const loaded = await this.rules.findRuleVersion(
      job.organizationId,
      job.ruleId,
      job.ruleVersion,
    );
    if (!loaded) return this.permanent("automation rule version is missing");
    const payload = loaded.definition.action.payload;
    try {
      if (job.actionType === "CREATE_INTERNAL_NOTIFICATION") {
        const template = payloadText(payload, "template");
        if (!template)
          return this.permanent("viewing notification template is missing");
        await this.delivery.deliver({
          organizationId: occurrence.organizationId,
          recipientUserId: occurrence.brokerId,
          template,
          locale: "ar",
          variables: {
            targetLabel: `viewing ${occurrence.viewingId}`,
            dueDate: occurrence.startAt.toISOString(),
          },
          idempotencyKey: `viewing-occurrence:${occurrence.eventId}`,
        });
        return { kind: "succeeded" };
      }
      if (job.actionType !== "CREATE_VIEWING_FOLLOW_UP")
        return this.permanent("viewing automation action is not supported");
      const title =
        payloadText(payload, "taskTitle") ?? "تسجيل نتيجة المعاينة والمتابعة";
      const suggestedLeadStage =
        payloadText(payload, "suggestedLeadStage") ??
        occurrence.suggestedLeadStage ??
        "QUALIFIED";
      const lead = await this.leads.findLead(
        occurrence.organizationId,
        occurrence.leadId,
      );
      if (!lead) return this.permanent("viewing Lead target is missing");
      const task = createLeadTask({
        id: executionUuid(occurrence.eventId.replaceAll("-", "")),
        organizationId: occurrence.organizationId,
        leadId: occurrence.leadId,
        title: `${title} (المرحلة المقترحة: ${suggestedLeadStage})`,
        dueAt: new Date(
          job.scheduledFor.getTime() + dueInMinutes(payload) * 60_000,
        ),
        createdByUserId: occurrence.brokerId,
        createdAt: job.scheduledFor,
      });
      const result = await this.leads.createLeadTask({
        organizationId: occurrence.organizationId,
        leadId: occurrence.leadId,
        createdByUserId: occurrence.brokerId,
        idempotencyKey: `viewing-occurrence:${occurrence.eventId}:follow-up`,
        task,
        timelineEvent: task.timelineEvent,
      });
      if (result.kind !== "ok" && result.kind !== "idempotent-replay")
        return this.permanent("viewing follow-up task could not be persisted");
      const template =
        payloadText(payload, "template") ?? "viewing-outcome-request";
      await this.delivery.deliver({
        organizationId: occurrence.organizationId,
        recipientUserId: occurrence.brokerId,
        template,
        locale: "ar",
        variables: {
          targetLabel: `viewing ${occurrence.viewingId}; suggested Lead transition: ${suggestedLeadStage}`,
          dueDate: occurrence.startAt.toISOString(),
          actionUrl: `/ar/organizations/${occurrence.organizationId}/viewings/${occurrence.viewingId}`,
        },
        idempotencyKey: `viewing-occurrence:${occurrence.eventId}:notification`,
      });
      return { kind: "succeeded" };
    } catch (error) {
      if (
        error instanceof Error &&
        error.message.includes("outside the supported")
      )
        return this.permanent(error.message);
      return {
        kind: "failed",
        retryable: true,
        errorKind: "action-transient-failure",
        message: "viewing automation persistence failed; retry is safe",
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
