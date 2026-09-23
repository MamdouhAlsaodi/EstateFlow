import type { LeadRepository } from "../../leads/application/lead-repository.js";
import { createLeadNote, createLeadTask } from "../../leads/domain/lead.js";
import type {
  AutomationActionExecutionOutcome,
  AutomationActionPort,
  AutomationActionExecutionRequest,
  SchedulerRuleReader,
} from "./automation-action-port.js";
import type { AutomationRuleDefinition } from "../domain/rule.js";

export const AUTOMATION_OUTBOUND_DELIVERY = Symbol(
  "AUTOMATION_OUTBOUND_DELIVERY",
);

export type AutomationNotification = Readonly<{
  organizationId: string;
  recipientUserId: string;
  template: string;
  idempotencyKey: string;
  locale?: "ar" | "en";
  variables?: Readonly<Record<string, string>>;
}>;

export interface AutomationOutboundDelivery {
  deliver(notification: AutomationNotification): Promise<void>;
}

/** Test/demo delivery compatible with the fake-delivery boundary. */
export class InMemoryAutomationDelivery implements AutomationOutboundDelivery {
  private readonly deliveries = new Map<string, AutomationNotification>();

  async deliver(notification: AutomationNotification): Promise<void> {
    if (!this.deliveries.has(notification.idempotencyKey))
      this.deliveries.set(notification.idempotencyKey, notification);
  }

  get size(): number {
    return this.deliveries.size;
  }
}

function executionUuid(executionKey: string): string {
  return `${executionKey.slice(0, 8)}-${executionKey.slice(8, 12)}-4${executionKey.slice(13, 16)}-8${executionKey.slice(17, 20)}-${executionKey.slice(20, 32)}`;
}

function payloadText(
  definition: AutomationRuleDefinition,
  key: string,
): string | undefined {
  return definition.action.payload[key];
}

function boundedMinutes(definition: AutomationRuleDefinition): number {
  const raw = payloadText(definition, "dueInMinutes");
  const minutes = raw === undefined ? 60 : Number(raw);
  if (!Number.isSafeInteger(minutes) || minutes < 0 || minutes > 60 * 24 * 30)
    throw new Error("automation dueInMinutes is outside the supported bound");
  return minutes;
}

/**
 * Concrete Lead actions. Persistence is delegated to the existing Lead
 * repository so its organization composite keys, idempotency records and
 * append-only timeline are reused rather than bypassed.
 */
export class LeadAutomationActionExecutor implements AutomationActionPort {
  constructor(
    private readonly leads: LeadRepository,
    private readonly rules: SchedulerRuleReader,
    private readonly delivery: AutomationOutboundDelivery,
  ) {}

  async executeAction(
    request: AutomationActionExecutionRequest,
  ): Promise<AutomationActionExecutionOutcome> {
    const job = request.job;
    if (job.targetType !== "LEAD")
      return this.permanent("automation action target is not a Lead");
    const loaded = await this.rules.findRuleVersion(
      job.organizationId,
      job.ruleId,
      job.ruleVersion,
    );
    if (!loaded) return this.permanent("automation rule version is missing");
    const lead = await this.leads.findLead(job.organizationId, job.targetId);
    if (!lead) return this.permanent("automation Lead target is missing");
    const definition = loaded.definition;
    try {
      switch (job.actionType) {
        case "CREATE_LEAD_TASK": {
          const title = payloadText(definition, "title");
          if (!title) return this.permanent("automation task title is missing");
          const task = createLeadTask({
            id: executionUuid(job.executionKey),
            organizationId: lead.organizationId,
            leadId: lead.id,
            title,
            dueAt: new Date(
              job.scheduledFor.getTime() + boundedMinutes(definition) * 60_000,
            ),
            createdByUserId: lead.ownerId,
            createdAt: job.scheduledFor,
          });
          const result = await this.leads.createLeadTask({
            organizationId: lead.organizationId,
            leadId: lead.id,
            createdByUserId: lead.ownerId,
            idempotencyKey: `automation:${job.executionKey}`,
            task,
            timelineEvent: task.timelineEvent,
          });
          return result.kind === "ok" || result.kind === "idempotent-replay"
            ? { kind: "succeeded" }
            : this.permanent("automation task could not be persisted");
        }
        case "ADD_LEAD_TIMELINE_NOTE": {
          const body = payloadText(definition, "body");
          if (!body) return this.permanent("automation note body is missing");
          const note = createLeadNote({
            id: executionUuid(job.executionKey),
            organizationId: lead.organizationId,
            leadId: lead.id,
            body,
            createdByUserId: lead.ownerId,
            createdAt: job.scheduledFor,
          });
          const result = await this.leads.createLeadNote({
            organizationId: lead.organizationId,
            leadId: lead.id,
            createdByUserId: lead.ownerId,
            idempotencyKey: `automation:${job.executionKey}`,
            note,
            timelineEvent: note.timelineEvent,
          });
          return result.kind === "ok" || result.kind === "idempotent-replay"
            ? { kind: "succeeded" }
            : this.permanent("automation timeline note could not be persisted");
        }
        case "CREATE_INTERNAL_NOTIFICATION": {
          const template = payloadText(definition, "template");
          if (!template)
            return this.permanent(
              "automation notification template is missing",
            );
          await this.delivery.deliver({
            organizationId: lead.organizationId,
            recipientUserId: lead.ownerId,
            template,
            idempotencyKey: `automation:${job.executionKey}`,
          });
          return { kind: "succeeded" };
        }
        default:
          return this.permanent("automation action type is not supported");
      }
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
        message: "lead automation persistence failed; retry is safe",
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
