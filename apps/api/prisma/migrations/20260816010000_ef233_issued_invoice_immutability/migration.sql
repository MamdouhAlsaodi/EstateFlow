CREATE FUNCTION "ef233_reject_issued_invoice_update"()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD."issuedAt" IS NOT NULL
    AND (
      NEW."amountMinor" IS DISTINCT FROM OLD."amountMinor"
      OR NEW."currency" IS DISTINCT FROM OLD."currency"
      OR NEW."organizationId" IS DISTINCT FROM OLD."organizationId"
      OR NEW."dealId" IS DISTINCT FROM OLD."dealId"
      OR NEW."draftCreatedBy" IS DISTINCT FROM OLD."draftCreatedBy"
      OR NEW."draftCreatedAt" IS DISTINCT FROM OLD."draftCreatedAt"
      OR NEW."issuedBy" IS DISTINCT FROM OLD."issuedBy"
      OR NEW."issuedAt" IS DISTINCT FROM OLD."issuedAt"
      OR NEW."dueAt" IS DISTINCT FROM OLD."dueAt"
      OR NEW."status" IS DISTINCT FROM OLD."status"
    )
  THEN
    RAISE EXCEPTION 'issued invoice snapshot is immutable'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER "Invoice_issued_immutability"
BEFORE UPDATE ON "Invoice"
FOR EACH ROW
EXECUTE FUNCTION "ef233_reject_issued_invoice_update"();
