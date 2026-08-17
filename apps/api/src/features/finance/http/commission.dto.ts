import { BadRequestException } from "@nestjs/common";
import { Transform, Type } from "class-transformer";
import {
  ArrayMinSize,
  IsArray,
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
  ValidateNested,
  registerDecorator,
  type ValidationArguments,
  type ValidationOptions,
} from "class-validator";

const UTC_ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const AMOUNT = /^[1-9]\d*$/;
function utc(value: unknown): unknown {
  if (
    typeof value !== "string" ||
    !UTC_ISO.test(value) ||
    Number.isNaN(Date.parse(value))
  )
    throw new BadRequestException();
  return value;
}
function CompletePolicy(options?: ValidationOptions) {
  return (object: object, propertyName: string) =>
    registerDecorator({
      name: "completePolicy",
      target: object.constructor,
      propertyName,
      options,
      validator: {
        validate(_: unknown, args: ValidationArguments) {
          const value = args.object as CreateCommissionPlanVersionDto;
          return (
            (value.rateBps === undefined) === (value.recipients === undefined)
          );
        },
      },
    });
}
function ValidRecipients(options?: ValidationOptions) {
  return (object: object, propertyName: string) =>
    registerDecorator({
      name: "validRecipients",
      target: object.constructor,
      propertyName,
      options,
      validator: {
        validate(_: unknown, args: ValidationArguments) {
          const value = args.object as CreateCommissionPlanVersionDto;
          if (!value.recipients) return true;
          return (
            new Set(value.recipients.map((r) => r.order)).size ===
              value.recipients.length &&
            value.recipients.reduce((sum, r) => sum + r.splitBps, 0) === 10000
          );
        },
      },
    });
}

export class CommissionRecipientDto {
  @IsInt() @Min(1) order!: number;
  @IsString() @IsIn(["BROKER", "OFFICE"]) kind!: "BROKER" | "OFFICE";
  @IsInt() @Min(1) @Max(10000) splitBps!: number;
}
export class CreateCommissionPlanVersionDto {
  @IsInt() @Min(1) @CompletePolicy() @ValidRecipients() version!: number;
  @IsOptional() @IsInt() @Min(1) @Max(10000) rateBps?: number;
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CommissionRecipientDto)
  recipients?: CommissionRecipientDto[];
}
export class CaptureCommissionableValueDto {
  @IsUUID() valueId!: string;
  @IsDefined() @IsString() @Matches(AMOUNT) amountMinor!: string;
  @IsString() @Matches(/^[A-Z]{3}$/) currency!: string;
  @IsString()
  @IsISO8601({ strict: true })
  @Transform(({ value }) => utc(value))
  capturedAt!: string;
}
export class CreateExpectedAccrualDto {
  @IsUUID() accrualId!: string;
  @IsUUID() commissionableValueId!: string;
  @IsUUID() commissionPlanVersionId!: string;
  @IsUUID() dealClosedWonEventId!: string;
}
export function commissionResponse(value: unknown): unknown {
  if (typeof value === "bigint") return value.toString(10);
  if (Array.isArray(value)) return value.map(commissionResponse);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        commissionResponse(item),
      ]),
    );
  return value;
}
