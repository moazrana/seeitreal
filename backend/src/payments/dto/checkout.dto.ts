import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Min,
} from 'class-validator';

// ISO 3166-1 alpha-2 country codes only — this drives gateway routing
// (documents/USER-APP-subscription-and-ui.md §3: "confirm by billing
// country at checkout — IP is a guess; billing country is truth"), so it's
// validated strictly, not freeform text.
const COUNTRY_CODE_PATTERN = /^[A-Z]{2}$/;

export class CheckoutDto {
  @IsInt()
  @Min(1)
  packageId!: number;

  @IsString()
  @Matches(COUNTRY_CODE_PATTERN, {
    message: 'billingCountry must be a 2-letter ISO country code',
  })
  billingCountry!: string;

  @IsOptional()
  @IsString()
  @Matches(/^[A-Z0-9_-]{3,32}$/, { message: 'Invalid promo code format' })
  promoCode?: string;
}

export class ChangePackageDto {
  @IsInt()
  @Min(1)
  packageId!: number;
}

export class ValidatePromoDto {
  @IsString()
  @Matches(/^[A-Z0-9_-]{3,32}$/, { message: 'Invalid promo code format' })
  code!: string;

  @IsIn(['subscription', 'setup', 'deal'])
  appliesTo!: 'subscription' | 'setup' | 'deal';
}
