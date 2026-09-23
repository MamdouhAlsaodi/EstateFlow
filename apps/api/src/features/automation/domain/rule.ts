/**
 * EF-301 — versioned automation rule model (Trigger / Condition / Action).
 *
 * Definitions are pure data: an allowlisted trigger catalog, typed conditions
 * with a closed operator set, and allowlisted actions with bounded string
 * payloads. There is no arbitrary expression or code execution anywhere in
 * this model. Every rule version is an immutable, auditable snapshot; the
 * enable/disable lifecycle lives on the rule row and never rewrites history.
 */

export const AUTOMATION_TRIGGER_EVENT_TYPES = [
  "lead.created",
  "lead.stage_changed",
  "lead.assignment_changed",
  "lead.response_sla_breached",
  "lead.inactivity_breached",
  "lead.next_action_missing",
  "receivable.due_soon",
  "receivable.overdue",
  "commission.due",
] as const;
export type AutomationTriggerEventType =
  (typeof AUTOMATION_TRIGGER_EVENT_TYPES)[number];

export type AutomationTrigger =
  | Readonly<{
      kind: "DOMAIN_EVENT";
      eventType: AutomationTriggerEventType;
    }>
  | Readonly<{
      kind: "SCHEDULE";
      cadence: "DAILY";
      /** 24h `HH:MM` in UTC, e.g. "14:00". */
      timeOfDayUtc: string;
    }>;

export const AUTOMATION_CONDITION_OPERATORS = [
  "equals",
  "not_equals",
  "in",
  "not_in",
  "is_empty",
  "is_not_empty",
] as const;
export type AutomationConditionOperator =
  (typeof AUTOMATION_CONDITION_OPERATORS)[number];

export type AutomationConditionValue =
  string | number | boolean | readonly string[];

export type AutomationCondition = Readonly<{
  /** Dotted path into the event subject, e.g. "lead.stage". */
  field: string;
  op: AutomationConditionOperator;
  value?: AutomationConditionValue;
}>;

export const AUTOMATION_ACTION_TYPES = [
  "CREATE_LEAD_TASK",
  "CREATE_INTERNAL_NOTIFICATION",
  "ADD_LEAD_TIMELINE_NOTE",
] as const;
export type AutomationActionType = (typeof AUTOMATION_ACTION_TYPES)[number];

export type AutomationAction = Readonly<{
  actionType: AutomationActionType;
  payload: Readonly<Record<string, string>>;
}>;

export type AutomationRuleDefinition = Readonly<{
  trigger: AutomationTrigger;
  conditions: readonly AutomationCondition[];
  action: AutomationAction;
}>;

export type AutomationRule = Readonly<{
  id: string;
  organizationId: string;
  name: string;
  enabled: boolean;
  /** Instant of the current enabling; null while disabled. */
  enabledAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}>;

export type AutomationRuleVersion = Readonly<{
  organizationId: string;
  ruleId: string;
  version: number;
  definition: AutomationRuleDefinition;
  createdBy: string;
  createdAt: Date;
  supersedesVersion: number | null;
  note: string | null;
}>;

export const AUTOMATION_RULE_NAME_MAX_LENGTH = 200;
export const AUTOMATION_RULE_VERSION_NOTE_MAX_LENGTH = 500;
export const MAX_AUTOMATION_RULE_CONDITIONS = 10;
export const MAX_AUTOMATION_CONDITION_LIST_VALUES = 20;
export const MAX_AUTOMATION_ACTION_PAYLOAD_ENTRIES = 10;
export const AUTOMATION_PAYLOAD_VALUE_MAX_LENGTH = 200;

export const AUTOMATION_SCHEDULE_EVALUATION_LOOKBACK_BUCKETS = 2;

export class AutomationRuleValidationError extends Error {
  constructor(reason: string) {
    super(`Invalid automation rule definition: ${reason}`);
    this.name = "AutomationRuleValidationError";
  }
}

