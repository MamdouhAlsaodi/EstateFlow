ALTER TABLE "Invoice"
  ADD COLUMN "cancelledBy" UUID,
  ADD COLUMN "cancelledAt" TIMESTAMPTZ(6),
  ADD COLUMN "cancellationReason" TEXT;

ALTER TABLE "Invoice"
  ADD CONSTRAINT "Invoice_cancelledBy_fkey"
    FOREIGN KEY ("cancelledBy") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "Invoice_cancellation_state_check" CHECK (
    ("status" = 'DRAFT' AND "issuedBy" IS NULL AND "issuedAt" IS NULL AND "dueAt" IS NULL
      AND "cancelledBy" IS NULL AND "cancelledAt" IS NULL AND "cancellationReason" IS NULL)
    OR
    ("status" = 'ISSUED' AND "issuedBy" IS NOT NULL AND "issuedAt" IS NOT NULL AND "dueAt" IS NOT NULL
      AND "cancelledBy" IS NULL AND "cancelledAt" IS NULL AND "cancellationReason" IS NULL)
    OR
    ("status" = 'CANCELLED' AND "issuedBy" IS NOT NULL AND "issuedAt" IS NOT NULL AND "dueAt" IS NOT NULL
      AND "cancelledBy" IS NOT NULL AND "cancelledAt" IS NOT NULL AND "cancellationReason" IS NOT NULL
      AND "cancelledAt" >= "issuedAt"
      AND char_length("cancellationReason") BETWEEN 1 AND 500
      AND "cancellationReason" = btrim("cancellationReason"))
  );

DROP TRIGGER IF EXISTS "Invoice_issued_immutability" ON "Invoice";
DROP FUNCTION IF EXISTS "ef233_reject_issued_invoice_update"();
CREATE FUNCTION "ef233_reject_issued_invoice_update"()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF OLD."issuedAt" IS NULL THEN
    IF OLD."status" = 'DRAFT' AND NEW."status" = 'DRAFT'
      AND NEW."issuedBy" IS NULL AND NEW."issuedAt" IS NULL AND NEW."dueAt" IS NULL
      AND NEW."cancelledBy" IS NULL AND NEW."cancelledAt" IS NULL AND NEW."cancellationReason" IS NULL THEN
      RETURN NEW;
    END IF;

    IF OLD."status" = 'DRAFT' AND NEW."status" = 'ISSUED'
      AND NEW."cancelledBy" IS NULL AND NEW."cancelledAt" IS NULL AND NEW."cancellationReason" IS NULL THEN
      RETURN NEW;
    END IF;

    RAISE EXCEPTION 'invoice pre-issue transition is not allowed' USING ERRCODE = 'check_violation';
  END IF;

  IF NEW."amountMinor" IS DISTINCT FROM OLD."amountMinor"
    OR NEW."currency" IS DISTINCT FROM OLD."currency"
    OR NEW."organizationId" IS DISTINCT FROM OLD."organizationId"
    OR NEW."dealId" IS DISTINCT FROM OLD."dealId"
    OR NEW."draftCreatedBy" IS DISTINCT FROM OLD."draftCreatedBy"
    OR NEW."draftCreatedAt" IS DISTINCT FROM OLD."draftCreatedAt"
    OR NEW."issuedBy" IS DISTINCT FROM OLD."issuedBy"
    OR NEW."issuedAt" IS DISTINCT FROM OLD."issuedAt"
    OR NEW."dueAt" IS DISTINCT FROM OLD."dueAt" THEN
    RAISE EXCEPTION 'issued invoice snapshot is immutable' USING ERRCODE = 'check_violation';
  END IF;

  IF OLD."status" = 'CANCELLED' THEN
    IF NEW IS DISTINCT FROM OLD THEN
      RAISE EXCEPTION 'cancelled invoice is immutable' USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
  END IF;

  IF OLD."status" = 'ISSUED' AND NEW."status" = 'CANCELLED'
    AND OLD."cancelledBy" IS NULL AND OLD."cancelledAt" IS NULL AND OLD."cancellationReason" IS NULL
    AND NEW."cancelledBy" IS NOT NULL AND NEW."cancelledAt" IS NOT NULL AND NEW."cancellationReason" IS NOT NULL
    AND NEW."cancelledAt" >= NEW."issuedAt"
    AND char_length(NEW."cancellationReason") BETWEEN 1 AND 500
    AND NEW."cancellationReason" = btrim(NEW."cancellationReason") THEN
    RETURN NEW;
  END IF;

  IF NEW."status" IS DISTINCT FROM OLD."status"
    OR NEW."cancelledBy" IS DISTINCT FROM OLD."cancelledBy"
    OR NEW."cancelledAt" IS DISTINCT FROM OLD."cancelledAt"
    OR NEW."cancellationReason" IS DISTINCT FROM OLD."cancellationReason" THEN
    RAISE EXCEPTION 'issued invoice status or audit is immutable' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "Invoice_issued_immutability"
BEFORE UPDATE ON "Invoice" FOR EACH ROW
EXECUTE FUNCTION "ef233_reject_issued_invoice_update"();

CREATE FUNCTION "ef233_guard_receivable_cancellation"()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF OLD."status" = 'CANCELLED' THEN
    IF NEW IS DISTINCT FROM OLD THEN
      RAISE EXCEPTION 'cancelled receivable is immutable' USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW."status" = 'CANCELLED' THEN
    IF OLD."status" <> 'OPEN'
      OR NEW."organizationId" IS DISTINCT FROM OLD."organizationId"
      OR NEW."invoiceId" IS DISTINCT FROM OLD."invoiceId"
      OR NEW."dealId" IS DISTINCT FROM OLD."dealId"
      OR NEW."originalAmountMinor" IS DISTINCT FROM OLD."originalAmountMinor"
      OR NEW."outstandingMinor" IS DISTINCT FROM OLD."originalAmountMinor"
      OR NEW."currency" IS DISTINCT FROM OLD."currency"
      OR NEW."issuedAt" IS DISTINCT FROM OLD."issuedAt"
      OR NEW."dueAt" IS DISTINCT FROM OLD."dueAt"
      OR EXISTS (SELECT 1 FROM "PaymentRecord" p WHERE p."organizationId" = OLD."organizationId" AND p."receivableId" = OLD."id") THEN
      RAISE EXCEPTION 'receivable cancellation is not allowed' USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "Receivable_cancellation_guard"
BEFORE UPDATE ON "Receivable" FOR EACH ROW
EXECUTE FUNCTION "ef233_guard_receivable_cancellation"();

CREATE INDEX "Receivable_organizationId_status_dueAt_id_idx"
  ON "Receivable"("organizationId", "status", "dueAt", "id");
