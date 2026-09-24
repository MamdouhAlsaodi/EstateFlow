const crmLeadOperations = [
  {
    method: "post",
    path: "/organizations/{organizationId}/leads/{leadId}/notes",
    operationId: "LeadController_createNote",
    clientMethod: "createLeadNote",
  },
  {
    method: "post",
    path: "/organizations/{organizationId}/leads/{leadId}/tasks",
    operationId: "LeadController_createTask",
    clientMethod: "createLeadTask",
  },
  {
    method: "post",
    path: "/organizations/{organizationId}/leads/{leadId}/tasks/{taskId}/complete",
    operationId: "LeadController_completeTask",
    clientMethod: "completeLeadTask",
  },
  {
    method: "post",
    path: "/organizations/{organizationId}/leads/{leadId}/tasks/{taskId}/reschedule",
    operationId: "LeadController_rescheduleTask",
    clientMethod: "rescheduleLeadTask",
  },
];

const expectedOperations = new Map([
  ["/health/live", "getLiveHealth"],
  ["/health/ready", "getReadyHealth"],
  ["/organizations/{organizationId}/leads", "LeadController_list"],
  ["/organizations/{organizationId}/leads/{leadId}", "LeadController_find"],
]);

const leadReadOperationIds = new Set(expectedOperations.values());
const legacyLeadOperations = new Map([
  ["post /organizations/{organizationId}/leads", "LeadController_create"],
  [
    "post /organizations/{organizationId}/leads/{leadId}/transition",
    "LeadController_transition",
  ],
  [
    "post /organizations/{organizationId}/leads/{leadId}/assign",
    "LeadController_assign",
  ],
  [
    "post /organizations/{organizationId}/leads/{leadId}/next-action",
    "LeadController_nextAction",
  ],
]);

const ledgerOperations = new Map([
  [
    "post /organizations/{organizationId}/finance/accounts",
    {
      operationId: "LedgerController_createAccount",
      clientMethod: "createAccount",
      body: { code: "string", name: "string", type: "string" },
    },
  ],
  [
    "post /organizations/{organizationId}/finance/accounting-periods",
    {
      operationId: "LedgerController_createAccountingPeriod",
      clientMethod: "createAccountingPeriod",
      body: { startsAt: "string", endsAt: "string" },
    },
  ],
  [
    "post /organizations/{organizationId}/finance/journal-drafts",
    {
      operationId: "LedgerController_createDraft",
      clientMethod: "createDraft",
      body: { reference: "string", reason: "string", lines: "DraftLine[]" },
    },
  ],
  [
    "post /organizations/{organizationId}/finance/journal-entries/{entryId}/post",
    {
      operationId: "LedgerController_post",
      clientMethod: "post",
      body: { periodId: "string", postedAt: "string" },
    },
  ],
  [
    "post /organizations/{organizationId}/finance/journal-entries/{entryId}/reverse",
    {
      operationId: "LedgerController_reverse",
      clientMethod: "reverse",
      body: null,
    },
  ],
]);

const commissionOperations = new Map([
  [
    "post /organizations/{organizationId}/finance/commission-plan-versions",
    {
      operationId: "CommissionController_createPlanVersion",
      clientMethod: "createCommissionPlanVersion",
      body: {
        type: "object",
        required: ["version"],
        additionalProperties: false,
        properties: {
          version: { type: "integer", minimum: 1 },
          rateBps: { type: "integer", minimum: 1, maximum: 10000 },
          recipients: {
            type: "array",
            minItems: 1,
            items: {
              type: "object",
              required: ["order", "kind", "splitBps"],
              additionalProperties: false,
              properties: {
                order: { type: "integer", minimum: 1 },
                kind: { type: "string", enum: ["BROKER", "OFFICE"] },
                splitBps: { type: "integer", minimum: 1, maximum: 10000 },
              },
            },
          },
        },
        oneOf: [
          {
            type: "object",
            required: ["version"],
            additionalProperties: false,
            properties: {
              version: { type: "integer", minimum: 1 },
            },
          },
          {
            type: "object",
            required: ["version", "rateBps", "recipients"],
            additionalProperties: false,
            properties: {
              version: { type: "integer", minimum: 1 },
              rateBps: { type: "integer", minimum: 1, maximum: 10000 },
              recipients: {
                type: "array",
                minItems: 1,
                items: {
                  type: "object",
                  required: ["order", "kind", "splitBps"],
                  additionalProperties: false,
                  properties: {
                    order: { type: "integer", minimum: 1 },
                    kind: { type: "string", enum: ["BROKER", "OFFICE"] },
                    splitBps: { type: "integer", minimum: 1, maximum: 10000 },
                  },
                },
              },
            },
          },
        ],
      },
      successStatuses: ["201"],
    },
  ],
  [
    "post /organizations/{organizationId}/finance/deals/{dealId}/commissionable-values",
    {
      operationId: "CommissionController_captureCommissionableValue",
      clientMethod: "captureCommissionableValue",
      body: {
        type: "object",
        required: ["valueId", "amountMinor", "currency", "capturedAt"],
        additionalProperties: false,
        properties: {
          valueId: { type: "string", format: "uuid" },
          amountMinor: { type: "string", pattern: "^[1-9]\\d*$" },
          currency: { type: "string", pattern: "^[A-Z]{3}$" },
          capturedAt: { type: "string", format: "date-time" },
        },
      },
      successStatuses: ["201"],
    },
  ],
  [
    "post /organizations/{organizationId}/finance/deals/{dealId}/expected-commissions",
    {
      operationId: "CommissionController_createExpectedAccrual",
      clientMethod: "createExpectedAccrual",
      body: {
        type: "object",
        required: [
          "accrualId",
          "commissionableValueId",
          "commissionPlanVersionId",
          "dealClosedWonEventId",
        ],
        additionalProperties: false,
        properties: {
          accrualId: { type: "string", format: "uuid" },
          commissionableValueId: { type: "string", format: "uuid" },
          commissionPlanVersionId: { type: "string", format: "uuid" },
          dealClosedWonEventId: { type: "string", format: "uuid" },
        },
      },
      successStatuses: ["201", "200"],
    },
  ],
]);

const uuidSchema = { type: "string", format: "uuid" };
const amountMinorSchema = { type: "string", pattern: "^[1-9]\\d*$" };
const signedAmountMinorSchema = {
  type: "string",
  pattern: "^-?(0|[1-9]\\d*)$",
};
const currencySchema = { type: "string", pattern: "^[A-Z]{3}$" };
const instantSchema = {
  type: "string",
  format: "date-time",
  pattern: "^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}\\.\\d{3}Z$",
};
const agingResponseSchema = {
  type: "object",
  required: ["asOf", "items"],
  additionalProperties: false,
  properties: {
    asOf: instantSchema,
    items: {
      type: "array",
      items: {
        type: "object",
        required: [
          "receivableId",
          "invoiceId",
          "dealId",
          "currency",
          "originalAmountMinor",
          "outstandingMinor",
          "status",
          "issuedAt",
          "dueAt",
          "daysPastDue",
          "bucket",
        ],
        additionalProperties: false,
        properties: {
          receivableId: uuidSchema,
          invoiceId: uuidSchema,
          dealId: uuidSchema,
          currency: currencySchema,
          originalAmountMinor: amountMinorSchema,
          outstandingMinor: amountMinorSchema,
          status: { type: "string", enum: ["OPEN", "PARTIALLY_PAID"] },
          issuedAt: instantSchema,
          dueAt: instantSchema,
          daysPastDue: { type: "integer", minimum: 0 },
          bucket: {
            type: "string",
            enum: [
              "CURRENT",
              "DAYS_1_30",
              "DAYS_31_60",
              "DAYS_61_90",
              "DAYS_91_PLUS",
            ],
          },
        },
      },
    },
    nextCursor: {
      type: "string",
      minLength: 1,
      maxLength: 512,
      pattern: "^[A-Za-z0-9_-]+$",
    },
  },
};

const receivableOperations = new Map([
  [
    "post /organizations/{organizationId}/finance/deals/{dealId}/invoices",
    {
      operationId: "ReceivableController_createDraft",
      clientMethod: "createInvoiceDraft",
      body: {
        type: "object",
        required: ["amountMinor", "currency"],
        additionalProperties: false,
        properties: {
          amountMinor: amountMinorSchema,
          currency: currencySchema,
        },
      },
      successStatuses: ["201"],
      idempotency: false,
    },
  ],
  [
    "post /organizations/{organizationId}/finance/invoices/{invoiceId}/issue",
    {
      operationId: "ReceivableController_issue",
      clientMethod: "issueInvoice",
      body: {
        type: "object",
        required: ["receivableId", "issuedAt", "dueAt"],
        additionalProperties: false,
        properties: {
          receivableId: uuidSchema,
          issuedAt: instantSchema,
          dueAt: instantSchema,
        },
      },
      successStatuses: ["201", "200"],
      idempotency: false,
    },
  ],
  [
    "post /organizations/{organizationId}/finance/invoices/{invoiceId}/cancel",
    {
      operationId: "ReceivableController_cancel",
      clientMethod: "cancelInvoice",
      body: {
        type: "object",
        required: ["reason"],
        additionalProperties: false,
        properties: {
          reason: {
            type: "string",
            minLength: 1,
            maxLength: 500,
            pattern: "\\S",
          },
        },
      },
      successStatuses: ["200"],
      errorStatuses: ["400", "401", "403", "404", "409"],
      idempotency: false,
    },
  ],
  [
    "get /organizations/{organizationId}/finance/receivables/aging",
    {
      operationId: "ReceivableController_getAging",
      clientMethod: "getReceivableAging",
      body: null,
      query: {
        cursor: {
          type: "string",
          minLength: 1,
          maxLength: 512,
          pattern: "^[A-Za-z0-9_-]+$",
        },
        limit: { type: "integer", minimum: 1, maximum: 100, default: 50 },
      },
      responseSchema: agingResponseSchema,
      responseType: "ReceivableAgingResponse",
      successStatuses: ["200"],
      errorStatuses: ["400", "401", "403"],
      idempotency: false,
    },
  ],
  [
    "post /organizations/{organizationId}/finance/receivables/{receivableId}/payments",
    {
      operationId: "ReceivableController_recordPayment",
      clientMethod: "recordReceivablePayment",
      body: {
        type: "object",
        required: ["amountMinor", "currency", "recordedAt"],
        additionalProperties: false,
        properties: {
          amountMinor: amountMinorSchema,
          currency: currencySchema,
          recordedAt: instantSchema,
        },
      },
      successStatuses: ["201", "200"],
      idempotency: true,
    },
  ],
]);

const expenseOperations = new Map([
  [
    "post /organizations/{organizationId}/finance/expenses",
    {
      operationId: "ExpenseController_createDraft",
      clientMethod: "createExpenseDraft",
      body: {
        type: "object",
        required: ["category", "vendorReference", "amountMinor", "currency"],
        additionalProperties: false,
        properties: {
          category: {
            type: "string",
            enum: ["OFFICE", "CAMPAIGN", "PROPERTY", "OTHER"],
          },
          vendorReference: {
            type: "string",
            minLength: 1,
            maxLength: 200,
            pattern: "\\S",
          },
          amountMinor: amountMinorSchema,
          currency: currencySchema,
          campaignReference: {
            type: "string",
            minLength: 1,
            maxLength: 100,
            pattern: "\\S",
          },
          campaignId: uuidSchema,
          propertyId: uuidSchema,
          dealId: uuidSchema,
        },
      },
      successStatuses: ["201"],
      errorStatuses: ["400", "401", "403"],
      idempotency: false,
    },
  ],
  [
    "post /organizations/{organizationId}/finance/expenses/{expenseId}/evidence",
    {
      operationId: "ExpenseController_attachEvidence",
      clientMethod: "attachExpenseEvidence",
      body: {
        type: "object",
        required: ["evidenceId", "mediaType", "byteSize", "attachedAt"],
        additionalProperties: false,
        properties: {
          evidenceId: uuidSchema,
          mediaType: {
            type: "string",
            enum: ["PDF", "JPEG", "PNG", "WEBP"],
          },
          byteSize: { type: "integer", minimum: 1, maximum: 100000000 },
          note: {
            type: "string",
            minLength: 1,
            maxLength: 500,
            pattern: "\\S",
          },
          attachedAt: instantSchema,
        },
      },
      successStatuses: ["201", "200"],
      errorStatuses: ["400", "401", "403", "404", "409"],
      idempotency: false,
    },
  ],
  [
    "post /organizations/{organizationId}/finance/expenses/{expenseId}/submit",
    {
      operationId: "ExpenseController_submit",
      clientMethod: "submitExpenseForApproval",
      body: null,
      successStatuses: ["200"],
      errorStatuses: ["400", "401", "403", "404", "409"],
      idempotency: false,
    },
  ],
  [
    "post /organizations/{organizationId}/finance/expenses/{expenseId}/decision",
    {
      operationId: "ExpenseController_decideApproval",
      clientMethod: "decideExpenseApproval",
      body: {
        type: "object",
        required: ["decision"],
        additionalProperties: false,
        properties: {
          decision: { type: "string", enum: ["APPROVED", "REJECTED"] },
          reason: {
            type: "string",
            minLength: 1,
            maxLength: 500,
            pattern: "\\S",
          },
        },
      },
      successStatuses: ["200"],
      errorStatuses: ["400", "401", "403", "404", "409"],
      idempotency: false,
    },
  ],
  [
    "post /organizations/{organizationId}/finance/expense-approval-policy",
    {
      operationId: "ExpenseController_setApprovalPolicy",
      clientMethod: "setExpenseApprovalPolicy",
      body: {
        type: "object",
        required: ["currency"],
        additionalProperties: false,
        properties: {
          thresholdMinor: amountMinorSchema,
          currency: currencySchema,
        },
      },
      successStatuses: ["201", "200"],
      errorStatuses: ["400", "401", "403"],
      idempotency: false,
    },
  ],
]);

