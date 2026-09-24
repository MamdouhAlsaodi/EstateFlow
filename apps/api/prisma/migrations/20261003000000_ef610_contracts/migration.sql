-- EF-610: contracts — operational simple e-sign (NOT a certified legal
-- signature). Org-scoped versioned templates with approved immutable versions;
-- deterministic generation from (template version, immutable deal/property
-- snapshot); SHA-256 content/PDF hashes recorded at generation; strictly
-- sequential signatures bound to the document hash; append-only audit.
CREATE TYPE "ContractStatus" AS ENUM ('DRAFT', 'FINALIZED', 'VOID');
CREATE TYPE "ContractTemplateStatus" AS ENUM ('DRAFT', 'APPROVED');
CREATE TYPE "ContractAuditAction" AS ENUM ('GENERATED', 'AMEND_REQUESTED', 'SIGNATURE_RECORDED', 'FINALIZED', 'VOIDED');

CREATE TABLE "ContractTemplate" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organizationId" UUID NOT NULL,
    "templateKey" VARCHAR(100) NOT NULL,
    "version" INTEGER NOT NULL,
    "titlePattern" VARCHAR(200) NOT NULL,
    "bodyPattern" VARCHAR(8000) NOT NULL,
    "status" "ContractTemplateStatus" NOT NULL DEFAULT 'DRAFT',
    "createdBy" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "approvedBy" UUID,
    "approvedAt" TIMESTAMPTZ(6),

    CONSTRAINT "ContractTemplate_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ContractTemplate_version_positive" CHECK ("version" >= 1)
);

CREATE TABLE "Contract" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organizationId" UUID NOT NULL,
    "dealId" UUID NOT NULL,
    "templateId" UUID NOT NULL,
    "templateKey" VARCHAR(100) NOT NULL,
    "templateVersion" INTEGER NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "body" VARCHAR(8000) NOT NULL,
    "contentHash" CHAR(64) NOT NULL,
    "snapshot" JSONB NOT NULL,
    "pdfSha256" CHAR(64) NOT NULL,
    "pdfByteSize" INTEGER NOT NULL,
    "status" "ContractStatus" NOT NULL DEFAULT 'DRAFT',
    "generatedBy" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,
    "finalizedAt" TIMESTAMPTZ(6),
    "voidedBy" UUID,
    "voidedAt" TIMESTAMPTZ(6),
    "voidReason" VARCHAR(500),

    CONSTRAINT "Contract_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "Contract_pdf_byte_size_positive" CHECK ("pdfByteSize" > 0)
);

CREATE TABLE "ContractSignature" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organizationId" UUID NOT NULL,
    "contractId" UUID NOT NULL,
    "signerOrder" INTEGER NOT NULL,
    "signerUserId" UUID NOT NULL,
    "signerRole" VARCHAR(20) NOT NULL,
    "documentHash" CHAR(64) NOT NULL,
    "signedAt" TIMESTAMPTZ(6) NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContractSignature_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ContractSignature_order_positive" CHECK ("signerOrder" >= 1)
);

CREATE TABLE "ContractAuditEvent" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organizationId" UUID NOT NULL,
    "contractId" UUID NOT NULL,
    "action" "ContractAuditAction" NOT NULL,
    "actorId" UUID NOT NULL,
    "reason" VARCHAR(500),
    "data" JSONB,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContractAuditEvent_pkey" PRIMARY KEY ("id")
);

-- Unique/composite indexes first: the composite tenant FKs below reference them.
CREATE UNIQUE INDEX "ContractTemplate_organization_id_key" ON "ContractTemplate"("organizationId", "id");
CREATE UNIQUE INDEX "ContractTemplate_organization_templateKey_version_key" ON "ContractTemplate"("organizationId", "templateKey", "version");
CREATE INDEX "ContractTemplate_organization_status_idx" ON "ContractTemplate"("organizationId", "status");
CREATE UNIQUE INDEX "Contract_organization_id_key" ON "Contract"("organizationId", "id");
CREATE INDEX "Contract_organization_deal_status_idx" ON "Contract"("organizationId", "dealId", "status");
CREATE INDEX "Contract_organization_status_created_idx" ON "Contract"("organizationId", "status", "createdAt");
CREATE UNIQUE INDEX "ContractSignature_organization_id_key" ON "ContractSignature"("organizationId", "id");
CREATE UNIQUE INDEX "ContractSignature_organization_contract_order_key" ON "ContractSignature"("organizationId", "contractId", "signerOrder");
CREATE INDEX "ContractSignature_organization_contract_idx" ON "ContractSignature"("organizationId", "contractId");
CREATE UNIQUE INDEX "ContractAuditEvent_organization_id_key" ON "ContractAuditEvent"("organizationId", "id");
CREATE INDEX "ContractAuditEvent_organization_contract_created_idx" ON "ContractAuditEvent"("organizationId", "contractId", "createdAt");

