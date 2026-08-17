export const LeadStage = {
  NEW: "NEW",
  CONTACTED: "CONTACTED",
  QUALIFIED: "QUALIFIED",
  NURTURING: "NURTURING",
  CLOSED_WON: "CLOSED_WON",
  CLOSED_LOST: "CLOSED_LOST",
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
  | "LEAD_NEXT_ACTION_CHANGED"
  | "LEAD_NOTE_ADDED"
  | "LEAD_TASK_CREATED"
  | "LEAD_TASK_COMPLETED"
  | "LEAD_TASK_RESCHEDULED"
  | "LEAD_CLOSED_WON"
  | "LEAD_CLOSED_LOST";

export type TimelineEventIntent = Readonly<{
  type: TimelineEventType;
  leadId: string;
  organizationId: string;
  occurredAt: Date;
  data: Readonly<Record<string, string | null>>;
}>;

export class LeadValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LeadValidationError";
  }
}
export class LeadOwnershipConflictError extends Error {
  constructor() {
    super("Lead organization ownership conflict");
    this.name = "LeadOwnershipConflictError";
  }
}
export class LeadVersionConflictError extends Error {
  constructor() {
    super("Lead version conflict");
    this.name = "LeadVersionConflictError";
  }
}
export class LeadTransitionError extends Error {
  constructor(message = "Invalid lead stage transition") {
    super(message);
    this.name = "LeadTransitionError";
  }
}

export type Deal = Readonly<{
  id: string;
  organizationId: string;
  leadId: string;
  propertyId: string;
  brokerId: string;
  status: "OPEN";
  version: 1;
  createdAt: Date;
  updatedAt: Date;
}>;

export type DealClosedWonEventIntent = Readonly<{
  schemaVersion: 1;
  organizationId: string;
  dealId: string;
  leadId: string;
  propertyId: string;
  brokerId: string;
  occurredAt: Date;
}>;

export type LeadNote = Readonly<{
  id: string;
  organizationId: string;
  leadId: string;
  body: string;
  createdByUserId: string;
  createdAt: Date;
  timelineEvent: TimelineEventIntent;
}>;
export type LeadTaskStatus = "OPEN" | "COMPLETED";
export type LeadTask = Readonly<{
  id: string;
  organizationId: string;
  leadId: string;
  title: string;
  dueAt: Date;
  status: LeadTaskStatus;
  createdByUserId: string;
  createdAt: Date;
  completedAt: Date | null;
  version: number;
  timelineEvent: TimelineEventIntent;
}>;

const transitions: Readonly<Record<LeadStage, readonly LeadStage[]>> = {
  NEW: [LeadStage.CONTACTED],
  CONTACTED: [LeadStage.QUALIFIED, LeadStage.NEW],
  QUALIFIED: [LeadStage.NURTURING, LeadStage.CONTACTED],
  NURTURING: [LeadStage.CONTACTED],
  CLOSED_WON: [],
  CLOSED_LOST: [],
};

function requiredText(value: unknown, field: string): string {
  if (
    typeof value !== "string" ||
    value.trim().length === 0 ||
    value.length > 500
  )
    throw new LeadValidationError(`Invalid ${field}`);
  return value;
}

function optionalUtm(value: unknown): LeadUtm {
  if (value === undefined || value === null) return {};
  if (typeof value !== "object" || Array.isArray(value))
    throw new LeadValidationError("Invalid utm");
  const utmFields: Record<string, string> = {};
  for (const [key, item] of Object.entries(value))
    utmFields[key] = requiredText(item, `utm.${key}`);
  return Object.freeze(utmFields);
}

function requireVersion(actual: number, expected: unknown): void {
  if (!Number.isSafeInteger(expected) || expected !== actual)
    throw new LeadVersionConflictError();
}

function requireActiveLead(lead: Lead): void {
  if (
    lead.stage === LeadStage.CLOSED_WON ||
    lead.stage === LeadStage.CLOSED_LOST
  )
    throw new LeadTransitionError();
}

function boundedText(value: unknown, field: string, maximum: number): string {
  if (typeof value !== "string")
    throw new LeadValidationError(`Invalid ${field}`);
  const trimmed = value.trim();
  if (trimmed.length === 0 || trimmed.length > maximum)
    throw new LeadValidationError(`Invalid ${field}`);
  return trimmed;
}

function validDate(value: unknown, field: string): Date {
  if (!(value instanceof Date) || !Number.isFinite(value.getTime()))
    throw new LeadValidationError(`Invalid ${field}`);
  return value;
}

