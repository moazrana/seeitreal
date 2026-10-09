import { IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class CreateRestaurantDto {
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  name!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(200)
  @Matches(/^[a-z0-9-]+$/, {
    message: 'slug must contain only lowercase letters, numbers, and hyphens',
  })
  slug!: string;

  // No logoUrl here: logos only arrive through the upload endpoint
  // (spec §7.5), which sets the URL to our own storage.

  @IsString()
  @MinLength(5)
  @MaxLength(500)
  address!: string;
}
