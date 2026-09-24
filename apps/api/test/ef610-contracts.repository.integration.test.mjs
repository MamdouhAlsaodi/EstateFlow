import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { randomUUID } from "node:crypto";
import process from "node:process";
import { URL } from "node:url";
import test from "node:test";
import { PrismaClient } from "@prisma/client";
import { ContractApplication } from "../dist/features/contracts/application/contract-application.js";
import { ContractNotFoundError } from "../dist/features/contracts/application/contract-application.js";
import { ContractStateError } from "../dist/features/contracts/domain/contract.js";
import { PrismaContractRepository } from "../dist/features/contracts/infrastructure/prisma-contract.repository.js";
import { PrismaDealSnapshotReader } from "../dist/features/contracts/infrastructure/prisma-deal-snapshot.reader.js";
import {
  cleanupDatabase,
  assertTablesAreEmpty,
} from "./support/cleanup-database.mjs";

const expectedPort = process.env.ESTATEFLOW_TEST_DB_PORT ?? "55433";
const guarded =
  process.env.ALLOW_DESTRUCTIVE_TESTS === "1" &&
  (() => {
    if (!process.env.DATABASE_URL) return false;
    const url = new URL(process.env.DATABASE_URL);
    return (
      ["postgres:", "postgresql:"].includes(url.protocol) &&
      ["127.0.0.1", "localhost", "::1"].includes(url.hostname) &&
      url.port === expectedPort &&
      url.username === "estateflow_test" &&
      url.pathname === "/estateflow_test"
    );
  })();

const TABLES = [
  "ContractAuditEvent",
  "ContractSignature",
  "Contract",
  "ContractTemplate",
  "Deal",
  "DealDomainEvent",
  "Property",
  "Lead",
  "Membership",
  "Organization",
  "User",
];

const now = new Date("2026-10-03T09:00:00.000Z");
const later1 = new Date("2026-10-03T09:05:00.000Z");
const later2 = new Date("2026-10-03T09:10:00.000Z");

function makeIds() {
  return {
    organizationId: randomUUID(),
    otherOrganizationId: randomUUID(),
    propertyId: randomUUID(),
    leadId: randomUUID(),
    dealId: randomUUID(),
    OWNER: randomUUID(),
    MANAGER: randomUUID(),
    BROKER: randomUUID(),
    CLIENT: randomUUID(),
  };
}

async function seed(prisma, ids) {
  const users = [
    ["OWNER", ids.OWNER],
    ["MANAGER", ids.MANAGER],
    ["BROKER", ids.BROKER],
    ["CLIENT", ids.CLIENT],
  ];
  await prisma.user.createMany({
    data: users.map(([role, id]) => ({
      id,
      accountIdentifier: `${role.toLowerCase()}-${id}@ef610.test.invalid`,
      verifiedAt: now,
    })),
  });
  await prisma.organization.createMany({
    data: [
      { id: ids.organizationId, name: "EF610 synthetic" },
      { id: ids.otherOrganizationId, name: "EF610 other" },
    ],
  });
  await prisma.membership.createMany({
    data: [
      {
        organizationId: ids.organizationId,
        userId: ids.OWNER,
        role: "OWNER",
        status: "ACTIVE",
      },
      {
        organizationId: ids.organizationId,
        userId: ids.MANAGER,
        role: "MANAGER",
        status: "ACTIVE",
      },
      {
        organizationId: ids.organizationId,
        userId: ids.BROKER,
        role: "BROKER",
        status: "ACTIVE",
      },
      {
        organizationId: ids.organizationId,
        userId: ids.CLIENT,
        role: "CLIENT",
        status: "ACTIVE",
      },
      {
        organizationId: ids.otherOrganizationId,
        userId: ids.OWNER,
        role: "OWNER",
        status: "ACTIVE",
      },
    ],
  });
  await prisma.property.create({
    data: {
      id: ids.propertyId,
      organizationId: ids.organizationId,
      title: "EF610 villa",
      propertyType: "VILLA",
      addressText: "Synthetic address",
      status: "ACTIVE",
    },
  });
  await prisma.lead.create({
    data: {
      id: ids.leadId,
      organizationId: ids.organizationId,
      ownerId: ids.OWNER,
      nextAction: "call",
      source: "synthetic",
    },
  });
  await prisma.deal.create({
    data: {
      id: ids.dealId,
      organizationId: ids.organizationId,
      leadId: ids.leadId,
      propertyId: ids.propertyId,
      brokerId: ids.BROKER,
      status: "OPEN",
    },
  });
}

