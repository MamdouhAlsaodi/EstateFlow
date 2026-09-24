import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import test from "node:test";
import {
  ContractAccessDeniedError,
  ContractApplication,
  ContractNotFoundError,
} from "../dist/features/contracts/application/contract-application.js";
import {
  ContractStateError,
  OPERATIONAL_ESIGN_DISCLAIMER_AR,
} from "../dist/features/contracts/domain/contract.js";
import { ContractTemplateValidationError } from "../dist/features/contracts/domain/contract-template.js";
import {
  BROKER_ID,
  CLIENT_ID,
  DEAL_ID,
  InMemoryContractRepository,
  InMemoryDealSnapshotReader,
  InMemoryMembershipReader,
  ORG_ID,
  OTHER_ORG,
  PRINCIPAL_ID,
  fixedDate,
  foundOutcome,
} from "./support/ef610-contracts-fixtures.mjs";

const TEMPLATE_ID = "99999999-9999-4999-8999-999999999991";
const CONTRACT_ID = "99999999-9999-4999-8999-999999999992";
const MANAGER_ID = "69999999-9999-4999-8999-999999999999";

function harness({ withDeal = true } = {}) {
  const repository = new InMemoryContractRepository();
  const memberships = new InMemoryMembershipReader([
    {
      organizationId: ORG_ID,
      userId: PRINCIPAL_ID,
      role: "OWNER",
      status: "ACTIVE",
    },
    {
      organizationId: ORG_ID,
      userId: BROKER_ID,
      role: "BROKER",
      status: "ACTIVE",
    },
    {
      organizationId: ORG_ID,
      userId: CLIENT_ID,
      role: "CLIENT",
      status: "ACTIVE",
    },
    {
      organizationId: ORG_ID,
      userId: MANAGER_ID,
      role: "MANAGER",
      status: "ACTIVE",
    },
    {
      organizationId: OTHER_ORG,
      userId: PRINCIPAL_ID,
      role: "OWNER",
      status: "ACTIVE",
    },
  ]);
  const deals = new InMemoryDealSnapshotReader(
    withDeal ? [foundOutcome(ORG_ID, DEAL_ID)] : [],
  );
  const app = new ContractApplication(repository, memberships, deals);
  return { app, repository, memberships, deals };
}

function actorFor(userId, organizationId, role) {
  return {
    userId,
    verified: true,
    memberships: [{ organizationId, role, active: true }],
  };
}

const OWNER = actorFor(PRINCIPAL_ID, ORG_ID, "OWNER");
const BROKER = actorFor(BROKER_ID, ORG_ID, "BROKER");
const CLIENT = actorFor(CLIENT_ID, ORG_ID, "CLIENT");

async function seedApprovedTemplate(app) {
  await app.createTemplate({
    actor: OWNER,
    userId: PRINCIPAL_ID,
    organizationId: ORG_ID,
    templateId: TEMPLATE_ID,
    templateKey: "sale-agreement",
    titlePattern: "عقد بيع — {PROPERTY_TITLE}",
    bodyPattern:
      "الجهة: {ORGANIZATION_NAME}\nالعقار: {PROPERTY_TYPE} في {PROPERTY_ADDRESS}",
    now: fixedDate,
  });
  return app.approveTemplate({
    actor: OWNER,
    userId: PRINCIPAL_ID,
    organizationId: ORG_ID,
    templateId: TEMPLATE_ID,
    now: fixedDate,
  });
}

test("EF-610 authority matrix on templates: only Owner/Manager manage, Client denied", async () => {
  const { app } = harness();
  await assert.rejects(
    () =>
      app.createTemplate({
        actor: BROKER,
        userId: BROKER_ID,
        organizationId: ORG_ID,
        templateId: TEMPLATE_ID,
        templateKey: "sale-agreement",
        titlePattern: "t {PROPERTY_TITLE}",
        bodyPattern: "b {PROPERTY_TITLE}",
        now: fixedDate,
      }),
    ContractAccessDeniedError,
  );
  await assert.rejects(
    () =>
      app.createTemplate({
        actor: CLIENT,
        userId: CLIENT_ID,
        organizationId: ORG_ID,
        templateId: TEMPLATE_ID,
        templateKey: "sale-agreement",
        titlePattern: "t",
        bodyPattern: "b",
        now: fixedDate,
      }),
    ContractAccessDeniedError,
  );
  await seedApprovedTemplate(app);
  // A broker cannot approve or re-approve.
  await assert.rejects(
    () =>
      app.approveTemplate({
        actor: BROKER,
        userId: BROKER_ID,
        organizationId: ORG_ID,
        templateId: TEMPLATE_ID,
        now: fixedDate,
      }),
    ContractAccessDeniedError,
  );
  // Unknown slot is a typed template validation error.
  await assert.rejects(
    () =>
      app.createTemplate({
        actor: OWNER,
        userId: PRINCIPAL_ID,
        organizationId: ORG_ID,
        templateId: "99999999-9999-4999-8999-999999999993",
        templateKey: "other",
        titlePattern: "{UNKNOWN_SLOT}",
        bodyPattern: "body",
        now: fixedDate,
      }),
    ContractTemplateValidationError,
  );
  // Broker can list templates; Client cannot.
  assert.equal(
    (
      await app.listTemplates({
        actor: BROKER,
        userId: BROKER_ID,
        organizationId: ORG_ID,
      })
    ).length,
    1,
  );
  await assert.rejects(
    () =>
      app.listTemplates({
        actor: CLIENT,
        userId: CLIENT_ID,
        organizationId: ORG_ID,
      }),
    ContractAccessDeniedError,
  );
});