const FIELD_PATTERN = /^[a-zA-Z][a-zA-Z0-9_]*(\.[a-zA-Z][a-zA-Z0-9_]*)*$/;
const PAYLOAD_KEY_PATTERN = /^[a-z][a-zA-Z0-9_]{0,39}$/;
const TIME_OF_DAY_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function rejectUnknownKeys(
  input: Record<string, unknown>,
  allowed: readonly string[],
): string | null {
  const unknownKey = Object.keys(input).find((key) => !allowed.includes(key));
  return unknownKey === undefined ? null : `unknown property "${unknownKey}"`;
}

function validateScalarConditionValue(
  value: unknown,
): AutomationConditionValue | null {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string")
    return value.length >= 1 &&
      value.length <= AUTOMATION_PAYLOAD_VALUE_MAX_LENGTH
      ? value
      : null;
  return null;
}

function validateCondition(input: unknown): AutomationCondition | string {
  if (!isPlainObject(input)) return "condition must be an object";
  const unknownKey = rejectUnknownKeys(input, ["field", "op", "value"]);
  if (unknownKey) return unknownKey;
  if (
    typeof input.field !== "string" ||
    input.field.length > 99 ||
    !FIELD_PATTERN.test(input.field)
  )
    return "condition.field must be a dotted path of 1..99 characters";
  if (
    typeof input.op !== "string" ||
    !AUTOMATION_CONDITION_OPERATORS.includes(
      input.op as AutomationConditionOperator,
    )
  )
    return "condition.op is not allowlisted";
  const op = input.op as AutomationConditionOperator;
  const needsList = op === "in" || op === "not_in";
  const forbidsValue = op === "is_empty" || op === "is_not_empty";
  if (forbidsValue)
    return input.value === undefined
      ? { field: input.field, op }
      : `condition.op "${op}" must not carry a value`;
  if (input.value === undefined) return `condition.op "${op}" requires a value`;
  if (needsList) {
    const list = input.value;
    if (
      !Array.isArray(list) ||
      list.length < 1 ||
      list.length > MAX_AUTOMATION_CONDITION_LIST_VALUES ||
      list.some(
        (item) =>
          typeof item !== "string" ||
          item.length < 1 ||
          item.length > AUTOMATION_PAYLOAD_VALUE_MAX_LENGTH,
      )
    )
      return `condition.op "${op}" requires 1..${MAX_AUTOMATION_CONDITION_LIST_VALUES} string values`;
    return Object.freeze({
      field: input.field,
      op,
      value: Object.freeze([...list]),
    });
  }
  const scalar = validateScalarConditionValue(input.value);
  return scalar === null
    ? `condition.op "${op}" requires a string (<=${AUTOMATION_PAYLOAD_VALUE_MAX_LENGTH}), finite number, or boolean`
    : Object.freeze({ field: input.field, op, value: scalar });
}

function validateTrigger(input: unknown): AutomationTrigger | string {
  if (!isPlainObject(input)) return "trigger must be an object";
  if (input.kind === "DOMAIN_EVENT") {
    const unknownKey = rejectUnknownKeys(input, ["kind", "eventType"]);
    if (unknownKey) return unknownKey;
    if (
      typeof input.eventType !== "string" ||
      !AUTOMATION_TRIGGER_EVENT_TYPES.includes(
        input.eventType as AutomationTriggerEventType,
      )
    )
      return "trigger.eventType is not allowlisted";
    return Object.freeze({
      kind: "DOMAIN_EVENT",
      eventType: input.eventType as AutomationTriggerEventType,
    });
  }
  if (input.kind === "SCHEDULE") {
    const unknownKey = rejectUnknownKeys(input, [
      "kind",
      "cadence",
      "timeOfDayUtc",
    ]);
    if (unknownKey) return unknownKey;
    if (input.cadence !== "DAILY") return "trigger.cadence only supports DAILY";
    if (
      typeof input.timeOfDayUtc !== "string" ||
      !TIME_OF_DAY_PATTERN.test(input.timeOfDayUtc)
    )
      return "trigger.timeOfDayUtc must be a 24h HH:MM UTC time";
    return Object.freeze({
      kind: "SCHEDULE",
      cadence: "DAILY",
      timeOfDayUtc: input.timeOfDayUtc,
    });
  }
  return "trigger.kind must be DOMAIN_EVENT or SCHEDULE";
}

