-- EF-234 / FIN-04: expenses with dimensions, approval threshold policy, and evidence metadata.
-- Mirrors the EF-233 migration style: tenant composite FKs, CHECK constraints, and an
-- immutable approval audit trail enforced in the database.

CREATE TABLE "Expense" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organizationId" UUID NOT NULL,
  "category" VARCHAR(20) NOT NULL,
  "vendorReference" VARCHAR(200) NOT NULL,
  "amountMinor" BIGINT NOT NULL,
  "currency" VARCHAR(3) NOT NULL,
  "campaignReference" VARCHAR(100),
  "propertyId" UUID,
  "dealId" UUID,
  "status" VARCHAR(20) NOT NULL,
  "draftCreatedBy" UUID NOT NULL,
  "draftCreatedAt" TIMESTAMPTZ(6) NOT NULL,
  "submittedBy" UUID,
  "submittedAt" TIMESTAMPTZ(6),
  "decidedBy" UUID,
  "decidedAt" TIMESTAMPTZ(6),
  "decision" VARCHAR(20),
  "decisionReason" VARCHAR(500),
  CONSTRAINT "Expense_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Expense_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "Expense_property_fkey" FOREIGN KEY ("organizationId", "propertyId") REFERENCES "Property"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "Expense_deal_fkey" FOREIGN KEY ("organizationId", "dealId") REFERENCES "Deal"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "Expense_amount_positive" CHECK ("amountMinor" > 0),
  CONSTRAINT "Expense_currency_format" CHECK ("currency" ~ '^[A-Za-z]{3}$'),
  CONSTRAINT "Expense_vendor_reference_format" CHECK ("vendorReference" <> '' AND "vendorReference" ~ '\S'),
  CONSTRAINT "Expense_category_check" CHECK ("category" IN ('OFFICE', 'CAMPAIGN', 'PROPERTY', 'OTHER')),
  CONSTRAINT "Expense_campaign_reference_format" CHECK ("campaignReference" IS NULL OR ("campaignReference" <> '' AND "campaignReference" ~ '\S')),
  CONSTRAINT "Expense_status_check" CHECK ("status" IN ('DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED')),
  CONSTRAINT "Expense_draft_state_check" CHECK ("status" = 'DRAFT' OR ("submittedBy" IS NOT NULL AND "submittedAt" IS NOT NULL)),
  CONSTRAINT "Expense_decision_state_check" CHECK (
    ("status" IN ('DRAFT', 'SUBMITTED') AND "decidedBy" IS NULL AND "decidedAt" IS NULL AND "decision" IS NULL AND "decisionReason" IS NULL)
    OR
    ("status" = 'APPROVED' AND "decidedBy" IS NOT NULL AND "decidedAt" IS NOT NULL AND "decision" = 'APPROVED')
    OR
    ("status" = 'REJECTED' AND "decidedBy" IS NOT NULL AND "decidedAt" IS NOT NULL AND "decision" = 'REJECTED' AND "decisionReason" IS NOT NULL)
  ),
  CONSTRAINT "Expense_maker_checker_check" CHECK (
    "decidedBy" IS NULL OR "decidedBy" <> "draftCreatedBy" OR COALESCE("decisionReason", '') = 'BELOW_THRESHOLD_AUTO_APPROVAL'
  ),
  CONSTRAINT "Expense_decision_after_submission" CHECK ("decidedAt" IS NULL OR "submittedAt" IS NULL OR "decidedAt" >= "submittedAt")
);
CREATE UNIQUE INDEX "Expense_organizationId_id_key" ON "Expense"("organizationId", "id");
CREATE INDEX "Expense_organizationId_status_idx" ON "Expense"("organizationId", "status");
CREATE INDEX "Expense_organizationId_category_idx" ON "Expense"("organizationId", "category");

