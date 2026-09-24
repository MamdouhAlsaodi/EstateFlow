/**
 * EF-610 — contract aggregate: deterministic content + document hashes, the
 * DRAFT → FINALIZED / DRAFT → VOID lifecycle, and strict sequential signing.
 *
 * Hash discipline:
 * - contentHash = SHA-256 over a canonical string of (template identity,
 *   rendered title, rendered body). Two generations from the same snapshot
 *   and template version are byte-identical and hash-identical.
 * - pdfSha256 = SHA-256 over the deterministic PDF bytes produced at
 *   generation from the same frozen inputs. Every signature stores exactly
 *   this document hash; finalized rows are frozen by database triggers.
 *
 * This is an OPERATIONAL, SIMPLE e-sign record — never a certified legal
 * signature. The disclaimer below is part of every generated document.
 */

import { createHash } from "node:crypto";
import {
  parseContractSnapshot,
  type ContractSigner,
  type ContractSnapshot,
} from "./contract-snapshot.js";
import { renderContractPdf } from "./minimal-pdf.js";

/** Exact user-facing label — UI, docs, and every generated document. */
export const OPERATIONAL_ESIGN_DISCLAIMER_AR =
  "توقيع تشغيلي مبسّط — ليس توقيعًا قانونيًا معتمدًا";
export const OPERATIONAL_ESIGN_DISCLAIMER_EN =
  "Operational simple e-signature — NOT a certified legal signature";

export type ContractStatus = "DRAFT" | "FINALIZED" | "VOID";

export type ContractAuditAction =
  | "GENERATED"
  | "AMEND_REQUESTED"
  | "SIGNATURE_RECORDED"
  | "FINALIZED"
  | "VOIDED";

export type Contract = Readonly<{
  id: string;
  organizationId: string;
  dealId: string;
  templateId: string;
  templateKey: string;
  templateVersion: number;
  title: string;
  body: string;
  contentHash: string;
  snapshot: ContractSnapshot;
  pdfSha256: string;
  pdfByteSize: number;
  status: ContractStatus;
  generatedBy: string;
  createdAt: Date;
  finalizedAt: Date | null;
  voidedBy: string | null;
  voidedAt: Date | null;
  voidReason: string | null;
}>;

export type ContractSignature = Readonly<{
  id: string;
  organizationId: string;
  contractId: string;
  signerOrder: number;
  signerUserId: string;
  signerRole: string;
  documentHash: string;
  signedAt: Date;
  createdAt: Date;
}>;

export type ContractAuditEvent = Readonly<{
  id: string;
  organizationId: string;
  contractId: string;
  action: ContractAuditAction;
  actorId: string;
  reason: string | null;
  data: Readonly<Record<string, unknown>> | null;
  createdAt: Date;
}>;

export class ContractValidationError extends Error {
  readonly code = "CONTRACT_VALIDATION_ERROR" as const;
  constructor(message: string) {
    super(message);
    this.name = "ContractValidationError";
  }
}

export type ContractStateErrorCode =
  | "SIGNATURE_OUT_OF_ORDER"
  | "SIGNER_NOT_NEXT"
  | "CONTRACT_NOT_DRAFT"
  | "CONTRACT_FINALIZED"
  | "CONTRACT_VOIDED";

export class ContractStateError extends Error {
  readonly code: ContractStateErrorCode;
  constructor(code: ContractStateErrorCode) {
    super(code);
    this.name = "ContractStateError";
    this.code = code;
  }
}

export function sha256Hex(bytes: Uint8Array | string): string {
  return createHash("sha256").update(bytes).digest("hex");
}

/** Canonical content hash over the frozen generation inputs. */
export function contractContentHash(input: {
  templateKey: string;
  templateVersion: number;
  title: string;
  body: string;
}): string {
  const canonical = [
    "ef610-content-v1",
    input.templateKey,
    String(input.templateVersion),
    input.title,
    input.body,
  ].join("\n");
  return sha256Hex(canonical);
}

/** Deterministic PDF bytes for the frozen contract document. */
export function renderContractDocument(input: {
  id: string;
  dealId: string;
  templateKey: string;
  templateVersion: number;
  title: string;
  body: string;
  contentHash: string;
  snapshot: ContractSnapshot;
}): Uint8Array {
  return renderContractPdf({
    title: input.title,
    body: input.body,
    meta: {
      contractId: input.id,
      templateKey: input.templateKey,
      templateVersion: input.templateVersion,
      dealId: input.dealId,
      contentSha256: input.contentHash,
      capturedAt: input.snapshot.capturedAt,
      signers: input.snapshot.signers.map((signer) => ({
        order: signer.order,
        role: signer.role,
        reference: signer.reference,
      })),
    },
    disclaimer: OPERATIONAL_ESIGN_DISCLAIMER_EN,
  });
}

