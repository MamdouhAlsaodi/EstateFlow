/**
 * EF-610 — deterministic contract fixtures for domain/application tests.
 * Pure helpers only: importing this file registers no node:test hooks.
 */

export const fixedDate = new Date("2026-10-03T09:00:00.000Z");

export const ORG_ID = "22222222-2222-4222-8222-222222222222";
export const OTHER_ORG = "29999999-9999-4999-8999-999999999999";
export const DEAL_ID = "33333333-3333-4333-8333-333333333333";
export const PROPERTY_ID = "44444444-4444-4444-8444-444444444444";
export const BROKER_ID = "55555555-5555-4555-8555-555555555555";
export const PRINCIPAL_ID = "66666666-6666-4666-8666-666666666666";
export const CLIENT_ID = "77777777-7777-4777-8777-777777777777";

/** Base snapshot inputs mirroring a synthetic deal aggregate. */
export function buildSnapshotInputs() {
  return {
    now: fixedDate,
    deal: {
      id: DEAL_ID,
      organizationId: ORG_ID,
      leadId: "88888888-8888-4888-8888-888888888888",
      propertyId: PROPERTY_ID,
      status: "OPEN",
      version: 1,
      createdAt: fixedDate,
    },
    property: {
      id: PROPERTY_ID,
      title: "EF610 villa",
      propertyType: "VILLA",
      addressText: "Synthetic address",
      version: 3,
    },
    organizationName: "EF610 synthetic",
    broker: {
      userId: BROKER_ID,
      role: "BROKER",
      reference: "broker@ef610.test.invalid",
    },
    principal: {
      userId: PRINCIPAL_ID,
      role: "OWNER",
      reference: "owner@ef610.test.invalid",
    },
  };
}

/** A minimal approved-style template for render tests. */
export function renderTemplateInputs() {
  return {
    templateKey: "sale-agreement",
    version: 1,
    titlePattern: "عقد بيع — {PROPERTY_TITLE}",
    bodyPattern:
      "الجهة: {ORGANIZATION_NAME}\nالعقار: {PROPERTY_TYPE} في {PROPERTY_ADDRESS}\nالصفقة: {DEAL_REFERENCE}\nالوسيط: {BROKER_REFERENCE}\nتاريخ اللقطة: {SNAPSHOT_CAPTURED_AT}",
  };
}

/** In-memory contract repository mirroring the Prisma transaction shapes. */
export class InMemoryContractRepository {
  constructor() {
    this.templates = new Map();
    this.contracts = new Map();
    this.signatures = [];
    this.auditEvents = [];
    this.transactionHiccups = 0;
  }

  async createTemplate(input) {
    const template = {
      status: "DRAFT",
      approvedBy: null,
      approvedAt: null,
      ...input,
    };
    this.templates.set(`${input.organizationId}:${input.id}`, template);
    return template;
  }

  async findTemplate(organizationId, templateId) {
    return this.templates.get(`${organizationId}:${templateId}`) ?? null;
  }

  async findApprovedTemplate(organizationId, templateId, templateVersion) {
    const template = await this.findTemplate(organizationId, templateId);
    if (!template || template.status !== "APPROVED") return null;
    if (templateVersion !== undefined && template.version !== templateVersion)
      return null;
    return template;
  }

  async listTemplates(organizationId) {
    return [...this.templates.values()]
      .filter((template) => template.organizationId === organizationId)
      .sort(
        (a, b) =>
          a.templateKey.localeCompare(b.templateKey) || b.version - a.version,
      );
  }

  async findTemplateVersion(organizationId, templateKey, version) {
    for (const template of this.templates.values()) {
      if (
        template.organizationId === organizationId &&
        template.templateKey === templateKey &&
        template.version === version
      )
        return template;
    }
    return null;
  }

  async approveTemplate(organizationId, templateId, approval) {
    const template = await this.findTemplate(organizationId, templateId);
    if (!template || template.status !== "DRAFT") return null;
    template.status = "APPROVED";
    template.approvedBy = approval.approvedBy;
    template.approvedAt = approval.approvedAt;
    return template;
  }

  async createGeneratedContract({ contract, audit }) {
    if (this.transactionHiccups > 0) {
      this.transactionHiccups -= 1;
      throw new Error("simulated transaction failure");
    }
    if (this.contracts.has(`${contract.organizationId}:${contract.id}`))
      throw new Error("duplicate contract id");
    this.contracts.set(`${contract.organizationId}:${contract.id}`, {
      ...contract,
    });
    this.auditEvents.push({ ...audit });
    return { ...contract };
  }