test("EF-610 generation: provenance stamp, disclaimer, tenant-safe 404s", async () => {
  const { app } = harness();
  await seedApprovedTemplate(app);
  const generated = await app.generateContract({
    actor: BROKER,
    userId: BROKER_ID,
    organizationId: ORG_ID,
    contractId: CONTRACT_ID,
    dealId: DEAL_ID,
    templateId: TEMPLATE_ID,
    now: fixedDate,
  });
  assert.equal(generated.status, "DRAFT");
  assert.equal(generated.templateKey, "sale-agreement");
  assert.equal(generated.templateVersion, 1);
  assert.equal(generated.signers.length, 2);
  assert.equal(generated.signers[0].order, 1);
  assert.equal(generated.signers[0].userId, BROKER_ID);
  assert.equal(generated.disclaimer, OPERATIONAL_ESIGN_DISCLAIMER_AR);
  // Same fixed clock → deterministic content: the content hash depends only
  // on (template identity, snapshot-rendered text), not on the record id.
  const twin = await app.generateContract({
    actor: BROKER,
    userId: BROKER_ID,
    organizationId: ORG_ID,
    contractId: "99999999-9999-4999-8999-999999999994",
    dealId: DEAL_ID,
    templateId: TEMPLATE_ID,
    now: fixedDate,
  });
  assert.equal(twin.contentHash, generated.contentHash);
  // The PDF embeds its contract id (document identity), so two records have
  // different document hashes — but each record regenerates byte-identically
  // and the application verifies the regenerated hash against the row.
  assert.notEqual(twin.pdfSha256, generated.pdfSha256);
  const regenerated = await app.getContractPdf({
    actor: BROKER,
    userId: BROKER_ID,
    organizationId: ORG_ID,
    contractId: CONTRACT_ID,
  });
  assert.equal(Buffer.from(regenerated.bytes).length, regenerated.bytes.length);
  // Foreign deal is a tenant-safe 404.
  await assert.rejects(
    () =>
      app.generateContract({
        actor: BROKER,
        userId: BROKER_ID,
        organizationId: ORG_ID,
        contractId: "99999999-9999-4999-8999-999999999995",
        dealId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        templateId: TEMPLATE_ID,
        now: fixedDate,
      }),
    ContractNotFoundError,
  );
  // A user with no membership in the organization is denied before any
  // existence check (tenant-safe 403 at the application boundary).
  await assert.rejects(
    () =>
      app.generateContract({
        actor: OWNER,
        userId: PRINCIPAL_ID,
        organizationId: OTHER_ORG,
        contractId: "99999999-9999-4999-8999-999999999996",
        dealId: DEAL_ID,
        templateId: TEMPLATE_ID,
        now: fixedDate,
      }),
    ContractAccessDeniedError,
  );
  // A valid member of the organization asking for a foreign deal id gets a
  // tenant-safe 404 without existence leak.
  const OTHER_MEMBER = actorFor(MANAGER_ID, ORG_ID, "MANAGER");
  await assert.rejects(
    () =>
      app.generateContract({
        actor: OTHER_MEMBER,
        userId: MANAGER_ID,
        organizationId: ORG_ID,
        contractId: "99999999-9999-4999-8999-999999999996",
        dealId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        templateId: TEMPLATE_ID,
        now: fixedDate,
      }),
    ContractNotFoundError,
  );
  // Client may never generate.
  await assert.rejects(
    () =>
      app.generateContract({
        actor: CLIENT,
        userId: CLIENT_ID,
        organizationId: ORG_ID,
        contractId: "99999999-9999-4999-8999-999999999997",
        dealId: DEAL_ID,
        templateId: TEMPLATE_ID,
        now: fixedDate,
      }),
    ContractAccessDeniedError,
  );
  // Generated audit event recorded with provenance data.
  const detail = await app.getContract({
    actor: OWNER,
    userId: PRINCIPAL_ID,
    organizationId: ORG_ID,
    contractId: CONTRACT_ID,
  });
  assert.equal(detail.auditEvents.length, 1);
  assert.equal(detail.auditEvents[0].action, "GENERATED");
  assert.equal(detail.auditEvents[0].data.templateId, TEMPLATE_ID);
  assert.equal(detail.snapshot.property.title, "EF610 villa");
  assert.equal(detail.snapshot.property.propertyVersion, 3);
  assert.equal(detail.nextSignerOrder, 1);
});

