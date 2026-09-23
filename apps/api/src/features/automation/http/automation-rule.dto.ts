import { BadRequestException } from "@nestjs/common";
import { Transform } from "class-transformer";
import {
  IsDefined,
  IsOptional,
  IsString,
  Length,
  Matches,
} from "class-validator";
import { parseRuleDefinition } from "../domain/rule.js";
import type {
  AutomationRule,
  AutomationRuleDefinition,
  AutomationRuleVersion,
} from "../domain/rule.js";

function parseDefinitionTransform({ value }: { value: unknown }): unknown {
  if (value === undefined || value === null) return value;
  const parsed = parseRuleDefinition(value);
  if (parsed.kind === "invalid")
    throw new BadRequestException(
      `Invalid automation rule definition: ${parsed.reason}`,
    );
  return parsed.definition;
}

function trimText(value: unknown): unknown {
  return typeof value === "string" ? value.trim() : value;
}

export class CreateAutomationRuleDto {
  @IsDefined()
  @IsString()
  @Length(1, 200)
  @Matches(/\S/)
  @Transform(trimText)
  name!: string;

  @IsDefined()
  @Transform(parseDefinitionTransform)
  definition!: AutomationRuleDefinition;
}

export class AddAutomationRuleVersionDto {
  @IsDefined()
  @Transform(parseDefinitionTransform)
  definition!: AutomationRuleDefinition;

  @IsOptional()
  @IsString()
  @Length(1, 500)
  @Matches(/\S/)
  @Transform(trimText)
  note?: string;
}

/** Bigint-free, UTC-safe JSON rendering for every automation response. */
export function automationResponse(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(automationResponse);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        automationResponse(item),
      ]),
    );
  return value;
}

export function ruleSummary(
  rule: AutomationRule,
  definition: AutomationRuleDefinition,
  currentVersion: number,
): unknown {
  return {
    id: rule.id,
    name: rule.name,
    enabled: rule.enabled,
    currentVersion,
    createdAt: rule.createdAt,
    updatedAt: rule.updatedAt,
    definition,
  };
}

export function ruleVersionItem(version: AutomationRuleVersion): unknown {
  return {
    version: version.version,
    definition: version.definition,
    createdBy: version.createdBy,
    createdAt: version.createdAt,
    supersedesVersion: version.supersedesVersion,
    note: version.note,
  };
}

export const AUTOMATION_RULE_LIST_BOUND = 200;
export const AUTOMATION_RULE_VERSION_HISTORY_BOUND = 1000;
