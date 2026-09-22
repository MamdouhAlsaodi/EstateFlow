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
