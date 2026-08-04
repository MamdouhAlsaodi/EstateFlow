import { Type } from "class-transformer";
import { IsIn, IsInt, IsNotEmpty, IsOptional, IsString, Max, MaxLength, Min, ValidateNested } from "class-validator";
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
