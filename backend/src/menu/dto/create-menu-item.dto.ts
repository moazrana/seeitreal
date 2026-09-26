import {
  IsInt,
  IsOptional,
  IsString,
  IsUrl,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { MAX_DIMENSION_MM, MIN_DIMENSION_MM } from '@ar-menu/shared';

export class CreateMenuItemDto {
  @IsOptional()
  @IsInt()
  categoryId?: number;

  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  // Photo upload pipeline (with magic-byte verification, EXIF stripping,
  // etc. per spec §7.5) lands in build-order step 2; for now items are
  // created with a photoUrl that must already point at approved storage.
  @IsOptional()
  @IsUrl()
  @MaxLength(2048)
  photoUrl?: string;

  // Real-world dish dimensions in millimetres (TASK-real-world-ar-sizing.md
  // §1-2). Optional at creation, but TripoGenerationService requires
  // widthMm before it will start a 3D-generation job, and AdminService
  // requires it again before an item can go live. Upper bound of 5000mm
  // (5m) per the task spec — comfortably covers any dish/product while
  // rejecting garbage input. Lower bound of 10mm (1cm): nothing served on
  // a menu is smaller, and a 5mm entry on staging produced a half-
  // centimetre AR dish (a cm/inch value typed into a mm field).
  @IsOptional()
  @IsInt()
  @Min(MIN_DIMENSION_MM)
  @Max(MAX_DIMENSION_MM)
  widthMm?: number;

  @IsOptional()
  @IsInt()
  @Min(MIN_DIMENSION_MM)
  @Max(MAX_DIMENSION_MM)
  heightMm?: number;

  @IsOptional()
  @IsInt()
  @Min(MIN_DIMENSION_MM)
  @Max(MAX_DIMENSION_MM)
  lengthMm?: number;
}
