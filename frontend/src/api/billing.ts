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

  getSubscription: (restaurantId: number) =>
    api.get<Subscription | null>(`/billing/restaurants/${restaurantId}/subscription`),
  listInvoices: (restaurantId: number) =>
    api.get<Invoice[]>(`/billing/restaurants/${restaurantId}/invoices`),
  checkout: (restaurantId: number, input: CheckoutInput) =>
    api.post<{ checkoutUrl: string }>(`/billing/restaurants/${restaurantId}/checkout`, input),
  changePackage: (restaurantId: number, packageId: number) =>
    api.patch<Subscription>(`/billing/restaurants/${restaurantId}/subscription`, { packageId }),
  cancel: (restaurantId: number) =>
    api.post<Subscription>(`/billing/restaurants/${restaurantId}/cancel`),
};
