export type BillingCurrency = 'PKR' | 'USD';

export function currencyForCountry(country: string): BillingCurrency {
  return country.toUpperCase() === 'PK' ? 'PKR' : 'USD';
}

export function formatMinorUnits(amount: number, currency: BillingCurrency): string {
  return new Intl.NumberFormat(currency === 'PKR' ? 'en-PK' : 'en-US', {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(amount / 100);
}
