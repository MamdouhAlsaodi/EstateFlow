CREATE TYPE "AccountType" AS ENUM ('ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'EXPENSE');
CREATE TYPE "JournalSide" AS ENUM ('DEBIT', 'CREDIT');
CREATE TYPE "JournalStatus" AS ENUM ('DRAFT', 'POSTED');
CREATE TYPE "AccountingPeriodStatus" AS ENUM ('OPEN', 'CLOSED');

CREATE TABLE "Account" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organizationId" UUID NOT NULL,
  "code" VARCHAR(64) NOT NULL,
  "name" VARCHAR(200) NOT NULL,
  "type" "AccountType" NOT NULL,
  CONSTRAINT "Account_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Account_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "Account_organizationId_id_key" ON "Account"("organizationId", "id");
CREATE UNIQUE INDEX "Account_organizationId_code_key" ON "Account"("organizationId", "code");
CREATE INDEX "Account_organizationId_type_idx" ON "Account"("organizationId", "type");

CREATE TABLE "AccountingPeriod" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organizationId" UUID NOT NULL,
  "startsAt" TIMESTAMPTZ(6) NOT NULL,
  "endsAt" TIMESTAMPTZ(6) NOT NULL,
  "status" "AccountingPeriodStatus" NOT NULL,
  CONSTRAINT "AccountingPeriod_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AccountingPeriod_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "AccountingPeriod_date_range_check" CHECK ("startsAt" <= "endsAt")
);
CREATE UNIQUE INDEX "AccountingPeriod_organizationId_id_key" ON "AccountingPeriod"("organizationId", "id");
CREATE INDEX "AccountingPeriod_organizationId_dates_status_idx" ON "AccountingPeriod"("organizationId", "startsAt", "endsAt", "status");

CREATE TABLE "JournalEntry" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organizationId" UUID NOT NULL,
  "status" "JournalStatus" NOT NULL DEFAULT 'DRAFT',
  "currency" VARCHAR(3) NOT NULL,
  "reference" VARCHAR(200) NOT NULL,
  "reason" VARCHAR(200) NOT NULL,
  "actorId" UUID NOT NULL,
  "createdAt" TIMESTAMPTZ(6) NOT NULL,
  "postedAt" TIMESTAMPTZ(6),
  "periodId" UUID,
  "reversalOfEntryId" UUID,
  CONSTRAINT "JournalEntry_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "JournalEntry_organizationId_id_key" UNIQUE ("organizationId", "id"),
  CONSTRAINT "JournalEntry_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "JournalEntry_period_fkey" FOREIGN KEY ("organizationId", "periodId") REFERENCES "AccountingPeriod"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "JournalEntry_reversal_fkey" FOREIGN KEY ("organizationId", "reversalOfEntryId") REFERENCES "JournalEntry"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "JournalEntry_status_shape_check" CHECK (("status" = 'DRAFT' AND "postedAt" IS NULL) OR ("status" = 'POSTED' AND "postedAt" IS NOT NULL))
);
CREATE INDEX "JournalEntry_organizationId_status_createdAt_idx" ON "JournalEntry"("organizationId", "status", "createdAt");
CREATE INDEX "JournalEntry_organizationId_periodId_status_idx" ON "JournalEntry"("organizationId", "periodId", "status");
CREATE INDEX "JournalEntry_organizationId_reversalOfEntryId_idx" ON "JournalEntry"("organizationId", "reversalOfEntryId");

CREATE TABLE "JournalLine" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organizationId" UUID NOT NULL,
  "entryId" UUID NOT NULL,
  "accountId" UUID NOT NULL,
  "side" "JournalSide" NOT NULL,
  "amountMinor" BIGINT NOT NULL,
  "currency" VARCHAR(3) NOT NULL,
  CONSTRAINT "JournalLine_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "JournalLine_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "JournalLine_entry_fkey" FOREIGN KEY ("organizationId", "entryId") REFERENCES "JournalEntry"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "JournalLine_account_fkey" FOREIGN KEY ("organizationId", "accountId") REFERENCES "Account"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "JournalLine_amount_positive_check" CHECK ("amountMinor" > 0),
  CONSTRAINT "JournalLine_side_check" CHECK ("side" IN ('DEBIT', 'CREDIT'))
);
CREATE INDEX "JournalLine_organizationId_entryId_idx" ON "JournalLine"("organizationId", "entryId");
CREATE INDEX "JournalLine_organizationId_accountId_idx" ON "JournalLine"("organizationId", "accountId");
