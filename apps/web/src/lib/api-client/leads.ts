export const LeadStage = {
  NEW: "NEW",
  CONTACTED: "CONTACTED",
  QUALIFIED: "QUALIFIED",
  NURTURING: "NURTURING",
} as const;

export type LeadStage = (typeof LeadStage)[keyof typeof LeadStage];
export type LeadTerminalStage = "CLOSED_WON" | "CLOSED_LOST";

export type LeadBoardListQuery = Readonly<{
  stage?: LeadStage;
  cursor?: string;
  limit?: number;
}>;

export type LeadBoardUtmDto = Readonly<{
  source?: string;
  medium?: string;
  campaign?: string;
  term?: string;
  content?: string;
}>;

export type LeadBoardLeadDto = Readonly<{
  id: string;
  organizationId: string;
  ownerId: string;
  stage: LeadStage;
  nextAction: string;
  source: string;
  utm: LeadBoardUtmDto;
  version: number;
  createdAt: string;
  updatedAt: string;
}>;

export type LeadBoardListResponse = Readonly<{
  items: readonly LeadBoardLeadDto[];
  nextCursor: string | null;
}>;

export type LeadTransitionResponse = Readonly<{
  kind: "ok" | "idempotent-replay";
  lead: LeadBoardLeadDto;
}>;
export type LeadCloseTimelineEventDto = Readonly<{
  type: "LEAD_CLOSED_WON" | "LEAD_CLOSED_LOST";
  leadId: string;
  organizationId: string;
  occurredAt: string;
  data: Readonly<Record<string, string | null>>;
}>;
export type LeadDealDto = Readonly<{
  id: string;
  organizationId: string;
  leadId: string;
  propertyId: string;
  brokerId: string;
  status: "OPEN";
  version: 1;
  createdAt: string;
  updatedAt: string;
}>;
export type LeadCloseEventDto = Readonly<{
  schemaVersion: 1;
  organizationId: string;
  dealId: string;
  leadId: string;
  propertyId: string;
  brokerId: string;
  occurredAt: string;
}>;
export type LeadCloseLeadDto = Readonly<
  Omit<LeadBoardLeadDto, "stage"> & { stage: LeadTerminalStage }
>;
export type LeadCloseWonResponse = Readonly<{
  kind: "ok" | "idempotent-replay";
  lead: LeadCloseLeadDto;
  deal: LeadDealDto;
  timelineEvent: LeadCloseTimelineEventDto;
  event: LeadCloseEventDto;
}>;
export type LeadCloseLostResponse = Readonly<{
  kind: "ok" | "idempotent-replay";
  lead: LeadCloseLeadDto;
  timelineEvent: LeadCloseTimelineEventDto;
}>;

export type LeadWorkspaceQuery = Readonly<{ cursor?: string; limit?: number }>;
export type LeadWorkspaceLeadDto = Readonly<
  Omit<LeadBoardLeadDto, "organizationId" | "stage"> & {
    stage: LeadStage | LeadTerminalStage;
  }
>;
export type LeadTimelineEventDto = Readonly<{
  id: string;
  type: TimelineEventType;
  occurredAt: string;
  data: Readonly<Record<string, string | null>>;
}>;
export type LeadWorkspaceResponse = Readonly<{
  lead: LeadWorkspaceLeadDto;
  timeline: Readonly<{
    items: readonly LeadTimelineEventDto[];
    nextCursor: string | null;
  }>;
  notes: readonly LeadNoteDto[];
  tasks: readonly LeadTaskDto[];
}>;
export type LeadNoteDto = Readonly<{
  id: string;
  body: string;
  createdAt: string;
}>;
export type LeadTaskDto = Readonly<{
  id: string;
  title: string;
  dueAt: string;
  status: "OPEN" | "COMPLETED";
  createdAt: string;
  completedAt: string | null;
  version: number;
}>;
export type LeadNoteCommandResponse = Readonly<{
  kind: "ok" | "idempotent-replay";
  note: LeadNoteDto;
}>;
export type LeadTaskCommandResponse = Readonly<{
  kind: "ok" | "idempotent-replay";
  task: LeadTaskDto;
}>;

