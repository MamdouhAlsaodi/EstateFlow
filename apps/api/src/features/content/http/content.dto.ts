import { BadRequestException } from "@nestjs/common";
import { Transform } from "class-transformer";
import {
  IsDefined,
  IsIn,
  IsInt,
  IsISO8601,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
} from "class-validator";

const UTC_ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

export const CONTENT_STATUS_VALUES = [
  "IDEA",
  "DRAFT",
  "REVIEW",
  "APPROVED",
  "SCHEDULED",
  "PUBLISHED",
  "FAILED",
] as const;

/** Targets of the transition endpoint; IDEA is only a creation state. */
export const CONTENT_TARGET_STATUS_VALUES = [
  "DRAFT",
  "REVIEW",
  "APPROVED",
  "SCHEDULED",
  "PUBLISHED",
  "FAILED",
] as const;

export const CONTENT_CHANNEL_VALUES = [
  "INSTAGRAM",
  "X",
  "SNAPCHAT",
  "TIKTOK",
  "LINKEDIN",
  "FACEBOOK",
  "WHATSAPP",
  "EMAIL",
  "WEBSITE",
  "OTHER",
] as const;

export const CONTENT_FAILURE_KIND_VALUES = [
  "CHANNEL_REJECTED",
  "CHANNEL_TIMEOUT",
  "CONTENT_POLICY_VIOLATION",
  "SCHEDULE_MISSED",
  "OTHER",
] as const;

function parseUtcTimestamp(value: unknown): string {
  if (
    typeof value !== "string" ||
    !UTC_ISO.test(value) ||
    Number.isNaN(Date.parse(value))
  )
    throw new BadRequestException("Invalid UTC timestamp");
  return value;
}

function trimText(value: unknown): unknown {
  return typeof value === "string" ? value.trim() : value;
}

function optionalTrimmed(value: unknown): unknown {
  if (value === undefined || value === null || value === "") return undefined;
  return trimText(value);
}

export class CreateContentDto {
  @IsDefined()
  @IsString()
  @IsNotEmpty()
  @Transform(({ value }) => trimText(value))
  title!: string;

  @IsDefined()
  @IsString()
  @IsNotEmpty()
  @Transform(({ value }) => trimText(value))
  body!: string;

  @IsDefined()
  @IsString()
  @IsIn(CONTENT_CHANNEL_VALUES)
  channel!: string;

  @IsOptional()
  @IsUUID()
  campaignId?: string;
}

export class EditContentDto {
  @IsDefined()
  @IsString()
  @IsNotEmpty()
  @Transform(({ value }) => trimText(value))
  title!: string;

  @IsDefined()
  @IsString()
  @IsNotEmpty()
  @Transform(({ value }) => trimText(value))
  body!: string;

  @IsDefined()
  @IsString()
  @IsIn(CONTENT_CHANNEL_VALUES)
  channel!: string;

  @IsOptional()
  @IsUUID()
  campaignId?: string;
}

export class ContentTransitionDto {
  @IsDefined()
  @IsString()
  @IsIn(CONTENT_TARGET_STATUS_VALUES)
  toStatus!: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @Transform(({ value }) => optionalTrimmed(value))
  reason?: string;

  @IsOptional()
  @IsString()
  @IsIn(CONTENT_FAILURE_KIND_VALUES)
  failureKind?: string;

  @IsOptional()
  @IsString()
  @IsISO8601({ strict: true })
  @Transform(({ value }) => parseUtcTimestamp(value))
  scheduledFor?: string;
}

export class ContentListQueryDto {
  @IsOptional()
  @IsString()
  @IsIn(CONTENT_STATUS_VALUES)
  status?: string;

  @IsOptional()
  @IsString()
  cursor?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  @Transform(({ value }) =>
    value === undefined || value === null || value === ""
      ? undefined
      : typeof value === "string"
        ? Number(value)
        : value,
  )
  limit?: number;
}

export class ContentCalendarQueryDto {
  @IsDefined()
  @IsString()
  @IsISO8601({ strict: true })
  @Transform(({ value }) => parseUtcTimestamp(value))
  from!: string;

  @IsDefined()
  @IsString()
  @IsISO8601({ strict: true })
  @Transform(({ value }) => parseUtcTimestamp(value))
  to!: string;
}

/** EF-403 — deterministic draft generation from an allowlisted projection. */
export class GenerateContentDto {
  @IsDefined()
  @IsUUID()
  propertyId!: string;

  @IsDefined()
  @IsString()
  @IsIn(CONTENT_CHANNEL_VALUES)
  channel!: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(1000)
  @Transform(({ value }) =>
    value === undefined || value === null || value === ""
      ? undefined
      : typeof value === "string"
        ? Number(value)
        : value,
  )
  templateVersion?: number;
}

/** Bigint-safe (future-proof), UTC-safe JSON rendering for content responses. */
export function contentResponse(value: unknown): unknown {
  if (typeof value === "bigint") return value.toString(10);
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(contentResponse);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, contentResponse(item)]),
    );
  return value;
}
