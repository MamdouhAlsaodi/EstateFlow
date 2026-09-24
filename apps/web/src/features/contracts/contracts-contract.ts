/**
 * EF-610 — contract views for the Arabic contracts workspace. Closed-world
 * normalizers: every response field is validated and picked explicitly; the
 * normalizers refuse payloads that carry unexpected shapes.
 *
 * ⚠️ The operational e-sign disclaimer below is also a protocol sentinel:
 * every contract view payload must carry that exact text. Its written value
 * lives in the translation catalog (`contracts.esignDisclaimer`) and is read
 * from the Arabic source of truth here, so the UI label and the API contract
 * can never drift apart.
 */

import { arMessages, type MessageKey } from "../../i18n";

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ISO_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const SHA256 = /^[0-9a-f]{64}$/;

export const OPERATIONAL_ESIGN_DISCLAIMER_AR: string =
  arMessages["contracts.esignDisclaimer"];

export type ContractStatusView = "DRAFT" | "FINALIZED" | "VOID";
export type ContractTemplateStatusView = "DRAFT" | "APPROVED";
export type ContractAuditActionView =
  | "GENERATED"
  | "AMEND_REQUESTED"
  | "SIGNATURE_RECORDED"
  | "FINALIZED"
  | "VOIDED";

export type ContractTemplateSummary = Readonly<{
  templateId: string;
  templateKey: string;
  version: number;
  titlePattern: string;
  bodyPattern: string;
  status: ContractTemplateStatusView;
  createdAt: string;
  approvedAt: string | null;
}>;

export type ContractSignerView = Readonly<{
  userId: string;
  role: string;
  order: number;
  reference: string;
  signedAt: string | null;
  documentHash: string | null;
}>;

export type ContractAuditView = Readonly<{
  eventId: string;
  action: ContractAuditActionView;
  actorId: string;
  reason: string | null;
  createdAt: string;
}>;

export type ContractSummary = Readonly<{
  contractId: string;
  dealId: string;
  templateKey: string;
  templateVersion: number;
  title: string;
  contentHash: string;
  pdfSha256: string;
  status: ContractStatusView;
  createdAt: string;
  finalizedAt: string | null;
  signatureCount: number;
  signerTotal: number;
}>;

export type ContractDetail = Readonly<{
  contractId: string;
  dealId: string;
  templateKey: string;
  templateVersion: number;
  title: string;
  body: string;
  contentHash: string;
  pdfSha256: string;
  status: ContractStatusView;
  createdAt: string;
  finalizedAt: string | null;
  voidReason: string | null;
  propertyTitle: string;
  propertyType: string;
  propertyAddress: string;
  organizationName: string;
  capturedAt: string;
  signers: readonly ContractSignerView[];
  auditEvents: readonly ContractAuditView[];
  disclaimer: string;
  nextSignerOrder: number | null;
}>;

export type GeneratedContractView = Readonly<{
  contractId: string;
  contentHash: string;
  pdfSha256: string;
  title: string;
  status: "DRAFT";
  templateVersion: number;
  signers: readonly ContractSignerView[];
  disclaimer: string;
}>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requireUuid(name: string, value: unknown): string {
  if (typeof value !== "string" || !UUID.test(value))
    throw new TypeError(`Invalid ${name}`);
  return value;
}

function requireInstant(name: string, value: unknown): string {
  if (typeof value !== "string" || !ISO_INSTANT.test(value))
    throw new TypeError(`Invalid ${name}`);
  return value;
}

function requireSha256(name: string, value: unknown): string {
  if (typeof value !== "string" || !SHA256.test(value))
    throw new TypeError(`Invalid ${name}`);
  return value;
}

function requireText(name: string, value: unknown): string {
  if (typeof value !== "string") throw new TypeError(`Invalid ${name}`);
  return value;
}

function requireStatus(value: unknown): ContractStatusView {
  if (value !== "DRAFT" && value !== "FINALIZED" && value !== "VOID")
    throw new TypeError("Invalid contract status");
  return value;
}