export const TimelineEventType = {
  LEAD_CREATED: "LEAD_CREATED",
  LEAD_ASSIGNED: "LEAD_ASSIGNED",
  LEAD_STAGE_CHANGED: "LEAD_STAGE_CHANGED",
  LEAD_NEXT_ACTION_CHANGED: "LEAD_NEXT_ACTION_CHANGED",
  LEAD_NOTE_ADDED: "LEAD_NOTE_ADDED",
  LEAD_TASK_CREATED: "LEAD_TASK_CREATED",
  LEAD_TASK_COMPLETED: "LEAD_TASK_COMPLETED",
  LEAD_TASK_RESCHEDULED: "LEAD_TASK_RESCHEDULED",
  LEAD_CLOSED_WON: "LEAD_CLOSED_WON",
  LEAD_CLOSED_LOST: "LEAD_CLOSED_LOST",
} as const;
export type TimelineEventType =
  (typeof TimelineEventType)[keyof typeof TimelineEventType];

const STAGES = new Set<string>(Object.values(LeadStage));
const WORKSPACE_STAGES = new Set<string>([
  ...Object.values(LeadStage),
  "CLOSED_WON",
  "CLOSED_LOST",
]);
const TIMELINE_TYPES = new Set<string>(Object.values(TimelineEventType));
const TIMELINE_DATA_FIELDS: Readonly<
  Record<TimelineEventType, readonly string[]>
> = {
  LEAD_CREATED: ["stage"],
  LEAD_ASSIGNED: ["fromOwnerId", "toOwnerId"],
  LEAD_STAGE_CHANGED: ["from", "to"],
  LEAD_NEXT_ACTION_CHANGED: ["from", "to"],
  LEAD_NOTE_ADDED: ["noteId"],
  LEAD_TASK_CREATED: ["taskId", "dueAt"],
  LEAD_TASK_COMPLETED: ["taskId", "completedAt"],
  LEAD_TASK_RESCHEDULED: ["taskId", "fromDueAt", "toDueAt"],
  LEAD_CLOSED_WON: ["dealId", "propertyId", "brokerId"],
  LEAD_CLOSED_LOST: ["reason"],
};
const LEAD_WORKSPACE_FIELDS = ["lead", "timeline", "notes", "tasks"];
const LEAD_WORKSPACE_LEAD_FIELDS = [
  "id",
  "ownerId",
  "stage",
  "nextAction",
  "source",
  "utm",
  "version",
  "createdAt",
  "updatedAt",
];
const TIMELINE_FIELDS = ["id", "type", "occurredAt", "data"];
const NOTE_FIELDS = ["id", "body", "createdAt"];
const TASK_FIELDS = [
  "id",
  "title",
  "dueAt",
  "status",
  "createdAt",
  "completedAt",
  "version",
];
const LEAD_BOARD_RESPONSE_FIELDS = ["items", "nextCursor"];
const LEAD_BOARD_ITEM_FIELDS = [
  "id",
  "organizationId",
  "ownerId",
  "stage",
  "nextAction",
  "source",
  "utm",
  "version",
  "createdAt",
  "updatedAt",
];
const LEAD_BOARD_UTM_FIELDS = [
  "source",
  "medium",
  "campaign",
  "term",
  "content",
];
const CLOSE_WON_FIELDS = ["kind", "lead", "deal", "timelineEvent", "event"];
const CLOSE_LOST_FIELDS = ["kind", "lead", "timelineEvent"];
const DEAL_FIELDS = [
  "id",
  "organizationId",
  "leadId",
  "propertyId",
  "brokerId",
  "status",
  "version",
  "createdAt",
  "updatedAt",
];
const CLOSE_EVENT_FIELDS = [
  "schemaVersion",
  "organizationId",
  "dealId",
  "leadId",
  "propertyId",
  "brokerId",
  "occurredAt",
];
const CLOSE_TIMELINE_FIELDS = [
  "type",
  "leadId",
  "organizationId",
  "occurredAt",
  "data",
];

