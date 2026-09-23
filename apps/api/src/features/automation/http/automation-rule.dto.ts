import { BadRequestException } from "@nestjs/common";
import { Transform, Type } from "class-transformer";
import {
  IsDefined,
  IsOptional,
  IsString,
  Length,
  Matches,
  Max,
  Min,
  IsInt,
} from "class-validator";
import { parseRuleDefinition } from "../domain/rule.js";
import type {
  AutomationRule,
  AutomationRuleDefinition,
  AutomationRuleVersion,
} from "../domain/rule.js";
import type { AutomationJob as AutomationJobRecord } from "../domain/execution.js";

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

export class AutomationFailedJobsQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
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

export function failedJobItem(job: {
  id: string;
  ruleId: string;
  ruleVersion: number;
  actionType: string;
  targetType: string;
  targetId: string;
  status: string;
  attemptCount: number;
  maxAttempts: number;
  lastError: { kind: string; message: string } | null;
  completedAt: Date | null;
  updatedAt: Date;
}): unknown {
  return {
    id: job.id,
    ruleId: job.ruleId,
    ruleVersion: job.ruleVersion,
    actionType: job.actionType,
    targetType: job.targetType,
    targetId: job.targetId,
    status: job.status,
    attemptCount: job.attemptCount,
    maxAttempts: job.maxAttempts,
    lastError: job.lastError,
    failedAt: job.completedAt,
    updatedAt: job.updatedAt,
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

/**
 * EF-306 — closed execution-history rendering. Typed status, attempt book
 * keeping, and the typed last error only: no action payload, no execution
 * key, no event id, and never a raw provider payload or secret.
 */
export function automationJobItem(job: AutomationJobRecord): unknown {
  return {
    id: job.id,
    ruleId: job.ruleId,
    ruleVersion: job.ruleVersion,
    triggerKind: job.triggerKind,
    eventType: job.eventType,
    actionType: job.actionType,
    targetType: job.targetType,
    targetId: job.targetId,
    status: job.status,
    attemptCount: job.attemptCount,
    maxAttempts: job.maxAttempts,
    lastError: job.lastError
      ? { kind: job.lastError.kind, message: job.lastError.message }
      : null,
    scheduledFor: job.scheduledFor,
    startedAt: job.startedAt,
    completedAt: job.completedAt,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
  };
}

export const AUTOMATION_RULE_LIST_BOUND = 200;
export const AUTOMATION_RULE_VERSION_HISTORY_BOUND = 1000;
export const AUTOMATION_JOB_HISTORY_BOUND = 100;