function harness(prisma) {
  const repository = new PrismaContractRepository(prisma);
  const memberships = {
    async findMembership(organizationId, userId) {
      return prisma.membership.findUnique({
        where: { organizationId_userId: { organizationId, userId } },
        select: { organizationId: true, role: true, status: true },
      });
    },
  };
  const deals = new PrismaDealSnapshotReader(prisma);
  const app = new ContractApplication(repository, memberships, deals);
  return { app, repository };
}

function actorFor(userId, organizationId, role = "OWNER") {
  return {
    userId,
    verified: true,
    memberships: [{ organizationId, role, active: true }],
  };
}

const TEMPLATE_ID = () => randomUUID();
const CONTRACT_ID = () => randomUUID();

test(
  "EF-610 full contract lifecycle with deterministic hashes, ordered signatures, and immutability triggers on estateflow_test",
  { skip: !guarded },
  async () => {
    const prisma = new PrismaClient();
    const ids = makeIds();
    const { app } = harness(prisma);
    try {
      await cleanupDatabase(prisma, TABLES);
      await seed(prisma, ids);
      const OWNER = actorFor(ids.OWNER, ids.organizationId, "OWNER");
      const BROKER = actorFor(ids.BROKER, ids.organizationId, "BROKER");

      // Template: draft → approved (immutable after approval, DB trigger).
      const templateId = TEMPLATE_ID();
      await app.createTemplate({
        actor: OWNER,
        userId: ids.OWNER,
        organizationId: ids.organizationId,
        templateId,
        templateKey: "sale-agreement",
        titlePattern: "عقد بيع — {PROPERTY_TITLE}",
        bodyPattern:
          "الجهة: {ORGANIZATION_NAME}\nالعقار: {PROPERTY_TYPE} في {PROPERTY_ADDRESS}\nالصفقة: {DEAL_REFERENCE}\nالوسيط: {BROKER_REFERENCE}\nتاريخ اللقطة: {SNAPSHOT_CAPTURED_AT}",
        now,
      });
      await app.approveTemplate({
        actor: OWNER,
        userId: ids.OWNER,
        organizationId: ids.organizationId,
        templateId,
        now,
      });
      const templateRow = await prisma.contractTemplate.findUnique({
        where: {
          organizationId_id: {
            organizationId: ids.organizationId,
            id: templateId,
          },
        },
      });
      assert.equal(templateRow.status, "APPROVED");
      await assert.rejects(
        () =>
          prisma.$executeRawUnsafe(
            `UPDATE "ContractTemplate" SET "titlePattern" = 'tampered' WHERE "id" = $1::uuid`,
            templateId,
          ),
        /approved contract template is immutable/,
      );

      // Generation #1 — deterministic content from (template, snapshot).
      const contractId = CONTRACT_ID();
      const generated = await app.generateContract({
        actor: BROKER,
        userId: ids.BROKER,
        organizationId: ids.organizationId,
        contractId,
        dealId: ids.dealId,
        templateId,
        now,
      });
      assert.equal(generated.status, "DRAFT");
      assert.equal(generated.signers[0].order, 1);
      assert.equal(generated.signers[0].userId, ids.BROKER);
      assert.equal(generated.signers[1].userId, ids.OWNER);
      assert.ok(generated.title.includes("EF610 villa"));
      assert.ok(generated.pdfSha256.length === 64);
      const row = await prisma.contract.findUnique({
        where: {
          organizationId_id: {
            organizationId: ids.organizationId,
            id: contractId,
          },
        },
      });
      assert.equal(row.contentHash, generated.contentHash);
      assert.equal(row.pdfSha256, generated.pdfSha256);
      assert.equal(row.snapshot.property.propertyVersion, 1);
      assert.equal(row.snapshot.deal.status, "OPEN");

      // Generation #2 — different contract id → different document hash,
      // but identical content hash (template + snapshot only).
      const twinId = CONTRACT_ID();
      const twin = await app.generateContract({
        actor: BROKER,
        userId: ids.BROKER,
        organizationId: ids.organizationId,
        contractId: twinId,
        dealId: ids.dealId,
        templateId,
        now,
      });
      assert.equal(twin.contentHash, generated.contentHash);
      assert.notEqual(twin.pdfSha256, generated.pdfSha256);

      // Immutability trigger: content/snapshot/provenance can never change.
      await assert.rejects(
        () =>
          prisma.$executeRawUnsafe(
            `UPDATE "Contract" SET "body" = 'tampered' WHERE "id" = $1::uuid`,
            contractId,
          ),
        /immutable/,
      );
      await assert.rejects(
        () =>
          prisma.$executeRawUnsafe(
            `UPDATE "Contract" SET "snapshot" = '{"schemaVersion":1}'::jsonb WHERE "id" = $1::uuid`,
            contractId,
          ),
        /immutable/,
      );
      await assert.rejects(
        () =>
          prisma.$executeRawUnsafe(
            `DELETE FROM "Contract" WHERE "id" = $1::uuid`,
            contractId,
          ),
        /append-only/,
      );

      // Sequential signing at the database level: out-of-order raw inserts
      // are rejected by the insert trigger.
      await assert.rejects(
        () =>
          prisma.$executeRawUnsafe(
            `INSERT INTO "ContractSignature" ("id", "organizationId", "contractId", "signerOrder", "signerUserId", "signerRole", "documentHash", "signedAt")
             VALUES ($1::uuid, $2::uuid, $3::uuid, 2, $4::uuid, 'OWNER', $5, $6)`,
            randomUUID(),
            ids.organizationId,
            contractId,
            ids.OWNER,
            generated.pdfSha256,
            now,
          ),
        /out of order/,
      );
      await assert.rejects(
        () =>
          prisma.$executeRawUnsafe(
            `INSERT INTO "ContractSignature" ("id", "organizationId", "contractId", "signerOrder", "signerUserId", "signerRole", "documentHash", "signedAt")
             VALUES ($1::uuid, $2::uuid, $3::uuid, 1, $4::uuid, 'BROKER', $5, $6)`,
            randomUUID(),
            ids.organizationId,
            contractId,
            ids.MANAGER, // wrong signer for order 1
            generated.pdfSha256,
            now,
          ),
        /does not match the declared ordered signer/,
      );
      await assert.rejects(
        () =>
          prisma.$executeRawUnsafe(
            `INSERT INTO "ContractSignature" ("id", "organizationId", "contractId", "signerOrder", "signerUserId", "signerRole", "documentHash", "signedAt")
             VALUES ($1::uuid, $2::uuid, $3::uuid, 1, $4::uuid, 'BROKER', $5, $6)`,
            randomUUID(),
            ids.organizationId,
            contractId,
            ids.BROKER,
            "0".repeat(64), // wrong document hash
            now,
          ),
        /document hash mismatch/,
      );

      // Application-level typed out-of-order rejection (owner tries first).
      await assert.rejects(
        () =>
          app.signContract({
            actor: OWNER,
            userId: ids.OWNER,
            organizationId: ids.organizationId,
            contractId,
            now: later1,
          }),
        ContractStateError,
      );

      // Ordered signing → finalize.
      const first = await app.signContract({
        actor: BROKER,
        userId: ids.BROKER,
        organizationId: ids.organizationId,
        contractId,
        now: later1,
      });
      assert.equal(first.signerOrder, 1);
      assert.equal(first.contractStatus, "DRAFT");
      const second = await app.signContract({
        actor: OWNER,
        userId: ids.OWNER,
        organizationId: ids.organizationId,
        contractId,
        now: later2,
      });
      assert.equal(second.contractStatus, "FINALIZED");

      const finalizedRow = await prisma.contract.findUnique({
        where: {
          organizationId_id: {
            organizationId: ids.organizationId,
            id: contractId,
          },
        },
      });
      assert.equal(finalizedRow.status, "FINALIZED");
      assert.ok(finalizedRow.finalizedAt);
      // Finalized rows are fully frozen — even the status cannot move.
      await assert.rejects(
        () =>
          prisma.$executeRawUnsafe(
            `UPDATE "Contract" SET "status" = 'VOID'::"ContractStatus", "voidedBy" = $2::uuid, "voidedAt" = $3, "voidReason" = 'x' WHERE "id" = $1::uuid`,
            contractId,
            ids.OWNER,
            later2,
          ),
        /finalized or voided contract is immutable/,
      );

      // Signatures are append-only.
      await assert.rejects(
        () =>
          prisma.$executeRawUnsafe(
            `UPDATE "ContractSignature" SET "signedAt" = $2 WHERE "contractId" = $1::uuid`,
            contractId,
            now,
          ),
        /append-only/,
      );
      await assert.rejects(
        () =>
          prisma.$executeRawUnsafe(
            `DELETE FROM "ContractSignature" WHERE "contractId" = $1::uuid`,
            contractId,
          ),
        /append-only/,
      );

      // Audit trail: every lifecycle action present, append-only enforced.
      const auditRows = await prisma.contractAuditEvent.findMany({
        where: { organizationId: ids.organizationId, contractId },
        orderBy: { createdAt: "asc" },
      });
      assert.deepEqual(
        auditRows.map((event) => event.action),
        ["GENERATED", "SIGNATURE_RECORDED", "SIGNATURE_RECORDED", "FINALIZED"],
      );
      assert.equal(auditRows[0].data.templateId, templateId);
      await assert.rejects(
        () =>
          prisma.$executeRawUnsafe(
            `UPDATE "ContractAuditEvent" SET "reason" = 'tampered' WHERE "contractId" = $1::uuid`,
            contractId,
          ),
        /append-only/,
      );
      await assert.rejects(
        () =>
          prisma.$executeRawUnsafe(
            `DELETE FROM "ContractAuditEvent" WHERE "contractId" = $1::uuid`,
            contractId,
          ),
        /append-only/,
      );

      // The finalized document still regenerates byte-identically.
      const detail = await app.getContract({
        actor: OWNER,
        userId: ids.OWNER,
        organizationId: ids.organizationId,
        contractId,
      });
      assert.equal(detail.status, "FINALIZED");
      assert.equal(detail.contentHash, generated.contentHash);

      // Deterministic PDF regeneration for both drafts and finalized rows.
      for (const id of [contractId, twinId]) {
        const document = await app.getContractPdf({
          actor: OWNER,
          userId: ids.OWNER,
          organizationId: ids.organizationId,
          contractId: id,
        });
        const stored = await prisma.contract.findUnique({
          where: {
            organizationId_id: { organizationId: ids.organizationId, id },
          },
          select: { pdfSha256: true, pdfByteSize: true },
        });
        assert.equal(Buffer.from(document.bytes).length, stored.pdfByteSize);
        const { createHash } = await import("node:crypto");
        assert.equal(
          createHash("sha256").update(document.bytes).digest("hex"),
          stored.pdfSha256,
        );
      }

      // Tenant isolation: a member of the other organization cannot see,
      // sign, or mutate the contract; foreign ids are 404-equivalents.
      const OTHER_OWNER = actorFor(ids.OWNER, ids.otherOrganizationId, "OWNER");
      await assert.rejects(
        () =>
          app.getContract({
            actor: OTHER_OWNER,
            userId: ids.OWNER,
            organizationId: ids.otherOrganizationId,
            contractId,
          }),
        ContractNotFoundError,
      );
      await assert.rejects(
        () =>
          app.signContract({
            actor: OTHER_OWNER,
            userId: ids.OWNER,
            organizationId: ids.otherOrganizationId,
            contractId,
            now: later2,
          }),
        ContractNotFoundError,
      );
      const otherRows = await prisma.contract.findMany({
        where: { organizationId: ids.otherOrganizationId },
      });
      assert.equal(otherRows.length, 0);

      // Authority: Client cannot read or generate; Manager cannot void.
      const CLIENT = actorFor(ids.CLIENT, ids.organizationId, "CLIENT");
      await assert.rejects(
        () =>
          app.getContract({
            actor: CLIENT,
            userId: ids.CLIENT,
            organizationId: ids.organizationId,
            contractId,
          }),
        Error,
      );
    } finally {
      await prisma.$disconnect();
    }
  },
);

