/**
 * EF-610 — Prisma contracts repository. Every query is organization-scoped
 * via the composite (organizationId, id) unique constraints; lifecycle
 * mutations run in single transactions with their audit events, and the
 * database triggers re-validate immutability, signing order, hash locks and
 * append-only audit semantics as the second line of defense.
 */

import { randomUUID } from "node:crypto";
import type { Prisma, PrismaClient } from "@prisma/client";
import type {
  ContractRepository,
  TemplateRecordInput,
} from "../application/contract-repository.js";
import type {
  Contract,
  ContractAuditEvent,
  ContractSignature,
} from "../domain/contract.js";
import type { ContractTemplate } from "../domain/contract-template.js";
import { parseContractSnapshot } from "../domain/contract-snapshot.js";

type TemplateRow = Prisma.ContractTemplateGetPayload<Record<string, never>>;
type ContractRow = Prisma.ContractGetPayload<Record<string, never>>;

function toTemplate(row: TemplateRow): ContractTemplate {
  return {
    id: row.id,
    organizationId: row.organizationId,
    templateKey: row.templateKey,
    version: row.version,
    titlePattern: row.titlePattern,
    bodyPattern: row.bodyPattern,
    status: row.status as ContractTemplate["status"],
    createdBy: row.createdBy,
    createdAt: row.createdAt,
    approvedBy: row.approvedBy,
    approvedAt: row.approvedAt,
  };
}

function toContract(row: ContractRow): Contract {
  return {
    id: row.id,
    organizationId: row.organizationId,
    dealId: row.dealId,
    templateId: row.templateId,
    templateKey: row.templateKey,
    templateVersion: row.templateVersion,
    title: row.title,
    body: row.body,
    contentHash: row.contentHash,
    snapshot: parseContractSnapshot(row.snapshot),
    pdfSha256: row.pdfSha256,
    pdfByteSize: row.pdfByteSize,
    status: row.status as Contract["status"],
    generatedBy: row.generatedBy,
    createdAt: row.createdAt,
    finalizedAt: row.finalizedAt,
    voidedBy: row.voidedBy,
    voidedAt: row.voidedAt,
    voidReason: row.voidReason,
  };
}

function toSignature(row: {
  id: string;
  organizationId: string;
  contractId: string;
  signerOrder: number;
  signerUserId: string;
  signerRole: string;
  documentHash: string;
  signedAt: Date;
  createdAt: Date;
}): ContractSignature {
  return { ...row };
}

function toAuditEvent(row: {
  id: string;
  organizationId: string;
  contractId: string;
  action: string;
  actorId: string;
  reason: string | null;
  data: Prisma.JsonValue | null;
  createdAt: Date;
}): ContractAuditEvent {
  return {
    id: row.id,
    organizationId: row.organizationId,
    contractId: row.contractId,
    action: row.action as ContractAuditEvent["action"],
    actorId: row.actorId,
    reason: row.reason,
    data:
      row.data !== null &&
      typeof row.data === "object" &&
      !Array.isArray(row.data)
        ? (row.data as Record<string, unknown>)
        : row.data === null
          ? null
          : Object.freeze({ value: row.data }),
    createdAt: row.createdAt,
  };
}