function normalizeSigner(value: unknown): ContractSignerView {
  if (!isRecord(value)) throw new TypeError("Invalid signer payload");
  const order = value.order;
  if (typeof order !== "number" || !Number.isSafeInteger(order) || order < 1)
    throw new TypeError("Invalid signer order");
  return {
    userId: requireUuid("signer user id", value.userId),
    role: requireText("signer role", value.role),
    order,
    reference: requireText("signer reference", value.reference),
    signedAt:
      value.signedAt === null
        ? null
        : requireInstant("signer signedAt", value.signedAt),
    documentHash:
      value.documentHash === null
        ? null
        : requireSha256("signer documentHash", value.documentHash),
  };
}

export function normalizeContractTemplate(
  value: unknown,
): ContractTemplateSummary {
  if (!isRecord(value)) throw new TypeError("Invalid template payload");
  const status = value.status;
  if (status !== "DRAFT" && status !== "APPROVED")
    throw new TypeError("Invalid template status");
  const version = value.version;
  if (
    typeof version !== "number" ||
    !Number.isSafeInteger(version) ||
    version < 1
  )
    throw new TypeError("Invalid template version");
  return {
    templateId: requireUuid("template id", value.templateId),
    templateKey: requireText("template key", value.templateKey),
    version,
    titlePattern: requireText("title pattern", value.titlePattern),
    bodyPattern: requireText("body pattern", value.bodyPattern),
    status,
    createdAt: requireInstant("template createdAt", value.createdAt),
    approvedAt:
      value.approvedAt === null
        ? null
        : requireInstant("template approvedAt", value.approvedAt),
  };
}

export function normalizeContractTemplateList(
  payload: unknown,
): readonly ContractTemplateSummary[] {
  if (!isRecord(payload) || !Array.isArray(payload.items))
    throw new TypeError("Invalid template list payload");
  return payload.items.map(normalizeContractTemplate);
}

export function normalizeContractSummary(value: unknown): ContractSummary {
  if (!isRecord(value)) throw new TypeError("Invalid contract payload");
  const signatureCount = value.signatureCount;
  const signerTotal = value.signerTotal;
  if (
    typeof signatureCount !== "number" ||
    !Number.isSafeInteger(signatureCount) ||
    signatureCount < 0 ||
    typeof signerTotal !== "number" ||
    !Number.isSafeInteger(signerTotal) ||
    signerTotal < 1
  )
    throw new TypeError("Invalid contract signature counts");
  return {
    contractId: requireUuid("contract id", value.contractId),
    dealId: requireUuid("contract deal id", value.dealId),
    templateKey: requireText("template key", value.templateKey),
    templateVersion: value.templateVersion as number,
    title: requireText("contract title", value.title),
    contentHash: requireSha256("content hash", value.contentHash),
    pdfSha256: requireSha256("pdf sha256", value.pdfSha256),
    status: requireStatus(value.status),
    createdAt: requireInstant("contract createdAt", value.createdAt),
    finalizedAt:
      value.finalizedAt === null
        ? null
        : requireInstant("finalizedAt", value.finalizedAt),
    signatureCount,
    signerTotal,
  };
}

export function normalizeContractList(
  payload: unknown,
): readonly ContractSummary[] {
  if (!isRecord(payload) || !Array.isArray(payload.items))
    throw new TypeError("Invalid contract list payload");
  return payload.items.map(normalizeContractSummary);
}