function validateAction(input: unknown): AutomationAction | string {
  if (!isPlainObject(input)) return "action must be an object";
  const unknownKey = rejectUnknownKeys(input, ["actionType", "payload"]);
  if (unknownKey) return unknownKey;
  if (
    typeof input.actionType !== "string" ||
    !AUTOMATION_ACTION_TYPES.includes(input.actionType as AutomationActionType)
  )
    return "action.actionType is not allowlisted";
  if (input.payload === undefined)
    return Object.freeze({
      actionType: input.actionType as AutomationActionType,
      payload: Object.freeze({}),
    });
  if (!isPlainObject(input.payload)) return "action.payload must be an object";
  const entries = Object.entries(input.payload);
  if (entries.length > MAX_AUTOMATION_ACTION_PAYLOAD_ENTRIES)
    return `action.payload allows at most ${MAX_AUTOMATION_ACTION_PAYLOAD_ENTRIES} entries`;
  for (const [key, value] of entries) {
    if (!PAYLOAD_KEY_PATTERN.test(key))
      return "action.payload keys must match ^[a-z][a-zA-Z0-9_]{0,39}$";
    if (
      typeof value !== "string" ||
      value.length < 1 ||
      value.length > AUTOMATION_PAYLOAD_VALUE_MAX_LENGTH ||
      !/\S/.test(value)
    )
      return "action.payload values must be non-blank strings of 1..200 characters";
  }
  const payload: Record<string, string> = {};
  for (const [key, value] of entries) payload[key] = value as string;
  return Object.freeze({
    actionType: input.actionType as AutomationActionType,
    payload: Object.freeze(payload),
  });
}

export type RuleDefinitionParseResult =
  | Readonly<{ kind: "valid"; definition: AutomationRuleDefinition }>
  | Readonly<{ kind: "invalid"; reason: string }>;

/** Closed-world parse of an untrusted definition payload. */
export function parseRuleDefinition(input: unknown): RuleDefinitionParseResult {
  if (!isPlainObject(input))
    return { kind: "invalid", reason: "definition must be an object" };
  const unknownKey = rejectUnknownKeys(input, [
    "trigger",
    "conditions",
    "action",
  ]);
  if (unknownKey) return { kind: "invalid", reason: unknownKey };
  const trigger = validateTrigger(input.trigger);
  if (typeof trigger === "string") return { kind: "invalid", reason: trigger };
  const rawConditions = input.conditions;
  if (!Array.isArray(rawConditions))
    return { kind: "invalid", reason: "conditions must be an array" };
  if (rawConditions.length > MAX_AUTOMATION_RULE_CONDITIONS)
    return {
      kind: "invalid",
      reason: `conditions allows at most ${MAX_AUTOMATION_RULE_CONDITIONS} entries`,
    };
  const conditions: AutomationCondition[] = [];
  for (const condition of rawConditions) {
    const validated = validateCondition(condition);
    if (typeof validated === "string")
      return { kind: "invalid", reason: validated };
    conditions.push(validated);
  }
  if (trigger.kind === "SCHEDULE" && conditions.length > 0)
    return {
      kind: "invalid",
      reason: "schedule triggers cannot carry conditions",
    };
  const action = validateAction(input.action);
  if (typeof action === "string") return { kind: "invalid", reason: action };
  return {
    kind: "valid",
    definition: Object.freeze({
      trigger,
      conditions: Object.freeze(conditions),
      action,
    }),
  };
}

/** Throwing variant used inside application commands (mapped to HTTP 400). */
export function requireRuleDefinition(
  input: unknown,
): AutomationRuleDefinition {
  const parsed = parseRuleDefinition(input);
  if (parsed.kind === "invalid")
    throw new AutomationRuleValidationError(parsed.reason);
  return parsed.definition;
}

