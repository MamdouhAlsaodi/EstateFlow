/**
 * EF-610 — org-scoped versioned contract templates (EF-305 patterns).
 *
 * A template owns a title pattern and a body pattern whose variables are the
 * strict snapshot slots only. Unknown `{SLOT}` names are rejected at creation
 * (strict placeholders — nothing can slip into a contract that the snapshot
 * does not carry). Templates are created as DRAFT by Owner/Manager, approved
 * once (immutable afterwards, DB trigger), and generation always resolves one
 * APPROVED version; a new version is a new row under the same templateKey.
 */

import {
  CONTRACT_SLOTS,
  snapshotSlotValues,
  type ContractSlot,
  type ContractSnapshot,
} from "./contract-snapshot.js";

export class ContractTemplateValidationError extends Error {
  readonly code = "CONTRACT_TEMPLATE_VALIDATION_ERROR" as const;
  constructor(message: string) {
    super(message);
    this.name = "ContractTemplateValidationError";
  }
}

export type ContractTemplateStatus = "DRAFT" | "APPROVED";

export type ContractTemplate = Readonly<{
  id: string;
  organizationId: string;
  templateKey: string;
  version: number;
  titlePattern: string;
  bodyPattern: string;
  status: ContractTemplateStatus;
  createdBy: string;
  createdAt: Date;
  approvedBy: string | null;
  approvedAt: Date | null;
}>;

export const CONTRACT_TEMPLATE_KEY_PATTERN = /^[a-z][a-z0-9._-]{2,99}$/;

export function validateTemplateKey(value: string): void {
  if (typeof value !== "string" || !CONTRACT_TEMPLATE_KEY_PATTERN.test(value))
    throw new ContractTemplateValidationError(
      "template key must match [a-z][a-z0-9._-]{2,99}",
    );
}

const SLOT_PATTERN = /\{([A-Z_]+)\}/g;
/** Bracketed fact tokens are an EF-403 concept and are forbidden here. */
const FACT_TOKEN_PATTERN = /\[[A-Z_]+\]/;

function validatePattern(kind: "title" | "body", pattern: string): void {
  if (typeof pattern !== "string" || pattern.trim().length === 0)
    throw new ContractTemplateValidationError(
      `${kind} pattern must not be empty`,
    );
  const maxLength = kind === "title" ? 200 : 8000;
  if (pattern.length > maxLength)
    throw new ContractTemplateValidationError(
      `${kind} pattern exceeds ${maxLength} characters`,
    );
  if (FACT_TOKEN_PATTERN.test(pattern))
    throw new ContractTemplateValidationError(
      `${kind} pattern must not contain [BRACKET] fact placeholders`,
    );
  for (const match of pattern.matchAll(SLOT_PATTERN)) {
    if (!(CONTRACT_SLOTS as readonly string[]).includes(match[1]))
      throw new ContractTemplateValidationError(
        `placeholder {${match[1]}} is not allowlisted`,
      );
  }
}

export function validateTemplatePatterns(input: {
  titlePattern: string;
  bodyPattern: string;
}): void {
  validatePattern("title", input.titlePattern);
  validatePattern("body", input.bodyPattern);
}

export function createContractTemplate(input: {
  id: string;
  organizationId: string;
  templateKey: string;
  version: number;
  titlePattern: string;
  bodyPattern: string;
  createdBy: string;
  createdAt: Date;
}): ContractTemplate {
  validateTemplateKey(input.templateKey);
  validateTemplatePatterns(input);
  if (!Number.isSafeInteger(input.version) || input.version < 1)
    throw new ContractTemplateValidationError("template version must be >= 1");
  return Object.freeze({
    id: input.id,
    organizationId: input.organizationId,
    templateKey: input.templateKey,
    version: input.version,
    titlePattern: input.titlePattern,
    bodyPattern: input.bodyPattern,
    status: "DRAFT",
    createdBy: input.createdBy,
    createdAt: input.createdAt,
    approvedBy: null,
    approvedAt: null,
  });
}

export type ContractTemplateApproval = Readonly<{
  approvedBy: string;
  approvedAt: Date;
}>;

/** One-way DRAFT → APPROVED; content stays untouched (trigger re-checks). */
export function approveContractTemplate(
  template: ContractTemplate,
  approval: ContractTemplateApproval,
): ContractTemplate {
  if (template.status !== "DRAFT")
    throw new ContractTemplateValidationError(
      "only a DRAFT template can be approved",
    );
  return Object.freeze({
    ...template,
    status: "APPROVED" as const,
    approvedBy: approval.approvedBy,
    approvedAt: approval.approvedAt,
  });
}

/**
 * Pure deterministic renderer: content = f(template patterns, snapshot).
 * Every slot resolves from the snapshot; a missing value is a defect and
 * throws instead of being defaulted or dropped.
 */
export function renderContractTemplate(input: {
  template: Pick<
    ContractTemplate,
    "templateKey" | "version" | "titlePattern" | "bodyPattern"
  >;
  snapshot: ContractSnapshot;
}): Readonly<{
  title: string;
  body: string;
  templateKey: string;
  templateVersion: number;
}> {
  const values = snapshotSlotValues(input.snapshot);
  const render = (pattern: string): string =>
    pattern.replace(SLOT_PATTERN, (_whole, slot: string) => {
      const value = (values as Record<string, string>)[slot];
      if (typeof value !== "string")
        throw new ContractTemplateValidationError(
          `slot {${slot}} has no snapshot value`,
        );
      return value;
    });
  const title = render(input.template.titlePattern);
  const body = render(input.template.bodyPattern);
  if (title.length === 0 || title.length > 200)
    throw new ContractTemplateValidationError(
      "rendered title must be 1..200 characters",
    );
  if (body.length === 0 || body.length > 8000)
    throw new ContractTemplateValidationError(
      "rendered body must be 1..8000 characters",
    );
  return Object.freeze({
    title,
    body,
    templateKey: input.template.templateKey,
    templateVersion: input.template.version,
  });
}

/** Slot catalog surfaced to owners/managers in the template editor. */
export function listContractSlots(): readonly ContractSlot[] {
  return CONTRACT_SLOTS;
}
