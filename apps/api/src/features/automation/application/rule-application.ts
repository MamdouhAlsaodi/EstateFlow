import {
  initialRuleVersion,
  nextRuleVersion,
  requireRuleDefinition,
  validateRuleName,
  validateVersionNote,
  AutomationRuleValidationError,
  type AutomationRule,
  type AutomationRuleDefinition,
  type AutomationRuleVersion,
} from "../domain/rule.js";
import type { AutomationJob } from "../domain/execution.js";
import type { AutomationJobRepository } from "./job-repository.js";
import { defaultLeadAutomationRules } from "../domain/lead-automation.js";
import type {
  AddRuleVersionConflictReason,
  AutomationRuleRepository,
  AutomationRuleWithCurrentDefinition,
  CreateRuleConflictReason,
} from "./rule-repository.js";

export type AutomationActor = Readonly<{ verified: boolean }>;
export type AutomationMembership = Readonly<{
  organizationId: string;
  role: "OWNER" | "MANAGER" | "BROKER" | "CLIENT";
  status: "ACTIVE" | "PENDING" | "SUSPENDED" | "REVOKED";
}>;

export interface AutomationMembershipReader {
  findMembership(
    organizationId: string,
    userId: string,
  ): Promise<AutomationMembership | null>;
}

type CommandBase = Readonly<{
  actor: AutomationActor;
  userId: string;
  organizationId: string;
}>;

export type CreateRuleResult =
  | Readonly<{
      kind: "created";
      rule: AutomationRule;
      version: AutomationRuleVersion;
    }>
  | Readonly<{ kind: "conflict"; reason: CreateRuleConflictReason }>
  | Readonly<{ kind: "access-denied" }>;

export type AddRuleVersionResult =
  | Readonly<{
      kind: "created";
      rule: AutomationRule;
      version: AutomationRuleVersion;
    }>
  | Readonly<{ kind: "conflict"; reason: AddRuleVersionConflictReason }>
  | Readonly<{ kind: "not-found"; resource: "rule" }>
  | Readonly<{ kind: "access-denied" }>;

export type SetRuleEnabledResult =
  | Readonly<{
      kind: "enabled" | "already-enabled" | "disabled" | "already-disabled";
      rule: AutomationRule;
    }>
  | Readonly<{ kind: "not-found"; resource: "rule" }>
  | Readonly<{ kind: "access-denied" }>;

export type ListRulesResult =
  | Readonly<{ kind: "found"; rules: AutomationRuleWithCurrentDefinition[] }>
  | Readonly<{ kind: "access-denied" }>;

export type GetRuleResult =
  | Readonly<{
      kind: "found";
      rule: AutomationRule;
      versions: AutomationRuleVersion[];
    }>
  | Readonly<{ kind: "not-found"; resource: "rule" }>
  | Readonly<{ kind: "access-denied" }>;

export type ListFailedJobsResult =
  | Readonly<{ kind: "found"; jobs: AutomationJob[] }>
  | Readonly<{ kind: "access-denied" }>;

/**
 * EF-301 — guarded automation rule commands.
 *
 * Authority matrix (per the RBAC roles from EF-121, ACTIVE membership
 * required): OWNER and MANAGER may create rules, append versions, flip the
 * enable/disable lifecycle, and read rules/version history. BROKER and CLIENT
 * are denied for every automation-rule command. All reads and writes are
 * organization-scoped; foreign rule ids are indistinguishable from absent
 * ones (typed "not-found").
 */
export class AutomationRuleApplication {
  constructor(
    private readonly repository: AutomationRuleRepository,
    private readonly membershipReader: AutomationMembershipReader,
    private readonly jobs?: AutomationJobRepository,
  ) {}

  async seedLeadAutomationDefaults(
    input: CommandBase & { createdAt: Date },
  ): Promise<
    | Readonly<{ kind: "seeded"; created: number }>
    | Readonly<{ kind: "access-denied" }>
  > {
    const access = await this.authorize(input);
    if (access.kind !== "authorized") return { kind: "access-denied" };
    let created = 0;
    for (const starter of defaultLeadAutomationRules()) {
      const result = await this.createRule({
        ...input,
        ruleId: crypto.randomUUID(),
        name: starter.name,
        definition: starter.definition,
      });
      if (result.kind === "created") created += 1;
    }
    return { kind: "seeded", created };
  }

  async createRule(
    input: CommandBase & {
      ruleId: string;
      name: string;
      definition: unknown;
      createdAt: Date;
    },
  ): Promise<CreateRuleResult> {
    const access = await this.authorize(input);
    if (access.kind !== "authorized") return { kind: "access-denied" };
    validateRuleName(input.name);
    const definition = requireRuleDefinition(input.definition);
    const rule: AutomationRule = {
      id: input.ruleId,
      organizationId: input.organizationId,
      name: input.name,
      enabled: false,
      enabledAt: null,
      createdAt: input.createdAt,
      updatedAt: input.createdAt,
    };
    const version = initialRuleVersion({
      organizationId: input.organizationId,
      ruleId: input.ruleId,
      definition,
      createdBy: input.userId,
      createdAt: input.createdAt,
    });
    const created = await this.repository.createRule({ rule, version });
    if (created.kind === "conflict") return created;
    return { kind: "created", rule: created.rule, version: created.version };
  }

