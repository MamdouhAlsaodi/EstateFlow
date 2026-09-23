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
  "lead.assignment_changed",
  "lead.response_sla_breached",
  "lead.inactivity_breached",
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

const failedJobProperties = {
  id: uuidParameter,
  ruleId: uuidParameter,
  ruleVersion: { type: "integer", minimum: 1 },
  actionType: { type: "string" },
  targetType: { type: "string" },
  targetId: { type: "string" },
  status: { type: "string", enum: ["FAILED"] },
  attemptCount: { type: "integer", minimum: 1 },
  maxAttempts: { type: "integer", minimum: 1, maximum: 10 },
  lastError: {
    type: "object",
    required: ["kind", "message"],
    additionalProperties: false,
    properties: { kind: { type: "string" }, message: { type: "string" } },
  },
  failedAt: instantProperty,
  updatedAt: instantProperty,
};

export const ruleListResponse = {
  type: "object",
  required: ["rules", "failedJobs"],
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
    failedJobs: {
      type: "array",
      maxItems: 100,
      items: {
        type: "object",
        required: Object.keys(failedJobProperties),
        additionalProperties: false,
        properties: failedJobProperties,
      },
    },
    recentFinanceJobs: {
      type: "array",
      maxItems: 100,
      items: {
        type: "object",
        required: [
          "id",
          "ruleId",
          "ruleVersion",
          "actionType",
          "targetType",
          "targetId",
          "status",
          "attemptCount",
          "maxAttempts",
          "lastError",
          "scheduledFor",
          "completedAt",
          "updatedAt",
        ],
        additionalProperties: false,
        properties: {
          id: uuidParameter,
          ruleId: uuidParameter,
          ruleVersion: { type: "integer", minimum: 1 },
          actionType: { type: "string" },
          targetType: { type: "string", enum: ["RECEIVABLE", "COMMISSION"] },
          targetId: { type: "string" },
          status: {
            type: "string",
            enum: [
              "QUEUED",
              "RUNNING",
              "RETRYING",
              "SUCCEEDED",
              "FAILED",
              "CANCELLED",
            ],
          },
          attemptCount: { type: "integer", minimum: 0 },
          maxAttempts: { type: "integer", minimum: 1, maximum: 10 },
          lastError: {
            type: "object",
            required: ["kind", "message"],
            nullable: true,
            additionalProperties: false,
            properties: {
              kind: { type: "string" },
              message: { type: "string" },
            },
          },
          scheduledFor: instantProperty,
          completedAt: { ...instantProperty, nullable: true },
          updatedAt: instantProperty,
        },
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

// ---------------------------------------------------------------------------
// EF-306 — execution history. Closed-world job rendering: typed status and
// error kinds only, never an action payload, execution key, event id, or any
// provider payload/secret.
// ---------------------------------------------------------------------------

export const automationJobStatuses = [
  "QUEUED",
  "RUNNING",
  "RETRYING",
  "SUCCEEDED",
  "FAILED",
  "CANCELLED",
] as const;

export const automationJobTriggerKinds = ["DOMAIN_EVENT", "SCHEDULE"] as const;

const jobItemProperties = {
  id: uuidParameter,
  ruleId: uuidParameter,
  ruleVersion: { type: "integer", minimum: 1 },
  triggerKind: { type: "string", enum: [...automationJobTriggerKinds] },
  eventType: {
    type: "string",
    enum: [...automationTriggerEventTypes],
    nullable: true,
  },
  actionType: { type: "string", enum: [...automationActionTypes] },
  targetType: {
    type: "string",
    enum: ["LEAD", "RECEIVABLE", "COMMISSION", "RULE_SELF"],
  },
  targetId: { type: "string", minLength: 1, maxLength: 200 },
  status: { type: "string", enum: [...automationJobStatuses] },
  attemptCount: { type: "integer", minimum: 0 },
  maxAttempts: { type: "integer", minimum: 1, maximum: 10 },
  lastError: {
    type: "object",
    required: ["kind", "message"],
    nullable: true,
    additionalProperties: false,
    properties: {
      kind: {
        type: "string",
        enum: [
          "action-executor-not-configured",
          "action-permanent-failure",
          "action-transient-failure",
          "unexpected-executor-error",
        ],
      },
      message: { type: "string", minLength: 1, maxLength: 500 },
    },
  },
  scheduledFor: instantProperty,
  startedAt: { ...instantProperty, nullable: true },
  completedAt: { ...instantProperty, nullable: true },
  createdAt: instantProperty,
  updatedAt: instantProperty,
};

export const automationJobItemSchema = {
  type: "object",
  required: Object.keys(jobItemProperties),
  additionalProperties: false,
  properties: jobItemProperties,
};

export const jobListResponse = {
  type: "object",
  required: ["jobs"],
  additionalProperties: false,
  properties: {
    jobs: {
      type: "array",
      maxItems: 100,
      items: automationJobItemSchema,
    },
  },
};

export const jobDetailResponse = {
  type: "object",
  required: ["job"],
  additionalProperties: false,
  properties: {
    job: automationJobItemSchema,
  },
};

export const retryJobResponse = jobDetailResponse;
export const cancelJobResponse = jobDetailResponse;
