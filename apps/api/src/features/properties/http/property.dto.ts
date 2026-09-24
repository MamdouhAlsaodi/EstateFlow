import { Type } from "class-transformer";
import {
  IsIn,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from "class-validator";

const MAX_TEXT_LENGTH = 500;

export class CreatePropertyDto {
  @IsString() @IsNotEmpty() @MaxLength(MAX_TEXT_LENGTH) title!: string;
  @IsString() @IsNotEmpty() @MaxLength(MAX_TEXT_LENGTH) propertyType!: string;
  @IsString() @IsNotEmpty() @MaxLength(MAX_TEXT_LENGTH) addressText!: string;
  @IsOptional() @IsString() @MaxLength(MAX_TEXT_LENGTH) ownerReference?:
    string | null;
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ allowInfinity: false })
  @Min(-90)
  @Max(90)
  latitude?: number;
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ allowInfinity: false })
  @Min(-180)
  @Max(180)
  longitude?: number;
}

export class UpdatePropertyDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(Number.MAX_SAFE_INTEGER)
  version!: number;
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(MAX_TEXT_LENGTH)
  title?: string;
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(MAX_TEXT_LENGTH)
  propertyType?: string;
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(MAX_TEXT_LENGTH)
  addressText?: string;
  @IsOptional() @IsString() @MaxLength(MAX_TEXT_LENGTH) ownerReference?:
    string | null;
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ allowInfinity: false })
  @Min(-90)
  @Max(90)
  latitude?: number;
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ allowInfinity: false })
  @Min(-180)
  @Max(180)
  longitude?: number;
}

export class ListingVersionDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(Number.MAX_SAFE_INTEGER)
  version!: number;
}

export class PropertyListQueryDto {
  @IsOptional() @IsString() @MaxLength(200) search?: string;
  @IsOptional() @IsString() @IsNotEmpty() @MaxLength(255) cursor?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(50) limit?: number;
}

export class ImageMetadataDto {
  @IsIn(["JPEG", "PNG", "WEBP"]) mediaType!: "JPEG" | "PNG" | "WEBP";
  @Type(() => Number) @IsInt() @Min(1) @Max(5 * 1024 * 1024) byteSize!: number;
  @Type(() => Number) @IsInt() @Min(0) position!: number;
}
