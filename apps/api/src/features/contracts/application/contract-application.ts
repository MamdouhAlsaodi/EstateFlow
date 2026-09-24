/**
 * EF-610 — contracts application service.
 *
 * Authority matrix (ACTIVE membership required, tenant-scoped everywhere —
 * foreign ids are tenant-safe 404-equivalents):
 * - Templates: Owner/Manager create and approve; Owner/Manager/Broker list.
 * - Generation/list/read/PDF: Owner/Manager/Broker; CLIENT never touches
 *   contracts.
 * - Signing: strictly the next ordered snapshot signer, in order; every
 *   signature stores signer, timestamp and the exact document hash.
 * - Void: Owner only, with a mandatory reason.
 * - Amend-request: Owner/Manager/Broker while DRAFT; audit-only (the
 *   document itself is immutable; amendments produce a NEW contract).
 *
 * Generation is deterministic: contract content and PDF bytes are pure
 * functions of (approved template version, immutable deal/property snapshot).
 * This is an operational simple e-sign record — NOT a certified legal
 * signature; the disclaimer is stamped on every generated document.
 */

import { randomUUID } from "node:crypto";
import type {
  Contract,
  ContractAuditAction,
  ContractAuditEvent,
  ContractSignature,
} from "../domain/contract.js";
import {
  ContractStateError,
  ContractValidationError,
  OPERATIONAL_ESIGN_DISCLAIMER_AR,
  generateContract,
  expectNextSignature,
  renderContractDocument,
  sha256Hex,
  validateAmendReason,
  validateVoidReason,
} from "../domain/contract.js";
import {
  approveContractTemplate,
  createContractTemplate,
  listContractSlots,
  renderContractTemplate,
  type ContractTemplate,
} from "../domain/contract-template.js";
import {
  buildContractSnapshot,
  type ContractSnapshot,
} from "../domain/contract-snapshot.js";
import type {
  ContractMembershipReader,
  ContractRepository,
  DealSnapshotReader,
  DealSnapshotOutcome,
} from "./contract-repository.js";

export type ContractRole = "OWNER" | "MANAGER" | "BROKER" | "CLIENT";

export type ContractActor = Readonly<{
  userId: string;
  verified: boolean;
  memberships: readonly {
    organizationId: string;
    role: ContractRole;
    active: boolean;
  }[];
}>;

export class ContractAccessDeniedError extends Error {
  constructor() {
    super("Contract access denied");
    this.name = "ContractAccessDeniedError";
  }
}

export class ContractNotFoundError extends Error {
  constructor() {
    super("Contract not found");
    this.name = "ContractNotFoundError";
  }
}

const TEMPLATE_ADMIN_ROLES: readonly ContractRole[] = ["OWNER", "MANAGER"];
const CONTRACT_ROLES: readonly ContractRole[] = ["OWNER", "MANAGER", "BROKER"];
const VOID_ROLES: readonly ContractRole[] = ["OWNER"];

function auditEvent(input: {
  organizationId: string;
  contractId: string;
  action: ContractAuditAction;
  actorId: string;
  at: Date;
  reason?: string;
  data?: Record<string, unknown>;
}): ContractAuditEvent {
  return Object.freeze({
    id: randomUUID(),
    organizationId: input.organizationId,
    contractId: input.contractId,
    action: input.action,
    actorId: input.actorId,
    reason: input.reason ?? null,
    data: input.data ? Object.freeze({ ...input.data }) : null,
    createdAt: input.at,
  });
}

export type ContractTemplateView = Readonly<{
  templateId: string;
  organizationId: string;
  templateKey: string;
  version: number;
  titlePattern: string;
  bodyPattern: string;
  status: ContractTemplate["status"];
  createdBy: string;
  createdAt: string;
  approvedBy: string | null;
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
  action: ContractAuditAction;
  actorId: string;
  reason: string | null;
  data: Record<string, unknown> | null;
  createdAt: string;
}>;

