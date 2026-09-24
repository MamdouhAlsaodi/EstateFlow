import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import test from "node:test";
import {
  ContractStateError,
  ContractValidationError,
  OPERATIONAL_ESIGN_DISCLAIMER_AR,
  contractContentHash,
  expectNextSignature,
  finalizeContract,
  generateContract,
  sha256Hex,
  validateAmendReason,
  validateVoidReason,
  voidContract,
} from "../dist/features/contracts/domain/contract.js";
import {
  ContractTemplateValidationError,
  approveContractTemplate,
  createContractTemplate,
  listContractSlots,
  renderContractTemplate,
  validateTemplateKey,
  validateTemplatePatterns,
} from "../dist/features/contracts/domain/contract-template.js";
import {
  CONTRACT_SLOTS,
  ContractSnapshotError,
  buildContractSnapshot,
  parseContractSnapshot,
  snapshotSlotValues,
} from "../dist/features/contracts/domain/contract-snapshot.js";
import {
  ContractPdfError,
  escapePdfText,
  renderContractPdf,
  wrapPdfLine,
} from "../dist/features/contracts/domain/minimal-pdf.js";
import {
  buildSnapshotInputs,
  fixedDate,
  renderTemplateInputs,
} from "./support/ef610-contracts-fixtures.mjs";

const UUID_A = "11111111-1111-4111-8111-111111111111";

test("EF-610 snapshot: deterministic build, strict signer order, validation", () => {
  const snapshot = buildContractSnapshot(buildSnapshotInputs());
  assert.equal(snapshot.schemaVersion, 1);
  assert.deepEqual(
    snapshot.signers.map((signer) => signer.order),
    [1, 2],
  );
  assert.equal(snapshot.signers[0].role, "BROKER");
  assert.equal(snapshot.signers[1].role, "OWNER");
  assert.equal(snapshot.capturedAt, "2026-10-03T09:00:00.000Z");
  // Identical inputs → identical frozen snapshot content.
  const again = buildContractSnapshot(buildSnapshotInputs());
  assert.deepEqual(
    JSON.parse(JSON.stringify(again)),
    JSON.parse(JSON.stringify(snapshot)),
  );
  // Broker and principal must differ.
  assert.throws(
    () =>
      buildContractSnapshot({
        ...buildSnapshotInputs(),
        principal: buildSnapshotInputs().broker,
      }),
    ContractSnapshotError,
  );
  // Round-trip through the DB re-validator.
  assert.deepEqual(
    JSON.parse(
      JSON.stringify(
        parseContractSnapshot(JSON.parse(JSON.stringify(snapshot))),
      ),
    ),
    JSON.parse(JSON.stringify(snapshot)),
  );
  assert.throws(
    () =>
      parseContractSnapshot({
        ...JSON.parse(JSON.stringify(snapshot)),
        schemaVersion: 2,
      }),
    ContractSnapshotError,
  );
  assert.throws(() => parseContractSnapshot(null), ContractSnapshotError);
});

test("EF-610 slots: strict allowlist and pure snapshot resolution", () => {
  assert.ok(
    CONTRACT_SLOTS.includes("PROPERTY_TITLE") &&
      CONTRACT_SLOTS.includes("ORGANIZATION_NAME") &&
      CONTRACT_SLOTS.includes("BROKER_REFERENCE") &&
      CONTRACT_SLOTS.includes("SNAPSHOT_CAPTURED_AT"),
  );
  const snapshot = buildContractSnapshot(buildSnapshotInputs());
  const values = snapshotSlotValues(snapshot);
  assert.equal(values.ORGANIZATION_NAME, "EF610 synthetic");
  assert.equal(values.PROPERTY_TITLE, "EF610 villa");
  assert.equal(values.DEAL_REFERENCE, snapshot.deal.dealId);
  assert.equal(values.BROKER_REFERENCE, "broker@ef610.test.invalid");
  assert.equal(values.SNAPSHOT_CAPTURED_AT, "2026-10-03T09:00:00.000Z");
});

