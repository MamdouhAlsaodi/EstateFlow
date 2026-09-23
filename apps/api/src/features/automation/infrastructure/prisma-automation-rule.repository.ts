import type { PrismaClient } from "@prisma/client";
import type {
  AddRuleVersionConflictReason,
  AutomationRuleRepository,
  AutomationRuleWithCurrentDefinition,
  CreateRuleConflictReason,
} from "../application/rule-repository.js";
import {
  parseRuleDefinition,
  type AutomationRule,
  type AutomationRuleDefinition,
  type AutomationRuleVersion,
  type AutomationTriggerEventType,
} from "../domain/rule.js";

type Db = PrismaClient;

/**
 * EF-301 persistence. The automation tables are created by raw SQL migration
 * fourteen and intentionally not mirrored into schema.prisma (outside this
 * packet's allowed paths), so every access is parameterized raw SQL — always
 * scoped by organizationId.
 */
export class PrismaAutomationRuleRepository implements AutomationRuleRepository {
  constructor(private readonly db: Db) {}

  async findRule(
    organizationId: string,
    ruleId: string,
  ): Promise<AutomationRule | null> {
    const rows = await this.db.$queryRaw<RuleRow[]>`
      SELECT "id", "organizationId", "name", "enabled", "enabledAt", "createdAt", "updatedAt"
      FROM "AutomationRule"
      WHERE "organizationId" = ${organizationId}::uuid AND "id" = ${ruleId}::uuid
      LIMIT 1`;
    return rows[0] ? mapRule(rows[0]) : null;
  }

  async findRuleByName(
    organizationId: string,
    name: string,
  ): Promise<AutomationRule | null> {
    const rows = await this.db.$queryRaw<RuleRow[]>`
      SELECT "id", "organizationId", "name", "enabled", "enabledAt", "createdAt", "updatedAt"
      FROM "AutomationRule"
      WHERE "organizationId" = ${organizationId}::uuid AND "name" = ${name}
      LIMIT 1`;
    return rows[0] ? mapRule(rows[0]) : null;
  }

  async findVersion(
    organizationId: string,
    ruleId: string,
    version: number,
  ): Promise<AutomationRuleVersion | null> {
    const rows = await this.db.$queryRaw<VersionRow[]>`
      SELECT "organizationId", "ruleId", "version", "definition", "createdBy", "createdAt", "supersedesVersion", "note"
      FROM "AutomationRuleVersion"
      WHERE "organizationId" = ${organizationId}::uuid
        AND "ruleId" = ${ruleId}::uuid
        AND "version" = ${version}
      LIMIT 1`;
    return rows[0] ? mapVersion(rows[0]) : null;
  }

  async findRuleVersion(
    organizationId: string,
    ruleId: string,
    version: number,
  ): Promise<Readonly<{ definition: AutomationRuleDefinition }> | null> {
    const found = await this.findVersion(organizationId, ruleId, version);
    return found ? { definition: found.definition } : null;
  }

  async listRuleVersions(
    organizationId: string,
    ruleId: string,
  ): Promise<AutomationRuleVersion[]> {
    const rows = await this.db.$queryRaw<VersionRow[]>`
      SELECT "organizationId", "ruleId", "version", "definition", "createdBy", "createdAt", "supersedesVersion", "note"
      FROM "AutomationRuleVersion"
      WHERE "organizationId" = ${organizationId}::uuid AND "ruleId" = ${ruleId}::uuid
      ORDER BY "version" ASC`;
    return rows.map(mapVersion);
  }

  async findRuleWithCurrentDefinition(
    organizationId: string,
    ruleId: string,
  ): Promise<AutomationRuleWithCurrentDefinition | null> {
    const rows = await this.db.$queryRaw<RuleWithDefinitionRow[]>`
      SELECT r."id", r."organizationId", r."name", r."enabled", r."enabledAt", r."createdAt", r."updatedAt",
             v."version" AS "versionNumber", v."definition" AS "definition"
      FROM "AutomationRule" r
      JOIN "AutomationRuleVersion" v
        ON v."organizationId" = r."organizationId" AND v."ruleId" = r."id"
      WHERE r."organizationId" = ${organizationId}::uuid
        AND r."id" = ${ruleId}::uuid
        AND v."version" = (
          SELECT MAX("version") FROM "AutomationRuleVersion"
          WHERE "organizationId" = r."organizationId" AND "ruleId" = r."id"
        )
      LIMIT 1`;
    const row = rows[0];
    return row
      ? {
          rule: mapRule(row),
          definition: mapDefinition(row.definition),
          version: row.versionNumber,
        }
      : null;
  }