-- The submitted/approved expense snapshot and its approval audit trail are immutable.
CREATE FUNCTION "ef234_reject_expense_snapshot_update"()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD."status" <> 'DRAFT'
    AND (
      NEW."amountMinor" IS DISTINCT FROM OLD."amountMinor"
      OR NEW."currency" IS DISTINCT FROM OLD."currency"
      OR NEW."category" IS DISTINCT FROM OLD."category"
      OR NEW."vendorReference" IS DISTINCT FROM OLD."vendorReference"
      OR NEW."campaignReference" IS DISTINCT FROM OLD."campaignReference"
      OR NEW."propertyId" IS DISTINCT FROM OLD."propertyId"
      OR NEW."dealId" IS DISTINCT FROM OLD."dealId"
      OR NEW."organizationId" IS DISTINCT FROM OLD."organizationId"
      OR NEW."draftCreatedBy" IS DISTINCT FROM OLD."draftCreatedBy"
      OR NEW."draftCreatedAt" IS DISTINCT FROM OLD."draftCreatedAt"
    )
  THEN
    RAISE EXCEPTION 'submitted expense snapshot is immutable'
      USING ERRCODE = 'check_violation';
  END IF;

  IF OLD."decidedBy" IS NOT NULL
    AND (
      NEW."status" IS DISTINCT FROM OLD."status"
      OR NEW."submittedBy" IS DISTINCT FROM OLD."submittedBy"
      OR NEW."submittedAt" IS DISTINCT FROM OLD."submittedAt"
      OR NEW."decidedBy" IS DISTINCT FROM OLD."decidedBy"
      OR NEW."decidedAt" IS DISTINCT FROM OLD."decidedAt"
      OR NEW."decision" IS DISTINCT FROM OLD."decision"
      OR NEW."decisionReason" IS DISTINCT FROM OLD."decisionReason"
    )
  THEN
    RAISE EXCEPTION 'expense approval audit trail is immutable'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER "Expense_snapshot_and_audit_immutability"
BEFORE UPDATE ON "Expense"
FOR EACH ROW
EXECUTE FUNCTION "ef234_reject_expense_snapshot_update"();

CREATE TABLE "ExpenseEvidenceMetadata" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organizationId" UUID NOT NULL,
  "expenseId" UUID NOT NULL,
  "mediaType" VARCHAR(10) NOT NULL,
  "byteSize" INTEGER NOT NULL,
  "note" VARCHAR(500),
  "attachedBy" UUID NOT NULL,
  "attachedAt" TIMESTAMPTZ(6) NOT NULL,
  "commandPayloadHash" VARCHAR(64) NOT NULL,
  CONSTRAINT "ExpenseEvidenceMetadata_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ExpenseEvidenceMetadata_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "ExpenseEvidenceMetadata_expense_fkey" FOREIGN KEY ("organizationId", "expenseId") REFERENCES "Expense"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "ExpenseEvidenceMetadata_media_type_check" CHECK ("mediaType" IN ('PDF', 'JPEG', 'PNG', 'WEBP')),
  CONSTRAINT "ExpenseEvidenceMetadata_byte_size_check" CHECK ("byteSize" > 0),
  CONSTRAINT "ExpenseEvidenceMetadata_note_format" CHECK ("note" IS NULL OR ("note" <> '' AND "note" ~ '\S')),
  CONSTRAINT "ExpenseEvidenceMetadata_hash_format" CHECK ("commandPayloadHash" ~ '^[0-9a-f]{64}$')
);
CREATE UNIQUE INDEX "ExpenseEvidenceMetadata_organizationId_id_key" ON "ExpenseEvidenceMetadata"("organizationId", "id");
CREATE INDEX "ExpenseEvidenceMetadata_organizationId_expenseId_idx" ON "ExpenseEvidenceMetadata"("organizationId", "expenseId");

CREATE TABLE "ExpenseApprovalPolicy" (
  "organizationId" UUID NOT NULL,
  "thresholdMinor" BIGINT,
  "currency" VARCHAR(3) NOT NULL,
  "updatedBy" UUID NOT NULL,
  "updatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ExpenseApprovalPolicy_pkey" PRIMARY KEY ("organizationId"),
  CONSTRAINT "ExpenseApprovalPolicy_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "ExpenseApprovalPolicy_threshold_check" CHECK ("thresholdMinor" IS NULL OR "thresholdMinor" > 0),
  CONSTRAINT "ExpenseApprovalPolicy_currency_format" CHECK ("currency" ~ '^[A-Za-z]{3}$')
);
CREATE INDEX "ExpenseApprovalPolicy_updatedAt_idx" ON "ExpenseApprovalPolicy"("updatedAt");