// EF-401 — campaigns and attribution contract.
const campaignChannelSchema = {
  type: "string",
  enum: [
    "META",
    "GOOGLE",
    "SNAPCHAT",
    "TIKTOK",
    "X",
    "LINKEDIN",
    "PRINT",
    "OUTDOOR",
    "REFERRAL",
    "OTHER",
  ],
};
const touchChannelSchema = {
  type: "string",
  enum: [
    "WEBSITE",
    "WHATSAPP",
    "PHONE_CALL",
    "WALK_IN",
    "REFERRAL",
    "META",
    "GOOGLE",
    "SNAPCHAT",
    "TIKTOK",
    "X",
    "OTHER",
  ],
};
const campaignStatusSchema = {
  type: "string",
  enum: ["DRAFT", "ACTIVE", "COMPLETED", "CANCELLED"],
};
const utmSchema = {
  type: "object",
  required: [],
  additionalProperties: false,
  properties: {
    utmSource: { type: "string", minLength: 1, maxLength: 100 },
    utmMedium: { type: "string", minLength: 1, maxLength: 100 },
    utmCampaign: { type: "string", minLength: 1, maxLength: 100 },
    utmContent: { type: "string", minLength: 1, maxLength: 100 },
    utmTerm: { type: "string", minLength: 1, maxLength: 100 },
  },
};
const campaignMoneyRowSchema = {
  type: "object",
  required: ["currency", "count", "amountMinor"],
  additionalProperties: false,
  properties: {
    currency: currencySchema,
    count: { type: "integer", minimum: 0 },
    amountMinor: amountMinorSchema,
  },
};
const campaignSchema = {
  type: "object",
  required: [
    "id",
    "organizationId",
    "name",
    "objective",
    "channel",
    "status",
    "startsAt",
    "endsAt",
    "budget",
    "utm",
    "createdBy",
    "createdAt",
    "updatedAt",
  ],
  additionalProperties: false,
  properties: {
    id: uuidSchema,
    organizationId: uuidSchema,
    name: { type: "string", minLength: 1, maxLength: 200 },
    objective: { type: "string", minLength: 1, maxLength: 500 },
    channel: campaignChannelSchema,
    status: campaignStatusSchema,
    startsAt: instantSchema,
    endsAt: instantSchema,
    budget: {
      type: "object",
      required: ["amountMinor", "currency"],
      additionalProperties: false,
      properties: {
        amountMinor: amountMinorSchema,
        currency: currencySchema,
      },
    },
    utm: utmSchema,
    createdBy: uuidSchema,
    createdAt: instantSchema,
    updatedAt: instantSchema,
  },
};
const campaignTransitionSchema = {
  type: "object",
  required: [
    "id",
    "organizationId",
    "campaignId",
    "fromStatus",
    "toStatus",
    "actorId",
    "createdAt",
  ],
  additionalProperties: false,
  properties: {
    id: uuidSchema,
    organizationId: uuidSchema,
    campaignId: uuidSchema,
    fromStatus: campaignStatusSchema,
    toStatus: campaignStatusSchema,
    reason: { type: "string", minLength: 1, maxLength: 500 },
    actorId: uuidSchema,
    createdAt: instantSchema,
  },
};
const budgetCorrectionSchema = {
  type: "object",
  required: [
    "id",
    "organizationId",
    "campaignId",
    "previousMinor",
    "correctedMinor",
    "currency",
    "reason",
    "createdBy",
    "createdAt",
  ],
  additionalProperties: false,
  properties: {
    id: uuidSchema,
    organizationId: uuidSchema,
    campaignId: uuidSchema,
    previousMinor: amountMinorSchema,
    correctedMinor: amountMinorSchema,
    currency: currencySchema,
    reason: { type: "string", minLength: 1, maxLength: 500 },
    createdBy: uuidSchema,
    createdAt: instantSchema,
  },
};
const performanceEntrySchema = {
  type: "object",
  required: [
    "id",
    "organizationId",
    "campaignId",
    "occurredAt",
    "impressions",
    "clicks",
    "leadsCount",
    "createdBy",
    "createdAt",
  ],
  additionalProperties: false,
  properties: {
    id: uuidSchema,
    organizationId: uuidSchema,
    campaignId: uuidSchema,
    occurredAt: instantSchema,
    impressions: { type: "integer", minimum: 0 },
    clicks: { type: "integer", minimum: 0 },
    leadsCount: { type: "integer", minimum: 0 },
    note: { type: "string", minLength: 1, maxLength: 500 },
    createdBy: uuidSchema,
    createdAt: instantSchema,
  },
};
const touchSchema = {
  type: "object",
  required: [
    "id",
    "organizationId",
    "leadId",
    "channel",
    "utm",
    "occurredAt",
    "createdBy",
    "createdAt",
  ],
  additionalProperties: false,
  properties: {
    id: uuidSchema,
    organizationId: uuidSchema,
    leadId: uuidSchema,
    campaignId: uuidSchema,
    channel: touchChannelSchema,
    source: { type: "string", minLength: 1, maxLength: 200 },
    utm: utmSchema,
    occurredAt: instantSchema,
    createdBy: uuidSchema,
    createdAt: instantSchema,
  },
};
const attributionCorrectionSchema = {
  type: "object",
  required: [
    "id",
    "organizationId",
    "leadId",
    "reason",
    "createdBy",
    "createdAt",
  ],
  additionalProperties: false,
  properties: {
    id: uuidSchema,
    organizationId: uuidSchema,
    leadId: uuidSchema,
    previousCampaignId: uuidSchema,
    correctedCampaignId: uuidSchema,
    reason: { type: "string", minLength: 1, maxLength: 500 },
    createdBy: uuidSchema,
    createdAt: instantSchema,
  },
};
const campaignPagedSchema = (itemsSchema) => ({
  type: "object",
  required: ["items"],
  additionalProperties: false,
  properties: {
    items: { type: "array", items: itemsSchema },
    nextCursor: {
      type: "string",
      minLength: 1,
      maxLength: 512,
      pattern: "^[A-Za-z0-9_-]+$",
    },
  },
});

const analyticsMoneyRowSchema = {
  type: "object",
  required: ["currency", "count", "amountMinor"],
  additionalProperties: false,
  properties: {
    currency: currencySchema,
    count: { type: "integer", minimum: 0 },
    amountMinor: signedAmountMinorSchema,
  },
};
const analyticsAttributionSchema = {
  type: "object",
  required: [
    "firstTouchLeadCount",
    "firstTouchQualifiedLeadCount",
    "firstTouchWinCount",
    "firstTouchAttributedRevenue",
    "lastTouchLeadCount",
    "lastTouchQualifiedLeadCount",
    "lastTouchWinCount",
    "lastTouchAttributedRevenue",
  ],
  additionalProperties: false,
  properties: {
    firstTouchLeadCount: { type: "integer", minimum: 0 },
    firstTouchQualifiedLeadCount: { type: "integer", minimum: 0 },
    firstTouchWinCount: { type: "integer", minimum: 0 },
    firstTouchAttributedRevenue: {
      type: "array",
      items: analyticsMoneyRowSchema,
    },
    lastTouchLeadCount: { type: "integer", minimum: 0 },
    lastTouchQualifiedLeadCount: { type: "integer", minimum: 0 },
    lastTouchWinCount: { type: "integer", minimum: 0 },
    lastTouchAttributedRevenue: {
      type: "array",
      items: analyticsMoneyRowSchema,
    },
  },
};
const publishedContentCountSchema = {
  type: "object",
  required: ["channel", "count"],
  additionalProperties: false,
  properties: {
    channel: { type: "string", minLength: 1 },
    count: { type: "integer", minimum: 0 },
  },
};
const analyticsMetricSchema = {
  type: "object",
  required: ["currency", "cpl", "cac", "roi"],
  additionalProperties: false,
  properties: {
    currency: currencySchema,
    cpl: { type: "string" },
    cac: { type: "string" },
    roi: { type: "string" },
  },
};
const analyticsMetricsSchema = {
  type: "object",
  required: ["firstTouch", "lastTouch"],
  additionalProperties: false,
  properties: {
    firstTouch: { type: "array", items: analyticsMetricSchema },
    lastTouch: { type: "array", items: analyticsMetricSchema },
  },
};
const campaignAnalyticsSchema = {
  type: "object",
  required: [
    "campaignId",
    "plannedBudget",
    "approvedSpend",
    "touchCount",
    "attribution",
    "publishedContent",
  ],
  additionalProperties: false,
  properties: {
    campaignId: uuidSchema,
    plannedBudget: { type: "array", items: analyticsMoneyRowSchema },
    approvedSpend: { type: "array", items: analyticsMoneyRowSchema },
    touchCount: { type: "integer", minimum: 0 },
    attribution: analyticsAttributionSchema,
    publishedContent: { type: "array", items: publishedContentCountSchema },
  },
};
const organizationAnalyticsSchema = {
  type: "object",
  required: [
    "campaignCount",
    "plannedBudget",
    "approvedSpend",
    "touchCount",
    "attribution",
    "publishedContent",
  ],
  additionalProperties: false,
  properties: {
    campaignId: uuidSchema,
    campaignCount: { type: "integer", minimum: 0 },
    plannedBudget: { type: "array", items: analyticsMoneyRowSchema },
    approvedSpend: { type: "array", items: analyticsMoneyRowSchema },
    touchCount: { type: "integer", minimum: 0 },
    attribution: analyticsAttributionSchema,
    publishedContent: { type: "array", items: publishedContentCountSchema },
  },
};
const analyticsResponseSchema = (payload) => ({
  type: "object",
  required: ["asOf", "analytics", "metrics"],
  additionalProperties: false,
  properties: {
    asOf: instantSchema,
    analytics: payload,
    metrics: analyticsMetricsSchema,
  },
});