  async addRuleVersion(
    input: CommandBase & {
      ruleId: string;
      definition: unknown;
      note?: string;
      createdAt: Date;
    },
  ): Promise<AddRuleVersionResult> {
    const access = await this.authorize(input);
    if (access.kind !== "authorized") return { kind: "access-denied" };
    if (input.note !== undefined) validateVersionNote(input.note);
    const definition = requireRuleDefinition(input.definition);
    const current = await this.repository.findVersion(
      input.organizationId,
      input.ruleId,
      await this.currentVersionNumber(input.organizationId, input.ruleId),
    );
    if (!current) return { kind: "not-found", resource: "rule" };
    const version = nextRuleVersion(current, {
      definition,
      createdBy: input.userId,
      createdAt: input.createdAt,
      ...(input.note === undefined ? {} : { note: input.note }),
    });
    const created = await this.repository.addRuleVersion({ version });
    if (created.kind === "conflict") return created;
    return { kind: "created", rule: created.rule, version: created.version };
  }

  async enableRule(
    input: CommandBase & {
      ruleId: string;
      at: Date;
    },
  ): Promise<SetRuleEnabledResult> {
    return this.setEnabled(input, true);
  }

  async disableRule(
    input: CommandBase & {
      ruleId: string;
      at: Date;
    },
  ): Promise<SetRuleEnabledResult> {
    return this.setEnabled(input, false);
  }

  async listRules(
    input: CommandBase & {
      limit: number;
    },
  ): Promise<ListRulesResult> {
    const access = await this.authorize(input);
    if (access.kind !== "authorized") return { kind: "access-denied" };
    const rules = await this.repository.listRulesWithCurrentDefinition(
      input.organizationId,
      input.limit,
    );
    return { kind: "found", rules };
  }

  async listFailedJobs(
    input: CommandBase & { limit: number },
  ): Promise<ListFailedJobsResult> {
    const access = await this.authorize(input);
    if (access.kind !== "authorized") return { kind: "access-denied" };
    if (!this.jobs) return { kind: "found", jobs: [] };
    return {
      kind: "found",
      jobs: await this.jobs.listJobsByStatus({
        organizationId: input.organizationId,
        status: "FAILED",
        limit: input.limit,
      }),
    };
  }

  async getRule(
    input: CommandBase & {
      ruleId: string;
    },
  ): Promise<GetRuleResult> {
    const access = await this.authorize(input);
    if (access.kind !== "authorized") return { kind: "access-denied" };
    const rule = await this.repository.findRule(
      input.organizationId,
      input.ruleId,
    );
    if (!rule) return { kind: "not-found", resource: "rule" };
    const versions = await this.repository.listRuleVersions(
      input.organizationId,
      input.ruleId,
    );
    return { kind: "found", rule, versions };
  }

  private async setEnabled(
    input: CommandBase & { ruleId: string; at: Date },
    enabled: boolean,
  ): Promise<SetRuleEnabledResult> {
    const access = await this.authorize(input);
    if (access.kind !== "authorized") return { kind: "access-denied" };
    const existing = await this.repository.findRule(
      input.organizationId,
      input.ruleId,
    );
    if (!existing) return { kind: "not-found", resource: "rule" };
    if (existing.enabled === enabled)
      return {
        kind: enabled ? "already-enabled" : "already-disabled",
        rule: existing,
      };
    const updated = await this.repository.setRuleEnabled({
      organizationId: input.organizationId,
      ruleId: input.ruleId,
      enabled,
      updatedAt: input.at,
    });
    if (updated.kind === "not-found")
      return { kind: "not-found", resource: "rule" };
    return {
      kind: enabled ? "enabled" : "disabled",
      rule: updated.rule,
    };
  }

  private async currentVersionNumber(
    organizationId: string,
    ruleId: string,
  ): Promise<number> {
    // The repository serializes concurrent appends; reading the highest
    // version first keeps the append-only chain (`supersedes`) intact.
    const versions = await this.repository.listRuleVersions(
      organizationId,
      ruleId,
    );
    return versions.reduce((max, version) => Math.max(max, version.version), 0);
  }

  private async authorize(
    input: CommandBase,
  ): Promise<{ kind: "authorized" } | { kind: "denied" }> {
    if (!input.actor.verified || input.userId.trim().length === 0)
      return { kind: "denied" };
    const membership = await this.membershipReader.findMembership(
      input.organizationId,
      input.userId,
    );
    if (
      !membership ||
      membership.organizationId !== input.organizationId ||
      membership.status !== "ACTIVE" ||
      (membership.role !== "OWNER" && membership.role !== "MANAGER")
    )
      return { kind: "denied" };
    return { kind: "authorized" };
  }
}

export { AutomationRuleValidationError };
export type { AutomationRuleDefinition, AutomationRuleVersion };