export type ContractDetailView = Readonly<{
  contractId: string;
  organizationId: string;
  dealId: string;
  templateId: string;
  templateKey: string;
  templateVersion: number;
  title: string;
  body: string;
  contentHash: string;
  pdfSha256: string;
  pdfByteSize: number;
  status: Contract["status"];
  generatedBy: string;
  createdAt: string;
  finalizedAt: string | null;
  voidedBy: string | null;
  voidedAt: string | null;
  voidReason: string | null;
  snapshot: ContractSnapshot;
  signers: readonly ContractSignerView[];
  auditEvents: readonly ContractAuditView[];
  disclaimer: string;
  nextSignerOrder: number | null;
}>;

export type ContractSummaryView = Readonly<{
  contractId: string;
  organizationId: string;
  dealId: string;
  templateKey: string;
  templateVersion: number;
  title: string;
  contentHash: string;
  pdfSha256: string;
  status: Contract["status"];
  createdAt: string;
  finalizedAt: string | null;
  signatureCount: number;
  signerTotal: number;
}>;

export type GeneratedContractView = Readonly<{
  contractId: string;
  contentHash: string;
  pdfSha256: string;
  pdfByteSize: number;
  title: string;
  status: "DRAFT";
  templateKey: string;
  templateVersion: number;
  signers: readonly ContractSignerView[];
  disclaimer: string;
}>;

export type SignatureRecordedView = Readonly<{
  contractId: string;
  signerOrder: number;
  signerUserId: string;
  documentHash: string;
  signedAt: string;
  contractStatus: Contract["status"];
}>;

export class ContractApplication {
  constructor(
    private readonly repository: ContractRepository,
    private readonly memberships: ContractMembershipReader,
    private readonly dealSnapshots: DealSnapshotReader,
  ) {}

  private async authorize(
    actor: ContractActor,
    organizationId: string,
    roles: readonly ContractRole[],
  ): Promise<void> {
    if (!actor.verified || actor.userId.trim().length === 0)
      throw new ContractAccessDeniedError();
    const membership = actor.memberships.find(
      (entry) => entry.organizationId === organizationId && entry.active,
    );
    if (!membership || !roles.includes(membership.role))
      throw new ContractAccessDeniedError();
    const persisted = await this.memberships.findMembership(
      organizationId,
      actor.userId,
    );
    if (
      !persisted ||
      persisted.status !== "ACTIVE" ||
      !roles.includes(persisted.role as ContractRole)
    )
      throw new ContractAccessDeniedError();
  }

  // ---- Templates ---------------------------------------------------------

  async createTemplate(input: {
    actor: ContractActor;
    userId: string;
    organizationId: string;
    templateId: string;
    templateKey: string;
    titlePattern: string;
    bodyPattern: string;
    now: Date;
  }): Promise<ContractTemplateView> {
    await this.authorize(
      input.actor,
      input.organizationId,
      TEMPLATE_ADMIN_ROLES,
    );
    const template = createContractTemplate({
      id: input.templateId,
      organizationId: input.organizationId,
      templateKey: input.templateKey,
      version: 1,
      titlePattern: input.titlePattern,
      bodyPattern: input.bodyPattern,
      createdBy: input.userId,
      createdAt: input.now,
    });
    const created = await this.repository.createTemplate(template);
    return toTemplateView(created);
  }

  async approveTemplate(input: {
    actor: ContractActor;
    userId: string;
    organizationId: string;
    templateId: string;
    now: Date;
  }): Promise<ContractTemplateView> {
    await this.authorize(
      input.actor,
      input.organizationId,
      TEMPLATE_ADMIN_ROLES,
    );
    const template = await this.repository.findTemplate(
      input.organizationId,
      input.templateId,
    );
    if (!template) throw new ContractNotFoundError();
    // Domain transition first (typed rejection for non-DRAFT), then the
    // guarded persistence — the DB trigger re-validates completeness.
    const approved = approveContractTemplate(template, {
      approvedBy: input.userId,
      approvedAt: input.now,
    });
    const persisted = await this.repository.approveTemplate(
      input.organizationId,
      input.templateId,
      { approvedBy: input.userId, approvedAt: input.now },
    );
    return toTemplateView(persisted ?? approved);
  }

  async listTemplates(input: {
    actor: ContractActor;
    userId: string;
    organizationId: string;
  }): Promise<readonly ContractTemplateView[]> {
    await this.authorize(input.actor, input.organizationId, CONTRACT_ROLES);
    const templates = await this.repository.listTemplates(input.organizationId);
    return templates.map(toTemplateView);
  }