-- Composite tenant foreign keys (organizationId first-class in every path).
ALTER TABLE "ContractTemplate" ADD CONSTRAINT "ContractTemplate_organization_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Contract" ADD CONSTRAINT "Contract_organization_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Contract" ADD CONSTRAINT "Contract_deal_fkey" FOREIGN KEY ("dealId", "organizationId") REFERENCES "Deal"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Contract" ADD CONSTRAINT "Contract_template_fkey" FOREIGN KEY ("templateId", "organizationId") REFERENCES "ContractTemplate"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ContractSignature" ADD CONSTRAINT "ContractSignature_contract_fkey" FOREIGN KEY ("contractId", "organizationId") REFERENCES "Contract"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ContractSignature" ADD CONSTRAINT "ContractSignature_organization_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ContractAuditEvent" ADD CONSTRAINT "ContractAuditEvent_contract_fkey" FOREIGN KEY ("contractId", "organizationId") REFERENCES "Contract"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ContractAuditEvent" ADD CONSTRAINT "ContractAuditEvent_organization_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Contract invariants: content/provenance/snapshot/PDF hash are immutable from
-- creation; only the DRAFT→FINALIZED and DRAFT→VOID transitions exist; FINALIZED
-- requires every ordered signature present and hash-locked to the document;
-- VOID requires owner + reason; finalized/void rows are fully immutable.
CREATE FUNCTION "ef610_reject_contract_update"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD."status" IN ('FINALIZED', 'VOID') THEN
    RAISE EXCEPTION 'finalized or voided contract is immutable';
  END IF;
  IF NEW."organizationId" <> OLD."organizationId"
     OR NEW."dealId" <> OLD."dealId"
     OR NEW."templateId" <> OLD."templateId"
     OR NEW."templateKey" <> OLD."templateKey"
     OR NEW."templateVersion" <> OLD."templateVersion"
     OR NEW."title" <> OLD."title"
     OR NEW."body" <> OLD."body"
     OR NEW."contentHash" <> OLD."contentHash"
     OR NEW."snapshot" <> OLD."snapshot"
     OR NEW."pdfSha256" <> OLD."pdfSha256"
     OR NEW."pdfByteSize" <> OLD."pdfByteSize"
     OR NEW."generatedBy" <> OLD."generatedBy"
     OR NEW."createdAt" <> OLD."createdAt" THEN
    RAISE EXCEPTION 'contract content, snapshot and provenance are immutable';
  END IF;
  IF NEW."status" = 'FINALIZED' AND OLD."status" = 'DRAFT' THEN
    IF NEW."finalizedAt" IS NULL THEN
      RAISE EXCEPTION 'finalization must record finalizedAt';
    END IF;
    IF NEW."voidedBy" IS NOT NULL OR NEW."voidedAt" IS NOT NULL OR NEW."voidReason" IS NOT NULL THEN
      RAISE EXCEPTION 'finalization must not set void fields';
    END IF;
    IF (SELECT COUNT(*) FROM "ContractSignature" s
        WHERE s."contractId" = OLD."id" AND s."organizationId" = OLD."organizationId")
       <> jsonb_array_length(OLD."snapshot" -> 'signers') THEN
      RAISE EXCEPTION 'cannot finalize before every ordered signature exists';
    END IF;
    IF EXISTS (SELECT 1 FROM "ContractSignature" s
               WHERE s."contractId" = OLD."id" AND s."organizationId" = OLD."organizationId"
                 AND s."documentHash" <> OLD."pdfSha256") THEN
      RAISE EXCEPTION 'signature document hash mismatch';
    END IF;
  ELSIF NEW."status" = 'VOID' AND OLD."status" = 'DRAFT' THEN
    IF NEW."voidedBy" IS NULL OR NEW."voidedAt" IS NULL
       OR NEW."voidReason" IS NULL OR btrim(NEW."voidReason") = '' THEN
      RAISE EXCEPTION 'void requires an actor, timestamp and reason';
    END IF;
    IF NEW."finalizedAt" IS NOT NULL THEN
      RAISE EXCEPTION 'void must not set finalizedAt';
    END IF;
  ELSE
    IF NEW."status" <> OLD."status" THEN
      RAISE EXCEPTION 'illegal contract transition % -> %', OLD."status", NEW."status";
    END IF;
    IF NEW."finalizedAt" IS DISTINCT FROM OLD."finalizedAt"
       OR NEW."voidedBy" IS DISTINCT FROM OLD."voidedBy"
       OR NEW."voidedAt" IS DISTINCT FROM OLD."voidedAt"
       OR NEW."voidReason" IS DISTINCT FROM OLD."voidReason" THEN
      RAISE EXCEPTION 'lifecycle fields change only with their transition';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "ef610_contract_immutable"
  BEFORE UPDATE ON "Contract"
  FOR EACH ROW EXECUTE FUNCTION "ef610_reject_contract_update"();