const campaignOperations = new Map([
  [
    "get /organizations/{organizationId}/campaigns/analytics",
    {
      operationId: "CampaignController_organizationAnalytics",
      clientMethod: "getOrganizationCampaignAnalytics",
      body: null,
      responseSchema: analyticsResponseSchema(organizationAnalyticsSchema),
      responseType: "OrganizationCampaignAnalyticsResponse",
      successStatuses: ["200"],
      errorStatuses: ["401", "403"],
      idempotency: false,
    },
  ],
  [
    "post /organizations/{organizationId}/campaigns",
    {
      operationId: "CampaignController_create",
      clientMethod: "createCampaign",
      body: {
        type: "object",
        required: [
          "name",
          "objective",
          "channel",
          "startsAt",
          "endsAt",
          "budgetPlannedMinor",
          "currency",
        ],
        additionalProperties: false,
        properties: {
          name: {
            type: "string",
            minLength: 1,
            maxLength: 200,
            pattern: "\\S",
          },
          objective: {
            type: "string",
            minLength: 1,
            maxLength: 500,
            pattern: "\\S",
          },
          channel: campaignChannelSchema,
          startsAt: instantSchema,
          endsAt: instantSchema,
          budgetPlannedMinor: amountMinorSchema,
          currency: currencySchema,
          utmSource: {
            type: "string",
            minLength: 1,
            maxLength: 100,
            pattern: "\\S",
          },
          utmMedium: {
            type: "string",
            minLength: 1,
            maxLength: 100,
            pattern: "\\S",
          },
          utmCampaign: {
            type: "string",
            minLength: 1,
            maxLength: 100,
            pattern: "\\S",
          },
          utmContent: {
            type: "string",
            minLength: 1,
            maxLength: 100,
            pattern: "\\S",
          },
          utmTerm: {
            type: "string",
            minLength: 1,
            maxLength: 100,
            pattern: "\\S",
          },
        },
      },
      successStatuses: ["201"],
      errorStatuses: ["400", "401", "403"],
      idempotency: false,
    },
  ],
  [
    "get /organizations/{organizationId}/campaigns",
    {
      operationId: "CampaignController_list",
      clientMethod: "listCampaigns",
      body: null,
      query: {
        status: campaignStatusSchema,
        cursor: {
          type: "string",
          minLength: 1,
          maxLength: 512,
          pattern: "^[A-Za-z0-9_-]+$",
        },
        limit: { type: "integer", minimum: 1, maximum: 100, default: 50 },
      },
      responseSchema: campaignPagedSchema({
        type: "object",
        required: [
          "id",
          "name",
          "objective",
          "channel",
          "status",
          "startsAt",
          "endsAt",
          "budgetPlannedMinor",
          "currency",
          "touchCount",
          "createdAt",
        ],
        additionalProperties: false,
        properties: {
          id: uuidSchema,
          name: { type: "string", minLength: 1, maxLength: 200 },
          objective: { type: "string", minLength: 1, maxLength: 500 },
          channel: campaignChannelSchema,
          status: campaignStatusSchema,
          startsAt: instantSchema,
          endsAt: instantSchema,
          budgetPlannedMinor: amountMinorSchema,
          currency: currencySchema,
          budgetActualMinor: amountMinorSchema,
          touchCount: { type: "integer", minimum: 0 },
          createdAt: instantSchema,
        },
      }),
      responseType: "CampaignListPage",
      successStatuses: ["200"],
      errorStatuses: ["400", "401", "403"],
      idempotency: false,
    },
  ],
  [
    "get /organizations/{organizationId}/campaigns/{campaignId}/analytics",
    {
      operationId: "CampaignController_campaignAnalytics",
      clientMethod: "getCampaignAnalytics",
      body: null,
      responseSchema: analyticsResponseSchema(campaignAnalyticsSchema),
      responseType: "CampaignAnalyticsResponse",
      successStatuses: ["200"],
      errorStatuses: ["401", "403", "404"],
      idempotency: false,
    },
  ],
  [
    "get /organizations/{organizationId}/campaigns/{campaignId}",
    {
      operationId: "CampaignController_find",
      clientMethod: "findCampaign",
      body: null,
      responseSchema: {
        type: "object",
        required: [
          "campaign",
          "actualByCurrency",
          "transitions",
          "budgetCorrections",
        ],
        additionalProperties: false,
        properties: {
          campaign: campaignSchema,
          actualByCurrency: {
            type: "array",
            items: campaignMoneyRowSchema,
          },
          transitions: { type: "array", items: campaignTransitionSchema },
          budgetCorrections: {
            type: "array",
            items: budgetCorrectionSchema,
          },
        },
      },
      responseType: "CampaignDetailResponse",
      successStatuses: ["200"],
      errorStatuses: ["401", "403", "404"],
      idempotency: false,
    },
  ],
  [
    "post /organizations/{organizationId}/campaigns/{campaignId}/transition",
    {
      operationId: "CampaignController_transition",
      clientMethod: "transitionCampaign",
      body: {
        type: "object",
        required: ["toStatus"],
        additionalProperties: false,
        properties: {
          toStatus: {
            type: "string",
            enum: ["ACTIVE", "COMPLETED", "CANCELLED"],
          },
          reason: {
            type: "string",
            minLength: 1,
            maxLength: 500,
            pattern: "\\S",
          },
        },
      },
      successStatuses: ["200"],
      errorStatuses: ["400", "401", "403", "404", "409"],
      idempotency: false,
    },
  ],
  [
    "post /organizations/{organizationId}/campaigns/{campaignId}/budget-corrections",
    {
      operationId: "CampaignController_correctBudget",
      clientMethod: "correctCampaignBudget",
      body: {
        type: "object",
        required: ["correctedMinor", "reason"],
        additionalProperties: false,
        properties: {
          correctedMinor: amountMinorSchema,
          reason: {
            type: "string",
            minLength: 1,
            maxLength: 500,
            pattern: "\\S",
          },
        },
      },
      successStatuses: ["201"],
      errorStatuses: ["400", "401", "403", "404", "409"],
      idempotency: false,
    },
  ],
  [
    "post /organizations/{organizationId}/campaigns/{campaignId}/performance-entries",
    {
      operationId: "CampaignController_recordPerformance",
      clientMethod: "recordCampaignPerformance",
      body: {
        type: "object",
        required: ["occurredAt", "impressions", "clicks", "leadsCount"],
        additionalProperties: false,
        properties: {
          occurredAt: instantSchema,
          impressions: { type: "integer", minimum: 0, maximum: 1000000000 },
          clicks: { type: "integer", minimum: 0, maximum: 1000000000 },
          leadsCount: { type: "integer", minimum: 0, maximum: 1000000000 },
          note: {
            type: "string",
            minLength: 1,
            maxLength: 500,
            pattern: "\\S",
          },
        },
      },
      successStatuses: ["201"],
      errorStatuses: ["400", "401", "403", "404", "409"],
      idempotency: false,
    },
  ],
  [
    "get /organizations/{organizationId}/campaigns/{campaignId}/performance-entries",
    {
      operationId: "CampaignController_listPerformance",
      clientMethod: "listCampaignPerformanceEntries",
      body: null,
      query: {
        cursor: {
          type: "string",
          minLength: 1,
          maxLength: 512,
          pattern: "^[A-Za-z0-9_-]+$",
        },
        limit: { type: "integer", minimum: 1, maximum: 100, default: 50 },
      },
      responseSchema: campaignPagedSchema(performanceEntrySchema),
      responseType: "CampaignPerformanceEntryPage",
      successStatuses: ["200"],
      errorStatuses: ["400", "401", "403", "404"],
      idempotency: false,
    },
  ],
  [
    "post /organizations/{organizationId}/leads/{leadId}/touches",
    {
      operationId: "CampaignController_recordTouch",
      clientMethod: "recordLeadTouch",
      body: {
        type: "object",
        required: ["channel"],
        additionalProperties: false,
        properties: {
          channel: touchChannelSchema,
          source: {
            type: "string",
            minLength: 1,
            maxLength: 200,
            pattern: "\\S",
          },
          campaignId: uuidSchema,
          utmSource: {
            type: "string",
            minLength: 1,
            maxLength: 100,
            pattern: "\\S",
          },
          utmMedium: {
            type: "string",
            minLength: 1,
            maxLength: 100,
            pattern: "\\S",
          },
          utmCampaign: {
            type: "string",
            minLength: 1,
            maxLength: 100,
            pattern: "\\S",
          },
          utmContent: {
            type: "string",
            minLength: 1,
            maxLength: 100,
            pattern: "\\S",
          },
          utmTerm: {
            type: "string",
            minLength: 1,
            maxLength: 100,
            pattern: "\\S",
          },
          occurredAt: instantSchema,
        },
      },
      successStatuses: ["201"],
      errorStatuses: ["400", "401", "403", "404"],
      idempotency: false,
    },
  ],
  [
    "get /organizations/{organizationId}/leads/{leadId}/touches",
    {
      operationId: "CampaignController_listTouches",
      clientMethod: "listLeadTouches",
      body: null,
      query: {
        cursor: {
          type: "string",
          minLength: 1,
          maxLength: 512,
          pattern: "^[A-Za-z0-9_-]+$",
        },
        limit: { type: "integer", minimum: 1, maximum: 100, default: 50 },
      },
      responseSchema: campaignPagedSchema(touchSchema),
      responseType: "LeadTouchPage",
      successStatuses: ["200"],
      errorStatuses: ["400", "401", "403", "404"],
      idempotency: false,
    },
  ],
  [
    "get /organizations/{organizationId}/leads/{leadId}/attribution",
    {
      operationId: "CampaignController_getAttribution",
      clientMethod: "getLeadAttribution",
      body: null,
      responseSchema: {
        type: "object",
        required: ["attribution"],
        additionalProperties: false,
        properties: {
          attribution: {
            type: "object",
            required: [],
            additionalProperties: false,
            properties: {
              firstTouch: touchSchema,
              lastTouch: touchSchema,
              firstCampaignId: uuidSchema,
              lastCampaignId: uuidSchema,
              override: attributionCorrectionSchema,
            },
          },
        },
      },
      responseType: "LeadAttributionResponse",
      successStatuses: ["200"],
      errorStatuses: ["401", "403", "404"],
      idempotency: false,
    },
  ],
  [
    "post /organizations/{organizationId}/leads/{leadId}/attribution-corrections",
    {
      operationId: "CampaignController_correctAttribution",
      clientMethod: "correctLeadAttribution",
      body: {
        type: "object",
        required: ["reason"],
        additionalProperties: false,
        properties: {
          correctedCampaignId: uuidSchema,
          reason: {
            type: "string",
            minLength: 1,
            maxLength: 500,
            pattern: "\\S",
          },
        },
      },
      successStatuses: ["201"],
      errorStatuses: ["400", "401", "403", "404"],
      idempotency: false,
    },
  ],
]);

const automationDefinitionSchema = {
  type: "object",
  required: ["trigger", "conditions", "action"],
  additionalProperties: false,
  properties: {
    trigger: { type: "object", additionalProperties: true },
    conditions: {
      type: "array",
      items: { type: "object", additionalProperties: true },
    },
    action: { type: "object", additionalProperties: true },
  },
};
const automationOperations = new Map([
  [
    "post /organizations/{organizationId}/automation/rules",
    {
      operationId: "AutomationRuleController_create",
      clientMethod: "createAutomationRule",
      body: {
        type: "object",
        required: ["name", "definition"],
        additionalProperties: false,
        properties: {
          name: { type: "string", minLength: 1, maxLength: 200 },
          definition: automationDefinitionSchema,
        },
      },
      successStatuses: ["201"],
    },
  ],
  [
    "post /organizations/{organizationId}/automation/rules/{ruleId}/versions",
    {
      operationId: "AutomationRuleController_addVersion",
      clientMethod: "addAutomationRuleVersion",
      body: {
        type: "object",
        required: ["definition"],
        additionalProperties: false,
        properties: {
          definition: automationDefinitionSchema,
          note: { type: "string", minLength: 1, maxLength: 500 },
        },
      },
      successStatuses: ["201"],
    },
  ],
  [
    "post /organizations/{organizationId}/automation/rules/{ruleId}/enable",
    {
      operationId: "AutomationRuleController_enable",
      clientMethod: "enableAutomationRule",
      body: null,
      successStatuses: ["200"],
    },
  ],
  [
    "post /organizations/{organizationId}/automation/rules/{ruleId}/disable",
    {
      operationId: "AutomationRuleController_disable",
      clientMethod: "disableAutomationRule",
      body: null,
      successStatuses: ["200"],
    },
  ],
  [
    "get /organizations/{organizationId}/automation/rules",
    {
      operationId: "AutomationRuleController_list",
      clientMethod: "listAutomationRules",
      body: null,
      successStatuses: ["200"],
    },
  ],
  [
    "get /organizations/{organizationId}/automation/rules/{ruleId}",
    {
      operationId: "AutomationRuleController_find",
      clientMethod: "findAutomationRule",
      body: null,
      successStatuses: ["200"],
    },
  ],
  // EF-306 — execution history plus guarded retry/cancel.
  [
    "get /organizations/{organizationId}/automation/jobs",
    {
      operationId: "AutomationRuleController_listJobs",
      clientMethod: "listAutomationJobs",
      body: null,
      method: "GET",
      successStatuses: ["200"],
    },
  ],
  [
    "get /organizations/{organizationId}/automation/rules/{ruleId}/jobs",
    {
      operationId: "AutomationRuleController_listRuleJobs",
      clientMethod: "listAutomationRuleJobs",
      body: null,
      method: "GET",
      successStatuses: ["200"],
    },
  ],
  [
    "get /organizations/{organizationId}/automation/jobs/{jobId}",
    {
      operationId: "AutomationRuleController_findJob",
      clientMethod: "findAutomationJob",
      body: null,
      method: "GET",
      successStatuses: ["200"],
    },
  ],
  [
    "post /organizations/{organizationId}/automation/jobs/{jobId}/retry",
    {
      operationId: "AutomationRuleController_retryJob",
      clientMethod: "retryAutomationJob",
      body: null,
      method: "POST",
      successStatuses: ["201"],
    },
  ],
  [
    "post /organizations/{organizationId}/automation/jobs/{jobId}/cancel",
    {
      operationId: "AutomationRuleController_cancelJob",
      clientMethod: "cancelAutomationJob",
      body: null,
      method: "POST",
      successStatuses: ["200"],
    },
  ],
]);

