import { api } from './client';
import type { MenuItem, QaQueueItem } from './types';

export const adminApi = {
  qaQueue: () => api.get<QaQueueItem[]>('/admin/qa-queue'),
  approveItem: (itemId: number) => api.post<MenuItem>(`/admin/items/${itemId}/approve`),
  rejectItem: (itemId: number, note: string) =>
    api.post<MenuItem>(`/admin/items/${itemId}/reject`, { note }),
};
