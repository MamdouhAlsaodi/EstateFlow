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
  Matches,
  Max,
  Min,
} from "class-validator";

const AMOUNT = /^[1-9]\d*$/;
const UTC_ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

export const CAMPAIGN_CHANNEL_VALUES = [
  "META",
  "GOOGLE",
  "SNAPCHAT",
  "TIKTOK",
  "X",
  "LINKEDIN",
  "PRINT",
  "OUTDOOR",
  "REFERRAL",
  "OTHER",
] as const;
export const CAMPAIGN_STATUS_VALUES = [
  "DRAFT",
  "ACTIVE",
  "COMPLETED",
  "CANCELLED",
] as const;
export const CAMPAIGN_TARGET_STATUS_VALUES = [
  "ACTIVE",
  "COMPLETED",
  "CANCELLED",
] as const;
export const TOUCH_CHANNEL_VALUES = [
  "WEBSITE",
  "WHATSAPP",
  "PHONE_CALL",
  "WALK_IN",
  "REFERRAL",
  "META",
  "GOOGLE",
  "SNAPCHAT",
  "TIKTOK",
  "X",
  "OTHER",
] as const;

function parseAmountMinor(value: unknown): bigint {
  if (typeof value !== "string" || !AMOUNT.test(value))
    throw new BadRequestException("Invalid amountMinor");
  return BigInt(value);
}

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

export class CreateCampaignDto {
  @IsDefined()
  @IsString()
  @IsNotEmpty()
  @Transform(({ value }) => trimText(value))
  name!: string;

  @IsDefined()
  @IsString()
  @IsNotEmpty()
  @Transform(({ value }) => trimText(value))
  objective!: string;

  @IsDefined()
  @IsString()
  @IsIn(CAMPAIGN_CHANNEL_VALUES)
  channel!: string;

  @IsDefined()
  @IsString()
  @IsISO8601({ strict: true })
  @Transform(({ value }) => parseUtcTimestamp(value))
  startsAt!: string;

  @IsDefined()
  @IsString()
  @IsISO8601({ strict: true })
  @Transform(({ value }) => parseUtcTimestamp(value))
  endsAt!: string;

  @IsDefined()
  @Transform(({ value }) => parseAmountMinor(value))
  budgetPlannedMinor!: bigint;

  @IsDefined()
  @IsString()
  @Matches(/^[A-Z]{3}$/)
  currency!: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @Transform(({ value }) => optionalTrimmed(value))
  utmSource?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @Transform(({ value }) => optionalTrimmed(value))
  utmMedium?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @Transform(({ value }) => optionalTrimmed(value))
  utmCampaign?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @Transform(({ value }) => optionalTrimmed(value))
  utmContent?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @Transform(({ value }) => optionalTrimmed(value))
  utmTerm?: string;
}

export class CampaignTransitionDto {
  @IsDefined()
  @IsString()
  @IsIn(CAMPAIGN_TARGET_STATUS_VALUES)
  toStatus!: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @Transform(({ value }) => optionalTrimmed(value))
  reason?: string;
}

export class CampaignBudgetCorrectionDto {
  @IsDefined()
  @Transform(({ value }) => parseAmountMinor(value))
  correctedMinor!: bigint;

  @IsDefined()
  @IsString()
  @IsNotEmpty()
  @Transform(({ value }) => trimText(value))
  reason!: string;
}

export class CampaignPerformanceEntryDto {
  @IsDefined()
  @IsString()
  @IsISO8601({ strict: true })
  @Transform(({ value }) => parseUtcTimestamp(value))
  occurredAt!: string;

  @IsDefined()
  @IsInt()
  @Min(0)
  @Max(1_000_000_000)
  impressions!: number;

  @IsDefined()
  @IsInt()
  @Min(0)
  @Max(1_000_000_000)
  clicks!: number;

  @IsDefined()
  @IsInt()
  @Min(0)
  @Max(1_000_000_000)
  leadsCount!: number;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @Transform(({ value }) => optionalTrimmed(value))
  note?: string;
}

export class CreateLeadTouchDto {
  @IsDefined()
  @IsString()
  @IsIn(TOUCH_CHANNEL_VALUES)
  channel!: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @Transform(({ value }) => optionalTrimmed(value))
  source?: string;

  @IsOptional()
  @IsUUID()
  campaignId?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @Transform(({ value }) => optionalTrimmed(value))
  utmSource?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @Transform(({ value }) => optionalTrimmed(value))
  utmMedium?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @Transform(({ value }) => optionalTrimmed(value))
  utmCampaign?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @Transform(({ value }) => optionalTrimmed(value))
  utmContent?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @Transform(({ value }) => optionalTrimmed(value))
  utmTerm?: string;

  @IsOptional()
  @IsString()
  @IsISO8601({ strict: true })
  @Transform(({ value }) => parseUtcTimestamp(value))
  occurredAt?: string;
}

export class AttributionCorrectionDto {
  @IsOptional()
  @IsUUID()
  correctedCampaignId?: string;

  @IsDefined()
  @IsString()
  @IsNotEmpty()
  @Transform(({ value }) => trimText(value))
  reason!: string;
}

export class CampaignListQueryDto {
  @IsOptional()
  @IsString()
  @IsIn(CAMPAIGN_STATUS_VALUES)
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

export class CampaignPageQueryDto {
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

/** Bigint-safe, UTC-safe JSON rendering for every campaign response. */
export function campaignResponse(value: unknown): unknown {
  if (typeof value === "bigint") return value.toString(10);
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(campaignResponse);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, campaignResponse(item)]),
    );
  return value;
}
