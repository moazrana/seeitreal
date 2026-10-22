import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { SubscriptionInterval } from '@ar-menu/shared';

/**
 * Subscription package definition (rootApp/documents/
 * ROOT-APP-subscriptions-and-promos.md §2). Prices are integer minor units
 * (paisa / cents) — never a float, to avoid rounding drift on money.
 */
export class CreatePackageDto {
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name!: string;

  @IsInt()
  @Min(0)
  @Max(100_000_000)
  pricePkr!: number;

  @IsInt()
  @Min(0)
  @Max(100_000_000)
  priceUsd!: number;

  @IsIn(Object.values(SubscriptionInterval))
  interval!: SubscriptionInterval;

  @IsOptional()
  @IsInt()
  @Min(1)
  maxItems?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(10_000)
  sortOrder?: number;
}