const reportBucketSchema = {
  type: "string",
  enum: ["CURRENT", "DAYS_1_30", "DAYS_31_60", "DAYS_61_90", "DAYS_91_PLUS"],
};
const reportMoneyTotalSchema = {
  type: "object",
  required: ["currency", "count", "amountMinor"],
  additionalProperties: false,
  properties: {
    currency: currencySchema,
    count: { type: "integer", minimum: 0 },
    amountMinor: amountMinorSchema,
  },
};
const reportSignedMoneySchema = {
  type: "object",
  required: ["currency", "amountMinor"],
  additionalProperties: false,
  properties: {
    currency: currencySchema,
    amountMinor: { type: "string", pattern: "^-?(0|[1-9]\\d*)$" },
  },
};
const reportPagedSchema = (itemsSchema) => ({
  type: "object",
  required: ["asOf", "items"],
  additionalProperties: false,
  properties: {
    asOf: instantSchema,
    items: { type: "array", items: itemsSchema },
    nextCursor: {
      type: "string",
      minLength: 1,
      maxLength: 512,
      pattern: "^[A-Za-z0-9_-]+$",
    },
  },
});

const reportPerformanceRowSchema = {
  type: "object",
  required: [
    "keyId",
    "currency",
    "revenueMinor",
    "costsMinor",
    "marginMinor",
    "paymentCount",
    "expenseCount",
  ],
  additionalProperties: false,
  properties: {
    keyId: uuidSchema,
    currency: currencySchema,
    revenueMinor: { type: "string", pattern: "^-?(0|[1-9]\\d*)$" },
    costsMinor: { type: "string", pattern: "^-?(0|[1-9]\\d*)$" },
    marginMinor: { type: "string", pattern: "^-?(0|[1-9]\\d*)$" },
    paymentCount: { type: "integer", minimum: 0 },
    expenseCount: { type: "integer", minimum: 0 },
  },
};

const notificationOperations = new Map([
  [
    "get /organizations/{organizationId}/notifications/templates",
    {
      operationId: "NotificationController_listTemplates",
      clientMethod: "listNotificationTemplates",
      body: null,
    },
  ],
  [
    "post /organizations/{organizationId}/notifications/templates",
    {
      operationId: "NotificationController_createTemplate",
      clientMethod: "createNotificationTemplate",
      body: "json",
    },
  ],
  [
    "post /organizations/{organizationId}/notifications/templates/{templateId}/revisions",
    {
      operationId: "NotificationController_reviseTemplate",
      clientMethod: "reviseNotificationTemplate",
      body: "json",
    },
  ],
  [
    "post /organizations/{organizationId}/notifications/templates/{templateId}/approve",
    {
      operationId: "NotificationController_approveTemplate",
      clientMethod: "approveNotificationTemplate",
      body: null,
    },
  ],
  [
    "get /organizations/{organizationId}/notifications/approvals",
    {
      operationId: "NotificationController_listApprovals",
      clientMethod: "listNotificationApprovals",
      body: null,
    },
  ],
  [
    "post /organizations/{organizationId}/notifications/send-requests",
    {
      operationId: "NotificationController_requestSend",
      clientMethod: "requestNotificationSend",
      body: "json",
    },
  ],
  [
    "post /organizations/{organizationId}/notifications/approvals/{approvalId}/approve",
    {
      operationId: "NotificationController_approveSend",
      clientMethod: "approveNotificationSend",
      body: null,
    },
  ],
  [
    "post /organizations/{organizationId}/notifications/approvals/{approvalId}/reject",
    {
      operationId: "NotificationController_rejectSend",
      clientMethod: "rejectNotificationSend",
      body: "json",
    },
  ],
  [
    "get /organizations/{organizationId}/notifications/sends",
    {
      operationId: "NotificationController_listSends",
      clientMethod: "listNotificationSends",
      body: null,
    },
  ],
  [
    "post /organizations/{organizationId}/notifications/policy",
    {
      operationId: "NotificationController_updatePolicy",
      clientMethod: "updateNotificationPolicy",
      body: "json",
    },
  ],
  [
    "post /organizations/{organizationId}/notifications/preferences",
    {
      operationId: "NotificationController_updatePreference",
      clientMethod: "updateNotificationPreference",
      body: "json",
    },
  ],
]);

const reportOperations = new Map([
  [
    "get /organizations/{organizationId}/finance/reports/cash-flow",
    {
      operationId: "ReportController_getCashFlow",
      clientMethod: "getOwnerCashFlow",
      body: null,
      query: {
        from: instantSchema,
        to: instantSchema,
      },
      responseSchema: {
        type: "object",
        required: ["asOf", "cashIn", "cashOut", "netCash"],
        additionalProperties: false,
        properties: {
          asOf: instantSchema,
          cashIn: { type: "array", items: reportMoneyTotalSchema },
          cashOut: { type: "array", items: reportMoneyTotalSchema },
          netCash: { type: "array", items: reportSignedMoneySchema },
        },
      },
      responseType: "OwnerCashFlowResponse",
      successStatuses: ["200"],
      errorStatuses: ["400", "401", "403"],
      idempotency: false,
    },
  ],
  [
    "get /organizations/{organizationId}/finance/reports/payments",
    {
      operationId: "ReportController_listPayments",
      clientMethod: "listOwnerPaymentItems",
      body: null,
      query: {
        dealId: uuidSchema,
        propertyId: uuidSchema,
        from: instantSchema,
        to: instantSchema,
        cursor: {
          type: "string",
          minLength: 1,
          maxLength: 512,
          pattern: "^[A-Za-z0-9_-]+$",
        },
        limit: { type: "integer", minimum: 1, maximum: 100, default: 50 },
      },
      responseSchema: reportPagedSchema({
        type: "object",
        required: [
          "paymentId",
          "receivableId",
          "invoiceId",
          "dealId",
          "propertyId",
          "currency",
          "amountMinor",
          "recordedAt",
        ],
        additionalProperties: false,
        properties: {
          paymentId: uuidSchema,
          receivableId: uuidSchema,
          invoiceId: uuidSchema,
          dealId: uuidSchema,
          propertyId: uuidSchema,
          currency: currencySchema,
          amountMinor: amountMinorSchema,
          recordedAt: instantSchema,
        },
      }),
      responseType: "OwnerPaymentItemPage",
      successStatuses: ["200"],
      errorStatuses: ["400", "401", "403"],
      idempotency: false,
    },
  ],
  [
    "get /organizations/{organizationId}/finance/reports/expenses",
    {
      operationId: "ReportController_listExpenses",
      clientMethod: "listOwnerExpenseItems",
      body: null,
      query: {
        dealId: uuidSchema,
        propertyId: uuidSchema,
        campaignId: uuidSchema,
        from: instantSchema,
        to: instantSchema,
        cursor: {
          type: "string",
          minLength: 1,
          maxLength: 512,
          pattern: "^[A-Za-z0-9_-]+$",
        },
        limit: { type: "integer", minimum: 1, maximum: 100, default: 50 },
      },
      responseSchema: reportPagedSchema({
        type: "object",
        required: [
          "expenseId",
          "category",
          "vendorReference",
          "currency",
          "amountMinor",
          "decidedAt",
        ],
        additionalProperties: false,
        properties: {
          expenseId: uuidSchema,
          category: {
            type: "string",
            enum: ["OFFICE", "CAMPAIGN", "PROPERTY", "OTHER"],
          },
          vendorReference: { type: "string", minLength: 1, maxLength: 200 },
          currency: currencySchema,
          amountMinor: amountMinorSchema,
          decidedAt: instantSchema,
          campaignReference: { type: "string", minLength: 1, maxLength: 100 },
          campaignId: uuidSchema,
          dealId: uuidSchema,
          propertyId: uuidSchema,
        },
      }),
      responseType: "OwnerExpenseItemPage",
      successStatuses: ["200"],
      errorStatuses: ["400", "401", "403"],
      idempotency: false,
    },
  ],
  [
    "get /organizations/{organizationId}/finance/reports/receivables/aging",
    {
      operationId: "ReportController_getAgingSummary",
      clientMethod: "getOwnerAgingSummary",
      body: null,
      responseSchema: {
        type: "object",
        required: ["asOf", "buckets"],
        additionalProperties: false,
        properties: {
          asOf: instantSchema,
          buckets: {
            type: "array",
            items: {
              type: "object",
              required: ["bucket", "currency", "count", "outstandingMinor"],
              additionalProperties: false,
              properties: {
                bucket: reportBucketSchema,
                currency: currencySchema,
                count: { type: "integer", minimum: 0 },
                outstandingMinor: amountMinorSchema,
              },
            },
          },
        },
      },
      responseType: "OwnerAgingSummaryResponse",
      successStatuses: ["200"],
      errorStatuses: ["400", "401", "403"],
      idempotency: false,
    },
  ],
  [
    "get /organizations/{organizationId}/finance/reports/receivables/aging/items",
    {
      operationId: "ReportController_listAgingItems",
      clientMethod: "listOwnerAgingItems",
      body: null,
      queryRequired: ["bucket"],
      query: {
        bucket: reportBucketSchema,
        cursor: {
          type: "string",
          minLength: 1,
          maxLength: 512,
          pattern: "^[A-Za-z0-9_-]+$",
        },
        limit: { type: "integer", minimum: 1, maximum: 100, default: 50 },
      },
      responseSchema: reportPagedSchema({
        type: "object",
        required: [
          "receivableId",
          "invoiceId",
          "dealId",
          "currency",
          "originalAmountMinor",
          "outstandingMinor",
          "status",
          "issuedAt",
          "dueAt",
          "daysPastDue",
          "bucket",
        ],
        additionalProperties: false,
        properties: {
          receivableId: uuidSchema,
          invoiceId: uuidSchema,
          dealId: uuidSchema,
          currency: currencySchema,
          originalAmountMinor: amountMinorSchema,
          outstandingMinor: amountMinorSchema,
          status: { type: "string", enum: ["OPEN", "PARTIALLY_PAID"] },
          issuedAt: instantSchema,
          dueAt: instantSchema,
          daysPastDue: { type: "integer", minimum: 0 },
          bucket: reportBucketSchema,
        },
      }),
      responseType: "OwnerAgingItemPage",
      successStatuses: ["200"],
      errorStatuses: ["400", "401", "403"],
      idempotency: false,
    },
  ],
  [
    "get /organizations/{organizationId}/finance/reports/commissions",
    {
      operationId: "ReportController_getCommissionSummary",
      clientMethod: "getOwnerCommissionSummary",
      body: null,
      responseSchema: {
        type: "object",
        required: ["asOf", "expected", "due", "paid"],
        additionalProperties: false,
        properties: {
          asOf: instantSchema,
          expected: { type: "array", items: reportMoneyTotalSchema },
          due: { type: "array", items: reportMoneyTotalSchema },
          paid: { type: "array", items: reportMoneyTotalSchema },
        },
      },
      responseType: "OwnerCommissionSummaryResponse",
      successStatuses: ["200"],
      errorStatuses: ["400", "401", "403"],
      idempotency: false,
    },
  ],
  [
    "get /organizations/{organizationId}/finance/reports/commissions/items",
    {
      operationId: "ReportController_listCommissionItems",
      clientMethod: "listOwnerCommissionItems",
      body: null,
      queryRequired: ["status"],
      query: {
        status: {
          type: "string",
          enum: ["EXPECTED", "CONFIRMED", "DUE", "PAID", "CANCELLED"],
        },
        cursor: {
          type: "string",
          minLength: 1,
          maxLength: 512,
          pattern: "^[A-Za-z0-9_-]+$",
        },
        limit: { type: "integer", minimum: 1, maximum: 100, default: 50 },
      },
      responseSchema: reportPagedSchema({
        type: "object",
        required: [
          "accrualId",
          "dealId",
          "status",
          "currency",
          "amountMinor",
          "createdAt",
          "splits",
        ],
        additionalProperties: false,
        properties: {
          accrualId: uuidSchema,
          dealId: uuidSchema,
          status: {
            type: "string",
            enum: ["EXPECTED", "CONFIRMED", "DUE", "PAID", "CANCELLED"],
          },
          currency: currencySchema,
          amountMinor: amountMinorSchema,
          createdAt: instantSchema,
          splits: {
            type: "array",
            items: {
              type: "object",
              required: ["order", "kind", "amountMinor"],
              additionalProperties: false,
              properties: {
                order: { type: "integer", minimum: 1 },
                kind: { type: "string", enum: ["BROKER", "OFFICE"] },
                amountMinor: amountMinorSchema,
              },
            },
          },
        },
      }),
      responseType: "OwnerCommissionItemPage",
      successStatuses: ["200"],
      errorStatuses: ["400", "401", "403"],
      idempotency: false,
    },
  ],
  [
    "get /organizations/{organizationId}/finance/reports/performance",
    {
      operationId: "ReportController_getPerformance",
      clientMethod: "getOwnerPerformance",
      body: null,
      query: {
        from: instantSchema,
        to: instantSchema,
      },
      responseSchema: {
        type: "object",
        required: ["asOf", "deals", "properties"],
        additionalProperties: false,
        properties: {
          asOf: instantSchema,
          deals: { type: "array", items: reportPerformanceRowSchema },
          properties: { type: "array", items: reportPerformanceRowSchema },
        },
      },
      responseType: "OwnerPerformanceResponse",
      successStatuses: ["200"],
      errorStatuses: ["400", "401", "403"],
      idempotency: false,
    },
  ],
  // EF-401 — revenue/margin by campaign dimension (first/last-touch).
  [
    "get /organizations/{organizationId}/finance/reports/campaigns/performance",
    {
      operationId: "ReportController_getCampaignPerformance",
      clientMethod: "getOwnerCampaignPerformance",
      body: null,
      queryRequired: ["model"],
      query: {
        model: { type: "string", enum: ["FIRST_TOUCH", "LAST_TOUCH"] },
        from: instantSchema,
        to: instantSchema,
      },
      responseSchema: {
        type: "object",
        required: ["asOf", "model", "campaigns"],
        additionalProperties: false,
        properties: {
          asOf: instantSchema,
          model: { type: "string", enum: ["FIRST_TOUCH", "LAST_TOUCH"] },
          campaigns: { type: "array", items: reportPerformanceRowSchema },
        },
      },
      responseType: "OwnerCampaignPerformanceResponse",
      successStatuses: ["200"],
      errorStatuses: ["400", "401", "403"],
      idempotency: false,
    },
  ],
]);