export function serializeLeadWorkspaceQuery(query: LeadWorkspaceQuery): string {
  validateQuery(query, ["cursor", "limit"]);
  const params = new URLSearchParams();
  if (query.cursor !== undefined) params.set("cursor", query.cursor);
  if (query.limit !== undefined) params.set("limit", String(query.limit));
  const serialized = params.toString();
  return serialized ? `?${serialized}` : "";
}

export function normalizeLeadWorkspaceResponse(
  value: unknown,
): LeadWorkspaceResponse {
  if (
    !isRecord(value) ||
    !hasOnlySupportedFields(value, LEAD_WORKSPACE_FIELDS) ||
    !isRecord(value.timeline) ||
    !Array.isArray(value.notes) ||
    !Array.isArray(value.tasks)
  )
    throw new TypeError("Invalid lead workspace response");
  if (
    !hasOnlySupportedFields(value.timeline, ["items", "nextCursor"]) ||
    !Array.isArray(value.timeline.items) ||
    (value.timeline.nextCursor !== null &&
      typeof value.timeline.nextCursor !== "string")
  )
    throw new TypeError("Invalid lead workspace timeline");
  return {
    lead: normalizeWorkspaceLead(value.lead),
    timeline: {
      items: value.timeline.items.map(normalizeTimelineEvent),
      nextCursor: value.timeline.nextCursor,
    },
    notes: value.notes.map(normalizeNote),
    tasks: value.tasks.map(normalizeTask),
  };
}

export function normalizeLeadNoteCommandResponse(
  value: unknown,
): LeadNoteCommandResponse {
  if (
    !isRecord(value) ||
    !hasOnlySupportedFields(value, ["kind", "note", "timelineEvent"]) ||
    !isCommandKind(value.kind)
  )
    throw new TypeError("Invalid lead note command response");
  return { kind: value.kind, note: normalizeNote(value.note) };
}

export function normalizeLeadTaskCommandResponse(
  value: unknown,
): LeadTaskCommandResponse {
  if (
    !isRecord(value) ||
    !hasOnlySupportedFields(value, ["kind", "task", "timelineEvent"]) ||
    !isCommandKind(value.kind)
  )
    throw new TypeError("Invalid lead task command response");
  return { kind: value.kind, task: normalizeTask(value.task) };
}

function normalizeWorkspaceLead(value: unknown): LeadWorkspaceLeadDto {
  if (
    !isRecord(value) ||
    !hasOnlySupportedFields(value, LEAD_WORKSPACE_LEAD_FIELDS) ||
    !isNonEmptyString(value.id) ||
    !isNonEmptyString(value.ownerId) ||
    !isNonEmptyString(value.nextAction) ||
    !isNonEmptyString(value.source) ||
    typeof value.stage !== "string" ||
    !WORKSPACE_STAGES.has(value.stage) ||
    !isPositiveVersion(value.version) ||
    !isIsoDate(value.createdAt) ||
    !isIsoDate(value.updatedAt) ||
    !isRecord(value.utm) ||
    !hasOnlySupportedFields(value.utm, LEAD_BOARD_UTM_FIELDS) ||
    Object.values(value.utm).some((item) => typeof item !== "string")
  )
    throw new TypeError("Invalid lead workspace lead");
  return {
    id: value.id,
    ownerId: value.ownerId,
    stage: value.stage as LeadStage | LeadTerminalStage,
    nextAction: value.nextAction,
    source: value.source,
    utm: value.utm as LeadBoardUtmDto,
    version: value.version,
    createdAt: value.createdAt,
    updatedAt: value.updatedAt,
  };
}

