import { createHash } from "node:crypto";
import type { Lead, LeadStage } from "../../leads/domain/lead.js";

export const LEAD_AUTOMATION_EVENT_TYPES = [
  "lead.created",
  "lead.stage_changed",
  "lead.assignment_changed",
  "lead.response_sla_breached",
  "lead.inactivity_breached",
] as const;
export type LeadAutomationEventType =
  (typeof LEAD_AUTOMATION_EVENT_TYPES)[number];

export type LeadAutomationSlaPolicy = Readonly<{
  responseMinutesByStage: Partial<Record<LeadStage, number>>;
  inactivityMinutesByStage: Partial<Record<LeadStage, number>>;
}>;

export type LeadAutomationBreach = Readonly<{
  eventType: "lead.response_sla_breached" | "lead.inactivity_breached";
  eventId: string;
  occurredAt: Date;
  subject: Readonly<Record<string, unknown>>;
}>;

const ACTIVE_STAGES = new Set<LeadStage>([
  "NEW",
  "CONTACTED",
  "QUALIFIED",
  "NURTURING",
]);

function positiveMinutes(value: number | undefined, fallback: number): number {
  return Number.isSafeInteger(value) && value !== undefined && value > 0
    ? value
    : fallback;
}

function occurrenceId(input: {
  organizationId: string;
  leadId: string;
  eventType: string;
  resetVersion: number;
}): string {
  const digest = createHash("sha256")
    .update(
      JSON.stringify({
        organizationId: input.organizationId,
        leadId: input.leadId,
        eventType: input.eventType,
        resetVersion: input.resetVersion,
      }),
      "utf8",
    )
    .digest("hex");
  return `${digest.slice(0, 8)}-${digest.slice(8, 12)}-4${digest.slice(13, 16)}-8${digest.slice(17, 20)}-${digest.slice(20, 32)}`;
}

function eventSubject(
  lead: Lead,
  eventType: LeadAutomationBreach["eventType"],
): Readonly<Record<string, unknown>> {
  return Object.freeze({
    lead: Object.freeze({
      id: lead.id,
      organizationId: lead.organizationId,
      ownerId: lead.ownerId,
      stage: lead.stage,
      version: lead.version,
      createdAt: lead.createdAt.toISOString(),
      updatedAt: lead.updatedAt.toISOString(),
    }),
    breachType: eventType,
  });
}

/**
 * Derive the current breach occurrence from the lead's version. Any accepted
 * lead mutation advances that version and therefore resets the occurrence;
 * replaying a sweep without a reset produces the same event id.
 */
export function detectLeadBreaches(input: {
  lead: Lead;
  now: Date;
  policy?: LeadAutomationSlaPolicy;
}): LeadAutomationBreach[] {
  const { lead, now } = input;
  if (!ACTIVE_STAGES.has(lead.stage)) return [];
  const policy = input.policy ?? {
    responseMinutesByStage: { NEW: 60 },
    inactivityMinutesByStage: {
      CONTACTED: 24 * 60,
      QUALIFIED: 48 * 60,
      NURTURING: 72 * 60,
    },
  };
  const breaches: LeadAutomationBreach[] = [];
  const responseMinutes = policy.responseMinutesByStage[lead.stage];
  if (lead.stage === "NEW" && responseMinutes !== undefined) {
    const deadline = new Date(
      lead.createdAt.getTime() + positiveMinutes(responseMinutes, 60) * 60_000,
    );
    if (deadline.getTime() <= now.getTime()) {
      const eventType = "lead.response_sla_breached" as const;
      breaches.push(
        Object.freeze({
          eventType,
          eventId: occurrenceId({
            organizationId: lead.organizationId,
            leadId: lead.id,
            eventType,
            resetVersion: lead.version,
          }),
          occurredAt: deadline,
          subject: eventSubject(lead, eventType),
        }),
      );
    }
  }
  const inactivityMinutes = policy.inactivityMinutesByStage[lead.stage];
  if (inactivityMinutes !== undefined) {
    const deadline = new Date(
      lead.updatedAt.getTime() +
        positiveMinutes(inactivityMinutes, 24 * 60) * 60_000,
    );
    if (deadline.getTime() <= now.getTime()) {
      const eventType = "lead.inactivity_breached" as const;
      breaches.push(
        Object.freeze({
          eventType,
          eventId: occurrenceId({
            organizationId: lead.organizationId,
            leadId: lead.id,
            eventType,
            resetVersion: lead.version,
          }),
          occurredAt: deadline,
          subject: eventSubject(lead, eventType),
        }),
      );
    }
  }
  return breaches;
}

export function leadEventId(input: {
  organizationId: string;
  leadId: string;
  eventType: LeadAutomationEventType;
  resetVersion: number;
}): string {
  return occurrenceId(input);
}

export type LeadAutomationDefaultRule = Readonly<{
  name: string;
  definition: Readonly<{
    trigger: Readonly<{
      kind: "DOMAIN_EVENT";
      eventType: LeadAutomationEventType;
    }>;
    conditions: readonly [];
    action: Readonly<{
      actionType:
        | "CREATE_LEAD_TASK"
        | "CREATE_INTERNAL_NOTIFICATION"
        | "ADD_LEAD_TIMELINE_NOTE";
      payload: Readonly<Record<string, string>>;
    }>;
  }>;
}>;

/** Closed-world, Arabic-first starter rules; callers append them per tenant. */
export function defaultLeadAutomationRules(): LeadAutomationDefaultRule[] {
  return [
    {
      name: "أول متابعة للعميل",
      definition: {
        trigger: { kind: "DOMAIN_EVENT", eventType: "lead.created" },
        conditions: [],
        action: {
          actionType: "CREATE_LEAD_TASK",
          payload: { title: "التواصل الأول مع العميل", dueInMinutes: "60" },
        },
      },
    },
    {
      name: "تجاوز مهلة الرد",
      definition: {
        trigger: {
          kind: "DOMAIN_EVENT",
          eventType: "lead.response_sla_breached",
        },
        conditions: [],
        action: {
          actionType: "CREATE_INTERNAL_NOTIFICATION",
          payload: { template: "lead-response-sla-breached" },
        },
      },
    },
    {
      name: "تصعيد خمول العميل",
      definition: {
        trigger: {
          kind: "DOMAIN_EVENT",
          eventType: "lead.inactivity_breached",
        },
        conditions: [],
        action: {
          actionType: "CREATE_LEAD_TASK",
          payload: { title: "متابعة العميل الخامل", dueInMinutes: "0" },
        },
      },
    },
    {
      name: "تغيير مسؤول العميل",
      definition: {
        trigger: { kind: "DOMAIN_EVENT", eventType: "lead.assignment_changed" },
        conditions: [],
        action: {
          actionType: "CREATE_INTERNAL_NOTIFICATION",
          payload: { template: "lead-assignment-changed" },
        },
      },
    },
  ];
}
