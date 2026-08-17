CREATE TABLE "Invoice" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organizationId" UUID NOT NULL,
  "dealId" UUID NOT NULL,
  "amountMinor" BIGINT NOT NULL,
  "currency" VARCHAR(3) NOT NULL,
  "status" VARCHAR(20) NOT NULL,
  "draftCreatedBy" UUID NOT NULL,
  "draftCreatedAt" TIMESTAMPTZ(6) NOT NULL,
  "issuedBy" UUID,
  "issuedAt" TIMESTAMPTZ(6),
  "dueAt" TIMESTAMPTZ(6),
  CONSTRAINT "Invoice_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Invoice_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "Invoice_deal_fkey" FOREIGN KEY ("organizationId", "dealId") REFERENCES "Deal"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "Invoice_amount_positive" CHECK ("amountMinor" > 0),
  CONSTRAINT "Invoice_currency_format" CHECK ("currency" ~ '^[A-Za-z]{3}$'),
  CONSTRAINT "Invoice_status_check" CHECK ("status" IN ('DRAFT', 'ISSUED', 'CANCELLED')),
  CONSTRAINT "Invoice_state_fields_check" CHECK (("status" = 'DRAFT' AND "issuedBy" IS NULL AND "issuedAt" IS NULL AND "dueAt" IS NULL) OR ("status" IN ('ISSUED', 'CANCELLED') AND "issuedBy" IS NOT NULL AND "issuedAt" IS NOT NULL AND "dueAt" IS NOT NULL)),
  CONSTRAINT "Invoice_due_after_issue" CHECK ("issuedAt" IS NULL OR "dueAt" >= "issuedAt")
);
CREATE UNIQUE INDEX "Invoice_organizationId_id_key" ON "Invoice"("organizationId", "id");
CREATE INDEX "Invoice_organizationId_dealId_idx" ON "Invoice"("organizationId", "dealId");

CREATE TABLE "Receivable" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organizationId" UUID NOT NULL,
  "invoiceId" UUID NOT NULL,
  "dealId" UUID NOT NULL,
  "originalAmountMinor" BIGINT NOT NULL,
  "outstandingMinor" BIGINT NOT NULL,
  "currency" VARCHAR(3) NOT NULL,
  "status" VARCHAR(20) NOT NULL,
  "issuedAt" TIMESTAMPTZ(6) NOT NULL,
  "dueAt" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "Receivable_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Receivable_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "Receivable_invoice_fkey" FOREIGN KEY ("organizationId", "invoiceId") REFERENCES "Invoice"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "Receivable_deal_fkey" FOREIGN KEY ("organizationId", "dealId") REFERENCES "Deal"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "Receivable_original_positive" CHECK ("originalAmountMinor" > 0),
  CONSTRAINT "Receivable_outstanding_range" CHECK ("outstandingMinor" >= 0 AND "outstandingMinor" <= "originalAmountMinor"),
  CONSTRAINT "Receivable_currency_format" CHECK ("currency" ~ '^[A-Za-z]{3}$'),
  CONSTRAINT "Receivable_status_check" CHECK ("status" IN ('OPEN', 'PARTIALLY_PAID', 'PAID', 'CANCELLED')),
  CONSTRAINT "Receivable_due_after_issue" CHECK ("dueAt" >= "issuedAt"),
  CONSTRAINT "Receivable_status_balance_check" CHECK (("status" = 'OPEN' AND "outstandingMinor" = "originalAmountMinor") OR ("status" = 'PARTIALLY_PAID' AND "outstandingMinor" > 0 AND "outstandingMinor" < "originalAmountMinor") OR ("status" = 'PAID' AND "outstandingMinor" = 0) OR "status" = 'CANCELLED')
);
CREATE UNIQUE INDEX "Receivable_organizationId_id_key" ON "Receivable"("organizationId", "id");
CREATE UNIQUE INDEX "Receivable_organizationId_invoiceId_key" ON "Receivable"("organizationId", "invoiceId");
CREATE INDEX "Receivable_organizationId_dealId_idx" ON "Receivable"("organizationId", "dealId");

CREATE TABLE "PaymentRecord" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organizationId" UUID NOT NULL,
  "receivableId" UUID NOT NULL,
  "amountMinor" BIGINT NOT NULL,
  "currency" VARCHAR(3) NOT NULL,
  "recordedAt" TIMESTAMPTZ(6) NOT NULL,
  "recordedBy" UUID NOT NULL,
  "commandScope" VARCHAR(64) NOT NULL,
  "idempotencyKey" VARCHAR(200) NOT NULL,
  "commandPayloadHash" VARCHAR(64) NOT NULL,
  CONSTRAINT "PaymentRecord_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PaymentRecord_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "PaymentRecord_receivable_fkey" FOREIGN KEY ("organizationId", "receivableId") REFERENCES "Receivable"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "PaymentRecord_amount_positive" CHECK ("amountMinor" > 0),
  CONSTRAINT "PaymentRecord_currency_format" CHECK ("currency" ~ '^[A-Za-z]{3}$'),
  CONSTRAINT "PaymentRecord_scope_check" CHECK ("commandScope" = 'RECEIVABLE_PAYMENT_RECORD')
);
CREATE UNIQUE INDEX "PaymentRecord_organizationId_id_key" ON "PaymentRecord"("organizationId", "id");
CREATE UNIQUE INDEX "PaymentRecord_organizationId_commandScope_idempotencyKey_key" ON "PaymentRecord"("organizationId", "commandScope", "idempotencyKey");
CREATE INDEX "PaymentRecord_organizationId_receivableId_idx" ON "PaymentRecord"("organizationId", "receivableId");
