import { api } from './client';
import type { Restaurant } from './types';

export interface CreateRestaurantInput {
  name: string;
  slug: string;
  address: string;
}

export const restaurantsApi = {
  list: () => api.get<Restaurant[]>('/restaurants'),
  get: (slug: string) => api.get<Restaurant>(`/restaurants/${slug}`),
  create: (input: CreateRestaurantInput) => api.post<Restaurant>('/restaurants', input),
  uploadLogo: (slug: string, file: File) =>
    api.upload<Restaurant>(`/restaurants/${slug}/logo`, file),
};
