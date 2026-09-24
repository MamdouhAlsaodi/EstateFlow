import assert from "node:assert/strict";
import process from "node:process";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { PrismaClient } from "@prisma/client";
import { PrismaCampaignRepository } from "../dist/features/campaigns/infrastructure/prisma-campaign.repository.js";
import {
  cleanupDatabase,
  assertTablesAreEmpty,
} from "./support/cleanup-database.mjs";

const guarded =
  process.env.ALLOW_DESTRUCTIVE_TESTS === "1" &&
  process.env.DATABASE_URL?.includes("estateflow_test");
const tables = [
  "ContentDelivery",
  "ContentPublishJob",
  "ContentTransition",
  "ContentItem",
  "LeadAttributionCorrection",
  "LeadTouch",
  "Expense",
  "CampaignPerformanceEntry",
  "CampaignBudgetCorrection",
  "CampaignTransition",
  "Campaign",
  "Lead",
  "Membership",
  "Organization",
  "User",
];
const uuid = () => randomUUID();

function totals(rows) {
  return rows.map(({ currency, count, amountMinor }) => ({
    currency,
    count,
    amountMinor,
  }));
}

test(
  "EF-405 analytics reconciles approved spend, touches, attribution, content, and tenant boundaries",
  { skip: !guarded },
  async () => {
    const prisma = new PrismaClient();
    const now = new Date("2026-10-01T00:00:00.000Z");
    const orgA = uuid();
    const orgB = uuid();
    const userA = uuid();
    const userB = uuid();
    const campaignA1 = uuid();
    const campaignA2 = uuid();
    const campaignB1 = uuid();
    const leadA1 = uuid();
    const leadA2 = uuid();
    const leadB1 = uuid();
    try {
      await cleanupDatabase(prisma, tables);
      await prisma.organization.createMany({
        data: [
          { id: orgA, name: "A" },
          { id: orgB, name: "B" },
        ],
      });
      await prisma.user.createMany({
        data: [
          { id: userA, accountIdentifier: `a-${userA}` },
          { id: userB, accountIdentifier: `b-${userB}` },
        ],
      });
      await prisma.membership.createMany({
        data: [
          {
            organizationId: orgA,
            userId: userA,
            role: "OWNER",
            status: "ACTIVE",
          },
          {
            organizationId: orgB,
            userId: userB,
            role: "OWNER",
            status: "ACTIVE",
          },
        ],
      });
      await prisma.campaign.createMany({
        data: [
          {
            id: campaignA1,
            organizationId: orgA,
            name: "A1",
            objective: "Leads",
            channel: "META",
            startsAt: now,
            endsAt: new Date("2026-10-31T00:00:00.000Z"),
            budgetPlannedMinor: 100000n,
            currency: "SAR",
            createdBy: userA,
          },
          {
            id: campaignA2,
            organizationId: orgA,
            name: "A2",
            objective: "Leads",
            channel: "GOOGLE",
            startsAt: now,
            endsAt: new Date("2026-10-31T00:00:00.000Z"),
            budgetPlannedMinor: 200000n,
            currency: "SAR",
            createdBy: userA,
          },
          {
            id: campaignB1,
            organizationId: orgB,
            name: "B1",
            objective: "Leads",
            channel: "META",
            startsAt: now,
            endsAt: new Date("2026-10-31T00:00:00.000Z"),
            budgetPlannedMinor: 900000n,
            currency: "SAR",
            createdBy: userB,
          },
        ],
      });
      await prisma.lead.createMany({
        data: [
          {
            id: leadA1,
            organizationId: orgA,
            ownerId: userA,
            stage: "QUALIFIED",
            nextAction: "call",
            source: "meta",
          },
          {
            id: leadA2,
            organizationId: orgA,
            ownerId: userA,
            stage: "CLOSED_WON",
            nextAction: "done",
            source: "google",
          },
          {
            id: leadB1,
            organizationId: orgB,
            ownerId: userB,
            stage: "QUALIFIED",
            nextAction: "call",
            source: "meta",
          },
        ],
      });
      await prisma.leadTouch.createMany({
        data: [
          {
            id: uuid(),
            organizationId: orgA,
            leadId: leadA1,
            campaignId: campaignA1,
            channel: "META",
            occurredAt: new Date("2026-10-01T01:00:00.000Z"),
            createdBy: userA,
          },
          {
            id: uuid(),
            organizationId: orgA,
            leadId: leadA1,
            campaignId: campaignA2,
            channel: "GOOGLE",
            occurredAt: new Date("2026-10-01T02:00:00.000Z"),
            createdBy: userA,
          },
          {
            id: uuid(),
            organizationId: orgA,
            leadId: leadA2,
            campaignId: campaignA2,
            channel: "GOOGLE",
            occurredAt: new Date("2026-10-01T03:00:00.000Z"),
            createdBy: userA,
          },
          {
            id: uuid(),
            organizationId: orgB,
            leadId: leadB1,
            campaignId: campaignB1,
            channel: "META",
            occurredAt: new Date("2026-10-01T01:00:00.000Z"),
            createdBy: userB,
          },
        ],
      });
      await prisma.expense.createMany({
        data: [
          {
            id: uuid(),
            organizationId: orgA,
            category: "CAMPAIGN",
            vendorReference: "approved",
            amountMinor: 2500n,
            currency: "SAR",
            campaignReference: "A1",
            campaignId: campaignA1,
            status: "APPROVED",
            draftCreatedBy: userA,
            draftCreatedAt: now,
            submittedBy: userA,
            submittedAt: now,
            decidedBy: userB,
            decidedAt: now,
            decision: "APPROVED",
          },
          {
            id: uuid(),
            organizationId: orgA,
            category: "CAMPAIGN",
            vendorReference: "ignored",
            amountMinor: 999n,
            currency: "SAR",
            campaignId: campaignA1,
            status: "DRAFT",
            draftCreatedBy: userA,
            draftCreatedAt: now,
          },
          {
            id: uuid(),
            organizationId: orgB,
            category: "CAMPAIGN",
            vendorReference: "foreign",
            amountMinor: 7000n,
            currency: "SAR",
            campaignReference: "B1",
            campaignId: campaignB1,
            status: "APPROVED",
            draftCreatedBy: userB,
            draftCreatedAt: now,
            submittedBy: userB,
            submittedAt: now,
            decidedBy: userA,
            decidedAt: now,
            decision: "APPROVED",
          },
        ],
      });
      await prisma.contentItem.createMany({
        data: [
          {
            id: uuid(),
            organizationId: orgA,
            campaignId: campaignA1,
            title: "published",
            body: "body",
            channel: "INSTAGRAM",
            status: "PUBLISHED",
            createdBy: userA,
          },
          {
            id: uuid(),
            organizationId: orgA,
            campaignId: campaignA1,
            title: "draft",
            body: "body",
            channel: "X",
            status: "DRAFT",
            createdBy: userA,
          },
          {
            id: uuid(),
            organizationId: orgB,
            campaignId: campaignB1,
            title: "foreign",
            body: "body",
            channel: "FACEBOOK",
            status: "PUBLISHED",
            createdBy: userB,
          },
        ],
      });

      const repository = new PrismaCampaignRepository(prisma);
      const campaign = await repository.getCampaignAnalytics(orgA, campaignA1);
      assert.deepEqual(totals(campaign.plannedBudget), [
        { currency: "SAR", count: 1, amountMinor: 100000n },
      ]);
      assert.deepEqual(totals(campaign.approvedSpend), [
        { currency: "SAR", count: 1, amountMinor: 2500n },
      ]);
      assert.equal(campaign.touchCount, 1);
      assert.deepEqual(campaign.attribution.firstTouchLeadCount, 1);
      assert.deepEqual(campaign.attribution.firstTouchQualifiedLeadCount, 1);
      assert.deepEqual(campaign.attribution.lastTouchLeadCount, 0);
      assert.deepEqual(campaign.attribution.lastTouchWinCount, 0);
      assert.deepEqual(campaign.publishedContent, [
        { channel: "INSTAGRAM", count: 1 },
      ]);

      const organization = await repository.getOrganizationAnalytics(orgA);
      assert.equal(organization.campaignCount, 2);
      assert.deepEqual(totals(organization.approvedSpend), [
        { currency: "SAR", count: 1, amountMinor: 2500n },
      ]);
      assert.equal(organization.touchCount, 3);
      assert.equal(organization.attribution.firstTouchLeadCount, 2);
      assert.equal(organization.attribution.lastTouchLeadCount, 2);
      assert.deepEqual(organization.publishedContent, [
        { channel: "INSTAGRAM", count: 1 },
      ]);
      assert.notEqual(
        organization.approvedSpend[0]?.amountMinor,
        7000n,
        "foreign approved spend must not cross the tenant boundary",
      );
    } finally {
      await cleanupDatabase(prisma, tables);
      await assertTablesAreEmpty(prisma, tables);
      await prisma.$disconnect();
    }
  },
);