  // ---- Generation --------------------------------------------------------

  async generateContract(input: {
    actor: ContractActor;
    userId: string;
    organizationId: string;
    contractId: string;
    dealId: string;
    templateId: string;
    templateVersion?: number;
    now: Date;
  }): Promise<GeneratedContractView> {
    await this.authorize(input.actor, input.organizationId, CONTRACT_ROLES);
    const outcome: DealSnapshotOutcome =
      await this.dealSnapshots.findDealSnapshot(
        input.organizationId,
        input.dealId,
        input.now,
      );
    if (outcome.kind === "not-found") throw new ContractNotFoundError();
    if (outcome.kind === "conflict")
      throw new ContractStateError("CONTRACT_NOT_DRAFT");
    const template = await this.repository.findApprovedTemplate(
      input.organizationId,
      input.templateId,
      input.templateVersion,
    );
    if (!template) throw new ContractNotFoundError();
    const snapshot = buildContractSnapshot(outcome.inputs);
    const rendered = renderContractTemplate({ template, snapshot });
    const generated = generateContract({
      id: input.contractId,
      organizationId: input.organizationId,
      dealId: input.dealId,
      templateId: template.id,
      templateKey: rendered.templateKey,
      templateVersion: rendered.templateVersion,
      title: rendered.title,
      body: rendered.body,
      snapshot,
      generatedBy: input.userId,
      createdAt: input.now,
    });
    const audit = auditEvent({
      organizationId: input.organizationId,
      contractId: input.contractId,
      action: "GENERATED",
      actorId: input.userId,
      at: input.now,
      data: {
        templateId: template.id,
        templateKey: rendered.templateKey,
        templateVersion: rendered.templateVersion,
        dealId: input.dealId,
        contentHash: generated.contract.contentHash,
        pdfSha256: generated.pdfSha256,
        disclaimer: OPERATIONAL_ESIGN_DISCLAIMER_AR,
      },
    });
    const persisted = await this.repository.createGeneratedContract({
      contract: generated.contract,
      audit,
    });
    return {
      contractId: persisted.id,
      contentHash: persisted.contentHash,
      pdfSha256: persisted.pdfSha256,
      pdfByteSize: persisted.pdfByteSize,
      title: persisted.title,
      status: "DRAFT",
      templateKey: persisted.templateKey,
      templateVersion: persisted.templateVersion,
      signers: toSignerViews(persisted.snapshot.signers, []),
      disclaimer: OPERATIONAL_ESIGN_DISCLAIMER_AR,
    };
  }

  // ---- Reads -------------------------------------------------------------

  async listContracts(input: {
    actor: ContractActor;
    userId: string;
    organizationId: string;
    dealId?: string;
  }): Promise<readonly ContractSummaryView[]> {
    await this.authorize(input.actor, input.organizationId, CONTRACT_ROLES);
    const contracts = await this.repository.listContracts(
      input.organizationId,
      input.dealId,
    );
    return Promise.all(
      contracts.map((contract) => this.toSummaryView(contract)),
    );
  }

  async getContract(input: {
    actor: ContractActor;
    userId: string;
    organizationId: string;
    contractId: string;
  }): Promise<ContractDetailView> {
    await this.authorize(input.actor, input.organizationId, CONTRACT_ROLES);
    const contract = await this.repository.findContract(
      input.organizationId,
      input.contractId,
    );
    if (!contract) throw new ContractNotFoundError();
    const [signatures, auditEvents] = await Promise.all([
      this.repository.listSignatures(input.organizationId, input.contractId),
      this.repository.listAuditEvents(input.organizationId, input.contractId),
    ]);
    return toDetailView(contract, signatures, auditEvents);
  }

  /**
   * Deterministic document bytes: regenerated from the frozen row and
   * verified against the recorded SHA-256 before release — a tampered or
   * drifted row can never surface as a valid-looking document.
   */
  async getContractPdf(input: {
    actor: ContractActor;
    userId: string;
    organizationId: string;
    contractId: string;
  }): Promise<{ bytes: Uint8Array; sha256: string }> {
    await this.authorize(input.actor, input.organizationId, CONTRACT_ROLES);
    const contract = await this.repository.findContract(
      input.organizationId,
      input.contractId,
    );
    if (!contract) throw new ContractNotFoundError();
    const bytes = renderContractDocument(contract);
    const sha256 = sha256Hex(bytes);
    if (sha256 !== contract.pdfSha256)
      throw new ContractValidationError(
        "stored document hash does not match the regenerated PDF",
      );
    return { bytes, sha256 };
  }

