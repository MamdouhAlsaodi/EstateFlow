-- EF-401 — Campaigns and attribution.
-- Campaign aggregate, audited lifecycle, append-only corrections/touches,
-- and the EF-234 expense campaign dimension graduating to a real composite
-- tenant foreign key on the campaign aggregate.

CREATE TYPE "CampaignStatus" AS ENUM ('DRAFT', 'ACTIVE', 'COMPLETED', 'CANCELLED');

CREATE TYPE "CampaignChannel" AS ENUM ('META', 'GOOGLE', 'SNAPCHAT', 'TIKTOK', 'X', 'LINKEDIN', 'PRINT', 'OUTDOOR', 'REFERRAL', 'OTHER');

CREATE TYPE "TouchChannel" AS ENUM ('WEBSITE', 'WHATSAPP', 'PHONE_CALL', 'WALK_IN', 'REFERRAL', 'META', 'GOOGLE', 'SNAPCHAT', 'TIKTOK', 'X', 'OTHER');

-- CreateTable
CREATE TABLE "Campaign" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organizationId" UUID NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "objective" VARCHAR(500) NOT NULL,
    "channel" "CampaignChannel" NOT NULL,
    "status" "CampaignStatus" NOT NULL DEFAULT 'DRAFT',
    "startsAt" TIMESTAMPTZ(6) NOT NULL,
    "endsAt" TIMESTAMPTZ(6) NOT NULL,
    "budgetPlannedMinor" BIGINT NOT NULL,
    "currency" VARCHAR(3) NOT NULL,
    "utmSource" VARCHAR(100),
    "utmMedium" VARCHAR(100),
    "utmCampaign" VARCHAR(100),
    "utmContent" VARCHAR(100),
    "utmTerm" VARCHAR(100),
    "createdBy" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "Campaign_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CampaignTransition" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organizationId" UUID NOT NULL,
    "campaignId" UUID NOT NULL,
    "fromStatus" "CampaignStatus" NOT NULL,
    "toStatus" "CampaignStatus" NOT NULL,
    "reason" VARCHAR(500),
    "actorId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CampaignTransition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CampaignBudgetCorrection" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organizationId" UUID NOT NULL,
    "campaignId" UUID NOT NULL,
    "previousMinor" BIGINT NOT NULL,
    "correctedMinor" BIGINT NOT NULL,
    "currency" VARCHAR(3) NOT NULL,
    "reason" VARCHAR(500) NOT NULL,
    "createdBy" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CampaignBudgetCorrection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CampaignPerformanceEntry" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organizationId" UUID NOT NULL,
    "campaignId" UUID NOT NULL,
    "occurredAt" TIMESTAMPTZ(6) NOT NULL,
    "impressions" INTEGER NOT NULL,
    "clicks" INTEGER NOT NULL,
    "leadsCount" INTEGER NOT NULL,
    "note" VARCHAR(500),
    "createdBy" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CampaignPerformanceEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeadTouch" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organizationId" UUID NOT NULL,
    "leadId" UUID NOT NULL,
    "campaignId" UUID,
    "channel" "TouchChannel" NOT NULL,
    "source" VARCHAR(200),
    "utmSource" VARCHAR(100),
    "utmMedium" VARCHAR(100),
    "utmCampaign" VARCHAR(100),
    "utmContent" VARCHAR(100),
    "utmTerm" VARCHAR(100),
    "occurredAt" TIMESTAMPTZ(6) NOT NULL,
    "createdBy" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LeadTouch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeadAttributionCorrection" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organizationId" UUID NOT NULL,
    "leadId" UUID NOT NULL,
    "previousCampaignId" UUID,
    "correctedCampaignId" UUID,
    "reason" VARCHAR(500) NOT NULL,
    "createdBy" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LeadAttributionCorrection_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Campaign_organizationId_id_key" ON "Campaign"("organizationId", "id");

-- CreateIndex
CREATE INDEX "Campaign_organizationId_status_idx" ON "Campaign"("organizationId", "status");

