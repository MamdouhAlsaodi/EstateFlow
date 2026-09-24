import { Type } from "class-transformer";
import {
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from "class-validator";

export class GeoSearchQueryDto {
  @IsIn(["radius", "polygon", "bbox"])
  mode!: "radius" | "polygon" | "bbox";
  @IsOptional() @IsString() @MaxLength(200) search?: string;
  @IsOptional() @IsString() @MaxLength(100) propertyType?: string;
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ allowInfinity: false })
  @Min(-90)
  @Max(90)
  centerLat?: number;
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ allowInfinity: false })
  @Min(-180)
  @Max(180)
  centerLng?: number;
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ allowInfinity: false })
  @Min(0.001)
  @Max(500)
  radiusKm?: number;
  @IsOptional() @IsString() @MaxLength(50000) polygon?: string;
  @IsOptional() @IsString() @MaxLength(500) bbox?: string;
  @IsOptional() @IsString() @MaxLength(255) cursor?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit?: number;
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ allowInfinity: false })
  @Min(0.1)
  @Max(10)
  cellKm?: number;
}