  async listRulesWithCurrentDefinition(
    organizationId: string,
    limit: number,
  ): Promise<AutomationRuleWithCurrentDefinition[]> {
    const rows = await this.db.$queryRaw<RuleWithDefinitionRow[]>`
      SELECT r."id", r."organizationId", r."name", r."enabled", r."enabledAt", r."createdAt", r."updatedAt",
             v."version" AS "versionNumber", v."definition" AS "definition"
      FROM "AutomationRule" r
      JOIN "AutomationRuleVersion" v
        ON v."organizationId" = r."organizationId" AND v."ruleId" = r."id"
      WHERE r."organizationId" = ${organizationId}::uuid
        AND v."version" = (
          SELECT MAX("version") FROM "AutomationRuleVersion"
          WHERE "organizationId" = r."organizationId" AND "ruleId" = r."id"
        )
      ORDER BY r."createdAt" ASC, r."id" ASC
      LIMIT ${limit}`;
    return rows.map((row) => ({
      rule: mapRule(row),
      definition: mapDefinition(row.definition),
      version: row.versionNumber,
    }));
  }

  async listEnabledScheduleRules(): Promise<
    AutomationRuleWithCurrentDefinition[]
  > {
    const rows = await this.db.$queryRaw<RuleWithDefinitionRow[]>`
      SELECT r."id", r."organizationId", r."name", r."enabled", r."enabledAt", r."createdAt", r."updatedAt",
             v."version" AS "versionNumber", v."definition" AS "definition"
      FROM "AutomationRule" r
      JOIN "AutomationRuleVersion" v
        ON v."organizationId" = r."organizationId" AND v."ruleId" = r."id"
      WHERE r."enabled" = TRUE
        AND v."version" = (
          SELECT MAX("version") FROM "AutomationRuleVersion"
          WHERE "organizationId" = r."organizationId" AND "ruleId" = r."id"
        )
      ORDER BY r."id" ASC`;
    return rows
      .map((row) => ({
        rule: mapRule(row),
        definition: mapDefinition(row.definition),
        version: row.versionNumber,
      }))
      .filter((entry) => entry.definition.trigger.kind === "SCHEDULE");
  }

  async listEnabledDomainEventRules(
    eventType: AutomationTriggerEventType,
  ): Promise<AutomationRuleWithCurrentDefinition[]> {
    const rows = await this.db.$queryRaw<RuleWithDefinitionRow[]>`
      SELECT r."id", r."organizationId", r."name", r."enabled", r."enabledAt", r."createdAt", r."updatedAt",
             v."version" AS "versionNumber", v."definition" AS "definition"
      FROM "AutomationRule" r
      JOIN "AutomationRuleVersion" v
        ON v."organizationId" = r."organizationId" AND v."ruleId" = r."id"
      WHERE r."enabled" = TRUE
        AND v."version" = (
          SELECT MAX("version") FROM "AutomationRuleVersion"
          WHERE "organizationId" = r."organizationId" AND "ruleId" = r."id"
        )
      ORDER BY r."organizationId" ASC, r."id" ASC`;
    return rows
      .map((row) => ({
        rule: mapRule(row),
        definition: mapDefinition(row.definition),
        version: row.versionNumber,
      }))
      .filter(
        (entry) =>
          entry.definition.trigger.kind === "DOMAIN_EVENT" &&
          entry.definition.trigger.eventType === eventType,
      );
  }

  async createRule(input: {
    rule: AutomationRule;
    version: AutomationRuleVersion;
  }): Promise<
    | Readonly<{
        kind: "created";
        rule: AutomationRule;
        version: AutomationRuleVersion;
      }>
    | Readonly<{ kind: "conflict"; reason: CreateRuleConflictReason }>
  > {
    try {
      await this.db.$transaction(async (tx) => {
        await tx.$executeRaw`
          INSERT INTO "AutomationRule"
            ("id", "organizationId", "name", "enabled", "enabledAt", "createdAt", "updatedAt")
          VALUES
            (${input.rule.id}::uuid, ${input.rule.organizationId}::uuid, ${input.rule.name},
             ${input.rule.enabled}, ${input.rule.enabledAt}, ${input.rule.createdAt}, ${input.rule.updatedAt})`;
        await tx.$executeRaw`
          INSERT INTO "AutomationRuleVersion"
            ("organizationId", "ruleId", "version", "definition", "createdBy", "createdAt", "supersedesVersion", "note")
          VALUES
            (${input.version.organizationId}::uuid, ${input.version.ruleId}::uuid, ${input.version.version},
             ${JSON.stringify(input.version.definition)}::jsonb, ${input.version.createdBy}::uuid,
             ${input.version.createdAt}, ${input.version.supersedesVersion}, ${input.version.note})`;
      });
    } catch (error) {
      const reason = ruleInsertConflictReason(error);
      if (reason) return { kind: "conflict", reason };
      throw error;
    }
    return { kind: "created", rule: input.rule, version: input.version };
  }

