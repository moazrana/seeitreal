import {
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import {
  PromoAppliesTo,
  PromoCurrency,
  PromoDiscountType,
} from '@ar-menu/shared';

/**
 * Promo code definition (rootApp/documents/
 * ROOT-APP-subscriptions-and-promos.md §3). Cross-field rules (currency
 * required iff discountType is "fixed"; percent amount capped at 100;
 * endsAt after startsAt) are enforced in RootPromoCodesService, not here —
 * class-validator's per-property conditionals get unreadable fast for
 * rules that span multiple fields.
 */
export class CreatePromoCodeDto {
  // Upper-cased/trimmed in the service before uniqueness check + persist.
  @IsString()
  @MinLength(3)
  @MaxLength(50)
  @Matches(/^[A-Za-z0-9_-]+$/, {
    message: 'code may only contain letters, numbers, hyphens, and underscores',
  })
  code!: string;

  @IsIn(Object.values(PromoDiscountType))
  discountType!: PromoDiscountType;

  @IsInt()
  @Min(1)
  @Max(100_000_000)
  amount!: number;

  @IsOptional()
  @IsIn(Object.values(PromoCurrency))
  currency?: PromoCurrency;

  @IsIn(Object.values(PromoAppliesTo))
  appliesTo!: PromoAppliesTo;

  @IsOptional()
  @IsInt()
  @Min(1)
  maxRedemptions?: number;

  @IsOptional()
  @IsDateString()
  startsAt?: string;

  @IsOptional()
  @IsDateString()
  endsAt?: string;
}
