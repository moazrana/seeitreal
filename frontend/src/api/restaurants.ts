import { api } from './client';
import type { Restaurant } from './types';

export interface CreateRestaurantInput {
  name: string;
  slug: string;
}

export const restaurantsApi = {
  list: () => api.get<Restaurant[]>('/restaurants'),
  get: (id: number) => api.get<Restaurant>(`/restaurants/${id}`),
  create: (input: CreateRestaurantInput) => api.post<Restaurant>('/restaurants', input),
  uploadLogo: (id: number, file: File) => api.upload<Restaurant>(`/restaurants/${id}/logo`, file),
};
