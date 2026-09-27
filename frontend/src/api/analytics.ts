import { api } from './client';
import type { DashboardOverview, ItemScanCount } from './types';

export const analyticsApi = {
  overview: () => api.get<DashboardOverview>('/dashboard/overview'),
  itemScans: (restaurantSlug: string) =>
    api.get<ItemScanCount[]>(`/restaurants/${restaurantSlug}/analytics/items`),
};