function normalizeTimelineEvent(value: unknown): LeadTimelineEventDto {
  if (
    !isRecord(value) ||
    !hasOnlySupportedFields(value, TIMELINE_FIELDS) ||
    !isNonEmptyString(value.id) ||
    typeof value.type !== "string" ||
    !TIMELINE_TYPES.has(value.type) ||
    !isIsoDate(value.occurredAt) ||
    !isRecord(value.data) ||
    !hasOnlySupportedFields(
      value.data,
      TIMELINE_DATA_FIELDS[value.type as TimelineEventType],
    ) ||
    Object.values(value.data).some(
      (item) => item !== null && typeof item !== "string",
    )
  )
    throw new TypeError("Invalid lead timeline event");
  return {
    id: value.id,
    type: value.type as TimelineEventType,
    occurredAt: value.occurredAt,
    data: value.data as Record<string, string | null>,
  };
}

function normalizeNote(value: unknown): LeadNoteDto {
  if (
    !isRecord(value) ||
    !hasOnlySupportedFields(value, NOTE_FIELDS) ||
    !isNonEmptyString(value.id) ||
    typeof value.body !== "string" ||
    !isIsoDate(value.createdAt)
  )
    throw new TypeError("Invalid lead note");
  return { id: value.id, body: value.body, createdAt: value.createdAt };
}

function normalizeTask(value: unknown): LeadTaskDto {
  if (
    !isRecord(value) ||
    !hasOnlySupportedFields(value, TASK_FIELDS) ||
    !isNonEmptyString(value.id) ||
    typeof value.title !== "string" ||
    !isIsoDate(value.dueAt) ||
    (value.status !== "OPEN" && value.status !== "COMPLETED") ||
    !isIsoDate(value.createdAt) ||
    (value.completedAt !== null && !isIsoDate(value.completedAt)) ||
    !isPositiveVersion(value.version)
  )
    throw new TypeError("Invalid lead task");
  return {
    id: value.id,
    title: value.title,
    dueAt: value.dueAt,
    status: value.status,
    createdAt: value.createdAt,
    completedAt: value.completedAt,
    version: value.version,
  };
}

function isCommandKind(value: unknown): value is "ok" | "idempotent-replay" {
  return value === "ok" || value === "idempotent-replay";
}

function validateQuery(
  query: Record<string, unknown>,
  supportedFields: readonly string[],
): void {
  const unsupportedKey = Object.keys(query).find(
    (key) => !supportedFields.includes(key),
  );
  if (unsupportedKey !== undefined)
    throw new TypeError(`Unsupported lead query field: ${unsupportedKey}`);
  if (
    query.cursor !== undefined &&
    (typeof query.cursor !== "string" ||
      query.cursor.length === 0 ||
      query.cursor.length > 255)
  )
    throw new TypeError("Invalid lead cursor");
  if (
    query.limit !== undefined &&
    (typeof query.limit !== "number" ||
      !Number.isSafeInteger(query.limit) ||
      query.limit < 1 ||
      query.limit > 100)
  )
    throw new TypeError("Invalid lead limit");
}

export function serializeLeadBoardListQuery(query: LeadBoardListQuery): string {
  const unsupportedKey = Object.keys(query).find(
    (key) => !["stage", "cursor", "limit"].includes(key),
  );
  if (unsupportedKey !== undefined)
    throw new TypeError(`Unsupported lead query field: ${unsupportedKey}`);
  if (query.stage !== undefined && !STAGES.has(query.stage))
    throw new TypeError("Unsupported lead stage");
  if (
    query.cursor !== undefined &&
    (query.cursor.length === 0 || query.cursor.length > 255)
  )
    throw new TypeError("Invalid lead cursor");
  if (
    query.limit !== undefined &&
    (!Number.isSafeInteger(query.limit) || query.limit < 1 || query.limit > 100)
  )
    throw new TypeError("Invalid lead limit");

  const params = new URLSearchParams();
  if (query.stage !== undefined) params.set("stage", query.stage);
  if (query.cursor !== undefined) params.set("cursor", query.cursor);
  if (query.limit !== undefined) params.set("limit", String(query.limit));
  const serialized = params.toString();
  return serialized ? `?${serialized}` : "";
}