const propertyOperations = [
  {
    method: "post",
    path: "/organizations/{organizationId}/properties",
    operationId: "PropertyController_create",
    body: true,
  },
  {
    method: "get",
    path: "/organizations/{organizationId}/properties",
    operationId: "PropertyController_list",
    query: ["search", "cursor", "limit"],
  },
  {
    method: "patch",
    path: "/organizations/{organizationId}/properties/{propertyId}",
    operationId: "PropertyController_update",
    body: true,
  },
  {
    method: "get",
    path: "/organizations/{organizationId}/properties/{propertyId}",
    operationId: "PropertyController_find",
  },
  {
    method: "post",
    path: "/organizations/{organizationId}/properties/{propertyId}/listings",
    operationId: "PropertyController_createListing",
    body: true,
  },
  {
    method: "get",
    path: "/organizations/{organizationId}/listings/{listingId}",
    operationId: "PropertyController_getListing",
  },
  {
    method: "post",
    path: "/organizations/{organizationId}/listings/{listingId}/publish",
    operationId: "PropertyController_publish",
    body: true,
  },
  {
    method: "post",
    path: "/organizations/{organizationId}/listings/{listingId}/archive",
    operationId: "PropertyController_archive",
    body: true,
  },
  {
    method: "post",
    path: "/organizations/{organizationId}/listings/{listingId}/images",
    operationId: "PropertyController_addImage",
    body: true,
  },
  {
    method: "get",
    path: "/organizations/{organizationId}/listings/{listingId}/images",
    operationId: "PropertyController_listImages",
  },
];

const closeLeadOperations = [
  {
    method: "post",
    path: "/organizations/{organizationId}/leads/{leadId}/close-won",
    operationId: "LeadController_closeWon",
    clientMethod: "closeLeadWon",
    successStatus: "201",
    body: {
      propertyId: { type: "string", format: "uuid" },
      brokerId: { type: "string", format: "uuid" },
      expectedVersion: { type: "integer", minimum: 1 },
    },
  },
  {
    method: "post",
    path: "/organizations/{organizationId}/leads/{leadId}/close-lost",
    operationId: "LeadController_closeLost",
    clientMethod: "closeLeadLost",
    successStatus: "200",
    body: {
      reason: { type: "string", minLength: 1, maxLength: 1000, pattern: "\\S" },
      expectedVersion: { type: "integer", minimum: 1 },
    },
  },
];

const httpMethods = new Set([
  "get",
  "post",
  "patch",
  "put",
  "delete",
  "head",
  "options",
]);

function readSupportedOperations(document) {
  const operations = [];

  for (const [path, operationId] of expectedOperations) {
    const pathItem = document.paths?.[path];
    const methods = Object.entries(pathItem ?? {}).filter(([method]) =>
      httpMethods.has(method),
    );
    const unsupportedMethod = methods.find(
      ([method, operation]) =>
        method !== "get" &&
        !(
          (path === "/organizations/{organizationId}/leads" &&
            operation?.operationId === "LeadController_create") ||
          crmLeadOperations.some(
            (candidate) =>
              candidate.method === method &&
              candidate.path === path &&
              candidate.operationId === operation?.operationId,
          )
        ),
    );
    if (unsupportedMethod) {
      throw new Error(
        `Unsupported OpenAPI non-GET operation ${unsupportedMethod[0].toUpperCase()} ${path}; only documented read operations are supported`,
      );
    }

    const operation = pathItem?.get;
    if (!operation || operation.operationId !== operationId) {
      throw new Error(
        `Unsupported OpenAPI operation ${operationId} at ${path}`,
      );
    }
    operations.push({ path, operation });
  }

  const crmOperationsByKey = new Map(
    [...crmLeadOperations, ...closeLeadOperations].map((operation) => [
      `${operation.method} ${operation.path}`,
      operation,
    ]),
  );
  for (const [path, pathItem] of Object.entries(document.paths ?? {})) {
    for (const [method, operation] of Object.entries(pathItem).filter(
      ([name]) => httpMethods.has(name),
    )) {
      if (!operation?.operationId?.startsWith("LeadController_")) continue;
      const key = `${method} ${path}`;
      const isLegacyLeadOperation =
        legacyLeadOperations.get(key) === operation.operationId;
      if (
        !leadReadOperationIds.has(operation.operationId) &&
        !isLegacyLeadOperation &&
        !crmOperationsByKey.has(key)
      ) {
        throw new Error(
          `Unsupported OpenAPI LeadController operation ${method.toUpperCase()} ${path}`,
        );
      }
      const crmOperation = crmOperationsByKey.get(key);
      if (crmOperation && operation.operationId !== crmOperation.operationId) {
        throw new Error(
          `Unsupported OpenAPI LeadController operation ${method.toUpperCase()} ${path}`,
        );
      }
      if (crmOperation) operations.push({ path, operation, crmOperation });
    }
  }

  const expectedPropertyOperations = new Map(
    propertyOperations.map((operation) => [
      `${operation.method} ${operation.path}`,
      operation,
    ]),
  );
  const hasPropertyContract = Object.values(document.paths ?? {}).some(
    (pathItem) =>
      Object.values(pathItem).some((operation) =>
        operation?.operationId?.startsWith("PropertyController_"),
      ),
  );
  if (hasPropertyContract) {
    for (const propertyOperation of propertyOperations) {
      const { path } = propertyOperation;
      const pathItem = document.paths?.[path];
      const operation = pathItem?.[propertyOperation.method];
      if (
        !operation ||
        operation.operationId !== propertyOperation.operationId
      ) {
        throw new Error(
          `Unsupported OpenAPI operation ${propertyOperation.operationId} at ${path}`,
        );
      }
      for (const [method, candidate] of Object.entries(pathItem ?? {}).filter(
        ([name]) => httpMethods.has(name),
      )) {
        const expected = expectedPropertyOperations.get(`${method} ${path}`);
        if (!expected || candidate.operationId !== expected.operationId) {
          throw new Error(
            `Unsupported OpenAPI PropertyController operation ${method.toUpperCase()} ${path}`,
          );
        }
      }
      if (propertyOperation.body && !propertyOperationBodyIsJson(operation)) {
        throw new Error(
          `OpenAPI Property operation ${propertyOperation.operationId} at ${path} must define an application/json request body`,
        );
      }
      operations.push({ path, operation, propertyOperation });
    }

    for (const [path, pathItem] of Object.entries(document.paths ?? {})) {
      for (const [method, operation] of Object.entries(pathItem).filter(
        ([name]) => httpMethods.has(name),
      )) {
        if (
          operation?.operationId?.startsWith("PropertyController_") &&
          !expectedPropertyOperations.has(`${method} ${path}`)
        ) {
          throw new Error(
            `Unsupported OpenAPI PropertyController operation ${method.toUpperCase()} ${path}`,
          );
        }
      }
    }
  }

  for (const [path, pathItem] of Object.entries(document.paths ?? {})) {
    for (const [method, operation] of Object.entries(pathItem).filter(
      ([name]) => httpMethods.has(name),
    )) {
      if (!operation?.operationId?.startsWith("CommissionController_"))
        continue;
      const key = `${method} ${path}`;
      const commissionOperation = commissionOperations.get(key);
      if (
        !commissionOperation ||
        operation.operationId !== commissionOperation.operationId
      ) {
        throw new Error(
          `Unsupported OpenAPI CommissionController operation ${method.toUpperCase()} ${path}`,
        );
      }
      validateCommissionOperation({
        path,
        operation,
        contract: commissionOperation,
      });
      operations.push({ path, operation, commissionOperation });
    }
  }

  const hasReceivableContract = Object.values(document.paths ?? {}).some(
    (pathItem) =>
      Object.values(pathItem).some((operation) =>
        operation?.operationId?.startsWith("ReceivableController_"),
      ),
  );
  if (hasReceivableContract) {
    for (const [key, receivableOperation] of receivableOperations) {
      const [method, path] = key.split(" ");
      const operation = document.paths?.[path]?.[method];
      if (
        !operation ||
        operation.operationId !== receivableOperation.operationId
      )
        throw new Error(
          `Unsupported OpenAPI operation ${receivableOperation.operationId} at ${path}`,
        );
      validateReceivableOperation({
        path,
        operation,
        contract: receivableOperation,
      });
      operations.push({ path, operation, receivableOperation });
    }
    for (const [path, pathItem] of Object.entries(document.paths ?? {})) {
      for (const [method, operation] of Object.entries(pathItem).filter(
        ([name]) => httpMethods.has(name),
      )) {
        if (
          operation?.operationId?.startsWith("ReceivableController_") &&
          !receivableOperations.has(`${method} ${path}`)
        )
          throw new Error(
            `Unsupported OpenAPI ReceivableController operation ${method.toUpperCase()} ${path}`,
          );
      }
    }
  }

  const hasExpenseContract = Object.values(document.paths ?? {}).some(
    (pathItem) =>
      Object.values(pathItem).some((operation) =>
        operation?.operationId?.startsWith("ExpenseController_"),
      ),
  );
  if (hasExpenseContract) {
    for (const [key, expenseOperation] of expenseOperations) {
      const [method, path] = key.split(" ");
      const operation = document.paths?.[path]?.[method];
      if (!operation || operation.operationId !== expenseOperation.operationId)
        throw new Error(
          `Unsupported OpenAPI operation ${expenseOperation.operationId} at ${path}`,
        );
      validateReceivableOperation({
        path,
        operation,
        contract: expenseOperation,
      });
      operations.push({ path, operation, expenseOperation });
    }
    for (const [path, pathItem] of Object.entries(document.paths ?? {})) {
      for (const [method, operation] of Object.entries(pathItem).filter(
        ([name]) => httpMethods.has(name),
      )) {
        if (
          operation?.operationId?.startsWith("ExpenseController_") &&
          !expenseOperations.has(`${method} ${path}`)
        )
          throw new Error(
            `Unsupported OpenAPI ExpenseController operation ${method.toUpperCase()} ${path}`,
          );
      }
    }
  }

  const hasAutomationContract = Object.values(document.paths ?? {}).some(
    (pathItem) =>
      Object.values(pathItem).some((operation) =>
        operation?.operationId?.startsWith("AutomationRuleController_"),
      ),
  );
  if (hasAutomationContract) {
    for (const [key, automationOperation] of automationOperations) {
      const [method, path] = key.split(" ");
      const operation = document.paths?.[path]?.[method];
      if (
        !operation ||
        operation.operationId !== automationOperation.operationId
      )
        throw new Error(
          `Unsupported OpenAPI operation ${automationOperation.operationId} at ${path}`,
        );
      validateAutomationOperation({
        path,
        operation,
        contract: automationOperation,
      });
      operations.push({ path, operation, automationOperation });
    }
    for (const [path, pathItem] of Object.entries(document.paths ?? {})) {
      for (const [method, operation] of Object.entries(pathItem).filter(
        ([name]) => httpMethods.has(name),
      )) {
        if (
          operation?.operationId?.startsWith("AutomationRuleController_") &&
          !automationOperations.has(`${method} ${path}`)
        )
          throw new Error(
            `Unsupported OpenAPI AutomationRuleController operation ${method.toUpperCase()} ${path}`,
          );
      }
    }
  }

  const hasNotificationContract = Object.values(document.paths ?? {}).some(
    (pathItem) =>
      Object.values(pathItem).some((operation) =>
        operation?.operationId?.startsWith("NotificationController_"),
      ),
  );
  if (hasNotificationContract) {
    for (const [key, notificationOperation] of notificationOperations) {
      const [method, path] = key.split(" ");
      const operation = document.paths?.[path]?.[method];
      if (
        !operation ||
        operation.operationId !== notificationOperation.operationId
      )
        throw new Error(
          `Unsupported OpenAPI NotificationController operation ${method.toUpperCase()} ${path}`,
        );
      operations.push({ path, operation, notificationOperation });
    }
    for (const [path, pathItem] of Object.entries(document.paths ?? {})) {
      for (const [method, operation] of Object.entries(pathItem).filter(
        ([name]) => httpMethods.has(name),
      )) {
        if (
          operation?.operationId?.startsWith("NotificationController_") &&
          !notificationOperations.has(`${method} ${path}`)
        )
          throw new Error(
            `Unsupported OpenAPI NotificationController operation ${method.toUpperCase()} ${path}`,
          );
      }
    }
  }

  const hasReportContract = Object.values(document.paths ?? {}).some(
    (pathItem) =>
      Object.values(pathItem).some((operation) =>
        operation?.operationId?.startsWith("ReportController_"),
      ),
  );
  if (hasReportContract) {
    for (const [key, reportOperation] of reportOperations) {
      const [method, path] = key.split(" ");
      const operation = document.paths?.[path]?.[method];
      if (!operation || operation.operationId !== reportOperation.operationId)
        throw new Error(
          `Unsupported OpenAPI operation ${reportOperation.operationId} at ${path}`,
        );
      validateReportOperation({
        path,
        operation,
        contract: reportOperation,
      });
      operations.push({ path, operation, reportOperation });
    }
    for (const [path, pathItem] of Object.entries(document.paths ?? {})) {
      for (const [method, operation] of Object.entries(pathItem).filter(
        ([name]) => httpMethods.has(name),
      )) {
        if (
          operation?.operationId?.startsWith("ReportController_") &&
          !reportOperations.has(`${method} ${path}`)
        )
          throw new Error(
            `Unsupported OpenAPI ReportController operation ${method.toUpperCase()} ${path}`,
          );
      }
    }
  }

  const hasCampaignContract = Object.values(document.paths ?? {}).some(
    (pathItem) =>
      Object.values(pathItem).some((operation) =>
        operation?.operationId?.startsWith("CampaignController_"),
      ),
  );
  if (hasCampaignContract) {
    for (const [key, campaignOperation] of campaignOperations) {
      const [method, path] = key.split(" ");
      const operation = document.paths?.[path]?.[method];
      if (!operation || operation.operationId !== campaignOperation.operationId)
        throw new Error(
          `Unsupported OpenAPI operation ${campaignOperation.operationId} at ${path}`,
        );
      validateReceivableOperation({
        path,
        operation,
        contract: campaignOperation,
      });
      operations.push({ path, operation, campaignOperation });
    }
    for (const [path, pathItem] of Object.entries(document.paths ?? {})) {
      for (const [method, operation] of Object.entries(pathItem).filter(
        ([name]) => httpMethods.has(name),
      )) {
        if (
          operation?.operationId?.startsWith("CampaignController_") &&
          !campaignOperations.has(`${method} ${path}`)
        )
          throw new Error(
            `Unsupported OpenAPI CampaignController operation ${method.toUpperCase()} ${path}`,
          );
      }
    }
  }

  for (const [path, pathItem] of Object.entries(document.paths ?? {})) {
    for (const [method, operation] of Object.entries(pathItem).filter(
      ([name]) => httpMethods.has(name),
    )) {
      if (!operation?.operationId?.startsWith("LedgerController_")) continue;
      const key = `${method} ${path}`;
      const ledgerOperation = ledgerOperations.get(key);
      if (
        !ledgerOperation ||
        operation.operationId !== ledgerOperation.operationId
      ) {
        throw new Error(
          `Unsupported OpenAPI LedgerController operation ${method.toUpperCase()} ${path}`,
        );
      }
      const expectedParameters = (path.match(/{[^}]+}/g) ?? []).map((name) => ({
        name: name.slice(1, -1),
        in: "path",
        required: true,
      }));
      const actualParameters = (operation.parameters ?? [])
        .filter(({ in: location }) => location === "path")
        .map(({ name, in: location, required }) => ({
          name,
          in: location,
          required,
        }));
      if (
        JSON.stringify(actualParameters) !== JSON.stringify(expectedParameters)
      )
        throw new Error(
          `OpenAPI Ledger operation ${operation.operationId} at ${path} must define its required path parameters`,
        );
      if (ledgerOperation.body === null) {
        if (operation.requestBody)
          throw new Error(
            `OpenAPI Ledger operation ${operation.operationId} at ${path} must not define a request body`,
          );
      } else if (!propertyOperationBodyIsJson(operation)) {
        throw new Error(
          `OpenAPI Ledger operation ${operation.operationId} at ${path} must define an application/json request body`,
        );
      }
      operations.push({ path, operation, ledgerOperation });
    }
  }

  return operations;
}