  // ---- Signing -----------------------------------------------------------

  async signContract(input: {
    actor: ContractActor;
    userId: string;
    organizationId: string;
    contractId: string;
    now: Date;
  }): Promise<SignatureRecordedView> {
    await this.authorize(input.actor, input.organizationId, CONTRACT_ROLES);
    const contract = await this.repository.findContract(
      input.organizationId,
      input.contractId,
    );
    if (!contract) throw new ContractNotFoundError();
    const signatures = await this.repository.listSignatures(
      input.organizationId,
      input.contractId,
    );
    const signer = expectNextSignature(contract, signatures, input.userId);
    const signature: ContractSignature = Object.freeze({
      id: randomUUID(),
      organizationId: input.organizationId,
      contractId: input.contractId,
      signerOrder: signer.order,
      signerUserId: input.userId,
      signerRole: signer.role,
      documentHash: contract.pdfSha256,
      signedAt: input.now,
      createdAt: input.now,
    });
    const isLast = signatures.length + 1 === contract.snapshot.signers.length;
    const audit = auditEvent({
      organizationId: input.organizationId,
      contractId: input.contractId,
      action: "SIGNATURE_RECORDED",
      actorId: input.userId,
      at: input.now,
      data: {
        signerOrder: signer.order,
        documentHash: contract.pdfSha256,
      },
    });
    let finalizedAudit: ContractAuditEvent | null = null;
    if (isLast) {
      finalizedAudit = auditEvent({
        organizationId: input.organizationId,
        contractId: input.contractId,
        action: "FINALIZED",
        actorId: input.userId,
        at: input.now,
        data: { signatures: signatures.length + 1 },
      });
    }
    const persisted = await this.repository.recordSignature({
      contract,
      signature,
      audit,
      finalize: isLast,
      finalizeAudit: finalizedAudit,
      finalizedAt: input.now,
    });
    return {
      contractId: persisted.id,
      signerOrder: signature.signerOrder,
      signerUserId: input.userId,
      documentHash: signature.documentHash,
      signedAt: input.now.toISOString(),
      contractStatus: persisted.status,
    };
  }

  // ---- Void / amend ------------------------------------------------------

  async voidContract(input: {
    actor: ContractActor;
    userId: string;
    organizationId: string;
    contractId: string;
    reason: string;
    now: Date;
  }): Promise<ContractDetailView> {
    await this.authorize(input.actor, input.organizationId, VOID_ROLES);
    const contract = await this.repository.findContract(
      input.organizationId,
      input.contractId,
    );
    if (!contract) throw new ContractNotFoundError();
    validateVoidReason(input.reason);
    if (contract.status !== "DRAFT")
      throw new ContractStateError("CONTRACT_NOT_DRAFT");
    const audit = auditEvent({
      organizationId: input.organizationId,
      contractId: input.contractId,
      action: "VOIDED",
      actorId: input.userId,
      at: input.now,
      reason: input.reason,
    });
    const voided = await this.repository.voidContract({
      organizationId: input.organizationId,
      contractId: input.contractId,
      voidedBy: input.userId,
      voidedAt: input.now,
      reason: input.reason,
      audit,
    });
    const [signatures, auditEvents] = await Promise.all([
      this.repository.listSignatures(input.organizationId, input.contractId),
      this.repository.listAuditEvents(input.organizationId, input.contractId),
    ]);
    return toDetailView(voided, signatures, auditEvents);
  }

