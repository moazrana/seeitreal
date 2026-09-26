import { api } from './client';
import type { Invoice, PromoPreview, Subscription, SubscriptionPackage } from './types';

export interface CheckoutInput {
  packageId: number;
  billingCountry: string;
  promoCode?: string;
}

export const billingApi = {
  listPackages: () => api.get<SubscriptionPackage[]>('/billing/packages'),
  defaultCountry: () => api.get<{ country: string }>('/billing/default-country'),
  validatePromo: (code: string, appliesTo: 'subscription' | 'setup' | 'deal') =>
    api.post<PromoPreview>('/billing/promo/validate', { code, appliesTo }),

  getSubscription: (restaurantSlug: string) =>
    api.get<Subscription | null>(`/billing/restaurants/${restaurantSlug}/subscription`),
  listInvoices: (restaurantSlug: string) =>
    api.get<Invoice[]>(`/billing/restaurants/${restaurantSlug}/invoices`),
  checkout: (restaurantSlug: string, input: CheckoutInput) =>
    api.post<{ checkoutUrl: string }>(`/billing/restaurants/${restaurantSlug}/checkout`, input),
  changePackage: (restaurantSlug: string, packageId: number) =>
    api.patch<Subscription>(`/billing/restaurants/${restaurantSlug}/subscription`, { packageId }),
  cancel: (restaurantSlug: string) =>
    api.post<Subscription>(`/billing/restaurants/${restaurantSlug}/cancel`),
};
