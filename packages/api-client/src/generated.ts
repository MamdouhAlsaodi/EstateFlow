export type HealthStatus = {
  status: "ok";
};

export type DraftLine = {
  accountId: string;
  side: "DEBIT" | "CREDIT";
  currency: string;
  amountMinor: string;
};

export type LeadDetailResponse = {
  lead: Record<string, unknown>;
  timeline: {
    items: Array<{
      id: string;
      type: string;
      occurredAt: string;
      data: Record<string, string | null>;
    }>;
    nextCursor: string | null;
  };
  notes: Array<{ id: string; body: string; createdAt: string }>;
  tasks: Array<{
    id: string;
    title: string;
    dueAt: string;
    status: "OPEN" | "COMPLETED";
    createdAt: string;
    completedAt: string | null;
    version: number;
  }>;
};

export type ReceivableAgingBucket =
  "CURRENT" | "DAYS_1_30" | "DAYS_31_60" | "DAYS_61_90" | "DAYS_91_PLUS";

export type ReceivableAgingItem = {
  receivableId: string;
  invoiceId: string;
  dealId: string;
  currency: string;
  originalAmountMinor: string;
  outstandingMinor: string;
  status: "OPEN" | "PARTIALLY_PAID";
  issuedAt: string;
  dueAt: string;
  daysPastDue: number;
  bucket: ReceivableAgingBucket;
};

export type ReceivableAgingResponse = {
  asOf: string;
  items: ReceivableAgingItem[];
  nextCursor?: string;
};

export type OwnerCashFlowResponse = {
  asOf: string;
  cashIn: { currency: string; count: number; amountMinor: string }[];
  cashOut: { currency: string; count: number; amountMinor: string }[];
  netCash: { currency: string; amountMinor: string }[];
};

export type OwnerPaymentItemPage = {
  asOf: string;
  items: {
    paymentId: string;
    receivableId: string;
    invoiceId: string;
    dealId: string;
    propertyId: string;
    currency: string;
    amountMinor: string;
    recordedAt: string;
  }[];
  nextCursor?: string;
};

export type OwnerExpenseItemPage = {
  asOf: string;
  items: {
    expenseId: string;
    category: "OFFICE" | "CAMPAIGN" | "PROPERTY" | "OTHER";
    vendorReference: string;
    currency: string;
    amountMinor: string;
    decidedAt: string;
    campaignReference: string;
    campaignId: string;
    dealId: string;
    propertyId: string;
  }[];
  nextCursor?: string;
};

export type OwnerAgingSummaryResponse = {
  asOf: string;
  buckets: {
    bucket:
      "CURRENT" | "DAYS_1_30" | "DAYS_31_60" | "DAYS_61_90" | "DAYS_91_PLUS";
    currency: string;
    count: number;
    outstandingMinor: string;
  }[];
};

export type OwnerAgingItemPage = {
  asOf: string;
  items: {
    receivableId: string;
    invoiceId: string;
    dealId: string;
    currency: string;
    originalAmountMinor: string;
    outstandingMinor: string;
    status: "OPEN" | "PARTIALLY_PAID";
    issuedAt: string;
    dueAt: string;
    daysPastDue: number;
    bucket:
      "CURRENT" | "DAYS_1_30" | "DAYS_31_60" | "DAYS_61_90" | "DAYS_91_PLUS";
  }[];
  nextCursor?: string;
};

export type OwnerCommissionSummaryResponse = {
  asOf: string;
  expected: { currency: string; count: number; amountMinor: string }[];
  due: { currency: string; count: number; amountMinor: string }[];
  paid: { currency: string; count: number; amountMinor: string }[];
};

export type OwnerCommissionItemPage = {
  asOf: string;
  items: {
    accrualId: string;
    dealId: string;
    status: "EXPECTED" | "CONFIRMED" | "DUE" | "PAID" | "CANCELLED";
    currency: string;
    amountMinor: string;
    createdAt: string;
    splits: { order: number; kind: "BROKER" | "OFFICE"; amountMinor: string }[];
  }[];
  nextCursor?: string;
};

export type OwnerPerformanceResponse = {
  asOf: string;
  deals: {
    keyId: string;
    currency: string;
    revenueMinor: string;
    costsMinor: string;
    marginMinor: string;
    paymentCount: number;
    expenseCount: number;
  }[];
  properties: {
    keyId: string;
    currency: string;
    revenueMinor: string;
    costsMinor: string;
    marginMinor: string;
    paymentCount: number;
    expenseCount: number;
  }[];
};

export type OwnerCampaignPerformanceResponse = {
  asOf: string;
  model: "FIRST_TOUCH" | "LAST_TOUCH";
  campaigns: {
    keyId: string;
    currency: string;
    revenueMinor: string;
    costsMinor: string;
    marginMinor: string;
    paymentCount: number;
    expenseCount: number;
  }[];
};

export type CampaignListPage = {
  items: {
    id: string;
    name: string;
    objective: string;
    channel:
      | "META"
      | "GOOGLE"
      | "SNAPCHAT"
      | "TIKTOK"
      | "X"
      | "LINKEDIN"
      | "PRINT"
      | "OUTDOOR"
      | "REFERRAL"
      | "OTHER";
    status: "DRAFT" | "ACTIVE" | "COMPLETED" | "CANCELLED";
    startsAt: string;
    endsAt: string;
    budgetPlannedMinor: string;
    currency: string;
    budgetActualMinor: string;
    touchCount: number;
    createdAt: string;
  }[];
  nextCursor?: string;
};

