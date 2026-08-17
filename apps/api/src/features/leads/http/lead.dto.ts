import { Type } from "class-transformer";
import {
  IsDateString,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from "class-validator";
import type { LeadStage } from "../domain/lead.js";

const MAX_UTM_FIELD_LENGTH = 255;

class LeadUtmDto {
  @IsOptional()
  @IsString()
  @MaxLength(MAX_UTM_FIELD_LENGTH)
  source?: string;

  @IsOptional()
  @IsString()
  @MaxLength(MAX_UTM_FIELD_LENGTH)
  medium?: string;

  @IsOptional()
  @IsString()
  @MaxLength(MAX_UTM_FIELD_LENGTH)
  campaign?: string;

  @IsOptional()
  @IsString()
  @MaxLength(MAX_UTM_FIELD_LENGTH)
  term?: string;

  @IsOptional()
  @IsString()
  @MaxLength(MAX_UTM_FIELD_LENGTH)
  content?: string;
}

export class LeadDetailQueryDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  cursor?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}

export class LeadListQueryDto {
  @IsOptional()
  @IsIn(["NEW", "CONTACTED", "QUALIFIED", "NURTURING"])
  stage?: LeadStage;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  cursor?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}

export class CreateLeadDto {
  @IsString()
  @IsNotEmpty()
  id!: string;

  @IsString()
  @IsNotEmpty()
  ownerId!: string;

  @IsString()
  @IsNotEmpty()
  nextAction!: string;

  @IsString()
  @IsNotEmpty()
  source!: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => LeadUtmDto)
  utm?: LeadUtmDto;
}

export class LeadVersionDto {
  @IsInt()
  @Min(1)
  @Max(Number.MAX_SAFE_INTEGER)
  expectedVersion!: number;
}

const ISO_UTC_DATE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/;

export class CreateLeadNoteDto {
  @IsString()
  @Matches(/\S/)
  @MaxLength(2000)
  body!: string;
}

export class CreateLeadTaskDto {
  @IsString()
  @Matches(/\S/)
  @MaxLength(500)
  title!: string;

  @IsDateString({ strict: true })
  @Matches(ISO_UTC_DATE)
  dueAt!: string;
}

export class CompleteLeadTaskDto extends LeadVersionDto {}

export class RescheduleLeadTaskDto extends LeadVersionDto {
  @IsDateString({ strict: true })
  @Matches(ISO_UTC_DATE)
  dueAt!: string;
}

export class CloseWonDto extends LeadVersionDto {
  @IsUUID()
  propertyId!: string;

  @IsUUID()
  brokerId!: string;
}

export class CloseLostDto extends LeadVersionDto {
  @IsString()
  @Matches(/\S/)
  @MaxLength(1000)
  reason!: string;
}

export class TransitionLeadDto extends LeadVersionDto {
  @IsIn(["NEW", "CONTACTED", "QUALIFIED", "NURTURING"])
  to!: LeadStage;
}

export class AssignLeadDto extends LeadVersionDto {
  @IsString()
  @IsNotEmpty()
  ownerId!: string;
}

export class NextActionDto extends LeadVersionDto {
  @IsString()
  @IsNotEmpty()
  nextAction!: string;
}