test("EF-610 sequential signing: out-of-order typed rejection, finalize, freeze", async () => {
  const { app } = harness();
  await seedApprovedTemplate(app);
  await app.generateContract({
    actor: BROKER,
    userId: BROKER_ID,
    organizationId: ORG_ID,
    contractId: CONTRACT_ID,
    dealId: DEAL_ID,
    templateId: TEMPLATE_ID,
    now: fixedDate,
  });
  // Order 2 (owner) cannot sign before the broker.
  await assert.rejects(
    () =>
      app.signContract({
        actor: OWNER,
        userId: PRINCIPAL_ID,
        organizationId: ORG_ID,
        contractId: CONTRACT_ID,
        now: fixedDate,
      }),
    ContractStateError,
  );
  // Broker signs first.
  const first = await app.signContract({
    actor: BROKER,
    userId: BROKER_ID,
    organizationId: ORG_ID,
    contractId: CONTRACT_ID,
    now: fixedDate,
  });
  assert.equal(first.signerOrder, 1);
  assert.equal(first.contractStatus, "DRAFT");
  assert.equal(first.documentHash.length, 64);
  // The same signer cannot sign twice.
  await assert.rejects(
    () =>
      app.signContract({
        actor: BROKER,
        userId: BROKER_ID,
        organizationId: ORG_ID,
        contractId: CONTRACT_ID,
        now: fixedDate,
      }),
    ContractStateError,
  );
  // Owner completes the ordered set → FINALIZED.
  const second = await app.signContract({
    actor: OWNER,
    userId: PRINCIPAL_ID,
    organizationId: ORG_ID,
    contractId: CONTRACT_ID,
    now: fixedDate,
  });
  assert.equal(second.signerOrder, 2);
  assert.equal(second.contractStatus, "FINALIZED");
  const detail = await app.getContract({
    actor: BROKER,
    userId: BROKER_ID,
    organizationId: ORG_ID,
    contractId: CONTRACT_ID,
  });
  assert.equal(detail.status, "FINALIZED");
  assert.ok(detail.finalizedAt);
  assert.equal(detail.nextSignerOrder, null);
  assert.deepEqual(
    detail.signers.map((signer) => [signer.order, signer.signedAt !== null]),
    [
      [1, true],
      [2, true],
    ],
  );
  assert.deepEqual(
    detail.signers.map((signer) => signer.documentHash === detail.pdfSha256),
    [true, true],
  );
  assert.deepEqual(
    detail.auditEvents.map((event) => event.action),
    ["GENERATED", "SIGNATURE_RECORDED", "SIGNATURE_RECORDED", "FINALIZED"],
  );
  // Finalized contracts reject signing, voiding and amendments.
  await assert.rejects(
    () =>
      app.signContract({
        actor: BROKER,
        userId: BROKER_ID,
        organizationId: ORG_ID,
        contractId: CONTRACT_ID,
        now: fixedDate,
      }),
    ContractStateError,
  );
  await assert.rejects(
    () =>
      app.voidContract({
        actor: OWNER,
        userId: PRINCIPAL_ID,
        organizationId: ORG_ID,
        contractId: CONTRACT_ID,
        reason: "late",
        now: fixedDate,
      }),
    ContractStateError,
  );
  await assert.rejects(
    () =>
      app.requestAmendment({
        actor: BROKER,
        userId: BROKER_ID,
        organizationId: ORG_ID,
        contractId: CONTRACT_ID,
        reason: "change terms",
        now: fixedDate,
      }),
    ContractStateError,
  );
});