export function normalizeLeadCloseWonResponse(
  value: unknown,
): LeadCloseWonResponse {
  if (
    !isRecord(value) ||
    !hasOnlySupportedFields(value, CLOSE_WON_FIELDS) ||
    !isCommandKind(value.kind) ||
    value.timelineEvent === undefined ||
    value.event === undefined
  )
    throw new TypeError("Invalid lead close-won response");
  const lead = normalizeClosedLead(value.lead, "CLOSED_WON");
  const deal = normalizeDeal(value.deal);
  const timelineEvent = normalizeCloseTimelineEvent(
    value.timelineEvent,
    "LEAD_CLOSED_WON",
  );
  const event = normalizeCloseEvent(value.event);
  if (event.dealId !== deal.id || timelineEvent.data.dealId !== deal.id)
    throw new TypeError("Invalid lead close-won response");
  return { kind: value.kind, lead, deal, timelineEvent, event };
}

export function normalizeLeadCloseLostResponse(
  value: unknown,
): LeadCloseLostResponse {
  if (
    !isRecord(value) ||
    !hasOnlySupportedFields(value, CLOSE_LOST_FIELDS) ||
    !isCommandKind(value.kind)
  )
    throw new TypeError("Invalid lead close-lost response");
  return {
    kind: value.kind,
    lead: normalizeClosedLead(value.lead, "CLOSED_LOST"),
    timelineEvent: normalizeCloseTimelineEvent(
      value.timelineEvent,
      "LEAD_CLOSED_LOST",
    ),
  };
}

function normalizeClosedLead(
  value: unknown,
  stage: LeadTerminalStage,
): LeadCloseLeadDto {
  if (
    !isRecord(value) ||
    !hasOnlySupportedFields(value, LEAD_BOARD_ITEM_FIELDS) ||
    !isNonEmptyString(value.id) ||
    !isNonEmptyString(value.organizationId) ||
    !isNonEmptyString(value.ownerId) ||
    value.stage !== stage ||
    !isNonEmptyString(value.nextAction) ||
    !isNonEmptyString(value.source) ||
    !isPositiveVersion(value.version) ||
    !isIsoDate(value.createdAt) ||
    !isIsoDate(value.updatedAt) ||
    !isRecord(value.utm) ||
    !hasOnlySupportedFields(value.utm, LEAD_BOARD_UTM_FIELDS) ||
    Object.values(value.utm).some((item) => typeof item !== "string")
  )
    throw new TypeError("Invalid closed lead");
  return value as LeadCloseLeadDto;
}
function normalizeDeal(value: unknown): LeadDealDto {
  if (
    !isRecord(value) ||
    !hasOnlySupportedFields(value, DEAL_FIELDS) ||
    !isNonEmptyString(value.id) ||
    !isNonEmptyString(value.organizationId) ||
    !isNonEmptyString(value.leadId) ||
    !isNonEmptyString(value.propertyId) ||
    !isNonEmptyString(value.brokerId) ||
    value.status !== "OPEN" ||
    value.version !== 1 ||
    !isIsoDate(value.createdAt) ||
    !isIsoDate(value.updatedAt)
  )
    throw new TypeError("Invalid lead deal");
  return value as LeadDealDto;
}
function normalizeCloseTimelineEvent(
  value: unknown,
  type: LeadCloseTimelineEventDto["type"],
): LeadCloseTimelineEventDto {
  if (
    !isRecord(value) ||
    !hasOnlySupportedFields(value, CLOSE_TIMELINE_FIELDS) ||
    value.type !== type ||
    !isNonEmptyString(value.leadId) ||
    !isNonEmptyString(value.organizationId) ||
    !isIsoDate(value.occurredAt) ||
    !isRecord(value.data) ||
    !hasOnlySupportedFields(value.data, TIMELINE_DATA_FIELDS[type]) ||
    Object.values(value.data).some(
      (item) => item !== null && typeof item !== "string",
    )
  )
    throw new TypeError("Invalid lead close timeline event");
  return value as LeadCloseTimelineEventDto;
}
function normalizeCloseEvent(value: unknown): LeadCloseEventDto {
  if (
    !isRecord(value) ||
    !hasOnlySupportedFields(value, CLOSE_EVENT_FIELDS) ||
    value.schemaVersion !== 1 ||
    !isNonEmptyString(value.organizationId) ||
    !isNonEmptyString(value.dealId) ||
    !isNonEmptyString(value.leadId) ||
    !isNonEmptyString(value.propertyId) ||
    !isNonEmptyString(value.brokerId) ||
    !isIsoDate(value.occurredAt)
  )
    throw new TypeError("Invalid lead close event");
  return value as LeadCloseEventDto;
}

