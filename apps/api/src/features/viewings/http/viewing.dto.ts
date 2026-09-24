import { Type } from "class-transformer";
import {
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
} from "class-validator";

const UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/;

export class CreateViewingDto {
  @IsUUID() leadId!: string;
  @IsUUID() propertyId!: string;
  @IsUUID() brokerId!: string;
  @IsDateString({ strict: true }) @Matches(UTC) startAt!: string;
  @IsDateString({ strict: true }) @Matches(UTC) endAt!: string;
  @IsOptional() @IsString() @MaxLength(1000) notes?: string;
}
export class RescheduleViewingDto {
  @IsDateString({ strict: true }) @Matches(UTC) startAt!: string;
  @IsDateString({ strict: true }) @Matches(UTC) endAt!: string;
  @IsOptional() @IsString() @MaxLength(500) reason?: string;
}
export class ViewingReasonDto {
  @IsOptional() @IsString() @MaxLength(500) reason?: string;
}
export class ViewingListQueryDto {
  @IsOptional() @IsUUID() brokerId?: string;
  @IsOptional() @IsDateString({ strict: true }) @Matches(UTC) from?: string;
  @IsOptional() @IsDateString({ strict: true }) @Matches(UTC) to?: string;
  @IsOptional() @IsString() @MaxLength(255) cursor?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit?: number;
}
export class AvailabilityRuleDto {
  @IsUUID() brokerId!: string;
  @IsInt() @Min(0) @Max(6) weekday!: number;
  @IsInt() @Min(0) @Max(1439) startMinute!: number;
  @IsInt() @Min(1) @Max(1440) endMinute!: number;
  @IsString()
  @Matches(/^[A-Za-z_]+(?:\/[A-Za-z0-9_+-]+)+$/)
  @MaxLength(64)
  timezone!: string;
}
export class AvailabilityExceptionDto {
  @IsUUID() brokerId!: string;
  @Matches(/^\d{4}-\d{2}-\d{2}$/) localDate!: string;
  @IsIn(["BLOCKED", "EXTRA"]) kind!: "BLOCKED" | "EXTRA";
  @IsInt() @Min(0) @Max(1439) startMinute!: number;
  @IsInt() @Min(1) @Max(1440) endMinute!: number;
  @IsString()
  @Matches(/^[A-Za-z_]+(?:\/[A-Za-z0-9_+-]+)+$/)
  @MaxLength(64)
  timezone!: string;
}