export function validateRuleName(name: string): void {
  if (
    typeof name !== "string" ||
    name.trim().length === 0 ||
    name.length > AUTOMATION_RULE_NAME_MAX_LENGTH
  )
    throw new AutomationRuleValidationError(
      `rule name must be a non-blank string of 1..${AUTOMATION_RULE_NAME_MAX_LENGTH} characters`,
    );
}

export function validateVersionNote(note: string): void {
  if (
    typeof note !== "string" ||
    note.trim().length === 0 ||
    note.length > AUTOMATION_RULE_VERSION_NOTE_MAX_LENGTH
  )
    throw new AutomationRuleValidationError(
      `version note must be a non-blank string of 1..${AUTOMATION_RULE_VERSION_NOTE_MAX_LENGTH} characters`,
    );
}

export function initialRuleVersion(input: {
  organizationId: string;
  ruleId: string;
  definition: AutomationRuleDefinition;
  createdBy: string;
  createdAt: Date;
  note?: string;
}): AutomationRuleVersion {
  return Object.freeze({
    organizationId: input.organizationId,
    ruleId: input.ruleId,
    version: 1,
    definition: input.definition,
    createdBy: input.createdBy,
    createdAt: input.createdAt,
    supersedesVersion: null,
    note: input.note ?? null,
  });
}

/**
 * Version invariant: the next snapshot is always exactly `previous + 1` and
 * records what it supersedes. Previous snapshots are never rewritten.
 */
export function nextRuleVersion(
  previous: AutomationRuleVersion,
  input: {
    definition: AutomationRuleDefinition;
    createdBy: string;
    createdAt: Date;
    note?: string;
  },
): AutomationRuleVersion {
  return Object.freeze({
    organizationId: previous.organizationId,
    ruleId: previous.ruleId,
    version: previous.version + 1,
    definition: input.definition,
    createdBy: input.createdBy,
    createdAt: input.createdAt,
    supersedesVersion: previous.version,
    note: input.note ?? null,
  });
}

// ---------------------------------------------------------------------------
// Schedule occurrence math (UTC only in this packet)
// ---------------------------------------------------------------------------

export type ScheduleOccurrence = Readonly<{
  /** `YYYY-MM-DD` UTC day of the occurrence; part of the execution key. */
  bucket: string;
  scheduledFor: Date;
}>;

export function parseTimeOfDayUtc(value: string): {
  hour: number;
  minute: number;
} {
  const match = TIME_OF_DAY_PATTERN.exec(value);
  if (!match)
    throw new AutomationRuleValidationError(
      "trigger.timeOfDayUtc must be a 24h HH:MM UTC time",
    );
  return { hour: Number(value.slice(0, 2)), minute: Number(value.slice(3, 5)) };
}

function dayIsoOf(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function addDaysIso(dayIso: string, days: number): string {
  const date = new Date(`${dayIso}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return dayIsoOf(date);
}

export function dailyOccurrenceUtc(timeOfDayUtc: string, dayIso: string): Date {
  const { hour, minute } = parseTimeOfDayUtc(timeOfDayUtc);
  return new Date(
    `${dayIso}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00.000Z`,
  );
}

/**
 * The due daily occurrences at-or-before `now`, at most `maxBuckets` of them
 * (most recent first), and never before the rule was enabled. Each bucket can
 * be enqueued at most once because the bucket id is part of the execution key.
 */
export function dailyBucketsDueUtc(
  timeOfDayUtc: string,
  now: Date,
  enabledAt: Date,
  maxBuckets: number = AUTOMATION_SCHEDULE_EVALUATION_LOOKBACK_BUCKETS,
): ScheduleOccurrence[] {
  const todayIso = dayIsoOf(now);
  const occurrences: ScheduleOccurrence[] = [];
  for (let delta = 1 - maxBuckets; delta <= 0; delta++) {
    const dayIso = addDaysIso(todayIso, delta);
    const scheduledFor = dailyOccurrenceUtc(timeOfDayUtc, dayIso);
    if (scheduledFor.getTime() > now.getTime()) continue;
    if (scheduledFor.getTime() < enabledAt.getTime()) continue;
    occurrences.push(Object.freeze({ bucket: dayIso, scheduledFor }));
  }
  return occurrences.reverse();
}
