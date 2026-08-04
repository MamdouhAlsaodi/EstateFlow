export const LeadStage = {
  NEW: "NEW",
  CONTACTED: "CONTACTED",
  QUALIFIED: "QUALIFIED",
  NURTURING: "NURTURING",
} as const;

export type LeadStage = (typeof LeadStage)[keyof typeof LeadStage];

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

const STAGES = new Set<string>(Object.values(LeadStage));
const LEAD_BOARD_RESPONSE_FIELDS = ["items", "nextCursor"];
const LEAD_BOARD_ITEM_FIELDS = ["id", "organizationId", "ownerId", "stage", "nextAction", "source", "utm", "version", "createdAt", "updatedAt"];
const LEAD_BOARD_UTM_FIELDS = ["source", "medium", "campaign", "term", "content"];

export function serializeLeadBoardListQuery(query: LeadBoardListQuery): string {
  const unsupportedKey = Object.keys(query).find((key) => !["stage", "cursor", "limit"].includes(key));
  if (unsupportedKey !== undefined) throw new TypeError(`Unsupported lead query field: ${unsupportedKey}`);
  if (query.stage !== undefined && !STAGES.has(query.stage)) throw new TypeError("Unsupported lead stage");
  if (query.cursor !== undefined && (query.cursor.length === 0 || query.cursor.length > 255)) throw new TypeError("Invalid lead cursor");
  if (query.limit !== undefined && (!Number.isSafeInteger(query.limit) || query.limit < 1 || query.limit > 100)) throw new TypeError("Invalid lead limit");

  const params = new URLSearchParams();
  if (query.stage !== undefined) params.set("stage", query.stage);
  if (query.cursor !== undefined) params.set("cursor", query.cursor);
  if (query.limit !== undefined) params.set("limit", String(query.limit));
  const serialized = params.toString();
  return serialized ? `?${serialized}` : "";
}

export function normalizeLeadTransitionResponse(value: unknown): LeadTransitionResponse {
  if (!isRecord(value) || (value.kind !== "ok" && value.kind !== "idempotent-replay") || !("lead" in value)) throw new TypeError("Invalid lead transition response");
  return { kind: value.kind, lead: normalizeLeadBoardLead(value.lead) };
}

export function normalizeLeadBoardListResponse(value: unknown): LeadBoardListResponse {
  if (!isRecord(value) || !hasOnlySupportedFields(value, LEAD_BOARD_RESPONSE_FIELDS) || !Array.isArray(value.items) || (value.nextCursor !== null && typeof value.nextCursor !== "string")) {
    throw new TypeError("Invalid lead board response");
  }
  return {
    items: value.items.map(normalizeLeadBoardLead),
    nextCursor: value.nextCursor,
  };
}

function normalizeLeadBoardLead(value: unknown): LeadBoardLeadDto {
  if (!isRecord(value) || !hasOnlySupportedFields(value, LEAD_BOARD_ITEM_FIELDS) || !isNonEmptyString(value.id) || !isNonEmptyString(value.organizationId) || !isNonEmptyString(value.ownerId) || !isNonEmptyString(value.nextAction) || !isNonEmptyString(value.source) || typeof value.stage !== "string" || !STAGES.has(value.stage) || !isPositiveVersion(value.version) || !isIsoDate(value.createdAt) || !isIsoDate(value.updatedAt) || !isRecord(value.utm) || !hasOnlySupportedFields(value.utm, LEAD_BOARD_UTM_FIELDS) || Object.values(value.utm).some((item) => typeof item !== "string")) {
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

function hasOnlySupportedFields(value: Record<string, unknown>, supportedFields: readonly string[]): boolean {
  return Object.keys(value).every((field) => supportedFields.includes(field));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function isNonEmptyString(value: unknown): value is string { return typeof value === "string" && value.trim().length > 0; }
function isPositiveVersion(value: unknown): value is number { return typeof value === "number" && Number.isSafeInteger(value) && value >= 1; }
function isIsoDate(value: unknown): value is string { return typeof value === "string" && !Number.isNaN(Date.parse(value)); }