export type CampaignDetailResponse = {
  campaign: {
    id: string;
    organizationId: string;
    name: string;
    objective: string;
    channel:
      | "META"
      | "GOOGLE"
      | "SNAPCHAT"
      | "TIKTOK"
      | "X"
      | "LINKEDIN"
      | "PRINT"
      | "OUTDOOR"
      | "REFERRAL"
      | "OTHER";
    status: "DRAFT" | "ACTIVE" | "COMPLETED" | "CANCELLED";
    startsAt: string;
    endsAt: string;
    budget: { amountMinor: string; currency: string };
    utm: {
      utmSource: string;
      utmMedium: string;
      utmCampaign: string;
      utmContent: string;
      utmTerm: string;
    };
    createdBy: string;
    createdAt: string;
    updatedAt: string;
  };
  actualByCurrency: { currency: string; count: number; amountMinor: string }[];
  transitions: {
    id: string;
    organizationId: string;
    campaignId: string;
    fromStatus: "DRAFT" | "ACTIVE" | "COMPLETED" | "CANCELLED";
    toStatus: "DRAFT" | "ACTIVE" | "COMPLETED" | "CANCELLED";
    reason: string;
    actorId: string;
    createdAt: string;
  }[];
  budgetCorrections: {
    id: string;
    organizationId: string;
    campaignId: string;
    previousMinor: string;
    correctedMinor: string;
    currency: string;
    reason: string;
    createdBy: string;
    createdAt: string;
  }[];
};

export type CampaignAnalyticsResponse = {
  asOf: string;
  analytics: {
    campaignId: string;
    plannedBudget: { currency: string; count: number; amountMinor: string }[];
    approvedSpend: { currency: string; count: number; amountMinor: string }[];
    touchCount: number;
    attribution: {
      firstTouchLeadCount: number;
      firstTouchQualifiedLeadCount: number;
      firstTouchWinCount: number;
      firstTouchAttributedRevenue: {
        currency: string;
        count: number;
        amountMinor: string;
      }[];
      lastTouchLeadCount: number;
      lastTouchQualifiedLeadCount: number;
      lastTouchWinCount: number;
      lastTouchAttributedRevenue: {
        currency: string;
        count: number;
        amountMinor: string;
      }[];
    };
    publishedContent: { channel: string; count: number }[];
  };
  metrics: {
    firstTouch: { currency: string; cpl: string; cac: string; roi: string }[];
    lastTouch: { currency: string; cpl: string; cac: string; roi: string }[];
  };
};

export type OrganizationCampaignAnalyticsResponse = {
  asOf: string;
  analytics: {
    campaignId: string;
    campaignCount: number;
    plannedBudget: { currency: string; count: number; amountMinor: string }[];
    approvedSpend: { currency: string; count: number; amountMinor: string }[];
    touchCount: number;
    attribution: {
      firstTouchLeadCount: number;
      firstTouchQualifiedLeadCount: number;
      firstTouchWinCount: number;
      firstTouchAttributedRevenue: {
        currency: string;
        count: number;
        amountMinor: string;
      }[];
      lastTouchLeadCount: number;
      lastTouchQualifiedLeadCount: number;
      lastTouchWinCount: number;
      lastTouchAttributedRevenue: {
        currency: string;
        count: number;
        amountMinor: string;
      }[];
    };
    publishedContent: { channel: string; count: number }[];
  };
  metrics: {
    firstTouch: { currency: string; cpl: string; cac: string; roi: string }[];
    lastTouch: { currency: string; cpl: string; cac: string; roi: string }[];
  };
};

export type CampaignPerformanceEntryPage = {
  items: {
    id: string;
    organizationId: string;
    campaignId: string;
    occurredAt: string;
    impressions: number;
    clicks: number;
    leadsCount: number;
    note: string;
    createdBy: string;
    createdAt: string;
  }[];
  nextCursor?: string;
};

export type LeadTouchPage = {
  items: {
    id: string;
    organizationId: string;
    leadId: string;
    campaignId: string;
    channel:
      | "WEBSITE"
      | "WHATSAPP"
      | "PHONE_CALL"
      | "WALK_IN"
      | "REFERRAL"
      | "META"
      | "GOOGLE"
      | "SNAPCHAT"
      | "TIKTOK"
      | "X"
      | "OTHER";
    source: string;
    utm: {
      utmSource: string;
      utmMedium: string;
      utmCampaign: string;
      utmContent: string;
      utmTerm: string;
    };
    occurredAt: string;
    createdBy: string;
    createdAt: string;
  }[];
  nextCursor?: string;
};

export type LeadAttributionResponse = {
  attribution: {
    firstTouch: {
      id: string;
      organizationId: string;
      leadId: string;
      campaignId: string;
      channel:
        | "WEBSITE"
        | "WHATSAPP"
        | "PHONE_CALL"
        | "WALK_IN"
        | "REFERRAL"
        | "META"
        | "GOOGLE"
        | "SNAPCHAT"
        | "TIKTOK"
        | "X"
        | "OTHER";
      source: string;
      utm: {
        utmSource: string;
        utmMedium: string;
        utmCampaign: string;
        utmContent: string;
        utmTerm: string;
      };
      occurredAt: string;
      createdBy: string;
      createdAt: string;
    };
    lastTouch: {
      id: string;
      organizationId: string;
      leadId: string;
      campaignId: string;
      channel:
        | "WEBSITE"
        | "WHATSAPP"
        | "PHONE_CALL"
        | "WALK_IN"
        | "REFERRAL"
        | "META"
        | "GOOGLE"
        | "SNAPCHAT"
        | "TIKTOK"
        | "X"
        | "OTHER";
      source: string;
      utm: {
        utmSource: string;
        utmMedium: string;
        utmCampaign: string;
        utmContent: string;
        utmTerm: string;
      };
      occurredAt: string;
      createdBy: string;
      createdAt: string;
    };
    firstCampaignId: string;
    lastCampaignId: string;
    override: {
      id: string;
      organizationId: string;
      leadId: string;
      previousCampaignId: string;
      correctedCampaignId: string;
      reason: string;
      createdBy: string;
      createdAt: string;
    };
  };
};

