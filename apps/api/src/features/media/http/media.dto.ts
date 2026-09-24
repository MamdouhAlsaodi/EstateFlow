/**
 * EF-601 — media HTTP DTOs. Strict allowlists only; responses never carry
 * server filesystem paths — storage stays behind opaque adapter tokens that
 * are not part of any response payload.
 */

import { ApiProperty } from "@nestjs/swagger";
import {
  IsIn,
  IsInt,
  IsNotEmpty,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
} from "class-validator";

export class CreateUploadIntentDto {
  @ApiProperty({ enum: ["IMAGE", "VIDEO"] })
  @IsIn(["IMAGE", "VIDEO"])
  kind!: "IMAGE" | "VIDEO";

  @ApiProperty({ example: "image/png", maxLength: 100 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  @Matches(/^[a-z]+\/[a-z0-9.+-]+$/, {
    message: "contentType must be a lowercase mime type",
  })
  contentType!: string;

  @ApiProperty({ minimum: 1 })
  @IsInt()
  @Min(1)
  @Max(100 * 1024 * 1024)
  byteSize!: number;

  @ApiProperty({ example: "villa-photo.png", maxLength: 120 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  fileName!: string;
}

export class ConfirmUploadDto {
  @ApiProperty({ maxLength: 2048 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(2048)
  token!: string;
}

export class SetCoverDto {
  @ApiProperty()
  @IsUUID()
  mediaId!: string;
}

export class MediaBytesQueryDto {
  @ApiProperty({ enum: ["ORIGINAL", "THUMB", "PREVIEW"], required: false })
  @IsIn(["ORIGINAL", "THUMB", "PREVIEW"])
  variant?: "ORIGINAL" | "THUMB" | "PREVIEW";
}

export class StorageObjectQueryDto {
  @ApiProperty({ maxLength: 2048 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(2048)
  token!: string;
}
