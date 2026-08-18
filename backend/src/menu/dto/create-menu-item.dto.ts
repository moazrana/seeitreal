import {
  IsInt,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  IsUrl,
  Max,
  MaxLength,
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

  // Major currency units with up to 2 decimal places; persisted as DECIMAL,
  // never float (spec §5).
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  @Max(1_000_000)
  price!: number;

  // Photo upload pipeline (with magic-byte verification, EXIF stripping,
  // etc. per spec §7.5) lands in build-order step 2; for now items are
  // created with a photoUrl that must already point at approved storage.
  @IsOptional()
  @IsUrl()
  @MaxLength(2048)
  photoUrl?: string;
}
