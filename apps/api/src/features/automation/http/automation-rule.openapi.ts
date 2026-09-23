/**
 * EF-301 HTTP contract shapes. Closed-world: every request body and response
 * schema enumerates its properties and rejects additional ones.
 */

export const uuidParameter = { type: "string", format: "uuid" };

const instantProperty = {
  type: "string",
  format: "date-time",
  pattern: "^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}\\.\\d{3}Z$",
};

const ruleNameProperty = {
  type: "string",
  minLength: 1,
  maxLength: 200,
  pattern: "\\S",
};

const versionNoteProperty = {
  type: "string",
  minLength: 1,
  maxLength: 500,
  pattern: "\\S",
};

export const automationTriggerEventTypes = [
  "lead.created",
  "lead.stage_changed",
  "lead.next_action_missing",
  "receivable.due_soon",
  "receivable.overdue",
  "commission.due",
] as const;

export const automationConditionOperators = [
  "equals",
  "not_equals",
  "in",
  "not_in",
  "is_empty",
  "is_not_empty",
] as const;

export const automationActionTypes = [
  "CREATE_LEAD_TASK",
  "CREATE_INTERNAL_NOTIFICATION",
  "ADD_LEAD_TIMELINE_NOTE",
] as const;

export const automationDefinitionSchema = {
  type: "object",
  required: ["trigger", "conditions", "action"],
  additionalProperties: false,
  properties: {
    trigger: {
      oneOf: [
        {
          type: "object",
          required: ["kind", "eventType"],
          additionalProperties: false,
          properties: {
            kind: { type: "string", enum: ["DOMAIN_EVENT"] },
            eventType: {
              type: "string",
              enum: [...automationTriggerEventTypes],
            },
          },
        },
        {
          type: "object",
          required: ["kind", "cadence", "timeOfDayUtc"],
          additionalProperties: false,
          properties: {
            kind: { type: "string", enum: ["SCHEDULE"] },
            cadence: { type: "string", enum: ["DAILY"] },
            timeOfDayUtc: {
              type: "string",
              pattern: "^([01]\\d|2[0-3]):[0-5]\\d$",
            },
          },
        },
      ],
    },
    conditions: {
      type: "array",
      minItems: 0,
      maxItems: 10,
      items: {
        type: "object",
        required: ["field", "op"],
        additionalProperties: false,
        properties: {
          field: {
            type: "string",
            minLength: 1,
            maxLength: 99,
            pattern: "^[a-zA-Z][a-zA-Z0-9_]*(\\.[a-zA-Z][a-zA-Z0-9_]*)*$",
          },
          op: { type: "string", enum: [...automationConditionOperators] },
          value: {
            oneOf: [
              { type: "string", minLength: 1, maxLength: 200 },
              { type: "number" },
              { type: "boolean" },
              {
                type: "array",
                minItems: 1,
                maxItems: 20,
                items: { type: "string", minLength: 1, maxLength: 200 },
              },
            ],
          },
        },
      },
    },
    action: {
      type: "object",
      required: ["actionType"],
      additionalProperties: false,
      properties: {
        actionType: { type: "string", enum: [...automationActionTypes] },
        payload: {
          type: "object",
          minProperties: 0,
          maxProperties: 10,
          additionalProperties: {
            type: "string",
            minLength: 1,
            maxLength: 200,
          },
        },
      },
    },
  },
};

export const createRuleBody = {
  type: "object",
  required: ["name", "definition"],
  additionalProperties: false,
  properties: {
    name: ruleNameProperty,
    definition: automationDefinitionSchema,
  },
};

export const ruleVersionBody = {
  type: "object",
  required: ["definition"],
  additionalProperties: false,
  properties: {
    definition: automationDefinitionSchema,
    note: versionNoteProperty,
  },
};

const ruleSummaryProperties = {
  id: uuidParameter,
  name: ruleNameProperty,
  enabled: { type: "boolean" },
  currentVersion: { type: "integer", minimum: 1 },
  createdAt: instantProperty,
  updatedAt: instantProperty,
  definition: automationDefinitionSchema,
};

export const ruleListResponse = {
  type: "object",
  required: ["rules"],
  additionalProperties: false,
  properties: {
    rules: {
      type: "array",
      maxItems: 200,
      items: {
        type: "object",
        required: Object.keys(ruleSummaryProperties),
        additionalProperties: false,
        properties: ruleSummaryProperties,
      },
    },
  },
};

const ruleVersionItemSchema = {
  type: "object",
  required: [
    "version",
    "definition",
    "createdBy",
    "createdAt",
    "supersedesVersion",
    "note",
  ],
  additionalProperties: false,
  properties: {
    version: { type: "integer", minimum: 1 },
    definition: automationDefinitionSchema,
    createdBy: uuidParameter,
    createdAt: instantProperty,
    supersedesVersion: { type: "integer", minimum: 1, nullable: true },
    note: { type: "string", minLength: 1, maxLength: 500, nullable: true },
  },
};

export const ruleDetailResponse = {
  type: "object",
  required: ["rule", "versions"],
  additionalProperties: false,
  properties: {
    rule: {
      type: "object",
      required: Object.keys(ruleSummaryProperties),
      additionalProperties: false,
      properties: ruleSummaryProperties,
    },
    versions: {
      type: "array",
      minItems: 1,
      maxItems: 1000,
      items: ruleVersionItemSchema,
    },
  },
};