export function normalizeLeadTransitionResponse(
  value: unknown,
): LeadTransitionResponse {
  if (
    !isRecord(value) ||
    (value.kind !== "ok" && value.kind !== "idempotent-replay") ||
    !("lead" in value)
  )
    throw new TypeError("Invalid lead transition response");
  return { kind: value.kind, lead: normalizeLeadBoardLead(value.lead) };
}

export function normalizeLeadBoardListResponse(
  value: unknown,
): LeadBoardListResponse {
  if (
    !isRecord(value) ||
    !hasOnlySupportedFields(value, LEAD_BOARD_RESPONSE_FIELDS) ||
    !Array.isArray(value.items) ||
    (value.nextCursor !== null && typeof value.nextCursor !== "string")
  ) {
    throw new TypeError("Invalid lead board response");
  }
  return {
    items: value.items.map(normalizeLeadBoardLead),
    nextCursor: value.nextCursor,
  };
}

function normalizeLeadBoardLead(value: unknown): LeadBoardLeadDto {
  if (
    !isRecord(value) ||
    !hasOnlySupportedFields(value, LEAD_BOARD_ITEM_FIELDS) ||
    !isNonEmptyString(value.id) ||
    !isNonEmptyString(value.organizationId) ||
    !isNonEmptyString(value.ownerId) ||
    !isNonEmptyString(value.nextAction) ||
    !isNonEmptyString(value.source) ||
    typeof value.stage !== "string" ||
    !STAGES.has(value.stage) ||
    !isPositiveVersion(value.version) ||
    !isIsoDate(value.createdAt) ||
    !isIsoDate(value.updatedAt) ||
    !isRecord(value.utm) ||
    !hasOnlySupportedFields(value.utm, LEAD_BOARD_UTM_FIELDS) ||
    Object.values(value.utm).some((item) => typeof item !== "string")
  ) {
    throw new TypeError("Invalid lead board item");
  }
  return {
    id: value.id,
    organizationId: value.organizationId,
    ownerId: value.ownerId,
    stage: value.stage as LeadStage,
    nextAction: value.nextAction,
    source: value.source,
    utm: value.utm as Record<string, string>,
    version: value.version,
    createdAt: value.createdAt,
    updatedAt: value.updatedAt,
  };
}

function hasOnlySupportedFields(
  value: Record<string, unknown>,
  supportedFields: readonly string[],
): boolean {
  return Object.keys(value).every((field) => supportedFields.includes(field));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}
function isPositiveVersion(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 1;
}
function isIsoDate(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value) &&
    !Number.isNaN(Date.parse(value))
  );
}
