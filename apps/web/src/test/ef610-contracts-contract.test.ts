import assert from "node:assert/strict";
import test from "node:test";
import { arMessages } from "../i18n/catalog";
import {
  CONTRACT_AUDIT_LABELS,
  CONTRACT_STATUS_LABELS,
  OPERATIONAL_ESIGN_DISCLAIMER_AR,
  contractPdfUrl,
  normalizeContractDetail,
  normalizeContractList,
  normalizeContractTemplateList,
  normalizeGeneratedContract,
} from "../features/contracts/contracts-contract";

const orgId = "11111111-1111-4111-8111-111111111111";
const dealId = "33333333-3333-4333-8333-333333333333";
const templateId = "44444444-4444-4444-8444-444444444444";
const contractId = "55555555-5555-4555-8555-555555555555";
const signerId = "66666666-6666-4666-8666-666666666666";
const principalId = "77777777-7777-4777-8777-777777777777";
const eventId = "88888888-8888-4888-8888-888888888888";
const now = "2026-10-03T09:00:00.000Z";
const hash = "a".repeat(64);

const validTemplate = {
  templateId,
  templateKey: "sale-agreement",
  version: 1,
  titlePattern: "عقد بيع — {PROPERTY_TITLE}",
  bodyPattern: "الجهة: {ORGANIZATION_NAME}",
  status: "APPROVED",
  createdAt: now,
  approvedAt: now,
};

const validSummary = {
  contractId,
  dealId,
  templateKey: "sale-agreement",
  templateVersion: 1,
  title: "عقد بيع — فيلا",
  contentHash: hash,
  pdfSha256: hash.replace("a", "b"),
  status: "DRAFT",
  createdAt: now,
  finalizedAt: null,
  signatureCount: 1,
  signerTotal: 2,
};

const validDetail = {
  contractId,
  dealId,
  templateKey: "sale-agreement",
  templateVersion: 1,
  title: "عقد بيع — فيلا",
  body: "الجهة: مكتب العقارات",
  contentHash: hash,
  pdfSha256: hash.replace("a", "b"),
  status: "DRAFT",
  createdAt: now,
  finalizedAt: null,
  voidReason: null,
  snapshot: {
    schemaVersion: 1,
    capturedAt: now,
    deal: {
      dealId,
      leadId: "99999999-9999-4999-8999-999999999999",
      status: "OPEN",
      dealVersion: 1,
      dealCreatedAt: now,
    },
    property: {
      propertyId: "22222222-2222-4222-8222-222222222222",
      title: "فيلا",
      propertyType: "VILLA",
      addressText: "عنوان",
      propertyVersion: 3,
    },
    organization: { organizationId: orgId, name: "مكتب" },
    signers: [
      { userId: signerId, role: "BROKER", order: 1, reference: "b@x.invalid" },
      {
        userId: principalId,
        role: "OWNER",
        order: 2,
        reference: "o@x.invalid",
      },
    ],
  },
  signers: [
    {
      userId: signerId,
      role: "BROKER",
      order: 1,
      reference: "b@x.invalid",
      signedAt: now,
      documentHash: hash.replace("a", "b"),
    },
    {
      userId: principalId,
      role: "OWNER",
      order: 2,
      reference: "o@x.invalid",
      signedAt: null,
      documentHash: null,
    },
  ],
  auditEvents: [
    {
      eventId,
      action: "GENERATED",
      actorId: signerId,
      reason: null,
      createdAt: now,
    },
  ],
  disclaimer: OPERATIONAL_ESIGN_DISCLAIMER_AR,
  nextSignerOrder: 2,
};

test("EF-610 operational e-sign disclaimer label is exact and mandatory", () => {
  assert.equal(
    OPERATIONAL_ESIGN_DISCLAIMER_AR,
    "توقيع تشغيلي مبسّط — ليس توقيعًا قانونيًا معتمدًا",
  );
  assert.equal(validDetail.disclaimer, OPERATIONAL_ESIGN_DISCLAIMER_AR);
  assert.throws(() =>
    normalizeContractDetail({ ...validDetail, disclaimer: "توقيع قانوني" }),
  );
});

test("EF-610 template/summary normalizers validate closed-world payloads", () => {
  const template = normalizeContractTemplateList({ items: [validTemplate] })[0];
  assert.equal(template.templateKey, "sale-agreement");
  assert.equal(template.status, "APPROVED");
  assert.throws(() =>
    normalizeContractTemplateList({
      items: [{ ...validTemplate, version: 0 }],
    }),
  );
  const summary = normalizeContractList({ items: [validSummary] })[0];
  assert.equal(summary.signatureCount, 1);
  assert.equal(summary.signerTotal, 2);
  assert.throws(() =>
    normalizeContractList({
      items: [{ ...validSummary, contentHash: "short" }],
    }),
  );
  assert.throws(() =>
    normalizeContractList({ items: [{ ...validSummary, status: "SIGNED" }] }),
  );
});

test("EF-610 detail normalizer keeps snapshot provenance and signature state", () => {
  const detail = normalizeContractDetail(validDetail);
  assert.equal(detail.propertyTitle, "فيلا");
  assert.equal(detail.organizationName, "مكتب");
  assert.equal(detail.capturedAt, now);
  assert.equal(detail.nextSignerOrder, 2);
  assert.equal(detail.signers[0].signedAt, now);
  assert.equal(detail.signers[1].signedAt, null);
  assert.equal(detail.auditEvents[0].action, "GENERATED");
  assert.throws(() =>
    normalizeContractDetail({
      ...validDetail,
      snapshot: { ...validDetail.snapshot, schemaVersion: 2 },
    }),
  );
  assert.throws(() =>
    normalizeContractDetail({
      ...validDetail,
      auditEvents: [{ ...validDetail.auditEvents[0], action: "EDITED" }],
    }),
  );
});

test("EF-610 generated contract normalizer enforces the disclaimer", () => {
  const generated = normalizeGeneratedContract({
    contractId,
    contentHash: hash,
    pdfSha256: hash.replace("a", "b"),
    title: "عقد",
    status: "DRAFT",
    templateVersion: 1,
    signers: validDetail.signers,
    disclaimer: OPERATIONAL_ESIGN_DISCLAIMER_AR,
  });
  assert.equal(generated.status, "DRAFT");
  assert.throws(() =>
    normalizeGeneratedContract({
      ...{
        contractId,
        contentHash: hash,
        pdfSha256: hash.replace("a", "b"),
        title: "عقد",
        status: "DRAFT",
        templateVersion: 1,
        signers: [],
      },
      disclaimer: "different",
    }),
  );
});

test("EF-610 Arabic labels and PDF URL are presentable", () => {
  assert.equal(arMessages[CONTRACT_STATUS_LABELS.DRAFT], "قيد التوقيع");
  assert.equal(arMessages[CONTRACT_STATUS_LABELS.FINALIZED], "مكتمل التوقيع");
  assert.equal(arMessages[CONTRACT_STATUS_LABELS.VOID], "ملغى");
  assert.equal(arMessages[CONTRACT_AUDIT_LABELS.VOIDED], "إلغاء");
  assert.equal(
    arMessages[CONTRACT_AUDIT_LABELS.SIGNATURE_RECORDED],
    "تسجيل توقيع",
  );
  const url = contractPdfUrl(orgId, contractId);
  assert.ok(
    url.startsWith(`/api/organizations/${orgId}/contracts/${contractId}/pdf`),
  );
  assert.throws(() => contractPdfUrl(orgId, "not-a-uuid"));
});