CREATE FUNCTION "ef610_reject_contract_delete"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'contracts are append-only; void instead of deleting';
END;
$$;

CREATE TRIGGER "ef610_contract_no_delete"
  BEFORE DELETE ON "Contract"
  FOR EACH ROW EXECUTE FUNCTION "ef610_reject_contract_delete"();

-- Signatures are append-only and database-validated: the contract must be
-- DRAFT, the order must be exactly next, the signer must match the snapshot
-- signer for that order, and the recorded document hash must equal the
-- contract's PDF hash.
CREATE FUNCTION "ef610_validate_signature_insert"() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  contract_row "Contract"%ROWTYPE;
  expected_signer JSONB;
  signature_count INTEGER;
BEGIN
  SELECT * INTO contract_row FROM "Contract"
   WHERE "id" = NEW."contractId" AND "organizationId" = NEW."organizationId";
  IF NOT FOUND THEN
    RAISE EXCEPTION 'signature references an unknown contract';
  END IF;
  IF contract_row."status" <> 'DRAFT' THEN
    RAISE EXCEPTION 'signatures are allowed only while the contract is DRAFT';
  END IF;
  SELECT COUNT(*) INTO signature_count FROM "ContractSignature"
   WHERE "contractId" = NEW."contractId" AND "organizationId" = NEW."organizationId";
  IF NEW."signerOrder" <> signature_count + 1 THEN
    RAISE EXCEPTION 'signature out of order: expected order %', signature_count + 1;
  END IF;
  IF NEW."signerOrder" > jsonb_array_length(contract_row."snapshot" -> 'signers') THEN
    RAISE EXCEPTION 'signature order beyond the declared signer list';
  END IF;
  SELECT sig INTO expected_signer
    FROM jsonb_array_elements(contract_row."snapshot" -> 'signers') sig
   WHERE (sig ->> 'order')::integer = NEW."signerOrder";
  IF expected_signer IS NULL
     OR expected_signer ->> 'userId' <> NEW."signerUserId"::text
     OR expected_signer ->> 'role' <> NEW."signerRole" THEN
    RAISE EXCEPTION 'signature signer does not match the declared ordered signer';
  END IF;
  IF NEW."documentHash" <> contract_row."pdfSha256" THEN
    RAISE EXCEPTION 'signature document hash mismatch';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "ef610_signature_sequential_insert"
  BEFORE INSERT ON "ContractSignature"
  FOR EACH ROW EXECUTE FUNCTION "ef610_validate_signature_insert"();

CREATE FUNCTION "ef610_reject_signature_mutation"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'contract signatures are append-only';
END;
$$;

CREATE TRIGGER "ef610_signature_append_only"
  BEFORE UPDATE OR DELETE ON "ContractSignature"
  FOR EACH ROW EXECUTE FUNCTION "ef610_reject_signature_mutation"();

-- Audit events are append-only: no update, no delete, ever.
CREATE FUNCTION "ef610_reject_audit_mutation"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'contract audit events are append-only';
END;
$$;

CREATE TRIGGER "ef610_audit_append_only"
  BEFORE UPDATE OR DELETE ON "ContractAuditEvent"
  FOR EACH ROW EXECUTE FUNCTION "ef610_reject_audit_mutation"();

-- Template invariants (EF-305 pattern): identity/content immutable; approved
-- rows fully immutable; approval must be a complete transition; history is
-- never deleted.
CREATE FUNCTION "ef610_reject_template_update"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD."status" = 'APPROVED' THEN
    RAISE EXCEPTION 'approved contract template is immutable';
  END IF;
  IF NEW."organizationId" <> OLD."organizationId"
     OR NEW."templateKey" <> OLD."templateKey"
     OR NEW."version" <> OLD."version"
     OR NEW."titlePattern" <> OLD."titlePattern"
     OR NEW."bodyPattern" <> OLD."bodyPattern"
     OR NEW."createdBy" <> OLD."createdBy"
     OR NEW."createdAt" <> OLD."createdAt" THEN
    RAISE EXCEPTION 'contract template content is immutable; create a new version';
  END IF;
  IF NEW."status" <> 'APPROVED' OR NEW."approvedBy" IS NULL OR NEW."approvedAt" IS NULL THEN
    RAISE EXCEPTION 'contract template approval must be a complete transition';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "ef610_template_immutable"
  BEFORE UPDATE ON "ContractTemplate"
  FOR EACH ROW EXECUTE FUNCTION "ef610_reject_template_update"();

CREATE FUNCTION "ef610_reject_template_delete"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'contract template history is never deleted';
END;
$$;

CREATE TRIGGER "ef610_template_no_delete"
  BEFORE DELETE ON "ContractTemplate"
  FOR EACH ROW EXECUTE FUNCTION "ef610_reject_template_delete"();
