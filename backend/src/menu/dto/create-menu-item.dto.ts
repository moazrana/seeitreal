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
import { Trim } from '../../common/decorators/trim.decorator';

export class CreateMenuItemDto {
  // Cuisine type — required: every dish belongs to one.
  @IsInt()
  @Min(1)
  categoryId!: number;

  @Trim()
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
  // §1-2), entered by owners in inches. All optional — a model generated
  // without them is scaled to DEFAULT_FOOTPRINT_MM. Bounds: 10mm floor
  // (a 5mm entry on staging produced a half-centimetre AR dish) and a
  // 20-inch (508mm) ceiling — nothing served on a menu is bigger.
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
