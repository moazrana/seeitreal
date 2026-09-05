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
  // rejecting garbage input.
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5000)
  widthMm?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5000)
  heightMm?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5000)
  lengthMm?: number;
}