test("EF-610 templates: strict placeholder validation and lifecycle", () => {
  validateTemplateKey("sale-agreement.v1");
  assert.throws(
    () => validateTemplateKey("Bad Key"),
    ContractTemplateValidationError,
  );
  validateTemplatePatterns({
    titlePattern: "عقد {PROPERTY_TYPE}",
    bodyPattern: "الطرف الأول: {ORGANIZATION_NAME}\nالعقار: {PROPERTY_TITLE}",
  });
  // Unknown slot rejected at creation.
  assert.throws(
    () =>
      validateTemplatePatterns({
        titlePattern: "x {NOT_A_SLOT}",
        bodyPattern: "body",
      }),
    ContractTemplateValidationError,
  );
  // EF-403-style bracket facts are forbidden in contracts.
  assert.throws(
    () =>
      validateTemplatePatterns({
        titlePattern: "x [PRICE]",
        bodyPattern: "body",
      }),
    ContractTemplateValidationError,
  );
  const template = createContractTemplate({
    id: UUID_A,
    organizationId: buildSnapshotInputs().deal.organizationId,
    templateKey: "sale-agreement",
    version: 1,
    titlePattern: "عقد بيع — {PROPERTY_TITLE}",
    bodyPattern:
      "الجهة: {ORGANIZATION_NAME}\nالعقار: {PROPERTY_TYPE} في {PROPERTY_ADDRESS}",
    createdBy: buildSnapshotInputs().broker.userId,
    createdAt: fixedDate,
  });
  assert.equal(template.status, "DRAFT");
  const approved = approveContractTemplate(template, {
    approvedBy: buildSnapshotInputs().principal.userId,
    approvedAt: fixedDate,
  });
  assert.equal(approved.status, "APPROVED");
  assert.throws(
    () =>
      approveContractTemplate(approved, {
        approvedBy: UUID_A,
        approvedAt: fixedDate,
      }),
    ContractTemplateValidationError,
  );
  assert.equal(listContractSlots().length, CONTRACT_SLOTS.length);
});

test("EF-610 render: deterministic content from (template, snapshot)", () => {
  const template = renderTemplateInputs();
  const snapshot = buildContractSnapshot(buildSnapshotInputs());
  const first = renderContractTemplate({ template, snapshot });
  const second = renderContractTemplate({ template, snapshot });
  assert.equal(first.title, second.title);
  assert.equal(first.body, second.body);
  assert.ok(first.title.includes("EF610 villa"));
  assert.ok(first.body.includes("EF610 synthetic"));
  assert.ok(first.title.length > 0 && first.title.length <= 200);
});

test("EF-610 hashing: content hash is stable and input-sensitive", () => {
  const base = {
    templateKey: "sale-agreement",
    templateVersion: 1,
    title: "same",
    body: "same",
  };
  assert.equal(contractContentHash(base), contractContentHash({ ...base }));
  assert.notEqual(
    contractContentHash(base),
    contractContentHash({ ...base, body: "different" }),
  );
  assert.notEqual(
    contractContentHash(base),
    contractContentHash({ ...base, templateVersion: 2 }),
  );
  assert.match(contractContentHash(base), /^[0-9a-f]{64}$/);
  assert.equal(
    sha256Hex(new Uint8Array([1, 2, 3])),
    sha256Hex(new Uint8Array([1, 2, 3])),
  );
});

test("EF-610 PDF: deterministic bytes, valid structure, escape safety", () => {
  const snapshot = buildContractSnapshot(buildSnapshotInputs());
  const input = {
    title: "عقد بيع — EF610 villa",
    body: "الجهة: EF610 synthetic\nسطر ثانٍ (مع أقواس) وشرطة \\",
    meta: {
      contractId: UUID_A,
      templateKey: "sale-agreement",
      templateVersion: 1,
      dealId: snapshot.deal.dealId,
      contentSha256: contractContentHash({
        templateKey: "sale-agreement",
        templateVersion: 1,
        title: "t",
        body: "b",
      }),
      capturedAt: snapshot.capturedAt,
      signers: snapshot.signers.map((signer) => ({
        order: signer.order,
        role: signer.role,
        reference: signer.reference,
      })),
    },
    disclaimer: OPERATIONAL_ESIGN_DISCLAIMER_AR,
  };
  const first = renderContractPdf(input);
  const second = renderContractPdf(input);
  assert.deepEqual(Array.from(second), Array.from(first));
  const text = Buffer.from(first).toString("latin1");
  assert.ok(text.startsWith("%PDF-1.4"));
  assert.ok(text.trimEnd().endsWith("%%EOF"));
  assert.ok(text.includes("/Type /Catalog"));
  assert.ok(text.includes("startxref"));
  // xref offset must point at the actual xref keyword.
  const startxref = Number(text.match(/startxref\n(\d+)\n%%EOF\n?$/)?.[1]);
  assert.equal(typeof startxref, "number");
  assert.ok(!Number.isNaN(startxref));
  assert.equal(text.slice(startxref, startxref + 4), "xref");
  // Lossless escaping: parentheses, backslash, Arabic code points.
  const escaped = escapePdfText("a(b)c\\dة");
  assert.ok(
    escaped.includes("\\(") &&
      escaped.includes("\\)") &&
      escaped.includes("\\\\"),
  );
  assert.ok(escaped.includes("U+0629"));
  // Same input → same hash; different input → different hash.
  assert.equal(
    sha256Hex(first),
    sha256Hex(renderContractPdf({ ...input, meta: { ...input.meta } })),
  );
  assert.notEqual(
    sha256Hex(first),
    sha256Hex(
      renderContractPdf({
        ...input,
        meta: { ...input.meta, contractId: UUID_A.replace("1", "2") },
      }),
    ),
  );
  assert.throws(
    () => renderContractPdf({ ...input, meta: { ...input.meta, signers: [] } }),
    ContractPdfError,
  );
});