test(
  "EF-610 void leaves owner+reason audit trail and freezes the row on estateflow_test",
  { skip: !guarded },
  async () => {
    const prisma = new PrismaClient();
    const ids = makeIds();
    const { app } = harness(prisma);
    try {
      await cleanupDatabase(prisma, TABLES);
      await seed(prisma, ids);
      const OWNER = actorFor(ids.OWNER, ids.organizationId, "OWNER");
      const BROKER = actorFor(ids.BROKER, ids.organizationId, "BROKER");
      const templateId = TEMPLATE_ID();
      await app.createTemplate({
        actor: OWNER,
        userId: ids.OWNER,
        organizationId: ids.organizationId,
        templateId,
        templateKey: "lease-agreement",
        titlePattern: "عقد إيجار — {PROPERTY_TITLE}",
        bodyPattern: "المؤجر: {ORGANIZATION_NAME}",
        now,
      });
      await app.approveTemplate({
        actor: OWNER,
        userId: ids.OWNER,
        organizationId: ids.organizationId,
        templateId,
        now,
      });
      const contractId = CONTRACT_ID();
      await app.generateContract({
        actor: BROKER,
        userId: ids.BROKER,
        organizationId: ids.organizationId,
        contractId,
        dealId: ids.dealId,
        templateId,
        now,
      });
      // Broker cannot void; Owner voids with a mandatory reason.
      await assert.rejects(
        () =>
          app.voidContract({
            actor: BROKER,
            userId: ids.BROKER,
            organizationId: ids.organizationId,
            contractId,
            reason: "not allowed",
            now: later1,
          }),
        Error,
      );
      await app.voidContract({
        actor: OWNER,
        userId: ids.OWNER,
        organizationId: ids.organizationId,
        contractId,
        reason: "تم إلغاء الصفقة من المالك",
        now: later1,
      });
      const auditRows = await prisma.contractAuditEvent.findMany({
        where: { organizationId: ids.organizationId, contractId },
        orderBy: { createdAt: "asc" },
      });
      assert.deepEqual(
        auditRows.map((event) => event.action),
        ["GENERATED", "VOIDED"],
      );
      assert.equal(auditRows[1].reason, "تم إلغاء الصفقة من المالك");
      assert.equal(auditRows[1].actorId, ids.OWNER);
      const voidedRow = await prisma.contract.findUnique({
        where: {
          organizationId_id: {
            organizationId: ids.organizationId,
            id: contractId,
          },
        },
      });
      assert.equal(voidedRow.status, "VOID");
      assert.equal(voidedRow.voidReason, "تم إلغاء الصفقة من المالك");
      // Voided rows are frozen.
      await assert.rejects(
        () =>
          prisma.$executeRawUnsafe(
            `UPDATE "Contract" SET "voidReason" = 'changed' WHERE "id" = $1::uuid`,
            contractId,
          ),
        /finalized or voided contract is immutable/,
      );
      // Signatures can no longer be recorded against a voided contract.
      await assert.rejects(
        () =>
          prisma.$executeRawUnsafe(
            `INSERT INTO "ContractSignature" ("id", "organizationId", "contractId", "signerOrder", "signerUserId", "signerRole", "documentHash", "signedAt")
             VALUES ($1::uuid, $2::uuid, $3::uuid, 1, $4::uuid, 'BROKER', $5, $6)`,
            randomUUID(),
            ids.organizationId,
            contractId,
            ids.BROKER,
            voidedRow.pdfSha256,
            later2,
          ),
        /only while the contract is DRAFT/,
      );
    } finally {
      await prisma.$disconnect();
    }
  },
);

test(
  "EF-610 FK-safe cleanup leaves contract tables empty on estateflow_test",
  { skip: !guarded },
  async () => {
    const prisma = new PrismaClient();
    try {
      await cleanupDatabase(prisma, TABLES);
      await assertTablesAreEmpty(prisma, TABLES);
    } finally {
      await prisma.$disconnect();
    }
  },
);