  async findContract(organizationId, contractId) {
    const contract = this.contracts.get(`${organizationId}:${contractId}`);
    return contract ? { ...contract } : null;
  }

  async listContracts(organizationId, dealId) {
    return [...this.contracts.values()]
      .filter(
        (contract) =>
          contract.organizationId === organizationId &&
          (dealId === undefined || contract.dealId === dealId),
      )
      .sort(
        (a, b) =>
          b.createdAt.getTime() - a.createdAt.getTime() ||
          a.id.localeCompare(b.id),
      )
      .map((contract) => ({ ...contract }));
  }

  async listSignatures(organizationId, contractId) {
    return this.signatures
      .filter(
        (signature) =>
          signature.organizationId === organizationId &&
          signature.contractId === contractId,
      )
      .sort((a, b) => a.signerOrder - b.signerOrder)
      .map((signature) => ({ ...signature }));
  }

  async listAuditEvents(organizationId, contractId) {
    return this.auditEvents
      .filter(
        (event) =>
          event.organizationId === organizationId &&
          event.contractId === contractId,
      )
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
      .map((event) => ({ ...event }));
  }

  async recordSignature({
    contract,
    signature,
    audit,
    finalize,
    finalizeAudit,
    finalizedAt,
  }) {
    const existing = await this.listSignatures(
      signature.organizationId,
      signature.contractId,
    );
    // Mirror of the DB insert trigger: order must be exactly next, signer must
    // match the snapshot, document hash must be locked, state must be DRAFT.
    if (contract.status !== "DRAFT")
      throw new Error(
        "signatures are allowed only while the contract is DRAFT",
      );
    if (signature.signerOrder !== existing.length + 1)
      throw new Error("signature out of order");
    const expected = contract.snapshot.signers.find(
      (signer) => signer.order === signature.signerOrder,
    );
    if (
      !expected ||
      expected.userId !== signature.signerUserId ||
      expected.role !== signature.signerRole
    )
      throw new Error(
        "signature signer does not match the declared ordered signer",
      );
    if (signature.documentHash !== contract.pdfSha256)
      throw new Error("signature document hash mismatch");
    this.signatures.push({ ...signature });
    this.auditEvents.push({ ...audit });
    if (!finalize) return { ...contract };
    if (existing.length + 1 !== contract.snapshot.signers.length)
      throw new Error("cannot finalize before every ordered signature exists");
    this.auditEvents.push({ ...finalizeAudit });
    const finalized = {
      ...contract,
      status: "FINALIZED",
      finalizedAt: finalizedAt,
    };
    this.contracts.set(`${contract.organizationId}:${contract.id}`, finalized);
    return { ...finalized };
  }

  async voidContract({
    organizationId,
    contractId,
    voidedBy,
    voidedAt,
    reason,
    audit,
  }) {
    const contract = await this.findContract(organizationId, contractId);
    if (!contract) throw new Error("contract not found");
    if (contract.status !== "DRAFT") throw new Error("contract is immutable");
    const voided = {
      ...contract,
      status: "VOID",
      voidedBy,
      voidedAt,
      voidReason: reason,
    };
    this.contracts.set(`${organizationId}:${contractId}`, voided);
    this.auditEvents.push({ ...audit });
    return voided;
  }

  async recordAuditEvent(audit) {
    this.auditEvents.push({ ...audit });
  }
}

/** In-memory membership reader + deal snapshot reader over synthetic rows. */
export class InMemoryMembershipReader {
  constructor(rows) {
    this.rows = rows;
  }

  async findMembership(organizationId, userId) {
    return (
      this.rows.find(
        (row) => row.organizationId === organizationId && row.userId === userId,
      ) ?? null
    );
  }
}

export class InMemoryDealSnapshotReader {
  constructor(outcomes) {
    this.outcomes = outcomes;
  }

  async findDealSnapshot(organizationId, dealId) {
    for (const outcome of this.outcomes) {
      if (
        outcome.organizationId === organizationId &&
        outcome.dealId === dealId
      )
        return structuredClone(outcome.result);
    }
    return { kind: "not-found" };
  }
}

export function foundOutcome(organizationId, dealId) {
  return {
    organizationId,
    dealId,
    result: { kind: "found", inputs: buildSnapshotInputs() },
  };
}
