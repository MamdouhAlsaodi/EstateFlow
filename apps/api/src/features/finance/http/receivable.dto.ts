import { BadRequestException } from "@nestjs/common";
import { Transform } from "class-transformer";
import {
  IsDefined,
  IsISO8601,
  IsInt,
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
const DECIMAL_LIMIT = /^[1-9]\d{0,2}$/;

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

function parseAgingLimit(value: unknown): number {
  if (typeof value !== "string" || !DECIMAL_LIMIT.test(value))
    throw new BadRequestException("Invalid aging limit");
  return Number(value);
}

export class CancelInvoiceDto {
  @IsDefined()
  @IsString()
  @IsNotEmpty()
  @Transform(({ value }) => (typeof value === "string" ? value.trim() : value))
  reason!: string;
}

class MoneyDto {
  @IsDefined()
  @Transform(({ value }) => parseAmountMinor(value))
  amountMinor!: bigint;
  @IsString() @Matches(/^[A-Z]{3}$/) currency!: string;
}

export class CreateInvoiceDraftDto extends MoneyDto {}

export class IssueInvoiceDto {
  @IsUUID() receivableId!: string;
  @IsString()
  @IsISO8601({ strict: true })
  @Transform(({ value }) => parseUtcTimestamp(value))
  issuedAt!: string;
  @IsString()
  @IsISO8601({ strict: true })
  @Transform(({ value }) => parseUtcTimestamp(value))
  dueAt!: string;
}

export class RecordPaymentDto extends MoneyDto {
  @IsString()
  @IsISO8601({ strict: true })
  @Transform(({ value }) => parseUtcTimestamp(value))
  recordedAt!: string;
}

export class ReceivableAgingQueryDto {
  @IsOptional()
  @IsString()
  cursor?: string;

  @IsOptional()
  @Transform(({ value }) => parseAgingLimit(value))
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}

export function receivableResponse(value: unknown): unknown {
  if (typeof value === "bigint") return value.toString(10);
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(receivableResponse);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        receivableResponse(item),
      ]),
    );
  return value;
}
