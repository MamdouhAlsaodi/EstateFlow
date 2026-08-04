import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import process from "node:process";
import { URL } from "node:url";
import test from "node:test";
import { PrismaClient } from "@prisma/client";
import { PrismaOrganizationRepository } from "../dist/features/organizations/infrastructure/prisma-organization.repository.js";
import {
  assertTablesAreEmpty,
  cleanupDatabase,
} from "./support/cleanup-database.mjs";

const TEST_TABLES = [
  "Membership",
  "Organization",
  "User",
  "Credential",
  "SessionFamily",
  "AccessSession",
  "RefreshSession",
  "PasswordReset",
  "EmailVerification",
  "AuthAttempt",
  "AuthRateLimitEvent",
  "SecurityAuditEvent",
];

function hasGuardedTestTarget() {
  const databaseUrl = process.env.DATABASE_URL;
  if (process.env.ALLOW_DESTRUCTIVE_TESTS !== "1" || !databaseUrl) return false;
  const parsed = new URL(databaseUrl);
  return (
    ["postgres:", "postgresql:"].includes(parsed.protocol) &&
    ["127.0.0.1", "localhost", "::1"].includes(parsed.hostname) &&
    parsed.port === "55433" &&
    parsed.username === "estateflow_test" &&
    parsed.pathname === "/estateflow_test"
  );
}

test(
  "organization repository persists owner, pending broker, approval, and FK-safe empty cleanup",
  { skip: !hasGuardedTestTarget() },
  async () => {
    const prisma = new PrismaClient();
    const repository = new PrismaOrganizationRepository(prisma);
    const organizationId = randomUUID();
    const ownerId = randomUUID();
    const brokerId = randomUUID();
    const adminId = randomUUID();

    try {
      await prisma.$connect();
      await cleanupDatabase(prisma, TEST_TABLES);
      await prisma.user.createMany({
        data: [
          {
            id: ownerId,
            accountIdentifier: `ef121-owner-${randomUUID()}@example.test`,
            verifiedAt: new Date(),
          },
          {
            id: brokerId,
            accountIdentifier: `ef121-broker-${randomUUID()}@example.test`,
            verifiedAt: new Date(),
          },
          {
            id: adminId,
            accountIdentifier: `ef121-admin-${randomUUID()}@example.test`,
            verifiedAt: new Date(),
            platformRole: "PLATFORM_ADMIN",
          },
        ],
      });

      const created = await repository.createOrganizationWithOwner({
        organizationId,
        name: "EF-121 Synthetic Realty",
        ownerUserId: ownerId,
      });
      assert.equal(created.status, "created");
      assert.deepEqual(created.organization, {
        id: organizationId,
        name: "EF-121 Synthetic Realty",
      });
      assert.equal(created.membership.role, "OWNER");
      assert.equal(created.membership.status, "ACTIVE");

      const pending = await repository.createMembership({
        organizationId,
        userId: brokerId,
        role: "BROKER",
        status: "PENDING",
      });
      assert.equal(pending.status, "created");
      assert.equal(pending.membership.status, "PENDING");

      const approvedAt = new Date("2030-01-01T00:00:00.000Z");
      const approved = await repository.approvePendingBrokerMembership({
        organizationId,
        membershipId: pending.membership.id,
        approvedByUserId: adminId,
        approvedAt,
      });
      assert.equal(approved.status, "approved");
      assert.deepEqual(approved.membership, {
        id: pending.membership.id,
        organizationId,
        userId: brokerId,
        role: "BROKER",
        status: "ACTIVE",
        approvedByUserId: adminId,
        approvedAt,
      });
    } finally {
      await cleanupDatabase(prisma, TEST_TABLES);
      await assertTablesAreEmpty(prisma, TEST_TABLES);
      await prisma.$disconnect();
    }
  },
);