-- CreateIndex
CREATE INDEX "Campaign_organizationId_createdAt_idx" ON "Campaign"("organizationId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "CampaignTransition_organizationId_id_key" ON "CampaignTransition"("organizationId", "id");

-- CreateIndex
CREATE INDEX "CampaignTransition_organizationId_campaignId_createdAt_idx" ON "CampaignTransition"("organizationId", "campaignId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "CampaignBudgetCorrection_organizationId_id_key" ON "CampaignBudgetCorrection"("organizationId", "id");

-- CreateIndex
CREATE INDEX "CampaignBudgetCorrection_organizationId_campaignId_createdAt_idx" ON "CampaignBudgetCorrection"("organizationId", "campaignId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "CampaignPerformanceEntry_organizationId_id_key" ON "CampaignPerformanceEntry"("organizationId", "id");

-- CreateIndex
CREATE INDEX "CampaignPerformanceEntry_organizationId_campaignId_occurredAt_idx" ON "CampaignPerformanceEntry"("organizationId", "campaignId", "occurredAt");

-- CreateIndex
CREATE UNIQUE INDEX "LeadTouch_organizationId_id_key" ON "LeadTouch"("organizationId", "id");

-- CreateIndex
CREATE INDEX "LeadTouch_organizationId_leadId_occurredAt_idx" ON "LeadTouch"("organizationId", "leadId", "occurredAt");

-- CreateIndex
CREATE INDEX "LeadTouch_organizationId_campaignId_idx" ON "LeadTouch"("organizationId", "campaignId");

-- CreateIndex
CREATE UNIQUE INDEX "LeadAttributionCorrection_organizationId_id_key" ON "LeadAttributionCorrection"("organizationId", "id");

-- CreateIndex
CREATE INDEX "LeadAttributionCorrection_organizationId_leadId_createdAt_idx" ON "LeadAttributionCorrection"("organizationId", "leadId", "createdAt");

-- AddForeignKey
ALTER TABLE "Campaign" ADD CONSTRAINT "Campaign_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignTransition" ADD CONSTRAINT "CampaignTransition_organizationId_campaignId_fkey" FOREIGN KEY ("organizationId", "campaignId") REFERENCES "Campaign"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignTransition" ADD CONSTRAINT "CampaignTransition_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignBudgetCorrection" ADD CONSTRAINT "CampaignBudgetCorrection_organizationId_campaignId_fkey" FOREIGN KEY ("organizationId", "campaignId") REFERENCES "Campaign"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignBudgetCorrection" ADD CONSTRAINT "CampaignBudgetCorrection_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignPerformanceEntry" ADD CONSTRAINT "CampaignPerformanceEntry_organizationId_campaignId_fkey" FOREIGN KEY ("organizationId", "campaignId") REFERENCES "Campaign"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignPerformanceEntry" ADD CONSTRAINT "CampaignPerformanceEntry_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadTouch" ADD CONSTRAINT "LeadTouch_organizationId_campaignId_fkey" FOREIGN KEY ("organizationId", "campaignId") REFERENCES "Campaign"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadTouch" ADD CONSTRAINT "LeadTouch_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadAttributionCorrection" ADD CONSTRAINT "LeadAttributionCorrection_organizationId_correctedCampaignId_fkey" FOREIGN KEY ("organizationId", "correctedCampaignId") REFERENCES "Campaign"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadAttributionCorrection" ADD CONSTRAINT "LeadAttributionCorrection_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- EF-234 expense campaign dimension graduates to a composite tenant FK.
-- Existing opaque "campaignReference" labels cannot be resolved to campaign
-- identities, so every existing row keeps its reference text and receives a
-- NULL campaignId (nullable migration, no guessing).
ALTER TABLE "Expense" ADD COLUMN "campaignId" UUID;

-- CreateIndex
CREATE INDEX "Expense_organizationId_campaignId_idx" ON "Expense"("organizationId", "campaignId");

-- AddForeignKey
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_organizationId_campaignId_fkey" FOREIGN KEY ("organizationId", "campaignId") REFERENCES "Campaign"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- EF-401 append-only invariants: touches, audited transitions, and the two
-- correction families can never be updated or deleted. Campaign itself stays
-- mutable through its guarded lifecycle/correction commands only.
CREATE FUNCTION "ef401_reject_append_only_mutation"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'EF-401 append-only record is immutable';
END;
$$;

CREATE TRIGGER "ef401_campaign_transition_append_only"
  BEFORE UPDATE OR DELETE ON "CampaignTransition"
  FOR EACH ROW EXECUTE FUNCTION "ef401_reject_append_only_mutation"();

CREATE TRIGGER "ef401_campaign_budget_correction_append_only"
  BEFORE UPDATE OR DELETE ON "CampaignBudgetCorrection"
  FOR EACH ROW EXECUTE FUNCTION "ef401_reject_append_only_mutation"();

CREATE TRIGGER "ef401_campaign_performance_entry_append_only"
  BEFORE UPDATE OR DELETE ON "CampaignPerformanceEntry"
  FOR EACH ROW EXECUTE FUNCTION "ef401_reject_append_only_mutation"();

CREATE TRIGGER "ef401_lead_touch_append_only"
  BEFORE UPDATE OR DELETE ON "LeadTouch"
  FOR EACH ROW EXECUTE FUNCTION "ef401_reject_append_only_mutation"();

CREATE TRIGGER "ef401_lead_attribution_correction_append_only"
  BEFORE UPDATE OR DELETE ON "LeadAttributionCorrection"
  FOR EACH ROW EXECUTE FUNCTION "ef401_reject_append_only_mutation"();