export function validateVoidReason(reason: string): void {
  if (typeof reason !== "string" || reason.trim().length === 0)
    throw new ContractValidationError("a void reason is required");
  if (reason.length > 500)
    throw new ContractValidationError(
      "the void reason must be at most 500 characters",
    );
}

export function validateAmendReason(reason: string): void {
  if (typeof reason !== "string" || reason.trim().length === 0)
    throw new ContractValidationError("an amendment reason is required");
  if (reason.length > 500)
    throw new ContractValidationError(
      "the amendment reason must be at most 500 characters",
    );
}

/**
 * The signing order is total: only the exact next snapshot signer may sign.
 * Anything else — wrong person, right person early, unknown user — is a
 * typed out-of-order rejection.
 */
export function expectNextSignature(
  contract: Contract,
  existingSignatures: readonly ContractSignature[],
  signerUserId: string,
): ContractSigner {
  if (contract.status === "FINALIZED")
    throw new ContractStateError("CONTRACT_FINALIZED");
  if (contract.status === "VOID")
    throw new ContractStateError("CONTRACT_VOIDED");
  const signers = [...contract.snapshot.signers].sort(
    (a, b) => a.order - b.order,
  );
  const nextOrder = existingSignatures.length + 1;
  const expected = signers.find((signer) => signer.order === nextOrder);
  if (!expected) throw new ContractStateError("SIGNATURE_OUT_OF_ORDER");
  if (expected.userId !== signerUserId)
    throw new ContractStateError("SIGNER_NOT_NEXT");
  return expected;
}

export type GeneratedContractInput = Readonly<{
  id: string;
  organizationId: string;
  dealId: string;
  templateId: string;
  templateKey: string;
  templateVersion: number;
  title: string;
  body: string;
  snapshot: ContractSnapshot;
  generatedBy: string;
  createdAt: Date;
}>;

export type GeneratedContract = Readonly<{
  contract: Contract;
  pdfBytes: Uint8Array;
  pdfSha256: string;
  pdfByteSize: number;
}>;

/**
 * Assembles the immutable generated contract. The PDF is rendered once here;
 * its bytes are NOT persisted (the document can always be regenerated
 * byte-identically from the frozen row, and the recorded hash proves it).
 */
export function generateContract(
  input: GeneratedContractInput,
): GeneratedContract {
  const contentHash = contractContentHash({
    templateKey: input.templateKey,
    templateVersion: input.templateVersion,
    title: input.title,
    body: input.body,
  });
  const pdfBytes = renderContractDocument({
    id: input.id,
    dealId: input.dealId,
    templateKey: input.templateKey,
    templateVersion: input.templateVersion,
    title: input.title,
    body: input.body,
    contentHash,
    snapshot: input.snapshot,
  });
  const pdfSha256 = sha256Hex(pdfBytes);
  return Object.freeze({
    contract: Object.freeze({
      id: input.id,
      organizationId: input.organizationId,
      dealId: input.dealId,
      templateId: input.templateId,
      templateKey: input.templateKey,
      templateVersion: input.templateVersion,
      title: input.title,
      body: input.body,
      contentHash,
      snapshot: input.snapshot,
      pdfSha256,
      pdfByteSize: pdfBytes.length,
      status: "DRAFT" as const,
      generatedBy: input.generatedBy,
      createdAt: input.createdAt,
      finalizedAt: null,
      voidedBy: null,
      voidedAt: null,
      voidReason: null,
    }),
    pdfBytes,
    pdfSha256,
    pdfByteSize: pdfBytes.length,
  });
}

export function finalizeContract(contract: Contract, at: Date): Contract {
  if (contract.status !== "DRAFT")
    throw new ContractStateError("CONTRACT_NOT_DRAFT");
  return Object.freeze({
    ...contract,
    status: "FINALIZED" as const,
    finalizedAt: at,
  });
}

export function voidContract(
  contract: Contract,
  input: { voidedBy: string; at: Date; reason: string },
): Contract {
  if (contract.status !== "DRAFT")
    throw new ContractStateError("CONTRACT_NOT_DRAFT");
  validateVoidReason(input.reason);
  return Object.freeze({
    ...contract,
    status: "VOID" as const,
    voidedBy: input.voidedBy,
    voidedAt: input.at,
    voidReason: input.reason,
  });
}

/** Runtime re-validation of contract rows read back from the database. */
export function parseContractSnapshotColumn(value: unknown): ContractSnapshot {
  return parseContractSnapshot(value);
}
