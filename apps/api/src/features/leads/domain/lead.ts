export const LeadStage = {
  NEW: "NEW",
  CONTACTED: "CONTACTED",
  QUALIFIED: "QUALIFIED",
  NURTURING: "NURTURING",
} as const;
export type LeadStage = (typeof LeadStage)[keyof typeof LeadStage];

export type LeadUtm = Readonly<{
  source?: string;
  medium?: string;
  campaign?: string;
  term?: string;
  content?: string;
}>;

export type Lead = Readonly<{
  id: string;
  organizationId: string;
  ownerId: string;
  stage: LeadStage;
  nextAction: string;
  source: string;
  utm: LeadUtm;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}>;

export type TimelineEventType =
  | "LEAD_CREATED"
  | "LEAD_ASSIGNED"
  | "LEAD_STAGE_CHANGED"
  | "LEAD_NEXT_ACTION_CHANGED";

export type TimelineEventIntent = Readonly<{
  type: TimelineEventType;
  leadId: string;
  organizationId: string;
  occurredAt: Date;
  data: Readonly<Record<string, string | null>>;
}>;

export class LeadValidationError extends Error {
  constructor(message: string) { super(message); this.name = "LeadValidationError"; }
}
export class LeadOwnershipConflictError extends Error {
  constructor() { super("Lead organization ownership conflict"); this.name = "LeadOwnershipConflictError"; }
}
export class LeadVersionConflictError extends Error {
  constructor() { super("Lead version conflict"); this.name = "LeadVersionConflictError"; }
}
export class LeadTransitionError extends Error {
  constructor(message = "Invalid lead stage transition") { super(message); this.name = "LeadTransitionError"; }
}

const transitions: Readonly<Record<LeadStage, readonly LeadStage[]>> = {
  NEW: [LeadStage.CONTACTED],
  CONTACTED: [LeadStage.QUALIFIED, LeadStage.NEW],
  QUALIFIED: [LeadStage.NURTURING, LeadStage.CONTACTED],
  NURTURING: [LeadStage.CONTACTED],
};

function requiredText(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim().length === 0 || value.length > 500) throw new LeadValidationError(`Invalid ${field}`);
  return value;
}

function optionalUtm(value: unknown): LeadUtm {
  if (value === undefined || value === null) return {};
  if (typeof value !== "object" || Array.isArray(value)) throw new LeadValidationError("Invalid utm");
  const utmFields: Record<string, string> = {};
  for (const [key, item] of Object.entries(value)) utmFields[key] = requiredText(item, `utm.${key}`);
  return Object.freeze(utmFields);
}

function requireVersion(actual: number, expected: unknown): void {
  if (!Number.isSafeInteger(expected) || expected !== actual) throw new LeadVersionConflictError();
}

function event(lead: Lead, type: TimelineEventType, occurredAt: Date, data: Record<string, string | null>): TimelineEventIntent {
  return Object.freeze({ type, leadId: lead.id, organizationId: lead.organizationId, occurredAt, data: Object.freeze(data) });
}

export function createLead(input: {
  id: string;
  organizationId: string;
  ownerId: string | null;
  nextAction: string;
  source: string;
  utm?: unknown;
  now: Date;
}): Lead {
  if (typeof input.organizationId !== "string" || input.organizationId.trim().length === 0) throw new LeadOwnershipConflictError();
  const organizationId = input.organizationId;
  const lead: Lead = Object.freeze({
    id: requiredText(input.id, "id"),
    organizationId,
    ownerId: requiredText(input.ownerId, "owner"),
    stage: LeadStage.NEW,
    nextAction: requiredText(input.nextAction, "next action"),
    source: requiredText(input.source, "source"),
    utm: optionalUtm(input.utm),
    version: 1,
    createdAt: input.now,
    updatedAt: input.now,
  });
  return lead;
}

export function transitionLead(lead: Lead, to: unknown, expectedVersion: number, now: Date): { lead: Lead; timelineEvent: TimelineEventIntent } {
  requireVersion(lead.version, expectedVersion);
  if (!Object.values(LeadStage).includes(to as LeadStage)) throw new LeadTransitionError("Invalid lead stage");
  if (!transitions[lead.stage].includes(to as LeadStage)) throw new LeadTransitionError();
  const next = Object.freeze({ ...lead, stage: to as LeadStage, version: lead.version + 1, updatedAt: now });
  return { lead: next, timelineEvent: event(lead, "LEAD_STAGE_CHANGED", now, { from: lead.stage, to: next.stage }) };
}

export function assignLead(lead: Lead, ownerId: unknown, expectedVersion: number, now: Date): { lead: Lead; timelineEvent: TimelineEventIntent } {
  requireVersion(lead.version, expectedVersion);
  const nextOwner = requiredText(ownerId, "owner");
  const next = Object.freeze({ ...lead, ownerId: nextOwner, version: lead.version + 1, updatedAt: now });
  return { lead: next, timelineEvent: event(lead, "LEAD_ASSIGNED", now, { fromOwnerId: lead.ownerId, toOwnerId: nextOwner }) };
}

export function setLeadNextAction(lead: Lead, nextAction: unknown, expectedVersion: number, now: Date): { lead: Lead; timelineEvent: TimelineEventIntent } {
  requireVersion(lead.version, expectedVersion);
  const value = requiredText(nextAction, "next action");
  const next = Object.freeze({ ...lead, nextAction: value, version: lead.version + 1, updatedAt: now });
  return { lead: next, timelineEvent: event(lead, "LEAD_NEXT_ACTION_CHANGED", now, { from: lead.nextAction, to: value }) };
}
