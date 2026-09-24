/**
 * EF-610 — contract HTTP DTOs. Strict allowlists only; responses never carry
 * more than the closed-world contract views.
 */

import { ApiProperty } from "@nestjs/swagger";
import {
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from "class-validator";

export class CreateContractTemplateDto {
  @ApiProperty({ maxLength: 100 })
  @IsString()
  @Matches(/^[a-z][a-z0-9._-]{2,99}$/, {
    message: "templateKey must match [a-z][a-z0-9._-]{2,99}",
  })
  templateKey!: string;

  @ApiProperty({ maxLength: 200 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  titlePattern!: string;

  @ApiProperty({ maxLength: 8000 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(8000)
  bodyPattern!: string;
}

export class GenerateContractDto {
  @ApiProperty()
  @IsUUID()
  dealId!: string;

  @ApiProperty()
  @IsUUID()
  templateId!: string;

  @ApiProperty({ required: false, minimum: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100000)
  templateVersion?: number;
}

export class VoidContractDto {
  @ApiProperty({ maxLength: 500 })
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  reason!: string;
}

export class AmendContractDto {
  @ApiProperty({ maxLength: 500 })
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  reason!: string;
}
