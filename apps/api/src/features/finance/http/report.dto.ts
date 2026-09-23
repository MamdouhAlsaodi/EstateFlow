import { BadRequestException } from "@nestjs/common";
import { Transform } from "class-transformer";
import {
  IsDefined,
  IsIn,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  Min,
} from "class-validator";

const UTC_ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const CURSOR = /^[A-Za-z0-9_-]+$/;

export const REPORT_AGING_BUCKET_VALUES = [
  "CURRENT",
  "DAYS_1_30",
  "DAYS_31_60",
  "DAYS_61_90",
  "DAYS_91_PLUS",
] as const;
export const REPORT_COMMISSION_STATUS_VALUES = [
  "EXPECTED",
  "CONFIRMED",
  "DUE",
  "PAID",
  "CANCELLED",
] as const;

function parseUtcInstant(field: string) {
  return ({ value }: { value: unknown }): unknown => {
    if (value === undefined || value === null || value === "") return undefined;
    if (typeof value !== "string" || !UTC_ISO.test(value))
      throw new BadRequestException(`Invalid ${field}`);
    return value;
  };
}

function parsePageLimit({ value }: { value: unknown }): unknown {
  if (value === undefined || value === null || value === "") return undefined;
  const parsed = typeof value === "string" ? Number(value) : value;
  if (typeof parsed !== "number" || !Number.isInteger(parsed))
    throw new BadRequestException("Invalid limit");
  return parsed;
}

function parseCursor({ value }: { value: unknown }): unknown {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value !== "string" || !CURSOR.test(value))
    throw new BadRequestException("Invalid cursor");
  return value;
}

export class ReportWindowQueryDto {
  @IsOptional()
  @IsString()
  @IsISO8601({ strict: true })
  @Matches(UTC_ISO)
  @Transform(parseUtcInstant("from"))
  from?: string;

  @IsOptional()
  @IsString()
  @IsISO8601({ strict: true })
  @Matches(UTC_ISO)
  @Transform(parseUtcInstant("to"))
  to?: string;
}

export class ReportPageQueryDto {
  @IsOptional()
  @Transform(parseCursor)
  @IsString()
  cursor?: string;

  @IsOptional()
  @Transform(parsePageLimit)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}

export class ReportDimensionQueryDto {
  @IsOptional()
  @IsUUID()
  dealId?: string;

  @IsOptional()
  @IsUUID()
  propertyId?: string;

  @IsOptional()
  @IsUUID()
  campaignId?: string;
}

export class ReportItemsQueryDto extends ReportWindowQueryDto {
  @IsOptional()
  @IsUUID()
  dealId?: string;

  @IsOptional()
  @IsUUID()
  propertyId?: string;

  @IsOptional()
  @IsUUID()
  campaignId?: string;

  @IsOptional()
  @Transform(parseCursor)
  @IsString()
  cursor?: string;

  @IsOptional()
  @Transform(parsePageLimit)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  static dimension(input: ReportItemsQueryDto): {
    dealId?: string;
    propertyId?: string;
    campaignId?: string;
  } {
    const provided = [input.dealId, input.propertyId, input.campaignId].filter(
      (value) => value !== undefined,
    ).length;
    if (provided > 1) throw new BadRequestException();
    return {
      ...(input.dealId === undefined ? {} : { dealId: input.dealId }),
      ...(input.propertyId === undefined
        ? {}
        : { propertyId: input.propertyId }),
      ...(input.campaignId === undefined
        ? {}
        : { campaignId: input.campaignId }),
    };
  }
}

export const REPORT_ATTRIBUTION_MODEL_VALUES = [
  "FIRST_TOUCH",
  "LAST_TOUCH",
] as const;

export class ReportCampaignPerformanceQueryDto extends ReportWindowQueryDto {
  @IsDefined()
  @IsString()
  @IsIn(REPORT_ATTRIBUTION_MODEL_VALUES)
  model!: string;
}

export class ReportAgingItemsQueryDto {
  @IsDefined()
  @IsString()
  @IsIn(REPORT_AGING_BUCKET_VALUES)
  bucket!: string;

  @IsOptional()
  @Transform(parseCursor)
  @IsString()
  cursor?: string;

  @IsOptional()
  @Transform(parsePageLimit)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}

export class ReportCommissionItemsQueryDto {
  @IsDefined()
  @IsString()
  @IsIn(REPORT_COMMISSION_STATUS_VALUES)
  status!: string;

  @IsOptional()
  @Transform(parseCursor)
  @IsString()
  cursor?: string;

  @IsOptional()
  @Transform(parsePageLimit)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}

/** Bigint-safe, UTC-safe JSON rendering for every report response. */
export function reportResponse(value: unknown): unknown {
  if (typeof value === "bigint") return value.toString(10);
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(reportResponse);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, reportResponse(item)]),
    );
  return value;
}