export function normalizeContractDetail(payload: unknown): ContractDetail {
  if (!isRecord(payload))
    throw new TypeError("Invalid contract detail payload");
  if (payload.disclaimer !== OPERATIONAL_ESIGN_DISCLAIMER_AR)
    throw new TypeError(
      "Contract payload must carry the operational e-sign disclaimer",
    );
  const snapshot = payload.snapshot;
  if (!isRecord(snapshot)) throw new TypeError("Invalid contract snapshot");
  if (snapshot.schemaVersion !== 1)
    throw new TypeError("Unsupported contract snapshot schema version");
  const property = snapshot.property;
  const organization = snapshot.organization;
  if (!isRecord(property) || !isRecord(organization))
    throw new TypeError("Invalid contract snapshot sections");
  if (!Array.isArray(payload.signers) || !Array.isArray(payload.auditEvents))
    throw new TypeError("Invalid contract detail arrays");
  const nextSignerOrder =
    payload.nextSignerOrder === null ? null : payload.nextSignerOrder;
  if (
    nextSignerOrder !== null &&
    (typeof nextSignerOrder !== "number" || nextSignerOrder < 1)
  )
    throw new TypeError("Invalid next signer order");
  return {
    contractId: requireUuid("contract id", payload.contractId),
    dealId: requireUuid("deal id", payload.dealId),
    templateKey: requireText("template key", payload.templateKey),
    templateVersion: payload.templateVersion as number,
    title: requireText("title", payload.title),
    body: requireText("body", payload.body),
    contentHash: requireSha256("content hash", payload.contentHash),
    pdfSha256: requireSha256("pdf sha256", payload.pdfSha256),
    status: requireStatus(payload.status),
    createdAt: requireInstant("createdAt", payload.createdAt),
    finalizedAt:
      payload.finalizedAt === null
        ? null
        : requireInstant("finalizedAt", payload.finalizedAt),
    voidReason:
      payload.voidReason === null
        ? null
        : requireText("voidReason", payload.voidReason),
    propertyTitle: requireText("property title", property.title),
    propertyType: requireText("property type", property.propertyType),
    propertyAddress: requireText("property address", property.addressText),
    organizationName: requireText("organization name", organization.name),
    capturedAt: requireInstant("capturedAt", snapshot.capturedAt),
    signers: payload.signers.map(normalizeSigner),
    auditEvents: payload.auditEvents.map((event) => {
      if (!isRecord(event)) throw new TypeError("Invalid audit event");
      const action = event.action;
      if (
        action !== "GENERATED" &&
        action !== "AMEND_REQUESTED" &&
        action !== "SIGNATURE_RECORDED" &&
        action !== "FINALIZED" &&
        action !== "VOIDED"
      )
        throw new TypeError("Invalid audit action");
      return {
        eventId: requireUuid("audit event id", event.eventId),
        action,
        actorId: requireUuid("audit actor id", event.actorId),
        reason:
          event.reason === null
            ? null
            : requireText("audit reason", event.reason),
        createdAt: requireInstant("audit createdAt", event.createdAt),
      };
    }),
    disclaimer: requireText("disclaimer", payload.disclaimer),
    nextSignerOrder,
  };
}

export function normalizeGeneratedContract(
  payload: unknown,
): GeneratedContractView {
  if (!isRecord(payload)) throw new TypeError("Invalid generated contract");
  if (payload.disclaimer !== OPERATIONAL_ESIGN_DISCLAIMER_AR)
    throw new TypeError("Generated contract must carry the disclaimer");
  if (!Array.isArray(payload.signers))
    throw new TypeError("Invalid generated signers");
  return {
    contractId: requireUuid("contract id", payload.contractId),
    contentHash: requireSha256("content hash", payload.contentHash),
    pdfSha256: requireSha256("pdf sha256", payload.pdfSha256),
    title: requireText("title", payload.title),
    status: "DRAFT",
    templateVersion: payload.templateVersion as number,
    signers: payload.signers.map(normalizeSigner),
    disclaimer: requireText("disclaimer", payload.disclaimer),
  };
}

/** Same-origin PDF streaming URL — cookies ride along automatically. */
export function contractPdfUrl(
  organizationId: string,
  contractId: string,
): string {
  const id = (name: string, value: string): string => {
    if (!UUID.test(value)) throw new TypeError(`Invalid ${name}`);
    return encodeURIComponent(value);
  };
  return (
    `/api/organizations/${id("organization id", organizationId)}` +
    `/contracts/${id("contract id", contractId)}/pdf`
  );
}

export const CONTRACT_STATUS_LABELS: Readonly<
  Record<ContractStatusView, MessageKey>
> = {
  DRAFT: "contracts.status.DRAFT",
  FINALIZED: "contracts.status.FINALIZED",
  VOID: "contracts.status.VOID",
};

export const CONTRACT_AUDIT_LABELS: Readonly<
  Record<ContractAuditActionView, MessageKey>
> = {
  GENERATED: "contracts.audit.GENERATED",
  AMEND_REQUESTED: "contracts.audit.AMEND_REQUESTED",
  SIGNATURE_RECORDED: "contracts.audit.SIGNATURE_RECORDED",
  FINALIZED: "contracts.audit.FINALIZED",
  VOIDED: "contracts.audit.VOIDED",
};

export const CONTRACT_ROLE_LABELS: Readonly<Record<string, MessageKey>> = {
  OWNER: "contracts.role.OWNER",
  MANAGER: "contracts.role.MANAGER",
  BROKER: "contracts.role.BROKER",
  CLIENT: "contracts.role.CLIENT",
};