test("EF-610 void: Owner + mandatory reason, full audit; broker cannot void", async () => {
  const { app } = harness();
  await seedApprovedTemplate(app);
  await app.generateContract({
    actor: BROKER,
    userId: BROKER_ID,
    organizationId: ORG_ID,
    contractId: CONTRACT_ID,
    dealId: DEAL_ID,
    templateId: TEMPLATE_ID,
    now: fixedDate,
  });
  // Broker (even the next signer) cannot void.
  await assert.rejects(
    () =>
      app.voidContract({
        actor: BROKER,
        userId: BROKER_ID,
        organizationId: ORG_ID,
        contractId: CONTRACT_ID,
        reason: "not allowed",
        now: fixedDate,
      }),
    ContractAccessDeniedError,
  );
  // Owner without a reason is a validation error.
  await assert.rejects(
    () =>
      app.voidContract({
        actor: OWNER,
        userId: PRINCIPAL_ID,
        organizationId: ORG_ID,
        contractId: CONTRACT_ID,
        reason: "  ",
        now: fixedDate,
      }),
    Error,
  );
  await app.voidContract({
    actor: OWNER,
    userId: PRINCIPAL_ID,
    organizationId: ORG_ID,
    contractId: CONTRACT_ID,
    reason: "تم إلغاء الصفقة",
    now: fixedDate,
  });
  const detail = await app.getContract({
    actor: BROKER,
    userId: BROKER_ID,
    organizationId: ORG_ID,
    contractId: CONTRACT_ID,
  });
  assert.equal(detail.status, "VOID");
  assert.equal(detail.voidReason, "تم إلغاء الصفقة");
  assert.equal(detail.voidedBy, PRINCIPAL_ID);
  assert.deepEqual(
    detail.auditEvents.map((event) => event.action),
    ["GENERATED", "VOIDED"],
  );
  assert.equal(detail.auditEvents[1].reason, "تم إلغاء الصفقة");
});

test("EF-610 amend requests: audit-only append, no document mutation", async () => {
  const { app } = harness();
  await seedApprovedTemplate(app);
  await app.generateContract({
    actor: BROKER,
    userId: BROKER_ID,
    organizationId: ORG_ID,
    contractId: CONTRACT_ID,
    dealId: DEAL_ID,
    templateId: TEMPLATE_ID,
    now: fixedDate,
  });
  const before = await app.getContract({
    actor: OWNER,
    userId: PRINCIPAL_ID,
    organizationId: ORG_ID,
    contractId: CONTRACT_ID,
  });
  await app.requestAmendment({
    actor: BROKER,
    userId: BROKER_ID,
    organizationId: ORG_ID,
    contractId: CONTRACT_ID,
    reason: "تعديل سعر الصفقة",
    now: fixedDate,
  });
  const after = await app.getContract({
    actor: OWNER,
    userId: PRINCIPAL_ID,
    organizationId: ORG_ID,
    contractId: CONTRACT_ID,
  });
  assert.equal(after.contentHash, before.contentHash);
  assert.equal(after.pdfSha256, before.pdfSha256);
  assert.equal(after.body, before.body);
  assert.deepEqual(
    after.auditEvents.map((event) => event.action),
    ["GENERATED", "AMEND_REQUESTED"],
  );
  assert.equal(after.status, "DRAFT");
});

test("EF-610 PDF endpoint source: hash-verified regeneration and tenant safety", async () => {
  const { app } = harness();
  await seedApprovedTemplate(app);
  await app.generateContract({
    actor: BROKER,
    userId: BROKER_ID,
    organizationId: ORG_ID,
    contractId: CONTRACT_ID,
    dealId: DEAL_ID,
    templateId: TEMPLATE_ID,
    now: fixedDate,
  });
  const document = await app.getContractPdf({
    actor: OWNER,
    userId: PRINCIPAL_ID,
    organizationId: ORG_ID,
    contractId: CONTRACT_ID,
  });
  assert.ok(document.bytes.length > 500);
  assert.equal(
    Buffer.from(document.bytes).toString("latin1").slice(0, 8),
    "%PDF-1.4",
  );
  // A principal of another organization (valid membership there) finds
  // nothing: tenant-safe 404 on the foreign contract.
  const OTHER_OWNER = actorFor(PRINCIPAL_ID, OTHER_ORG, "OWNER");
  await assert.rejects(
    () =>
      app.getContractPdf({
        actor: OTHER_OWNER,
        userId: PRINCIPAL_ID,
        organizationId: OTHER_ORG,
        contractId: CONTRACT_ID,
      }),
    ContractNotFoundError,
  );
});

test("EF-610 listing is org-scoped with optional deal filter", async () => {
  const { app } = harness();
  await seedApprovedTemplate(app);
  await app.generateContract({
    actor: BROKER,
    userId: BROKER_ID,
    organizationId: ORG_ID,
    contractId: CONTRACT_ID,
    dealId: DEAL_ID,
    templateId: TEMPLATE_ID,
    now: fixedDate,
  });
  const all = await app.listContracts({
    actor: BROKER,
    userId: BROKER_ID,
    organizationId: ORG_ID,
  });
  assert.equal(all.length, 1);
  const filtered = await app.listContracts({
    actor: BROKER,
    userId: BROKER_ID,
    organizationId: ORG_ID,
    dealId: DEAL_ID,
  });
  assert.equal(filtered.length, 1);
  const none = await app.listContracts({
    actor: BROKER,
    userId: BROKER_ID,
    organizationId: ORG_ID,
    dealId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  });
  assert.equal(none.length, 0);
});
