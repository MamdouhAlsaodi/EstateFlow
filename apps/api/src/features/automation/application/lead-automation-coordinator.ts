import type { AutomationScheduler } from "./automation-scheduler.js";
import type { SchedulerRuleReader } from "./automation-action-port.js";
import type { LeadRepository } from "../../leads/application/lead-repository.js";
import type { Lead, LeadStage } from "../../leads/domain/lead.js";
import {
  detectLeadBreaches,
  leadEventId,
  type LeadAutomationEventType,
  type LeadAutomationSlaPolicy,
} from "../domain/lead-automation.js";

export type LeadAutomationEvent = Readonly<{
  organizationId: string;
  leadId: string;
  eventId: string;
  eventType: LeadAutomationEventType;
  subject: Readonly<Record<string, unknown>>;
  occurredAt: Date;
}>;

/**
 * Bridges committed Lead lifecycle facts to the EF-302 scheduler. Event ids
 * are stable for a breach/reset version, so repeated worker sweeps enqueue
 * once and a later accepted Lead mutation creates the next occurrence.
 */
export class LeadAutomationCoordinator {
  constructor(
    private readonly scheduler: AutomationScheduler,
    private readonly rules: SchedulerRuleReader,
    private readonly leads: LeadRepository,
  ) {}

  async publish(event: LeadAutomationEvent): Promise<number> {
    const candidates = await this.rules.listEnabledDomainEventRules(
      event.eventType,
    );
    let scheduled = 0;
    for (const candidate of candidates) {
      if (candidate.rule.organizationId !== event.organizationId) continue;
      const result = await this.scheduler.enqueueDomainEventOccurrence({
        organizationId: event.organizationId,
        ruleId: candidate.rule.id,
        eventId: event.eventId,
        eventType: event.eventType,
        targetType: "LEAD",
        targetId: event.leadId,
        subject: event.subject,
        now: event.occurredAt,
      });
      if (result.kind === "scheduled") scheduled += 1;
    }
    return scheduled;
  }

  async publishLeadLifecycle(input: {
    lead: Lead;
    eventType: Extract<
      LeadAutomationEventType,
      "lead.created" | "lead.stage_changed" | "lead.assignment_changed"
    >;
    subject?: Readonly<Record<string, unknown>>;
    occurredAt?: Date;
  }): Promise<number> {
    const eventType = input.eventType;
    return this.publish({
      organizationId: input.lead.organizationId,
      leadId: input.lead.id,
      eventId: leadEventId({
        organizationId: input.lead.organizationId,
        leadId: input.lead.id,
        eventType,
        resetVersion: input.lead.version,
      }),
      eventType,
      occurredAt: input.occurredAt ?? input.lead.updatedAt,
      subject:
        input.subject ??
        Object.freeze({
          lead: Object.freeze({
            id: input.lead.id,
            ownerId: input.lead.ownerId,
            stage: input.lead.stage,
            version: input.lead.version,
          }),
        }),
    });
  }

  /** Sweep one tenant; callers provide the tenant boundary explicitly. */
  async evaluateBreaches(input: {
    organizationId: string;
    now: Date;
    policy?: LeadAutomationSlaPolicy;
  }): Promise<{ inspected: number; scheduled: number }> {
    let cursor: string | undefined;
    let inspected = 0;
    let scheduled = 0;
    do {
      const page = await this.leads.listLeads(input.organizationId, {
        cursor,
        limit: 100,
      });
      for (const lead of page.items) {
        inspected += 1;
        const breaches = detectLeadBreaches({
          lead,
          now: input.now,
          policy: input.policy,
        });
        for (const breach of breaches) {
          scheduled += await this.publish({
            organizationId: lead.organizationId,
            leadId: lead.id,
            eventId: breach.eventId,
            eventType: breach.eventType,
            subject: breach.subject,
            occurredAt: breach.occurredAt,
          });
        }
      }
      cursor = page.nextCursor ?? undefined;
    } while (cursor !== undefined);
    return { inspected, scheduled };
  }

  async publishAssignmentChange(input: {
    lead: Lead;
    fromOwnerId: string;
    occurredAt?: Date;
  }): Promise<number> {
    return this.publishLeadLifecycle({
      lead: input.lead,
      eventType: "lead.assignment_changed",
      occurredAt: input.occurredAt,
      subject: Object.freeze({
        lead: Object.freeze({
          id: input.lead.id,
          ownerId: input.lead.ownerId,
          previousOwnerId: input.fromOwnerId,
          stage: input.lead.stage,
          version: input.lead.version,
        }),
      }),
    });
  }
}

export type LeadAutomationStage = LeadStage;