function event(
  lead: Lead,
  type: TimelineEventType,
  occurredAt: Date,
  data: Record<string, string | null>,
): TimelineEventIntent {
  return Object.freeze({
    type,
    leadId: lead.id,
    organizationId: lead.organizationId,
    occurredAt,
    data: Object.freeze(data),
  });
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
  if (
    typeof input.organizationId !== "string" ||
    input.organizationId.trim().length === 0
  )
    throw new LeadOwnershipConflictError();
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

export function closeWon(input: {
  lead: Lead;
  dealId: unknown;
  propertyId: unknown;
  brokerId: unknown;
  expectedVersion: number;
  now: Date;
}): {
  lead: Lead;
  deal: Deal;
  timelineEvent: TimelineEventIntent;
  event: DealClosedWonEventIntent;
} {
  requireVersion(input.lead.version, input.expectedVersion);
  if (
    input.lead.stage !== LeadStage.QUALIFIED &&
    input.lead.stage !== LeadStage.NURTURING
  )
    throw new LeadTransitionError();
  const now = validDate(input.now, "now");
  const dealId = boundedText(input.dealId, "deal", 500);
  const propertyId = boundedText(input.propertyId, "property", 500);
  const brokerId = boundedText(input.brokerId, "broker", 500);
  const lead = Object.freeze({
    ...input.lead,
    stage: LeadStage.CLOSED_WON,
    version: input.lead.version + 1,
    updatedAt: now,
  });
  const timelineEvent = event(input.lead, "LEAD_CLOSED_WON", now, {
    dealId,
    propertyId,
    brokerId,
  });
  const deal = Object.freeze({
    id: dealId,
    organizationId: lead.organizationId,
    leadId: lead.id,
    propertyId,
    brokerId,
    status: "OPEN" as const,
    version: 1 as const,
    createdAt: now,
    updatedAt: now,
  });
  const eventIntent = Object.freeze({
    schemaVersion: 1 as const,
    organizationId: lead.organizationId,
    dealId,
    leadId: lead.id,
    propertyId,
    brokerId,
    occurredAt: now,
  });
  return { lead, deal, timelineEvent, event: eventIntent };
}

export function closeLost(input: {
  lead: Lead;
  reason: unknown;
  expectedVersion: number;
  now: Date;
}): { lead: Lead; timelineEvent: TimelineEventIntent } {
  requireVersion(input.lead.version, input.expectedVersion);
  if (
    input.lead.stage !== LeadStage.QUALIFIED &&
    input.lead.stage !== LeadStage.NURTURING
  )
    throw new LeadTransitionError();
  const now = validDate(input.now, "now");
  const reason = boundedText(input.reason, "reason", 1000);
  const lead = Object.freeze({
    ...input.lead,
    stage: LeadStage.CLOSED_LOST,
    version: input.lead.version + 1,
    updatedAt: now,
  });
  return {
    lead,
    timelineEvent: event(input.lead, "LEAD_CLOSED_LOST", now, { reason }),
  };
}

export function transitionLead(
  lead: Lead,
  to: unknown,
  expectedVersion: number,
  now: Date,
): { lead: Lead; timelineEvent: TimelineEventIntent } {
  requireVersion(lead.version, expectedVersion);
  if (!Object.values(LeadStage).includes(to as LeadStage))
    throw new LeadTransitionError("Invalid lead stage");
  if (!transitions[lead.stage].includes(to as LeadStage))
    throw new LeadTransitionError();
  const next = Object.freeze({
    ...lead,
    stage: to as LeadStage,
    version: lead.version + 1,
    updatedAt: now,
  });
  return {
    lead: next,
    timelineEvent: event(lead, "LEAD_STAGE_CHANGED", now, {
      from: lead.stage,
      to: next.stage,
    }),
  };
}

export function assignLead(
  lead: Lead,
  ownerId: unknown,
  expectedVersion: number,
  now: Date,
): { lead: Lead; timelineEvent: TimelineEventIntent } {
  requireVersion(lead.version, expectedVersion);
  requireActiveLead(lead);
  const nextOwner = requiredText(ownerId, "owner");
  const next = Object.freeze({
    ...lead,
    ownerId: nextOwner,
    version: lead.version + 1,
    updatedAt: now,
  });
  return {
    lead: next,
    timelineEvent: event(lead, "LEAD_ASSIGNED", now, {
      fromOwnerId: lead.ownerId,
      toOwnerId: nextOwner,
    }),
  };
}

export function setLeadNextAction(
  lead: Lead,
  nextAction: unknown,
  expectedVersion: number,
  now: Date,
): { lead: Lead; timelineEvent: TimelineEventIntent } {
  requireVersion(lead.version, expectedVersion);
  requireActiveLead(lead);
  const value = requiredText(nextAction, "next action");
  const next = Object.freeze({
    ...lead,
    nextAction: value,
    version: lead.version + 1,
    updatedAt: now,
  });
  return {
    lead: next,
    timelineEvent: event(lead, "LEAD_NEXT_ACTION_CHANGED", now, {
      from: lead.nextAction,
      to: value,
    }),
  };
}

export function createLeadNote(input: {
  id: string;
  organizationId: string;
  leadId: string;
  body: unknown;
  createdByUserId: string;
  createdAt: Date;
}): LeadNote {
  const note = {
    id: boundedText(input.id, "id", 500),
    organizationId: boundedText(input.organizationId, "organization", 500),
    leadId: boundedText(input.leadId, "lead", 500),
    body: boundedText(input.body, "body", 2000),
    createdByUserId: boundedText(input.createdByUserId, "actor", 500),
    createdAt: validDate(input.createdAt, "createdAt"),
  };
  const timelineEvent = event(
    { id: note.leadId, organizationId: note.organizationId } as Lead,
    "LEAD_NOTE_ADDED",
    note.createdAt,
    { noteId: note.id },
  );
  return Object.freeze({ ...note, timelineEvent });
}

export function createLeadTask(input: {
  id: string;
  organizationId: string;
  leadId: string;
  title: unknown;
  dueAt: Date;
  createdByUserId: string;
  createdAt: Date;
}): LeadTask {
  const task = {
    id: boundedText(input.id, "id", 500),
    organizationId: boundedText(input.organizationId, "organization", 500),
    leadId: boundedText(input.leadId, "lead", 500),
    title: boundedText(input.title, "title", 500),
    dueAt: validDate(input.dueAt, "dueAt"),
    status: "OPEN" as const,
    createdByUserId: boundedText(input.createdByUserId, "actor", 500),
    createdAt: validDate(input.createdAt, "createdAt"),
    completedAt: null,
    version: 1,
  };
  const timelineEvent = taskEvent(task, "LEAD_TASK_CREATED", task.createdAt, {
    taskId: task.id,
    dueAt: task.dueAt.toISOString(),
  });
  return Object.freeze({ ...task, timelineEvent });
}

function taskEvent(
  task: Pick<LeadTask, "leadId" | "organizationId">,
  type: TimelineEventType,
  occurredAt: Date,
  data: Record<string, string | null>,
): TimelineEventIntent {
  return Object.freeze({
    type,
    leadId: task.leadId,
    organizationId: task.organizationId,
    occurredAt,
    data: Object.freeze(data),
  });
}

export function completeLeadTask(
  task: LeadTask,
  expectedVersion: number,
  now: Date,
): { task: LeadTask; timelineEvent: TimelineEventIntent } {
  requireVersion(task.version, expectedVersion);
  if (task.status !== "OPEN") throw new LeadValidationError("Task is not open");
  const completedAt = validDate(now, "completedAt");
  const timelineEvent = taskEvent(task, "LEAD_TASK_COMPLETED", completedAt, {
    taskId: task.id,
    completedAt: completedAt.toISOString(),
  });
  const next = Object.freeze({
    ...task,
    status: "COMPLETED" as const,
    completedAt,
    version: task.version + 1,
    timelineEvent,
  });
  return { task: next, timelineEvent };
}

export function rescheduleLeadTask(
  task: LeadTask,
  dueAt: Date,
  expectedVersion: number,
  now = new Date(),
): { task: LeadTask; timelineEvent: TimelineEventIntent } {
  requireVersion(task.version, expectedVersion);
  if (task.status !== "OPEN") throw new LeadValidationError("Task is not open");
  const nextDueAt = validDate(dueAt, "dueAt");
  const occurredAt = validDate(now, "occurredAt");
  const timelineEvent = taskEvent(task, "LEAD_TASK_RESCHEDULED", occurredAt, {
    taskId: task.id,
    fromDueAt: task.dueAt.toISOString(),
    toDueAt: nextDueAt.toISOString(),
  });
  const next = Object.freeze({
    ...task,
    dueAt: nextDueAt,
    version: task.version + 1,
    timelineEvent,
  });
  return { task: next, timelineEvent };
}
