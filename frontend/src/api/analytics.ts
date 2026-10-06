import { api } from './client';
import type { DashboardOverview } from './types';

export const analyticsApi = {
  overview: () => api.get<DashboardOverview>('/dashboard/overview'),
};
