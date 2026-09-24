/**
 * EF-610 — application ports for the contracts feature. The application layer
 * depends only on these interfaces and the domain; Prisma lives behind them.
 */

import type {
  Contract,
  ContractAuditAction,
  ContractAuditEvent,
  ContractSignature,
} from "../domain/contract.js";
import type { ContractTemplate } from "../domain/contract-template.js";
import type { DealSnapshotInputs } from "../domain/contract-snapshot.js";

export type TemplateRecordInput = Readonly<{
  id: string;
  organizationId: string;
  templateKey: string;
  version: number;
  titlePattern: string;
  bodyPattern: string;
  createdBy: string;
  createdAt: Date;
}>;

export interface ContractRepository {
  createTemplate(input: TemplateRecordInput): Promise<ContractTemplate>;
  findTemplate(
    organizationId: string,
    templateId: string,
  ): Promise<ContractTemplate | null>;
  findApprovedTemplate(
    organizationId: string,
    templateId: string,
    templateVersion?: number,
  ): Promise<ContractTemplate | null>;
  listTemplates(organizationId: string): Promise<readonly ContractTemplate[]>;
  /** Persists the one-way DRAFT → APPROVED transition. */
  approveTemplate(
    organizationId: string,
    templateId: string,
    approval: { approvedBy: string; approvedAt: Date },
  ): Promise<ContractTemplate | null>;
  findTemplateVersion(
    organizationId: string,
    templateKey: string,
    version: number,
  ): Promise<ContractTemplate | null>;

  /** Creates the contract row + GENERATED audit event in one transaction. */
  createGeneratedContract(input: {
    contract: Contract;
    audit: ContractAuditEvent;
  }): Promise<Contract>;

  findContract(
    organizationId: string,
    contractId: string,
  ): Promise<Contract | null>;
  listContracts(
    organizationId: string,
    dealId?: string,
  ): Promise<readonly Contract[]>;
  listSignatures(
    organizationId: string,
    contractId: string,
  ): Promise<readonly ContractSignature[]>;
  listAuditEvents(
    organizationId: string,
    contractId: string,
  ): Promise<readonly ContractAuditEvent[]>;

  /**
   * One transaction: signature insert (+ audit) and, when this is the last
   * signature, the contract FINALIZED transition (+ audit). The database
   * triggers re-validate order, signer identity, hash lock and completeness.
   */
  recordSignature(input: {
    contract: Contract;
    signature: ContractSignature;
    audit: ContractAuditEvent;
    finalize: boolean;
    finalizeAudit: ContractAuditEvent | null;
    finalizedAt: Date;
  }): Promise<Contract>;

  /** One transaction: DRAFT → VOID (+ VOIDED audit). */
  voidContract(input: {
    organizationId: string;
    contractId: string;
    voidedBy: string;
    voidedAt: Date;
    reason: string;
    audit: ContractAuditEvent;
  }): Promise<Contract>;

  /** Appends an AMEND_REQUESTED audit event (no document mutation). */
  recordAuditEvent(audit: ContractAuditEvent): Promise<void>;
}

export type ContractMembership = Readonly<{
  organizationId: string;
  role: string;
  status: string;
}>;

export interface ContractMembershipReader {
  findMembership(
    organizationId: string,
    userId: string,
  ): Promise<ContractMembership | null>;
}

export type DealSnapshotOutcome =
  | { kind: "found"; inputs: DealSnapshotInputs }
  | { kind: "not-found" }
  | { kind: "conflict"; reason: "broker-inactive" };

export interface DealSnapshotReader {
  findDealSnapshot(
    organizationId: string,
    dealId: string,
    now?: Date,
  ): Promise<DealSnapshotOutcome>;
}

export type { ContractAuditAction };