export class PrismaContractRepository implements ContractRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async createTemplate(input: TemplateRecordInput): Promise<ContractTemplate> {
    const row = await this.prisma.contractTemplate.create({
      data: {
        id: input.id,
        organizationId: input.organizationId,
        templateKey: input.templateKey,
        version: input.version,
        titlePattern: input.titlePattern,
        bodyPattern: input.bodyPattern,
        status: "DRAFT",
        createdBy: input.createdBy,
        createdAt: input.createdAt,
      },
    });
    return toTemplate(row);
  }

  async findTemplate(
    organizationId: string,
    templateId: string,
  ): Promise<ContractTemplate | null> {
    const row = await this.prisma.contractTemplate.findUnique({
      where: {
        organizationId_id: { organizationId, id: templateId },
      },
    });
    return row ? toTemplate(row) : null;
  }

  async findApprovedTemplate(
    organizationId: string,
    templateId: string,
    templateVersion?: number,
  ): Promise<ContractTemplate | null> {
    const row = await this.prisma.contractTemplate.findFirst({
      where: {
        organizationId,
        id: templateId,
        status: "APPROVED",
        ...(templateVersion === undefined ? {} : { version: templateVersion }),
      },
      orderBy: { version: "desc" },
    });
    return row ? toTemplate(row) : null;
  }

  async listTemplates(
    organizationId: string,
  ): Promise<readonly ContractTemplate[]> {
    const rows = await this.prisma.contractTemplate.findMany({
      where: { organizationId },
      orderBy: [{ templateKey: "asc" }, { version: "desc" }],
    });
    return rows.map(toTemplate);
  }

  async findTemplateVersion(
    organizationId: string,
    templateKey: string,
    version: number,
  ): Promise<ContractTemplate | null> {
    const row = await this.prisma.contractTemplate.findUnique({
      where: {
        organizationId_templateKey_version: {
          organizationId,
          templateKey,
          version,
        },
      },
    });
    return row ? toTemplate(row) : null;
  }

  async approveTemplate(
    organizationId: string,
    templateId: string,
    approval: { approvedBy: string; approvedAt: Date },
  ): Promise<ContractTemplate | null> {
    const row = await this.prisma.contractTemplate.updateMany({
      where: {
        organizationId,
        id: templateId,
        status: "DRAFT",
      },
      data: {
        status: "APPROVED",
        approvedBy: approval.approvedBy,
        approvedAt: approval.approvedAt,
      },
    });
    if (row.count !== 1) return null;
    return this.findTemplate(organizationId, templateId);
  }

  async createGeneratedContract(input: {
    contract: Contract;
    audit: ContractAuditEvent;
  }): Promise<Contract> {
    return this.prisma.$transaction(async (tx) => {
      const row = await tx.contract.create({
        data: {
          id: input.contract.id,
          organizationId: input.contract.organizationId,
          dealId: input.contract.dealId,
          templateId: input.contract.templateId,
          templateKey: input.contract.templateKey,
          templateVersion: input.contract.templateVersion,
          title: input.contract.title,
          body: input.contract.body,
          contentHash: input.contract.contentHash,
          snapshot: input.contract.snapshot as unknown as Prisma.InputJsonValue,
          pdfSha256: input.contract.pdfSha256,
          pdfByteSize: input.contract.pdfByteSize,
          status: "DRAFT",
          generatedBy: input.contract.generatedBy,
          createdAt: input.contract.createdAt,
          updatedAt: input.contract.createdAt,
        },
      });
      await tx.contractAuditEvent.create({
        data: {
          id: input.audit.id,
          organizationId: input.audit.organizationId,
          contractId: input.audit.contractId,
          action: input.audit.action,
          actorId: input.audit.actorId,
          reason: input.audit.reason,
          data:
            input.audit.data === null
              ? undefined
              : (input.audit.data as Prisma.InputJsonValue),
          createdAt: input.audit.createdAt,
        },
      });
      return toContract(row);
    });
  }

  async findContract(
    organizationId: string,
    contractId: string,
  ): Promise<Contract | null> {
    const row = await this.prisma.contract.findUnique({
      where: { organizationId_id: { organizationId, id: contractId } },
    });
    return row ? toContract(row) : null;
  }

  async listContracts(
    organizationId: string,
    dealId?: string,
  ): Promise<readonly Contract[]> {
    const rows = await this.prisma.contract.findMany({
      where: { organizationId, ...(dealId === undefined ? {} : { dealId }) },
      orderBy: [{ createdAt: "desc" }, { id: "asc" }],
    });
    return rows.map(toContract);
  }

  async listSignatures(
    organizationId: string,
    contractId: string,
  ): Promise<readonly ContractSignature[]> {
    const rows = await this.prisma.contractSignature.findMany({
      where: { organizationId, contractId },
      orderBy: { signerOrder: "asc" },
    });
    return rows.map(toSignature);
  }

  async listAuditEvents(
    organizationId: string,
    contractId: string,
  ): Promise<readonly ContractAuditEvent[]> {
    const rows = await this.prisma.contractAuditEvent.findMany({
      where: { organizationId, contractId },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    });
    return rows.map(toAuditEvent);
  }

  async recordSignature(input: {
    contract: Contract;
    signature: ContractSignature;
    audit: ContractAuditEvent;
    finalize: boolean;
    finalizeAudit: ContractAuditEvent | null;
    finalizedAt: Date;
  }): Promise<Contract> {
    return this.prisma.$transaction(async (tx) => {
      await tx.contractSignature.create({
        data: {
          id: input.signature.id,
          organizationId: input.signature.organizationId,
          contractId: input.signature.contractId,
          signerOrder: input.signature.signerOrder,
          signerUserId: input.signature.signerUserId,
          signerRole: input.signature.signerRole,
          documentHash: input.signature.documentHash,
          signedAt: input.signature.signedAt,
          createdAt: input.signature.createdAt,
        },
      });
      await tx.contractAuditEvent.create({
        data: {
          id: input.audit.id,
          organizationId: input.audit.organizationId,
          contractId: input.audit.contractId,
          action: input.audit.action,
          actorId: input.audit.actorId,
          reason: input.audit.reason,
          data:
            input.audit.data === null
              ? undefined
              : (input.audit.data as Prisma.InputJsonValue),
          createdAt: input.audit.createdAt,
        },
      });
      if (!input.finalize) return input.contract;
      await tx.contractAuditEvent.create({
        data: {
          id: input.finalizeAudit?.id ?? randomUUID(),
          organizationId: input.contract.organizationId,
          contractId: input.contract.id,
          action: "FINALIZED",
          actorId: input.finalizeAudit?.actorId ?? input.signature.signerUserId,
          reason: null,
          data:
            input.finalizeAudit?.data === null ||
            input.finalizeAudit?.data === undefined
              ? undefined
              : (input.finalizeAudit.data as Prisma.InputJsonValue),
          createdAt: input.finalizedAt,
        },
      });
      const row = await tx.contract.update({
        where: {
          organizationId_id: {
            organizationId: input.contract.organizationId,
            id: input.contract.id,
          },
        },
        data: {
          status: "FINALIZED",
          finalizedAt: input.finalizedAt,
        },
      });
      return toContract(row);
    });
  }

  async voidContract(input: {
    organizationId: string;
    contractId: string;
    voidedBy: string;
    voidedAt: Date;
    reason: string;
    audit: ContractAuditEvent;
  }): Promise<Contract> {
    return this.prisma.$transaction(async (tx) => {
      const row = await tx.contract.update({
        where: {
          organizationId_id: {
            organizationId: input.organizationId,
            id: input.contractId,
          },
        },
        data: {
          status: "VOID",
          voidedBy: input.voidedBy,
          voidedAt: input.voidedAt,
          voidReason: input.reason,
        },
      });
      await tx.contractAuditEvent.create({
        data: {
          id: input.audit.id,
          organizationId: input.audit.organizationId,
          contractId: input.audit.contractId,
          action: input.audit.action,
          actorId: input.audit.actorId,
          reason: input.audit.reason,
          data:
            input.audit.data === null
              ? undefined
              : (input.audit.data as Prisma.InputJsonValue),
          createdAt: input.audit.createdAt,
        },
      });
      return toContract(row);
    });
  }

  async recordAuditEvent(audit: ContractAuditEvent): Promise<void> {
    await this.prisma.contractAuditEvent.create({
      data: {
        id: audit.id,
        organizationId: audit.organizationId,
        contractId: audit.contractId,
        action: audit.action,
        actorId: audit.actorId,
        reason: audit.reason,
        data:
          audit.data === null
            ? undefined
            : (audit.data as Prisma.InputJsonValue),
        createdAt: audit.createdAt,
      },
    });
  }
}
