import { BadRequestException } from "@nestjs/common";
import { Transform, Type } from "class-transformer";
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsDefined,
  IsIn,
  IsISO8601,
  IsString,
  IsUUID,
  Length,
  Matches,
  ValidateNested,
} from "class-validator";

const UTC_ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const CANONICAL_AMOUNT = /^[1-9]\d*$/;

function strictUtc(value: string): string {
  if (!UTC_ISO.test(value) || Number.isNaN(Date.parse(value)))
    throw new BadRequestException("Invalid UTC timestamp");
  return value;
}

function amountMinor(value: unknown): bigint {
  if (typeof value !== "string" || !CANONICAL_AMOUNT.test(value))
    throw new BadRequestException("Invalid amountMinor");
  return BigInt(value);
}

export class CreateAccountDto {
  @IsString() @Length(1, 64) code!: string;
  @IsString() @Length(1, 200) name!: string;
  @IsIn(["ASSET", "LIABILITY", "EQUITY", "REVENUE", "EXPENSE"]) type!:
    "ASSET" | "LIABILITY" | "EQUITY" | "REVENUE" | "EXPENSE";
}

export class CreateAccountingPeriodDto {
  @IsString()
  @IsISO8601({ strict: true })
  @Transform(({ value }) => strictUtc(value))
  startsAt!: string;
  @IsString()
  @IsISO8601({ strict: true })
  @Transform(({ value }) => strictUtc(value))
  endsAt!: string;
}

export class JournalLineDto {
  @IsString() @IsIn(["DEBIT", "CREDIT"]) side!: "DEBIT" | "CREDIT";
  @IsString() @Length(1, 3) currency!: string;
  @IsDefined()
  @Transform(({ value }) => amountMinor(value))
  amountMinor!: bigint;
  @IsUUID() accountId!: string;
}

export class CreateJournalDraftDto {
  @IsString() @Length(1, 200) @Matches(/\S/) reference!: string;
  @IsString() @Length(1, 200) @Matches(/\S/) reason!: string;
  @ArrayMinSize(2)
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => JournalLineDto)
  lines!: JournalLineDto[];
}

export class PostJournalEntryDto {
  @IsUUID() periodId!: string;
  @IsString()
  @IsISO8601({ strict: true })
  @Transform(({ value }) => strictUtc(value))
  postedAt!: string;
}

export function ledgerResponse(value: unknown): unknown {
  if (typeof value === "bigint") return value.toString(10);
  if (Array.isArray(value)) return value.map(ledgerResponse);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, ledgerResponse(item)]),
    );
  return value;
}