function validateCommissionOperation({ path, operation, contract }) {
  const expectedParameters = (path.match(/{[^}]+}/g) ?? []).map((name) => ({
    name: name.slice(1, -1),
    in: "path",
    required: true,
    schema: { type: "string", format: "uuid" },
  }));
  const actualParameters = (operation.parameters ?? []).map(
    ({ name, in: location, required, schema }) => ({
      name,
      in: location,
      required,
      schema,
    }),
  );
  if (stableJson(actualParameters) !== stableJson(expectedParameters))
    throw new Error(
      `OpenAPI Commission operation ${operation.operationId} at ${path} must define exactly its required UUID path parameters`,
    );

  const schema = operation.requestBody?.content?.["application/json"]?.schema;
  if (
    !operation.requestBody?.required ||
    !schema ||
    stableJson(schema) !== stableJson(contract.body)
  )
    throw new Error(
      `OpenAPI Commission operation ${operation.operationId} at ${path} must define the exact JSON body contract`,
    );
  for (const status of contract.successStatuses) {
    if (!operation.responses?.[status])
      throw new Error(
        `OpenAPI Commission operation ${operation.operationId} at ${path} must define success status ${status}`,
      );
  }
}

function validateReceivableOperation({ path, operation, contract }) {
  const expectedParameters = (path.match(/{[^}]+}/g) ?? []).map((name) => ({
    name: name.slice(1, -1),
    in: "path",
    required: true,
    schema: { type: "string", format: "uuid" },
  }));
  for (const [name, schema] of Object.entries(contract.query ?? {}))
    expectedParameters.push({ name, in: "query", required: false, schema });
  if (contract.idempotency)
    expectedParameters.push({
      name: "Idempotency-Key",
      in: "header",
      required: true,
      schema: { type: "string", minLength: 1, maxLength: 200, pattern: "\\S" },
    });
  const actualParameters = (operation.parameters ?? []).map(
    ({ name, in: location, required, schema }) => ({
      name,
      in: location,
      required,
      schema,
    }),
  );
  const sortParameters = (parameters) =>
    parameters
      .slice()
      .sort((a, b) => `${a.in}/${a.name}`.localeCompare(`${b.in}/${b.name}`));
  if (
    stableJson(sortParameters(actualParameters)) !==
    stableJson(sortParameters(expectedParameters))
  )
    throw new Error(
      `OpenAPI Receivable operation ${operation.operationId} at ${path} must define exactly its required parameters`,
    );

  if (contract.body === null) {
    if (operation.requestBody)
      throw new Error(
        `OpenAPI Receivable operation ${operation.operationId} at ${path} must not define a request body`,
      );
  } else {
    const schema = operation.requestBody?.content?.["application/json"]?.schema;
    if (
      !operation.requestBody?.required ||
      !schema ||
      stableJson(schema) !== stableJson(contract.body)
    )
      throw new Error(
        `OpenAPI Receivable operation ${operation.operationId} at ${path} must define the exact JSON body contract`,
      );
  }
  if (contract.responseSchema) {
    const response = operation.responses?.["200"];
    const schema = response?.content?.["application/json"]?.schema;
    if (!response || stableJson(schema) !== stableJson(contract.responseSchema))
      throw new Error(
        `OpenAPI Receivable operation ${operation.operationId} at ${path} must define the exact 200 response schema`,
      );
  }
  for (const status of contract.successStatuses)
    if (!operation.responses?.[status])
      throw new Error(
        `OpenAPI Receivable operation ${operation.operationId} at ${path} must define success status ${status}`,
      );
  for (const status of contract.errorStatuses ?? [])
    if (!operation.responses?.[status])
      throw new Error(
        `OpenAPI Receivable operation ${operation.operationId} at ${path} must define error status ${status}`,
      );
}

function validateReportOperation({ path, operation, contract }) {
  const expectedParameters = (path.match(/{[^}]+}/g) ?? []).map((name) => ({
    name: name.slice(1, -1),
    in: "path",
    required: true,
    schema: { type: "string", format: "uuid" },
  }));
  const queryRequired = new Set(contract.queryRequired ?? []);
  for (const [name, schema] of Object.entries(contract.query ?? {}))
    expectedParameters.push({
      name,
      in: "query",
      required: queryRequired.has(name),
      schema,
    });
  const actualParameters = (operation.parameters ?? []).map(
    ({ name, in: location, required, schema }) => ({
      name,
      in: location,
      required,
      schema,
    }),
  );
  const sortParameters = (parameters) =>
    parameters
      .slice()
      .sort((a, b) => `${a.in}/${a.name}`.localeCompare(`${b.in}/${b.name}`));
  if (
    stableJson(sortParameters(actualParameters)) !==
    stableJson(sortParameters(expectedParameters))
  )
    throw new Error(
      `OpenAPI Report operation ${operation.operationId} at ${path} must define exactly its required parameters`,
    );
  if (operation.requestBody)
    throw new Error(
      `OpenAPI Report operation ${operation.operationId} at ${path} must not define a request body`,
    );
  if (contract.responseSchema) {
    const response = operation.responses?.["200"];
    const schema = response?.content?.["application/json"]?.schema;
    if (!response || stableJson(schema) !== stableJson(contract.responseSchema))
      throw new Error(
        `OpenAPI Report operation ${operation.operationId} at ${path} must define the exact 200 response schema`,
      );
  }
  for (const status of contract.successStatuses)
    if (!operation.responses?.[status])
      throw new Error(
        `OpenAPI Report operation ${operation.operationId} at ${path} must define success status ${status}`,
      );
  for (const status of contract.errorStatuses ?? [])
    if (!operation.responses?.[status])
      throw new Error(
        `OpenAPI Report operation ${operation.operationId} at ${path} must define error status ${status}`,
      );
}

function validateAutomationOperation({ path, operation, contract }) {
  const expectedParameters = (path.match(/{[^}]+}/g) ?? []).map((name) => ({
    name: name.slice(1, -1),
    in: "path",
    required: true,
    schema: { type: "string", format: "uuid" },
  }));
  const actualParameters = (operation.parameters ?? []).map(
    ({ name, in: location, required, schema }) => ({
      name,
      in: location,
      required,
      schema,
    }),
  );
  if (JSON.stringify(actualParameters) !== JSON.stringify(expectedParameters))
    throw new Error(
      `OpenAPI Automation operation ${operation.operationId} at ${path} must define its required path parameters`,
    );
  if (contract.body === null) {
    if (operation.requestBody)
      throw new Error(
        `OpenAPI Automation operation ${operation.operationId} at ${path} must not define a request body`,
      );
  } else if (!propertyOperationBodyIsJson(operation)) {
    throw new Error(
      `OpenAPI Automation operation ${operation.operationId} at ${path} must define an application/json request body`,
    );
  }
  for (const status of contract.successStatuses)
    if (!operation.responses?.[status])
      throw new Error(
        `OpenAPI Automation operation ${operation.operationId} at ${path} must define success status ${status}`,
      );
}

function propertyOperationBodyIsJson(operation) {
  return Boolean(operation.requestBody?.content?.["application/json"]);
}

