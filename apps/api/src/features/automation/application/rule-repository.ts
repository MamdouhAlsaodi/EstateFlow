import type {
  AutomationRule,
  AutomationRuleDefinition,
  AutomationRuleVersion,
} from "../domain/rule.js";

export type AutomationRuleWithCurrentDefinition = Readonly<{
  rule: AutomationRule;
  definition: AutomationRuleDefinition;
  /** Current (highest) version number. */
  version: number;
}>;

export type CreateRuleConflictReason =
  "rule-name-conflict" | "rule-id-conflict";
export type AddRuleVersionConflictReason = "version-conflict" | "rule-missing";

export interface AutomationRuleRepository {
  findRule(
    organizationId: string,
    ruleId: string,
  ): Promise<AutomationRule | null>;
  findRuleByName(
    organizationId: string,
    name: string,
  ): Promise<AutomationRule | null>;
  findVersion(
    organizationId: string,
    ruleId: string,
    version: number,
  ): Promise<AutomationRuleVersion | null>;
  listRuleVersions(
    organizationId: string,
    ruleId: string,
  ): Promise<AutomationRuleVersion[]>;
  listRulesWithCurrentDefinition(
    organizationId: string,
    limit: number,
  ): Promise<AutomationRuleWithCurrentDefinition[]>;
  findRuleWithCurrentDefinition(
    organizationId: string,
    ruleId: string,
  ): Promise<AutomationRuleWithCurrentDefinition | null>;
  /** Enabled rules whose current-version trigger is a SCHEDULE trigger. */
  listEnabledScheduleRules(): Promise<AutomationRuleWithCurrentDefinition[]>;
  createRule(input: {
    rule: AutomationRule;
    version: AutomationRuleVersion;
  }): Promise<
    | Readonly<{
        kind: "created";
        rule: AutomationRule;
        version: AutomationRuleVersion;
      }>
    | Readonly<{ kind: "conflict"; reason: CreateRuleConflictReason }>
  >;
  /**
   * Append-only version insert plus the current-version pointer advance in a
   * single transaction. Previous versions are never touched.
   */
  addRuleVersion(input: { version: AutomationRuleVersion }): Promise<
    | Readonly<{
        kind: "created";
        rule: AutomationRule;
        version: AutomationRuleVersion;
      }>
    | Readonly<{ kind: "conflict"; reason: AddRuleVersionConflictReason }>
  >;
  setRuleEnabled(input: {
    organizationId: string;
    ruleId: string;
    enabled: boolean;
    updatedAt: Date;
  }): Promise<
    | Readonly<{ kind: "updated"; rule: AutomationRule }>
    | Readonly<{ kind: "not-found" }>
  >;
}

export type RuleMutationConflictReason =
  CreateRuleConflictReason | AddRuleVersionConflictReason;
