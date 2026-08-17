CREATE TABLE "CommissionPlanVersion" (
  "id" UUID NOT NULL,
  "organizationId" UUID NOT NULL,
  "version" INTEGER NOT NULL,
  "rateBps" INTEGER NOT NULL,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CommissionPlanVersion_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CommissionPlanVersion_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "CommissionPlanVersion_rate_positive" CHECK ("rateBps" > 0 AND "rateBps" <= 10000),
  CONSTRAINT "CommissionPlanVersion_version_positive" CHECK ("version" > 0)
);
CREATE UNIQUE INDEX "CommissionPlanVersion_organizationId_id_key" ON "CommissionPlanVersion"("organizationId", "id");
CREATE UNIQUE INDEX "CommissionPlanVersion_organizationId_version_key" ON "CommissionPlanVersion"("organizationId", "version");
CREATE INDEX "CommissionPlanVersion_organizationId_version_idx" ON "CommissionPlanVersion"("organizationId", "version");

CREATE TABLE "CommissionPlanRecipient" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organizationId" UUID NOT NULL,
  "planVersionId" UUID NOT NULL,
  "order" INTEGER NOT NULL,
  "kind" VARCHAR(20) NOT NULL,
  "splitBps" INTEGER NOT NULL,
  CONSTRAINT "CommissionPlanRecipient_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CommissionPlanRecipient_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "CommissionPlanRecipient_plan_fkey" FOREIGN KEY ("organizationId", "planVersionId") REFERENCES "CommissionPlanVersion"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "CommissionPlanRecipient_order_positive" CHECK ("order" > 0),
  CONSTRAINT "CommissionPlanRecipient_split_range" CHECK ("splitBps" > 0 AND "splitBps" <= 10000),
  CONSTRAINT "CommissionPlanRecipient_kind_check" CHECK ("kind" IN ('BROKER', 'OFFICE'))
);
CREATE UNIQUE INDEX "CommissionPlanRecipient_organizationId_id_key" ON "CommissionPlanRecipient"("organizationId", "id");
CREATE UNIQUE INDEX "CommissionPlanRecipient_organizationId_planVersionId_order_key" ON "CommissionPlanRecipient"("organizationId", "planVersionId", "order");
CREATE INDEX "CommissionPlanRecipient_organizationId_planVersionId_order_idx" ON "CommissionPlanRecipient"("organizationId", "planVersionId", "order");

CREATE TABLE "CommissionableValue" (
  "id" UUID NOT NULL,
  "organizationId" UUID NOT NULL,
  "dealId" UUID NOT NULL,
  "amountMinor" BIGINT NOT NULL,
  "currency" VARCHAR(3) NOT NULL,
  "capturedBy" UUID NOT NULL,
  "capturedAt" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "CommissionableValue_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CommissionableValue_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "CommissionableValue_deal_fkey" FOREIGN KEY ("organizationId", "dealId") REFERENCES "Deal"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "CommissionableValue_amount_positive" CHECK ("amountMinor" > 0),
  CONSTRAINT "CommissionableValue_currency_format" CHECK ("currency" ~ '^[A-Za-z]{3}$')
);
CREATE UNIQUE INDEX "CommissionableValue_organizationId_id_key" ON "CommissionableValue"("organizationId", "id");
CREATE UNIQUE INDEX "CommissionableValue_organizationId_dealId_key" ON "CommissionableValue"("organizationId", "dealId");

CREATE TABLE "CommissionAccrual" (
  "id" UUID NOT NULL,
  "organizationId" UUID NOT NULL,
  "dealId" UUID NOT NULL,
  "dealClosedWonEventId" UUID NOT NULL,
  "commissionableValueId" UUID NOT NULL,
  "commissionPlanVersionId" UUID NOT NULL,
  "totalAmountMinor" BIGINT NOT NULL,
  "currency" VARCHAR(3) NOT NULL,
  "status" VARCHAR(20) NOT NULL DEFAULT 'EXPECTED',
  "createdAt" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "CommissionAccrual_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CommissionAccrual_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "CommissionAccrual_deal_fkey" FOREIGN KEY ("organizationId", "dealId") REFERENCES "Deal"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "CommissionAccrual_event_fkey" FOREIGN KEY ("organizationId", "dealClosedWonEventId") REFERENCES "DealDomainEvent"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "CommissionAccrual_value_fkey" FOREIGN KEY ("organizationId", "commissionableValueId") REFERENCES "CommissionableValue"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "CommissionAccrual_plan_fkey" FOREIGN KEY ("organizationId", "commissionPlanVersionId") REFERENCES "CommissionPlanVersion"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "CommissionAccrual_total_positive_or_zero" CHECK ("totalAmountMinor" >= 0),
  CONSTRAINT "CommissionAccrual_currency_format" CHECK ("currency" ~ '^[A-Za-z]{3}$'),
  CONSTRAINT "CommissionAccrual_status_check" CHECK ("status" = 'EXPECTED')
);
CREATE UNIQUE INDEX "CommissionAccrual_organizationId_id_key" ON "CommissionAccrual"("organizationId", "id");
CREATE UNIQUE INDEX "CommissionAccrual_organizationId_dealClosedWonEventId_key" ON "CommissionAccrual"("organizationId", "dealClosedWonEventId");
CREATE INDEX "CommissionAccrual_organizationId_dealId_idx" ON "CommissionAccrual"("organizationId", "dealId");

CREATE TABLE "CommissionAccrualSplit" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organizationId" UUID NOT NULL,
  "accrualId" UUID NOT NULL,
  "order" INTEGER NOT NULL,
  "kind" VARCHAR(20) NOT NULL,
  "amountMinor" BIGINT NOT NULL,
  "currency" VARCHAR(3) NOT NULL,
  CONSTRAINT "CommissionAccrualSplit_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CommissionAccrualSplit_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "CommissionAccrualSplit_accrual_fkey" FOREIGN KEY ("organizationId", "accrualId") REFERENCES "CommissionAccrual"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "CommissionAccrualSplit_order_positive" CHECK ("order" > 0),
  CONSTRAINT "CommissionAccrualSplit_amount_nonnegative" CHECK ("amountMinor" >= 0),
  CONSTRAINT "CommissionAccrualSplit_kind_check" CHECK ("kind" IN ('BROKER', 'OFFICE')),
  CONSTRAINT "CommissionAccrualSplit_currency_format" CHECK ("currency" ~ '^[A-Za-z]{3}$')
);
CREATE UNIQUE INDEX "CommissionAccrualSplit_organizationId_id_key" ON "CommissionAccrualSplit"("organizationId", "id");
CREATE UNIQUE INDEX "CommissionAccrualSplit_organizationId_accrualId_order_key" ON "CommissionAccrualSplit"("organizationId", "accrualId", "order");
CREATE INDEX "CommissionAccrualSplit_organizationId_accrualId_order_idx" ON "CommissionAccrualSplit"("organizationId", "accrualId", "order");