function readLeadPathParameters({ path, operation }) {
  const parameterNames = (operation.parameters ?? [])
    .filter((parameter) => parameter.in === "path")
    .map((parameter) => parameter.name);
  const expectedNames = (path.match(/{[^}]+}/g) ?? []).map((name) =>
    name.slice(1, -1),
  );

  if (
    parameterNames.length !== expectedNames.length ||
    expectedNames.some((name) => !parameterNames.includes(name))
  ) {
    throw new Error(
      `OpenAPI Lead operation ${operation.operationId} at ${path} must define its required path parameters`,
    );
  }

  return expectedNames;
}

function readPropertyPathParameters({ path, operation }) {
  const expectedNames = (path.match(/{[^}]+}/g) ?? []).map((name) =>
    name.slice(1, -1),
  );
  const parameters = (operation.parameters ?? []).filter(
    (parameter) => parameter.in === "path",
  );
  if (
    parameters.length !== expectedNames.length ||
    expectedNames.some((name) => {
      const parameter = parameters.find((candidate) => candidate.name === name);
      return !parameter || parameter.required !== true;
    })
  ) {
    throw new Error(
      `OpenAPI Property operation ${operation.operationId} at ${path} must define its required path parameters`,
    );
  }
  return expectedNames;
}

const expectedLeadQueryParameters = new Map([
  ["stage", "string"],
  ["cursor", "string"],
  ["limit", "integer"],
]);

function readLeadQueryParameters({ path, operation }) {
  const queryParameters = (operation.parameters ?? []).filter(
    (parameter) => parameter.in === "query",
  );
  const unexpectedParameter = queryParameters.find(
    (parameter) => !expectedLeadQueryParameters.has(parameter.name),
  );
  if (unexpectedParameter) {
    throw new Error(
      `Unexpected OpenAPI GET query parameter ${unexpectedParameter.name} on ${path}; expected only stage, cursor, limit`,
    );
  }

  for (const [name, type] of expectedLeadQueryParameters) {
    const parameter = queryParameters.find(
      (candidate) => candidate.name === name,
    );
    if (parameter && parameter.schema?.type !== type) {
      throw new Error(
        `OpenAPI Lead GET query parameter ${name} on ${path} must use schema type ${type}`,
      );
    }
    if (parameter?.required === true) {
      throw new Error(
        `OpenAPI Lead GET query parameter ${name} on ${path} must be optional`,
      );
    }
  }

  const documentedNames = new Set(queryParameters.map(({ name }) => name));
  return [...expectedLeadQueryParameters.keys()].filter((name) =>
    documentedNames.has(name),
  );
}

function readPropertyQueryParameters({ path, operation, expected }) {
  const queryParameters = (operation.parameters ?? []).filter(
    (parameter) => parameter.in === "query",
  );
  const allowed = new Map([
    ["search", "string"],
    ["cursor", "string"],
    ["limit", "integer"],
  ]);
  const unexpectedParameter = queryParameters.find(
    (parameter) =>
      !allowed.has(parameter.name) || !expected.includes(parameter.name),
  );
  if (unexpectedParameter)
    throw new Error(
      `Unexpected OpenAPI GET query parameter ${unexpectedParameter.name} on ${path}; expected only search, cursor, limit`,
    );
  for (const parameter of queryParameters) {
    if (
      parameter.schema?.type !== allowed.get(parameter.name) ||
      parameter.required === true
    ) {
      throw new Error(
        `OpenAPI Property GET query parameter ${parameter.name} on ${path} must be an optional ${allowed.get(parameter.name)} parameter`,
      );
    }
  }
  return expected.filter((name) =>
    queryParameters.some((parameter) => parameter.name === name),
  );
}

function readStatusEnum({ path, operation }) {
  const statusEnum =
    operation.responses?.["200"]?.content?.["application/json"]?.schema
      ?.properties?.status?.enum;
  if (
    !Array.isArray(statusEnum) ||
    statusEnum.length === 0 ||
    statusEnum.some((status) => typeof status !== "string")
  ) {
    throw new Error(
      `OpenAPI health operation ${operation.operationId} at ${path} must define a non-empty string status enum`,
    );
  }
  return statusEnum;
}

function encodedPath(path) {
  return (
    "`" +
    path.slice(1).replace(/{(\w+)}/g, "${encodeURIComponent(params.$1)}") +
    "`"
  );
}

function typescriptSchemaType(schema) {
  if (schema.tsType) return schema.tsType;
  if (schema.type === "integer") return "number";
  if (schema.type === "array") return `${typescriptSchemaType(schema.items)}[]`;
  if (schema.enum)
    return schema.enum.map((value) => JSON.stringify(value)).join(" | ");
  if (schema.type === "object")
    return `{ ${Object.entries(schema.properties ?? [])
      .map(([name, child]) => `${name}: ${typescriptSchemaType(child)}`)
      .join("; ")} }`;
  return "string";
}

function typescriptObjectType(schema) {
  const required = new Set(schema.required ?? []);
  return `{ ${Object.entries(schema.properties ?? {})
    .map(
      ([name, child]) =>
        `${name}${required.has(name) ? "" : "?"}: ${typescriptSchemaType(child)}`,
    )
    .join("; ")} }`;
}

function parameterType(parameters, queryParameters = []) {
  return `{ ${[
    ...parameters.map((parameter) => `${parameter}: string`),
    ...queryParameters.map(
      (parameter) =>
        `${parameter}?: ${parameter === "limit" ? "number" : "string"}`,
    ),
  ].join(", ")} }`;
}

function queryExpression(queryParameters) {
  if (!queryParameters.length) return '""';
  return `(query.toString() ? \`?\${query}\` : "")`;
}

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object")
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`)
      .join(",")}}`;
  return JSON.stringify(value);
}

function validateCloseLeadOperation({ path, operation, contract }) {
  const expectedPathParameters = (path.match(/{[^}]+}/g) ?? []).map((name) => ({
    name: name.slice(1, -1),
    in: "path",
    required: true,
  }));
  const expectedParameters = [
    ...expectedPathParameters,
    { name: "Idempotency-Key", in: "header", required: true },
  ];
  const parameters = (operation.parameters ?? []).map(
    ({ name, in: location, required }) => ({ name, in: location, required }),
  );
  if (JSON.stringify(parameters) !== JSON.stringify(expectedParameters)) {
    throw new Error(
      `OpenAPI Lead close operation ${operation.operationId} at ${path} must define exactly the required path and Idempotency-Key parameters`,
    );
  }

  const requestBody = operation.requestBody;
  const content = requestBody?.content;
  if (
    !requestBody?.required ||
    !content ||
    Object.keys(content).length !== 1 ||
    !content["application/json"]?.schema
  ) {
    throw new Error(
      `OpenAPI Lead close operation ${operation.operationId} at ${path} must define only a required application/json request body`,
    );
  }

  const schema = content["application/json"].schema;
  const expectedFields = Object.keys(contract.body);
  if (
    schema.type !== "object" ||
    schema.additionalProperties !== false ||
    JSON.stringify(schema.required) !== JSON.stringify(expectedFields) ||
    Object.keys(schema.properties ?? {})
      .sort()
      .join(",") !== expectedFields.slice().sort().join(",")
  ) {
    throw new Error(
      `OpenAPI Lead close operation ${operation.operationId} at ${path} must define the exact required JSON body contract`,
    );
  }
  for (const field of expectedFields) {
    if (
      stableJson(schema.properties[field]) !== stableJson(contract.body[field])
    ) {
      throw new Error(
        `OpenAPI Lead close operation ${operation.operationId} at ${path} has invalid ${field} body constraints`,
      );
    }
  }
  if (!operation.responses?.[contract.successStatus]) {
    throw new Error(
      `OpenAPI Lead close operation ${operation.operationId} at ${path} must define success status ${contract.successStatus}`,
    );
  }
}