  async addRuleVersion(input: { version: AutomationRuleVersion }): Promise<
    | Readonly<{
        kind: "created";
        rule: AutomationRule;
        version: AutomationRuleVersion;
      }>
    | Readonly<{ kind: "conflict"; reason: AddRuleVersionConflictReason }>
  > {
    try {
      const rows = await this.db.$queryRaw<RuleRow[]>`
        WITH inserted AS (
          INSERT INTO "AutomationRuleVersion"
            ("organizationId", "ruleId", "version", "definition", "createdBy", "createdAt", "supersedesVersion", "note")
          VALUES
            (${input.version.organizationId}::uuid, ${input.version.ruleId}::uuid, ${input.version.version},
             ${JSON.stringify(input.version.definition)}::jsonb, ${input.version.createdBy}::uuid,
             ${input.version.createdAt}, ${input.version.supersedesVersion}, ${input.version.note})
          RETURNING "organizationId", "ruleId"
        )
        UPDATE "AutomationRule" r
        SET "updatedAt" = ${input.version.createdAt}
        FROM inserted
        WHERE r."organizationId" = inserted."organizationId" AND r."id" = inserted."ruleId"
        RETURNING r."id", r."organizationId", r."name", r."enabled", r."enabledAt", r."createdAt", r."updatedAt"`;
      if (!rows[0]) return { kind: "conflict", reason: "rule-missing" };
      return {
        kind: "created",
        rule: mapRule(rows[0]),
        version: input.version,
      };
    } catch (error) {
      const code = pgErrorCode(error);
      if (code === "23505")
        return { kind: "conflict", reason: "version-conflict" };
      if (code === "23503") return { kind: "conflict", reason: "rule-missing" };
      throw error;
    }
  }

  async setRuleEnabled(input: {
    organizationId: string;
    ruleId: string;
    enabled: boolean;
    updatedAt: Date;
  }): Promise<
    | Readonly<{ kind: "updated"; rule: AutomationRule }>
    | Readonly<{ kind: "not-found" }>
  > {
    const rows = await this.db.$queryRaw<RuleRow[]>`
      UPDATE "AutomationRule"
      SET "enabled" = ${input.enabled},
          "enabledAt" = ${input.enabled ? input.updatedAt : null},
          "updatedAt" = ${input.updatedAt}
      WHERE "organizationId" = ${input.organizationId}::uuid AND "id" = ${input.ruleId}::uuid
      RETURNING "id", "organizationId", "name", "enabled", "enabledAt", "createdAt", "updatedAt"`;
    return rows[0]
      ? { kind: "updated", rule: mapRule(rows[0]) }
      : { kind: "not-found" };
  }
}

type RuleRow = {
  id: string;
  organizationId: string;
  name: string;
  enabled: boolean;
  enabledAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

type VersionRow = {
  organizationId: string;
  ruleId: string;
  version: number;
  definition: unknown;
  createdBy: string;
  createdAt: Date;
  supersedesVersion: number | null;
  note: string | null;
};

type RuleWithDefinitionRow = RuleRow & {
  versionNumber: number;
  definition: unknown;
};

function mapRule(row: RuleRow): AutomationRule {
  return Object.freeze({
    id: row.id,
    organizationId: row.organizationId,
    name: row.name,
    enabled: row.enabled,
    enabledAt: row.enabledAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  });
}

function mapVersion(row: VersionRow): AutomationRuleVersion {
  return Object.freeze({
    organizationId: row.organizationId,
    ruleId: row.ruleId,
    version: row.version,
    definition: mapDefinition(row.definition),
    createdBy: row.createdBy,
    createdAt: row.createdAt,
    supersedesVersion: row.supersedesVersion,
    note: row.note,
  });
}

function mapDefinition(raw: unknown): AutomationRuleDefinition {
  const parsed = parseRuleDefinition(raw);
  if (parsed.kind === "invalid")
    throw new Error(
      `stored automation rule definition is invalid: ${parsed.reason}`,
    );
  return parsed.definition;
}

function pgErrorCode(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null) return undefined;
  const meta = (error as { meta?: { code?: unknown } }).meta;
  if (meta && typeof meta.code === "string") return meta.code;
  const direct = (error as { code?: unknown }).code;
  return typeof direct === "string" ? direct : undefined;
}

function ruleInsertConflictReason(
  error: unknown,
): CreateRuleConflictReason | null {
  const code = pgErrorCode(error);
  if (code !== "23505") return null;
  const message = String(
    (error as { meta?: { message?: unknown } }).meta?.message ?? "",
  );
  if (message.includes("AutomationRule_organizationId_name_key"))
    return "rule-name-conflict";
  if (message.includes("AutomationRule_pkey")) return "rule-id-conflict";
  return "rule-name-conflict";
}