export type AutomationRuleDefinitionInput = {
  trigger:
    | { kind: "DOMAIN_EVENT"; eventType: string }
    | { kind: "SCHEDULE"; cadence: "DAILY"; timeOfDayUtc: string };
  conditions: Array<{
    field: string;
    op: "equals" | "not_equals" | "in" | "not_in" | "is_empty" | "is_not_empty";
    value?: string | number | boolean | string[];
  }>;
  action: {
    actionType:
      | "CREATE_LEAD_TASK"
      | "CREATE_INTERNAL_NOTIFICATION"
      | "ADD_LEAD_TIMELINE_NOTE";
    payload?: Record<string, string>;
  };
};

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

  const requestJson = async <T>(
    path: string,
    init: {
      method: string;
      headers?: Record<string, string>;
      body?: string;
    } = { method: "GET" },
  ): Promise<T> => {
    const response = await request(new URL(path, baseUrl).toString(), init);

    if (!response.ok) throw new Error("EstateFlow API request failed");

    return response.json() as Promise<T>;
  };

  return {
    getLiveHealth: () => requestJson("health/live"),
    getReadyHealth: () => requestJson("health/ready"),
    LeadController_list: (params: {
      organizationId: string;
      stage?: string;
      cursor?: string;
      limit?: number;
    }) => {
      const query = new URLSearchParams();
      if (params.stage !== undefined) query.set("stage", String(params.stage));
      if (params.cursor !== undefined)
        query.set("cursor", String(params.cursor));
      if (params.limit !== undefined) query.set("limit", String(params.limit));
      return requestJson<unknown>(
        `organizations/${encodeURIComponent(params.organizationId)}/leads` +
          (query.toString() ? `?${query}` : ""),
      );
    },
    LeadController_find: (params: {
      organizationId: string;
      leadId: string;
      cursor?: string;
      limit?: number;
    }) => {
      const query = new URLSearchParams();
      if (params.cursor !== undefined)
        query.set("cursor", String(params.cursor));
      if (params.limit !== undefined) query.set("limit", String(params.limit));
      return requestJson<LeadDetailResponse>(
        `organizations/${encodeURIComponent(params.organizationId)}/leads/${encodeURIComponent(params.leadId)}` +
          (query.toString() ? `?${query}` : ""),
      );
    },
    closeLeadWon: (
      params: {
        organizationId: string;
        leadId: string;
        idempotencyKey: string;
      },
      body: { propertyId: string; brokerId: string; expectedVersion: number },
    ) =>
      requestJson(
        `organizations/${encodeURIComponent(params.organizationId)}/leads/${encodeURIComponent(params.leadId)}/close-won`,
        {
          method: "POST",
          headers: {
            "Idempotency-Key": params.idempotencyKey,
            "content-type": "application/json",
          },
          body: JSON.stringify(body),
        },
      ),
    closeLeadLost: (
      params: {
        organizationId: string;
        leadId: string;
        idempotencyKey: string;
      },
      body: { reason: string; expectedVersion: number },
    ) =>
      requestJson(
        `organizations/${encodeURIComponent(params.organizationId)}/leads/${encodeURIComponent(params.leadId)}/close-lost`,
        {
          method: "POST",
          headers: {
            "Idempotency-Key": params.idempotencyKey,
            "content-type": "application/json",
          },
          body: JSON.stringify(body),
        },
      ),
    createLeadNote: (
      params: {
        organizationId: string;
        leadId: string;
        idempotencyKey: string;
      },
      body: { body: string },
    ) =>
      requestJson(
        `organizations/${encodeURIComponent(params.organizationId)}/leads/${encodeURIComponent(params.leadId)}/notes`,
        {
          method: "POST",
          headers: {
            "Idempotency-Key": params.idempotencyKey,
            "content-type": "application/json",
          },
          body: JSON.stringify(body),
        },
      ),
    createLeadTask: (
      params: {
        organizationId: string;
        leadId: string;
        idempotencyKey: string;
      },
      body: { title: string; dueAt: string },
    ) =>
      requestJson(
        `organizations/${encodeURIComponent(params.organizationId)}/leads/${encodeURIComponent(params.leadId)}/tasks`,
        {
          method: "POST",
          headers: {
            "Idempotency-Key": params.idempotencyKey,
            "content-type": "application/json",
          },
          body: JSON.stringify(body),
        },
      ),
    completeLeadTask: (
      params: {
        organizationId: string;
        leadId: string;
        taskId: string;
        idempotencyKey: string;
      },
      body: { expectedVersion: number },
    ) =>
      requestJson(
        `organizations/${encodeURIComponent(params.organizationId)}/leads/${encodeURIComponent(params.leadId)}/tasks/${encodeURIComponent(params.taskId)}/complete`,
        {
          method: "POST",
          headers: {
            "Idempotency-Key": params.idempotencyKey,
            "content-type": "application/json",
          },
          body: JSON.stringify(body),
        },
      ),
    rescheduleLeadTask: (
      params: {
        organizationId: string;
        leadId: string;
        taskId: string;
        idempotencyKey: string;
      },
      body: { expectedVersion: number; dueAt: string },
    ) =>
      requestJson(
        `organizations/${encodeURIComponent(params.organizationId)}/leads/${encodeURIComponent(params.leadId)}/tasks/${encodeURIComponent(params.taskId)}/reschedule`,
        {
          method: "POST",
          headers: {
            "Idempotency-Key": params.idempotencyKey,
            "content-type": "application/json",
          },
          body: JSON.stringify(body),
        },
      ),
    createCommissionPlanVersion: (
      params: { organizationId: string },
      body:
        | { version: number }
        | {
            version: number;
            rateBps: number;
            recipients: {
              order: number;
              kind: "BROKER" | "OFFICE";
              splitBps: number;
            }[];
          },
    ) =>
      requestJson(
        `organizations/${encodeURIComponent(params.organizationId)}/finance/commission-plan-versions`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        },
      ),
    captureCommissionableValue: (
      params: { organizationId: string; dealId: string },
      body: {
        valueId: string;
        amountMinor: string;
        currency: string;
        capturedAt: string;
      },
    ) =>
      requestJson(
        `organizations/${encodeURIComponent(params.organizationId)}/finance/deals/${encodeURIComponent(params.dealId)}/commissionable-values`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        },
      ),
    createExpectedAccrual: (
      params: { organizationId: string; dealId: string },
      body: {
        accrualId: string;
        commissionableValueId: string;
        commissionPlanVersionId: string;
        dealClosedWonEventId: string;
      },
    ) =>
      requestJson(
        `organizations/${encodeURIComponent(params.organizationId)}/finance/deals/${encodeURIComponent(params.dealId)}/expected-commissions`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        },
      ),
    createInvoiceDraft: (
      params: { organizationId: string; dealId: string },
      body: { amountMinor: string; currency: string },
    ) =>
      requestJson(
        `organizations/${encodeURIComponent(params.organizationId)}/finance/deals/${encodeURIComponent(params.dealId)}/invoices`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        },
      ),
    issueInvoice: (
      params: { organizationId: string; invoiceId: string },
      body: { receivableId: string; issuedAt: string; dueAt: string },
    ) =>
      requestJson(
        `organizations/${encodeURIComponent(params.organizationId)}/finance/invoices/${encodeURIComponent(params.invoiceId)}/issue`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        },
      ),
    cancelInvoice: (
      params: { organizationId: string; invoiceId: string },
      body: { reason: string },
    ) =>
      requestJson(
        `organizations/${encodeURIComponent(params.organizationId)}/finance/invoices/${encodeURIComponent(params.invoiceId)}/cancel`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        },
      ),
    getReceivableAging: (params: {
      organizationId: string;
      cursor?: string;
      limit?: number;
    }) => {
      const query = new URLSearchParams();
      if (params.cursor !== undefined)
        query.set("cursor", String(params.cursor));
      if (params.limit !== undefined) query.set("limit", String(params.limit));
      return requestJson<ReceivableAgingResponse>(
        `organizations/${encodeURIComponent(params.organizationId)}/finance/receivables/aging` +
          (query.toString() ? `?${query}` : ""),
      );
    },
    recordReceivablePayment: (
      params: {
        organizationId: string;
        receivableId: string;
        idempotencyKey: string;
      },
      body: { amountMinor: string; currency: string; recordedAt: string },
    ) =>
      requestJson(
        `organizations/${encodeURIComponent(params.organizationId)}/finance/receivables/${encodeURIComponent(params.receivableId)}/payments`,
        {
          method: "POST",
          headers: {
            "Idempotency-Key": params.idempotencyKey,
            "content-type": "application/json",
          },
          body: JSON.stringify(body),
        },
      ),
    createExpenseDraft: (
      params: { organizationId: string },
      body: {
        category: "OFFICE" | "CAMPAIGN" | "PROPERTY" | "OTHER";
        vendorReference: string;
        amountMinor: string;
        currency: string;
        campaignReference?: string;
        campaignId?: string;
        propertyId?: string;
        dealId?: string;
      },
    ) =>
      requestJson(
        `organizations/${encodeURIComponent(params.organizationId)}/finance/expenses`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        },
      ),
    attachExpenseEvidence: (
      params: { organizationId: string; expenseId: string },
      body: {
        evidenceId: string;
        mediaType: "PDF" | "JPEG" | "PNG" | "WEBP";
        byteSize: number;
        note?: string;
        attachedAt: string;
      },
    ) =>
      requestJson(
        `organizations/${encodeURIComponent(params.organizationId)}/finance/expenses/${encodeURIComponent(params.expenseId)}/evidence`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        },
      ),
    submitExpenseForApproval: (params: {
      organizationId: string;
      expenseId: string;
    }) =>
      requestJson(
        `organizations/${encodeURIComponent(params.organizationId)}/finance/expenses/${encodeURIComponent(params.expenseId)}/submit`,
        { method: "POST" },
      ),
    decideExpenseApproval: (
      params: { organizationId: string; expenseId: string },
      body: { decision: "APPROVED" | "REJECTED"; reason?: string },
    ) =>
      requestJson(
        `organizations/${encodeURIComponent(params.organizationId)}/finance/expenses/${encodeURIComponent(params.expenseId)}/decision`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        },
      ),
    setExpenseApprovalPolicy: (
      params: { organizationId: string },
      body: { thresholdMinor?: string; currency: string },
    ) =>
      requestJson(
        `organizations/${encodeURIComponent(params.organizationId)}/finance/expense-approval-policy`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        },
      ),
    getOrganizationCampaignAnalytics: (params: { organizationId: string }) =>
      requestJson<OrganizationCampaignAnalyticsResponse>(
        `organizations/${encodeURIComponent(params.organizationId)}/campaigns/analytics`,
      ),
    createCampaign: (
      params: { organizationId: string },
      body: {
        name: string;
        objective: string;
        channel:
          | "META"
          | "GOOGLE"
          | "SNAPCHAT"
          | "TIKTOK"
          | "X"
          | "LINKEDIN"
          | "PRINT"
          | "OUTDOOR"
          | "REFERRAL"
          | "OTHER";
        startsAt: string;
        endsAt: string;
        budgetPlannedMinor: string;
        currency: string;
        utmSource?: string;
        utmMedium?: string;
        utmCampaign?: string;
        utmContent?: string;
        utmTerm?: string;
      },
    ) =>
      requestJson(
        `organizations/${encodeURIComponent(params.organizationId)}/campaigns`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        },
      ),
    listCampaigns: (params: {
      organizationId: string;
      status?: string;
      cursor?: string;
      limit?: number;
    }) => {
      const query = new URLSearchParams();
      if (params.status !== undefined)
        query.set("status", String(params.status));
      if (params.cursor !== undefined)
        query.set("cursor", String(params.cursor));
      if (params.limit !== undefined) query.set("limit", String(params.limit));
      return requestJson<CampaignListPage>(
        `organizations/${encodeURIComponent(params.organizationId)}/campaigns` +
          (query.toString() ? `?${query}` : ""),
      );
    },
    getCampaignAnalytics: (params: {
      organizationId: string;
      campaignId: string;
    }) =>
      requestJson<CampaignAnalyticsResponse>(
        `organizations/${encodeURIComponent(params.organizationId)}/campaigns/${encodeURIComponent(params.campaignId)}/analytics`,
      ),
    findCampaign: (params: { organizationId: string; campaignId: string }) =>
      requestJson<CampaignDetailResponse>(
        `organizations/${encodeURIComponent(params.organizationId)}/campaigns/${encodeURIComponent(params.campaignId)}`,
      ),
    transitionCampaign: (
      params: { organizationId: string; campaignId: string },
      body: { toStatus: "ACTIVE" | "COMPLETED" | "CANCELLED"; reason?: string },
    ) =>
      requestJson(
        `organizations/${encodeURIComponent(params.organizationId)}/campaigns/${encodeURIComponent(params.campaignId)}/transition`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        },
      ),
    correctCampaignBudget: (
      params: { organizationId: string; campaignId: string },
      body: { correctedMinor: string; reason: string },
    ) =>
      requestJson(
        `organizations/${encodeURIComponent(params.organizationId)}/campaigns/${encodeURIComponent(params.campaignId)}/budget-corrections`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        },
      ),
    recordCampaignPerformance: (
      params: { organizationId: string; campaignId: string },
      body: {
        occurredAt: string;
        impressions: number;
        clicks: number;
        leadsCount: number;
        note?: string;
      },
    ) =>
      requestJson(
        `organizations/${encodeURIComponent(params.organizationId)}/campaigns/${encodeURIComponent(params.campaignId)}/performance-entries`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        },
      ),
    listCampaignPerformanceEntries: (params: {
      organizationId: string;
      campaignId: string;
      cursor?: string;
      limit?: number;
    }) => {
      const query = new URLSearchParams();
      if (params.cursor !== undefined)
        query.set("cursor", String(params.cursor));
      if (params.limit !== undefined) query.set("limit", String(params.limit));
      return requestJson<CampaignPerformanceEntryPage>(
        `organizations/${encodeURIComponent(params.organizationId)}/campaigns/${encodeURIComponent(params.campaignId)}/performance-entries` +
          (query.toString() ? `?${query}` : ""),
      );
    },
    recordLeadTouch: (
      params: { organizationId: string; leadId: string },
      body: {
        channel:
          | "WEBSITE"
          | "WHATSAPP"
          | "PHONE_CALL"
          | "WALK_IN"
          | "REFERRAL"
          | "META"
          | "GOOGLE"
          | "SNAPCHAT"
          | "TIKTOK"
          | "X"
          | "OTHER";
        source?: string;
        campaignId?: string;
        utmSource?: string;
        utmMedium?: string;
        utmCampaign?: string;
        utmContent?: string;
        utmTerm?: string;
        occurredAt?: string;
      },
    ) =>
      requestJson(
        `organizations/${encodeURIComponent(params.organizationId)}/leads/${encodeURIComponent(params.leadId)}/touches`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        },
      ),
    listLeadTouches: (params: {
      organizationId: string;
      leadId: string;
      cursor?: string;
      limit?: number;
    }) => {
      const query = new URLSearchParams();
      if (params.cursor !== undefined)
        query.set("cursor", String(params.cursor));
      if (params.limit !== undefined) query.set("limit", String(params.limit));
      return requestJson<LeadTouchPage>(
        `organizations/${encodeURIComponent(params.organizationId)}/leads/${encodeURIComponent(params.leadId)}/touches` +
          (query.toString() ? `?${query}` : ""),
      );
    },
    getLeadAttribution: (params: { organizationId: string; leadId: string }) =>
      requestJson<LeadAttributionResponse>(
        `organizations/${encodeURIComponent(params.organizationId)}/leads/${encodeURIComponent(params.leadId)}/attribution`,
      ),
    correctLeadAttribution: (
      params: { organizationId: string; leadId: string },
      body: { correctedCampaignId?: string; reason: string },
    ) =>
      requestJson(
        `organizations/${encodeURIComponent(params.organizationId)}/leads/${encodeURIComponent(params.leadId)}/attribution-corrections`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        },
      ),
    listViewings: (params: { organizationId: string }) =>
      requestJson(
        `organizations/${encodeURIComponent(params.organizationId)}/viewings`,
        { method: "GET" },
      ),
    requestViewing: (
      params: { organizationId: string },
      body: Record<string, unknown>,
    ) =>
      requestJson(
        `organizations/${encodeURIComponent(params.organizationId)}/viewings`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        },
      ),
    getViewing: (params: { organizationId: string; viewingId: string }) =>
      requestJson(
        `organizations/${encodeURIComponent(params.organizationId)}/viewings/${encodeURIComponent(params.viewingId)}`,
        { method: "GET" },
      ),
    confirmViewing: (params: { organizationId: string; viewingId: string }) =>
      requestJson(
        `organizations/${encodeURIComponent(params.organizationId)}/viewings/${encodeURIComponent(params.viewingId)}/confirm`,
        { method: "POST" },
      ),
    rescheduleViewing: (
      params: { organizationId: string; viewingId: string },
      body: Record<string, unknown>,
    ) =>
      requestJson(
        `organizations/${encodeURIComponent(params.organizationId)}/viewings/${encodeURIComponent(params.viewingId)}/reschedule`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        },
      ),
    cancelViewing: (
      params: { organizationId: string; viewingId: string },
      body: Record<string, unknown>,
    ) =>
      requestJson(
        `organizations/${encodeURIComponent(params.organizationId)}/viewings/${encodeURIComponent(params.viewingId)}/cancel`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        },
      ),
    completeViewing: (
      params: { organizationId: string; viewingId: string },
      body: Record<string, unknown>,
    ) =>
      requestJson(
        `organizations/${encodeURIComponent(params.organizationId)}/viewings/${encodeURIComponent(params.viewingId)}/complete`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        },
      ),
    markViewingNoShow: (
      params: { organizationId: string; viewingId: string },
      body: Record<string, unknown>,
    ) =>
      requestJson(
        `organizations/${encodeURIComponent(params.organizationId)}/viewings/${encodeURIComponent(params.viewingId)}/no-show`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        },
      ),
    getBrokerAvailability: (params: {
      organizationId: string;
      brokerId: string;
    }) =>
      requestJson(
        `organizations/${encodeURIComponent(params.organizationId)}/brokers/${encodeURIComponent(params.brokerId)}/availability`,
        { method: "GET" },
      ),
    addBrokerWeeklyAvailability: (
      params: { organizationId: string; brokerId: string },
      body: Record<string, unknown>,
    ) =>
      requestJson(
        `organizations/${encodeURIComponent(params.organizationId)}/brokers/${encodeURIComponent(params.brokerId)}/availability/weekly`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        },
      ),
    addBrokerAvailabilityException: (
      params: { organizationId: string; brokerId: string },
      body: Record<string, unknown>,
    ) =>
      requestJson(
        `organizations/${encodeURIComponent(params.organizationId)}/brokers/${encodeURIComponent(params.brokerId)}/availability/exceptions`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        },
      ),
    getOwnerCashFlow: (params: {
      organizationId: string;
      from?: string;
      to?: string;
    }) => {
      const query = new URLSearchParams();
      if (params.from !== undefined) query.set("from", String(params.from));
      if (params.to !== undefined) query.set("to", String(params.to));
      return requestJson<OwnerCashFlowResponse>(
        `organizations/${encodeURIComponent(params.organizationId)}/finance/reports/cash-flow` +
          (query.toString() ? `?${query}` : ""),
      );
    },
    listOwnerPaymentItems: (params: {
      organizationId: string;
      dealId?: string;
      propertyId?: string;
      from?: string;
      to?: string;
      cursor?: string;
      limit?: number;
    }) => {
      const query = new URLSearchParams();
      if (params.dealId !== undefined)
        query.set("dealId", String(params.dealId));
      if (params.propertyId !== undefined)
        query.set("propertyId", String(params.propertyId));
      if (params.from !== undefined) query.set("from", String(params.from));
      if (params.to !== undefined) query.set("to", String(params.to));
      if (params.cursor !== undefined)
        query.set("cursor", String(params.cursor));
      if (params.limit !== undefined) query.set("limit", String(params.limit));
      return requestJson<OwnerPaymentItemPage>(
        `organizations/${encodeURIComponent(params.organizationId)}/finance/reports/payments` +
          (query.toString() ? `?${query}` : ""),
      );
    },
    listOwnerExpenseItems: (params: {
      organizationId: string;
      dealId?: string;
      propertyId?: string;
      campaignId?: string;
      from?: string;
      to?: string;
      cursor?: string;
      limit?: number;
    }) => {
      const query = new URLSearchParams();
      if (params.dealId !== undefined)
        query.set("dealId", String(params.dealId));
      if (params.propertyId !== undefined)
        query.set("propertyId", String(params.propertyId));
      if (params.campaignId !== undefined)
        query.set("campaignId", String(params.campaignId));
      if (params.from !== undefined) query.set("from", String(params.from));
      if (params.to !== undefined) query.set("to", String(params.to));
      if (params.cursor !== undefined)
        query.set("cursor", String(params.cursor));
      if (params.limit !== undefined) query.set("limit", String(params.limit));
      return requestJson<OwnerExpenseItemPage>(
        `organizations/${encodeURIComponent(params.organizationId)}/finance/reports/expenses` +
          (query.toString() ? `?${query}` : ""),
      );
    },
    getOwnerAgingSummary: (params: { organizationId: string }) =>
      requestJson<OwnerAgingSummaryResponse>(
        `organizations/${encodeURIComponent(params.organizationId)}/finance/reports/receivables/aging`,
      ),
    listOwnerAgingItems: (params: {
      organizationId: string;
      bucket?: string;
      cursor?: string;
      limit?: number;
    }) => {
      const query = new URLSearchParams();
      if (params.bucket !== undefined)
        query.set("bucket", String(params.bucket));
      if (params.cursor !== undefined)
        query.set("cursor", String(params.cursor));
      if (params.limit !== undefined) query.set("limit", String(params.limit));
      return requestJson<OwnerAgingItemPage>(
        `organizations/${encodeURIComponent(params.organizationId)}/finance/reports/receivables/aging/items` +
          (query.toString() ? `?${query}` : ""),
      );
    },
    getOwnerCommissionSummary: (params: { organizationId: string }) =>
      requestJson<OwnerCommissionSummaryResponse>(
        `organizations/${encodeURIComponent(params.organizationId)}/finance/reports/commissions`,
      ),
    listOwnerCommissionItems: (params: {
      organizationId: string;
      status?: string;
      cursor?: string;
      limit?: number;
    }) => {
      const query = new URLSearchParams();
      if (params.status !== undefined)
        query.set("status", String(params.status));
      if (params.cursor !== undefined)
        query.set("cursor", String(params.cursor));
      if (params.limit !== undefined) query.set("limit", String(params.limit));
      return requestJson<OwnerCommissionItemPage>(
        `organizations/${encodeURIComponent(params.organizationId)}/finance/reports/commissions/items` +
          (query.toString() ? `?${query}` : ""),
      );
    },
    getOwnerPerformance: (params: {
      organizationId: string;
      from?: string;
      to?: string;
    }) => {
      const query = new URLSearchParams();
      if (params.from !== undefined) query.set("from", String(params.from));
      if (params.to !== undefined) query.set("to", String(params.to));
      return requestJson<OwnerPerformanceResponse>(
        `organizations/${encodeURIComponent(params.organizationId)}/finance/reports/performance` +
          (query.toString() ? `?${query}` : ""),
      );
    },
    getOwnerCampaignPerformance: (params: {
      organizationId: string;
      model?: string;
      from?: string;
      to?: string;
    }) => {
      const query = new URLSearchParams();
      if (params.model !== undefined) query.set("model", String(params.model));
      if (params.from !== undefined) query.set("from", String(params.from));
      if (params.to !== undefined) query.set("to", String(params.to));
      return requestJson<OwnerCampaignPerformanceResponse>(
        `organizations/${encodeURIComponent(params.organizationId)}/finance/reports/campaigns/performance` +
          (query.toString() ? `?${query}` : ""),
      );
    },
    listNotificationTemplates: (params: { organizationId: string }) =>
      requestJson(
        `organizations/${encodeURIComponent(params.organizationId)}/notifications/templates`,
        { method: "GET" },
      ),
    createNotificationTemplate: (
      params: { organizationId: string },
      body: Record<string, unknown>,
    ) =>
      requestJson(
        `organizations/${encodeURIComponent(params.organizationId)}/notifications/templates`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        },
      ),
    reviseNotificationTemplate: (
      params: { organizationId: string; templateId: string },
      body: Record<string, unknown>,
    ) =>
      requestJson(
        `organizations/${encodeURIComponent(params.organizationId)}/notifications/templates/${encodeURIComponent(params.templateId)}/revisions`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        },
      ),
    approveNotificationTemplate: (params: {
      organizationId: string;
      templateId: string;
    }) =>
      requestJson(
        `organizations/${encodeURIComponent(params.organizationId)}/notifications/templates/${encodeURIComponent(params.templateId)}/approve`,
        { method: "POST" },
      ),
    listNotificationApprovals: (params: { organizationId: string }) =>
      requestJson(
        `organizations/${encodeURIComponent(params.organizationId)}/notifications/approvals`,
        { method: "GET" },
      ),
    requestNotificationSend: (
      params: { organizationId: string },
      body: Record<string, unknown>,
    ) =>
      requestJson(
        `organizations/${encodeURIComponent(params.organizationId)}/notifications/send-requests`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        },
      ),
    approveNotificationSend: (params: {
      organizationId: string;
      approvalId: string;
    }) =>
      requestJson(
        `organizations/${encodeURIComponent(params.organizationId)}/notifications/approvals/${encodeURIComponent(params.approvalId)}/approve`,
        { method: "POST" },
      ),
    rejectNotificationSend: (
      params: { organizationId: string; approvalId: string },
      body: Record<string, unknown>,
    ) =>
      requestJson(
        `organizations/${encodeURIComponent(params.organizationId)}/notifications/approvals/${encodeURIComponent(params.approvalId)}/reject`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        },
      ),
    listNotificationSends: (params: { organizationId: string }) =>
      requestJson(
        `organizations/${encodeURIComponent(params.organizationId)}/notifications/sends`,
        { method: "GET" },
      ),
    updateNotificationPolicy: (
      params: { organizationId: string },
      body: Record<string, unknown>,
    ) =>
      requestJson(
        `organizations/${encodeURIComponent(params.organizationId)}/notifications/policy`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        },
      ),
    updateNotificationPreference: (
      params: { organizationId: string },
      body: Record<string, unknown>,
    ) =>
      requestJson(
        `organizations/${encodeURIComponent(params.organizationId)}/notifications/preferences`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        },
      ),
    createAutomationRule: (
      params: { organizationId: string },
      body: { name: string; definition: AutomationRuleDefinitionInput },
    ) =>
      requestJson(
        `organizations/${encodeURIComponent(params.organizationId)}/automation/rules`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        },
      ),
    addAutomationRuleVersion: (
      params: { organizationId: string; ruleId: string },
      body: { definition: AutomationRuleDefinitionInput; note?: string },
    ) =>
      requestJson(
        `organizations/${encodeURIComponent(params.organizationId)}/automation/rules/${encodeURIComponent(params.ruleId)}/versions`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        },
      ),
    enableAutomationRule: (params: {
      organizationId: string;
      ruleId: string;
    }) =>
      requestJson(
        `organizations/${encodeURIComponent(params.organizationId)}/automation/rules/${encodeURIComponent(params.ruleId)}/enable`,
        { method: "POST" },
      ),
    disableAutomationRule: (params: {
      organizationId: string;
      ruleId: string;
    }) =>
      requestJson(
        `organizations/${encodeURIComponent(params.organizationId)}/automation/rules/${encodeURIComponent(params.ruleId)}/disable`,
        { method: "POST" },
      ),
    listAutomationRules: (params: { organizationId: string }) =>
      requestJson(
        `organizations/${encodeURIComponent(params.organizationId)}/automation/rules`,
        { method: "GET" },
      ),
    findAutomationRule: (params: { organizationId: string; ruleId: string }) =>
      requestJson(
        `organizations/${encodeURIComponent(params.organizationId)}/automation/rules/${encodeURIComponent(params.ruleId)}`,
        { method: "GET" },
      ),
    listAutomationJobs: (params: { organizationId: string }) =>
      requestJson(
        `organizations/${encodeURIComponent(params.organizationId)}/automation/jobs`,
        { method: "GET" },
      ),
    listAutomationRuleJobs: (params: {
      organizationId: string;
      ruleId: string;
    }) =>
      requestJson(
        `organizations/${encodeURIComponent(params.organizationId)}/automation/rules/${encodeURIComponent(params.ruleId)}/jobs`,
        { method: "GET" },
      ),
    findAutomationJob: (params: { organizationId: string; jobId: string }) =>
      requestJson(
        `organizations/${encodeURIComponent(params.organizationId)}/automation/jobs/${encodeURIComponent(params.jobId)}`,
        { method: "GET" },
      ),
    retryAutomationJob: (params: { organizationId: string; jobId: string }) =>
      requestJson(
        `organizations/${encodeURIComponent(params.organizationId)}/automation/jobs/${encodeURIComponent(params.jobId)}/retry`,
        { method: "POST" },
      ),
    cancelAutomationJob: (params: { organizationId: string; jobId: string }) =>
      requestJson(
        `organizations/${encodeURIComponent(params.organizationId)}/automation/jobs/${encodeURIComponent(params.jobId)}/cancel`,
        { method: "POST" },
      ),
    createAccount: (
      params: { organizationId: string },
      body: { code: string; name: string; type: string },
    ) =>
      requestJson(
        `organizations/${encodeURIComponent(params.organizationId)}/finance/accounts`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        },
      ),
    createAccountingPeriod: (
      params: { organizationId: string },
      body: { startsAt: string; endsAt: string },
    ) =>
      requestJson(
        `organizations/${encodeURIComponent(params.organizationId)}/finance/accounting-periods`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        },
      ),
    createDraft: (
      params: { organizationId: string },
      body: { reference: string; reason: string; lines: DraftLine[] },
    ) =>
      requestJson(
        `organizations/${encodeURIComponent(params.organizationId)}/finance/journal-drafts`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        },
      ),
    post: (
      params: { organizationId: string; entryId: string },
      body: { periodId: string; postedAt: string },
    ) =>
      requestJson(
        `organizations/${encodeURIComponent(params.organizationId)}/finance/journal-entries/${encodeURIComponent(params.entryId)}/post`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        },
      ),
    reverse: (params: { organizationId: string; entryId: string }) =>
      requestJson(
        `organizations/${encodeURIComponent(params.organizationId)}/finance/journal-entries/${encodeURIComponent(params.entryId)}/reverse`,
        { method: "POST" },
      ),
    PropertyController_create: (
      params: { organizationId: string },
      body: unknown,
    ) =>
      requestJson(
        `organizations/${encodeURIComponent(params.organizationId)}/properties`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        },
      ),
    PropertyController_list: (params: {
      organizationId: string;
      search?: string;
      cursor?: string;
      limit?: number;
    }) => {
      const query = new URLSearchParams();
      if (params.search !== undefined)
        query.set("search", String(params.search));
      if (params.cursor !== undefined)
        query.set("cursor", String(params.cursor));
      if (params.limit !== undefined) query.set("limit", String(params.limit));
      return requestJson<unknown>(
        `organizations/${encodeURIComponent(params.organizationId)}/properties` +
          (query.toString() ? `?${query}` : ""),
      );
    },
    PropertyController_update: (
      params: { organizationId: string; propertyId: string },
      body: unknown,
    ) =>
      requestJson(
        `organizations/${encodeURIComponent(params.organizationId)}/properties/${encodeURIComponent(params.propertyId)}`,
        {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        },
      ),
    PropertyController_find: (params: {
      organizationId: string;
      propertyId: string;
    }) => {
      return requestJson<unknown>(
        `organizations/${encodeURIComponent(params.organizationId)}/properties/${encodeURIComponent(params.propertyId)}` +
          "",
      );
    },
    PropertyController_createListing: (
      params: { organizationId: string; propertyId: string },
      body: unknown,
    ) =>
      requestJson(
        `organizations/${encodeURIComponent(params.organizationId)}/properties/${encodeURIComponent(params.propertyId)}/listings`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        },
      ),
    PropertyController_getListing: (params: {
      organizationId: string;
      listingId: string;
    }) => {
      return requestJson<unknown>(
        `organizations/${encodeURIComponent(params.organizationId)}/listings/${encodeURIComponent(params.listingId)}` +
          "",
      );
    },
    PropertyController_publish: (
      params: { organizationId: string; listingId: string },
      body: unknown,
    ) =>
      requestJson(
        `organizations/${encodeURIComponent(params.organizationId)}/listings/${encodeURIComponent(params.listingId)}/publish`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        },
      ),
    PropertyController_archive: (
      params: { organizationId: string; listingId: string },
      body: unknown,
    ) =>
      requestJson(
        `organizations/${encodeURIComponent(params.organizationId)}/listings/${encodeURIComponent(params.listingId)}/archive`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        },
      ),
    PropertyController_addImage: (
      params: { organizationId: string; listingId: string },
      body: unknown,
    ) =>
      requestJson(
        `organizations/${encodeURIComponent(params.organizationId)}/listings/${encodeURIComponent(params.listingId)}/images`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        },
      ),
    PropertyController_listImages: (params: {
      organizationId: string;
      listingId: string;
    }) => {
      return requestJson<unknown>(
        `organizations/${encodeURIComponent(params.organizationId)}/listings/${encodeURIComponent(params.listingId)}/images` +
          "",
      );
    },
  };
}