export function generateOpenApiClient(document) {
  const operations = readSupportedOperations(document);
  const healthOperations = operations.filter(({ operation }) =>
    operation.operationId.startsWith("get"),
  );
  const leadOperations = operations.filter(
    ({ operation, crmOperation }) =>
      operation.operationId.startsWith("LeadController_") && !crmOperation,
  );
  const crmOperationEntries = operations.filter(
    ({ crmOperation }) => crmOperation,
  );
  const propertyOperationEntries = operations.filter(
    ({ propertyOperation }) => propertyOperation,
  );
  const ledgerOperationEntries = operations.filter(
    ({ ledgerOperation }) => ledgerOperation,
  );
  const commissionOperationEntries = operations.filter(
    ({ commissionOperation }) => commissionOperation,
  );
  const receivableOperationEntries = operations.filter(
    ({ receivableOperation }) => receivableOperation,
  );
  const expenseOperationEntries = operations.filter(
    ({ expenseOperation }) => expenseOperation,
  );
  const reportOperationEntries = operations.filter(
    ({ reportOperation }) => reportOperation,
  );
  const notificationOperationEntries = operations.filter(
    ({ notificationOperation }) => notificationOperation,
  );
  const automationOperationEntries = operations.filter(
    ({ automationOperation }) => automationOperation,
  );
  const campaignOperationEntries = operations.filter(
    ({ campaignOperation }) => campaignOperation,
  );
  const statusLiterals = [
    ...new Set(healthOperations.flatMap(readStatusEnum)),
  ].map((status) => JSON.stringify(status));

  const getMethods = (entries, isProperty = false) =>
    entries.map(({ path, operation, propertyOperation }) => {
      const parameters = isProperty
        ? readPropertyPathParameters({ path, operation })
        : readLeadPathParameters({ path, operation });
      const queryParameters = isProperty
        ? readPropertyQueryParameters({
            path,
            operation,
            expected: propertyOperation.query ?? [],
          })
        : readLeadQueryParameters({ path, operation });
      const queryBuilder = queryParameters.length
        ? `const query = new URLSearchParams(); ${queryParameters.map((parameter) => `if (params.${parameter} !== undefined) query.set(${JSON.stringify(parameter)}, String(params.${parameter}));`).join(" ")} `
        : "";
      const responseType =
        operation.operationId === "LeadController_find"
          ? "LeadDetailResponse"
          : "unknown";
      return `    ${operation.operationId}: (${parameters.length || queryParameters.length ? `params: ${parameterType(parameters, queryParameters)}` : ""}) => { ${queryBuilder} return requestJson<${responseType}>(${encodedPath(path)} + ${queryExpression(queryParameters)}); },`;
    });
  const healthMethods = healthOperations
    .map(
      ({ path, operation }) =>
        `    ${operation.operationId}: () => requestJson(${JSON.stringify(path.slice(1))}),`,
    )
    .join("\n");
  const leadMethods = getMethods(leadOperations).join("\n");
  const crmMethods = crmOperationEntries
    .map(({ path, operation, crmOperation }) => {
      const parameters = readLeadPathParameters({ path, operation });
      const bodySchema =
        operation.requestBody?.content?.["application/json"]?.schema;
      if (!bodySchema || !Array.isArray(bodySchema.required)) {
        throw new Error(
          `OpenAPI Lead operation ${operation.operationId} at ${path} must define a JSON request body schema`,
        );
      }
      if (closeLeadOperations.includes(crmOperation))
        validateCloseLeadOperation({ path, operation, contract: crmOperation });
      const bodyProperties = bodySchema.required
        .map(
          (name) =>
            `${name}: ${bodySchema.properties?.[name]?.type === "integer" ? "number" : "string"}`,
        )
        .join(", ");
      return `    ${crmOperation.clientMethod}: (params: ${parameterType([...parameters, "idempotencyKey"])} , body: { ${bodyProperties} }) => requestJson(${encodedPath(path)}, { method: "POST", headers: { "Idempotency-Key": params.idempotencyKey, "content-type": "application/json" }, body: JSON.stringify(body) }),`;
    })
    .join("\n");
  const commissionMethods = commissionOperationEntries
    .map(({ path, commissionOperation }) => {
      const parameters = (path.match(/{[^}]+}/g) ?? []).map((name) =>
        name.slice(1, -1),
      );
      const bodySchema = commissionOperation.body;
      const bodyType = Array.isArray(bodySchema.oneOf)
        ? bodySchema.oneOf.map(typescriptObjectType).join(" | ")
        : typescriptObjectType(bodySchema);
      const renderedBodyType = bodyType.includes(" | ")
        ? `(${bodyType})`
        : bodyType;
      return `    ${commissionOperation.clientMethod}: (params: ${parameterType(parameters)}, body: ${renderedBodyType}) => requestJson(${encodedPath(path)}, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }),`;
    })
    .join("\n");
  const receivableMethods = receivableOperationEntries
    .map(({ path, receivableOperation }) => {
      const pathParameters = (path.match(/{[^}]+}/g) ?? []).map((name) =>
        name.slice(1, -1),
      );
      if (receivableOperation.body !== null) {
        const parameters = receivableOperation.idempotency
          ? [...pathParameters, "idempotencyKey"]
          : pathParameters;
        const bodyType = typescriptObjectType(receivableOperation.body);
        const headers = receivableOperation.idempotency
          ? '{ "Idempotency-Key": params.idempotencyKey, "content-type": "application/json" }'
          : '{ "content-type": "application/json" }';
        return `    ${receivableOperation.clientMethod}: (params: ${parameterType(parameters)}, body: ${bodyType}) => requestJson(${encodedPath(path)}, { method: "POST", headers: ${headers}, body: JSON.stringify(body) }),`;
      }
      const queryParameters = Object.keys(receivableOperation.query ?? {});
      const queryBuilder = `const query = new URLSearchParams(); ${queryParameters.map((name) => `if (params.${name} !== undefined) query.set(${JSON.stringify(name)}, String(params.${name}));`).join(" ")} `;
      return `    ${receivableOperation.clientMethod}: (params: ${parameterType(pathParameters, queryParameters)}) => { ${queryBuilder} return requestJson<${receivableOperation.responseType}>(${encodedPath(path)} + ${queryExpression(queryParameters)}); },`;
    })
    .join("\n");
  const expenseMethods = expenseOperationEntries
    .map(({ path, expenseOperation }) => {
      const pathParameters = (path.match(/{[^}]+}/g) ?? []).map((name) =>
        name.slice(1, -1),
      );
      if (expenseOperation.body !== null) {
        const parameters = expenseOperation.idempotency
          ? [...pathParameters, "idempotencyKey"]
          : pathParameters;
        const bodyType = typescriptObjectType(expenseOperation.body);
        const headers = expenseOperation.idempotency
          ? '{ "Idempotency-Key": params.idempotencyKey, "content-type": "application/json" }'
          : '{ "content-type": "application/json" }';
        return `    ${expenseOperation.clientMethod}: (params: ${parameterType(parameters)}, body: ${bodyType}) => requestJson(${encodedPath(path)}, { method: "POST", headers: ${headers}, body: JSON.stringify(body) }),`;
      }
      return `    ${expenseOperation.clientMethod}: (params: ${parameterType(pathParameters)}) => requestJson(${encodedPath(path)}, { method: "POST" }),`;
    })
    .join("\n");
  const automationMethods = automationOperationEntries
    .map(({ path, automationOperation }) => {
      const pathParameters = (path.match(/{[^}]+}/g) ?? []).map((name) =>
        name.slice(1, -1),
      );
      const paramsType = parameterType(pathParameters);
      if (automationOperation.body === null) {
        const method =
          automationOperation.method ??
          (automationOperation.operationId.endsWith("_list") ||
          automationOperation.operationId.endsWith("_find")
            ? "GET"
            : "POST");
        return `    ${automationOperation.clientMethod}: (params: ${paramsType}) => requestJson(${encodedPath(path)}, { method: ${JSON.stringify(method)} }),`;
      }
      const bodyType = automationOperation.operationId.endsWith("_create")
        ? "{ name: string; definition: AutomationRuleDefinitionInput }"
        : "{ definition: AutomationRuleDefinitionInput; note?: string }";
      return `    ${automationOperation.clientMethod}: (params: ${paramsType}, body: ${bodyType}) => requestJson(${encodedPath(path)}, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }),`;
    })
    .join("\n");
  const campaignMethods = campaignOperationEntries
    .map(({ path, campaignOperation }) => {
      const pathParameters = (path.match(/{[^}]+}/g) ?? []).map((name) =>
        name.slice(1, -1),
      );
      if (campaignOperation.body !== null) {
        const bodyType = typescriptObjectType(campaignOperation.body);
        return `    ${campaignOperation.clientMethod}: (params: ${parameterType(pathParameters)}, body: ${bodyType}) => requestJson(${encodedPath(path)}, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }),`;
      }
      const queryParameters = Object.keys(campaignOperation.query ?? {});
      const queryBuilder = queryParameters.length
        ? `const query = new URLSearchParams(); ${queryParameters.map((name) => `if (params.${name} !== undefined) query.set(${JSON.stringify(name)}, String(params.${name}));`).join(" ")} `
        : "";
      if (queryParameters.length)
        return `    ${campaignOperation.clientMethod}: (params: ${parameterType(pathParameters, queryParameters)}) => { ${queryBuilder} return requestJson<${campaignOperation.responseType}>(${encodedPath(path)} + ${queryExpression(queryParameters)}); },`;
      return `    ${campaignOperation.clientMethod}: (params: ${parameterType(pathParameters)}) => requestJson<${campaignOperation.responseType}>(${encodedPath(path)}),`;
    })
    .join("\n");
  const notificationMethods = notificationOperationEntries
    .map(({ path, notificationOperation }) => {
      const pathParameters = (path.match(/{[^}]+}/g) ?? []).map((name) =>
        name.slice(1, -1),
      );
      const params = parameterType(pathParameters);
      if (notificationOperation.body === null) {
        const method = notificationOperation.clientMethod.startsWith("list")
          ? "GET"
          : "POST";
        return `    ${notificationOperation.clientMethod}: (params: ${params}) => requestJson(${encodedPath(path)}, { method: ${JSON.stringify(method)} }),`;
      }
      return `    ${notificationOperation.clientMethod}: (params: ${params}, body: Record<string, unknown>) => requestJson(${encodedPath(path)}, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }),`;
    })
    .join("\n");
  const reportMethods = reportOperationEntries
    .map(({ path, reportOperation }) => {
      const pathParameters = (path.match(/{[^}]+}/g) ?? []).map((name) =>
        name.slice(1, -1),
      );
      const queryParameters = Object.keys(reportOperation.query ?? {});
      const queryBuilder = queryParameters.length
        ? `const query = new URLSearchParams(); ${queryParameters.map((name) => `if (params.${name} !== undefined) query.set(${JSON.stringify(name)}, String(params.${name}));`).join(" ")} `
        : "";
      if (queryParameters.length)
        return `    ${reportOperation.clientMethod}: (params: ${parameterType(pathParameters, queryParameters)}) => { ${queryBuilder} return requestJson<${reportOperation.responseType}>(${encodedPath(path)} + ${queryExpression(queryParameters)}); },`;
      return `    ${reportOperation.clientMethod}: (params: ${parameterType(pathParameters)}) => requestJson<${reportOperation.responseType}>(${encodedPath(path)}),`;
    })
    .join("\n");
  const campaignTypes = [
    "CampaignListPage",
    "CampaignDetailResponse",
    "CampaignAnalyticsResponse",
    "OrganizationCampaignAnalyticsResponse",
    "CampaignPerformanceEntryPage",
    "LeadTouchPage",
    "LeadAttributionResponse",
  ]
    .map((responseType) => {
      const entry = campaignOperationEntries.find(
        ({ campaignOperation }) =>
          campaignOperation.responseType === responseType,
      );
      if (!entry)
        throw new Error(`Missing campaign schema for ${responseType}`);
      const schema = JSON.parse(
        JSON.stringify(entry.campaignOperation.responseSchema),
      );
      return `export type ${responseType} = ${typescriptObjectType(schema)};`;
    })
    .join("\n\n");
  const reportTypes = [
    "OwnerCashFlowResponse",
    "OwnerPaymentItemPage",
    "OwnerExpenseItemPage",
    "OwnerAgingSummaryResponse",
    "OwnerAgingItemPage",
    "OwnerCommissionSummaryResponse",
    "OwnerCommissionItemPage",
    "OwnerPerformanceResponse",
    "OwnerCampaignPerformanceResponse",
  ]
    .map((responseType) => {
      const entry = reportOperationEntries.find(
        ({ reportOperation }) => reportOperation.responseType === responseType,
      );
      if (!entry) throw new Error(`Missing report schema for ${responseType}`);
      const schema = JSON.parse(
        JSON.stringify(entry.reportOperation.responseSchema),
      );
      return `export type ${responseType} = ${typescriptObjectType(schema)};`;
    })
    .join("\n\n");
  const automationTypes = `export type AutomationRuleDefinitionInput = {
  trigger:
    | { kind: "DOMAIN_EVENT"; eventType: string }
    | { kind: "SCHEDULE"; cadence: "DAILY"; timeOfDayUtc: string };
  conditions: Array<{
    field: string;
    op: "equals" | "not_equals" | "in" | "not_in" | "is_empty" | "is_not_empty";
    value?: string | number | boolean | string[];
  }>;
  action: {
    actionType: "CREATE_LEAD_TASK" | "CREATE_INTERNAL_NOTIFICATION" | "ADD_LEAD_TIMELINE_NOTE";
    payload?: Record<string, string>;
  };
};`;
  const agingItemSchema = {
    ...agingResponseSchema.properties.items.items,
    properties: {
      ...agingResponseSchema.properties.items.items.properties,
      bucket: { tsType: "ReceivableAgingBucket" },
    },
  };
  const agingResponseType = typescriptObjectType({
    ...agingResponseSchema,
    properties: {
      asOf: agingResponseSchema.properties.asOf,
      items: { tsType: "ReceivableAgingItem[]" },
      nextCursor: agingResponseSchema.properties.nextCursor,
    },
  });
  const agingTypes = `export type ReceivableAgingBucket = ${typescriptSchemaType(agingResponseSchema.properties.items.items.properties.bucket)};\n\nexport type ReceivableAgingItem = ${typescriptObjectType(agingItemSchema)};\n\nexport type ReceivableAgingResponse = ${agingResponseType};`;
  const ledgerMethods = ledgerOperationEntries
    .map(({ path, operation, ledgerOperation }) => {
      const parameters = readPropertyPathParameters({ path, operation });
      const bodyType =
        ledgerOperation.body === null
          ? ""
          : `, body: { ${Object.entries(ledgerOperation.body)
              .map(([name, type]) => `${name}: ${type}`)
              .join("; ")} }`;
      const bodyInit =
        ledgerOperation.body === null
          ? ""
          : ', { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }';
      const paramsType = parameterType(parameters);
      return ledgerOperation.body === null
        ? `    ${ledgerOperation.clientMethod}: (params: ${paramsType}) => requestJson(${encodedPath(path)}, { method: "POST" }),`
        : `    ${ledgerOperation.clientMethod}: (params: ${paramsType}${bodyType}) => requestJson(${encodedPath(path)}${bodyInit}),`;
    })
    .join("\n");
  const propertyMethods = propertyOperationEntries
    .map(({ path, operation, propertyOperation }) => {
      const parameters = readPropertyPathParameters({ path, operation });
      if (propertyOperation.method === "get")
        return getMethods([{ path, operation, propertyOperation }], true)[0];
      return `    ${operation.operationId}: (params: ${parameterType(parameters)}, body: unknown) => requestJson(${encodedPath(path)}, { method: ${JSON.stringify(propertyOperation.method.toUpperCase())}, headers: { "content-type": "application/json" }, body: JSON.stringify(body) }),`;
    })
    .join("\n");

  return `export type HealthStatus = {
  status: ${statusLiterals.join(" | ")};
};

export type DraftLine = {
  accountId: string;
  side: "DEBIT" | "CREDIT";
  currency: string;
  amountMinor: string;
};

export type LeadDetailResponse = {
  lead: Record<string, unknown>;
  timeline: { items: Array<{ id: string; type: string; occurredAt: string; data: Record<string, string | null> }>; nextCursor: string | null };
  notes: Array<{ id: string; body: string; createdAt: string }>;
  tasks: Array<{ id: string; title: string; dueAt: string; status: "OPEN" | "COMPLETED"; createdAt: string; completedAt: string | null; version: number }>;
};

${agingTypes}

${reportTypes}

${campaignTypes}

${automationTypes}

export type FetchLike = (
  input: string,
  init?: { method: string; headers?: Record<string, string>; body?: string },
) => Promise<{ ok: boolean; json(): Promise<unknown> }>;

export type EstateFlowClientOptions = {
  baseUrl: string;
  fetch?: FetchLike;
};

export function createEstateFlowClient({
  baseUrl,
  fetch,
}: EstateFlowClientOptions) {
  const request = fetch ?? (globalThis.fetch as FetchLike | undefined);

  if (!request) throw new Error("A fetch implementation is required");

  const requestJson = async <T>(path: string, init: { method: string; headers?: Record<string, string>; body?: string } = { method: "GET" }): Promise<T> => {
    const response = await request(new URL(path, baseUrl).toString(), init);

    if (!response.ok) throw new Error("EstateFlow API request failed");

    return response.json() as Promise<T>;
  };

  return {
${healthMethods}
${leadMethods}
${crmMethods}
${commissionMethods}
${receivableMethods}
${expenseMethods}
${campaignMethods}
${reportMethods}
${notificationMethods}
${automationMethods}
${ledgerMethods}
${propertyMethods}
  };
}
`;
}
