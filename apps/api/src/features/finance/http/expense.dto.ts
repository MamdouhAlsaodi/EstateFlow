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

export const EXPENSE_CATEGORY_VALUES = [
  "OFFICE",
  "CAMPAIGN",
  "PROPERTY",
  "OTHER",
] as const;
export const EXPENSE_MEDIA_TYPE_VALUES = [
  "PDF",
  "JPEG",
  "PNG",
  "WEBP",
] as const;
export const EXPENSE_DECISION_VALUES = ["APPROVED", "REJECTED"] as const;

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

export class CreateExpenseDto {
  @IsDefined()
  @IsString()
  @IsIn(EXPENSE_CATEGORY_VALUES)
  category!: string;

  @IsDefined()
  @IsString()
  @IsNotEmpty()
  @Transform(({ value }) => trimText(value))
  vendorReference!: string;

  @IsDefined()
  @Transform(({ value }) => parseAmountMinor(value))
  amountMinor!: bigint;

  @IsDefined()
  @IsString()
  @Matches(/^[A-Z]{3}$/)
  currency!: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @Transform(({ value }) => trimText(value))
  campaignReference?: string;

  @IsOptional()
  @IsUUID()
  propertyId?: string;

  @IsOptional()
  @IsUUID()
  dealId?: string;
}

export class AttachExpenseEvidenceDto {
  @IsDefined()
  @IsUUID()
  evidenceId!: string;

  @IsDefined()
  @IsString()
  @IsIn(EXPENSE_MEDIA_TYPE_VALUES)
  mediaType!: string;

  @IsDefined()
  @IsInt()
  @Min(1)
  @Max(100_000_000)
  byteSize!: number;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @Transform(({ value }) => trimText(value))
  note?: string;

  @IsDefined()
  @IsString()
  @IsISO8601({ strict: true })
  @Transform(({ value }) => parseUtcTimestamp(value))
  attachedAt!: string;
}

export class DecideExpenseDto {
  @IsDefined()
  @IsString()
  @IsIn(EXPENSE_DECISION_VALUES)
  decision!: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @Transform(({ value }) => trimText(value))
  reason?: string;
}

export class SetExpenseApprovalPolicyDto {
  @IsOptional()
  @Transform(({ value }) =>
    value === undefined || value === null || value === ""
      ? undefined
      : parseAmountMinor(value),
  )
  thresholdMinor?: bigint;

  @IsDefined()
  @IsString()
  @Matches(/^[A-Z]{3}$/)
  currency!: string;
}

export function expenseResponse(value: unknown): unknown {
  if (typeof value === "bigint") return value.toString(10);
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(expenseResponse);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, expenseResponse(item)]),
    );
  return value;
}