  async requestAmendment(input: {
    actor: ContractActor;
    userId: string;
    organizationId: string;
    contractId: string;
    reason: string;
    now: Date;
  }): Promise<ContractDetailView> {
    await this.authorize(input.actor, input.organizationId, CONTRACT_ROLES);
    const contract = await this.repository.findContract(
      input.organizationId,
      input.contractId,
    );
    if (!contract) throw new ContractNotFoundError();
    validateAmendReason(input.reason);
    if (contract.status !== "DRAFT")
      throw new ContractStateError("CONTRACT_NOT_DRAFT");
    await this.repository.recordAuditEvent(
      auditEvent({
        organizationId: input.organizationId,
        contractId: input.contractId,
        action: "AMEND_REQUESTED",
        actorId: input.userId,
        at: input.now,
        reason: input.reason,
      }),
    );
    return this.getContract({
      actor: input.actor,
      userId: input.userId,
      organizationId: input.organizationId,
      contractId: input.contractId,
    });
  }

  /** Slot catalog for the template editor. */
  listSlots(): readonly string[] {
    return listContractSlots();
  }

  private async toSummaryView(
    contract: Contract,
  ): Promise<ContractSummaryView> {
    const signatures = await this.repository.listSignatures(
      contract.organizationId,
      contract.id,
    );
    return {
      contractId: contract.id,
      organizationId: contract.organizationId,
      dealId: contract.dealId,
      templateKey: contract.templateKey,
      templateVersion: contract.templateVersion,
      title: contract.title,
      contentHash: contract.contentHash,
      pdfSha256: contract.pdfSha256,
      status: contract.status,
      createdAt: contract.createdAt.toISOString(),
      finalizedAt: contract.finalizedAt?.toISOString() ?? null,
      signatureCount: signatures.length,
      signerTotal: contract.snapshot.signers.length,
    };
  }
}

function toTemplateView(template: ContractTemplate): ContractTemplateView {
  return {
    templateId: template.id,
    organizationId: template.organizationId,
    templateKey: template.templateKey,
    version: template.version,
    titlePattern: template.titlePattern,
    bodyPattern: template.bodyPattern,
    status: template.status,
    createdBy: template.createdBy,
    createdAt: template.createdAt.toISOString(),
    approvedBy: template.approvedBy,
    approvedAt: template.approvedAt?.toISOString() ?? null,
  };
}

function toSignerViews(
  signers: readonly {
    userId: string;
    role: string;
    order: number;
    reference: string;
  }[],
  signatures: readonly ContractSignature[],
): readonly ContractSignerView[] {
  return [...signers]
    .sort((a, b) => a.order - b.order)
    .map((signer) => {
      const signature = signatures.find(
        (entry) => entry.signerOrder === signer.order,
      );
      return {
        userId: signer.userId,
        role: signer.role,
        order: signer.order,
        reference: signer.reference,
        signedAt: signature?.signedAt.toISOString() ?? null,
        documentHash: signature?.documentHash ?? null,
      };
    });
}

function toDetailView(
  contract: Contract,
  signatures: readonly ContractSignature[],
  auditEvents: readonly ContractAuditEvent[],
): ContractDetailView {
  const orderedSigners = toSignerViews(contract.snapshot.signers, signatures);
  return {
    contractId: contract.id,
    organizationId: contract.organizationId,
    dealId: contract.dealId,
    templateId: contract.templateId,
    templateKey: contract.templateKey,
    templateVersion: contract.templateVersion,
    title: contract.title,
    body: contract.body,
    contentHash: contract.contentHash,
    pdfSha256: contract.pdfSha256,
    pdfByteSize: contract.pdfByteSize,
    status: contract.status,
    generatedBy: contract.generatedBy,
    createdAt: contract.createdAt.toISOString(),
    finalizedAt: contract.finalizedAt?.toISOString() ?? null,
    voidedBy: contract.voidedBy,
    voidedAt: contract.voidedAt?.toISOString() ?? null,
    voidReason: contract.voidReason,
    snapshot: contract.snapshot,
    signers: orderedSigners,
    // Repository order is chronological (createdAt asc); events written in
    // the same millisecond stay in insertion order — never re-sorted here.
    auditEvents: auditEvents.map((event) => ({
      eventId: event.id,
      action: event.action,
      actorId: event.actorId,
      reason: event.reason,
      data: event.data ? { ...event.data } : null,
      createdAt: event.createdAt.toISOString(),
    })),
    disclaimer: OPERATIONAL_ESIGN_DISCLAIMER_AR,
    nextSignerOrder:
      contract.status === "DRAFT" &&
      signatures.length < contract.snapshot.signers.length
        ? signatures.length + 1
        : null,
  };
}