test("EF-610 wrapping and generated document determinism", () => {
  const long = "word ".repeat(40).trim();
  const lines = wrapPdfLine(long);
  for (const line of lines) assert.ok(line.length <= 78);
  assert.ok(lines.length >= 3);
  const snapshot = buildContractSnapshot(buildSnapshotInputs());
  const generated = generateContract({
    id: UUID_A,
    organizationId: snapshot.organization.organizationId,
    dealId: snapshot.deal.dealId,
    templateId: UUID_A,
    templateKey: "sale-agreement",
    templateVersion: 1,
    title: "عقد",
    body: "نص",
    snapshot,
    generatedBy: snapshot.signers[1].userId,
    createdAt: fixedDate,
  });
  assert.equal(generated.contract.status, "DRAFT");
  assert.equal(generated.pdfSha256, sha256Hex(generated.pdfBytes));
  assert.ok(generated.pdfByteSize > 500);
  // Same inputs (same capturedAt) → identical document hash.
  const identical = generateContract({
    id: UUID_A,
    organizationId: snapshot.organization.organizationId,
    dealId: snapshot.deal.dealId,
    templateId: UUID_A,
    templateKey: "sale-agreement",
    templateVersion: 1,
    title: "عقد",
    body: "نص",
    snapshot,
    generatedBy: snapshot.signers[1].userId,
    createdAt: fixedDate,
  });
  assert.equal(identical.pdfSha256, generated.pdfSha256);
  assert.equal(identical.contract.contentHash, generated.contract.contentHash);
});

test("EF-610 signing: strict next-signer order and lifecycle typing", () => {
  const snapshot = buildContractSnapshot(buildSnapshotInputs());
  const contract = generateContract({
    id: UUID_A,
    organizationId: snapshot.organization.organizationId,
    dealId: snapshot.deal.dealId,
    templateId: UUID_A,
    templateKey: "sale-agreement",
    templateVersion: 1,
    title: "عقد",
    body: "نص",
    snapshot,
    generatedBy: snapshot.signers[1].userId,
    createdAt: fixedDate,
  }).contract;
  // Order 2 signer cannot sign before order 1.
  assert.throws(
    () => expectNextSignature(contract, [], snapshot.signers[1].userId),
    (error) =>
      error instanceof ContractStateError &&
      (error.code === "SIGNER_NOT_NEXT" ||
        error.code === "SIGNATURE_OUT_OF_ORDER"),
  );
  // An unknown user can never be the next signer.
  assert.throws(
    () =>
      expectNextSignature(contract, [], "99999999-9999-4999-8999-999999999999"),
    ContractStateError,
  );
  // Order 1 signs, then order 2 finalizes.
  const signer1 = expectNextSignature(contract, [], snapshot.signers[0].userId);
  assert.equal(signer1.order, 1);
  assert.equal(signer1.userId, snapshot.signers[0].userId);
  const signer2 = expectNextSignature(
    contract,
    [
      {
        id: UUID_A,
        organizationId: contract.organizationId,
        contractId: contract.id,
        signerOrder: 1,
        signerUserId: snapshot.signers[0].userId,
        signerRole: "BROKER",
        documentHash: contract.pdfSha256,
        signedAt: fixedDate,
        createdAt: fixedDate,
      },
    ],
    snapshot.signers[1].userId,
  );
  assert.equal(signer2.order, 2);
  // Void reasons are validated.
  assert.throws(() => validateVoidReason(""), ContractValidationError);
  assert.throws(
    () => validateVoidReason(" ".repeat(1)),
    ContractValidationError,
  );
  assert.throws(
    () => validateVoidReason("x".repeat(501)),
    ContractValidationError,
  );
  validateVoidReason("سبب واضح");
  assert.throws(() => validateAmendReason(""), ContractValidationError);
  validateAmendReason("طلب تعديل");
  const voided = voidContract(contract, {
    voidedBy: snapshot.signers[1].userId,
    at: fixedDate,
    reason: "سبب واضح",
  });
  assert.equal(voided.status, "VOID");
  assert.equal(voided.voidReason, "سبب واضح");
  // A voided contract cannot be finalized.
  assert.throws(() => finalizeContract(voided, fixedDate), ContractStateError);
});
