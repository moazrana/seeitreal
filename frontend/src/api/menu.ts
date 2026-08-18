import { api } from './client';
import type { MenuCategory, MenuItem } from './types';

export interface CreateCategoryInput {
  name: string;
  sortOrder?: number;
}

export interface CreateItemInput {
  name: string;
  description?: string;
  price: number;
  categoryId?: number;
}

export const menuApi = {
  listCategories: (restaurantId: number) => api.get<MenuCategory[]>(`/restaurants/${restaurantId}/categories`),
  createCategory: (restaurantId: number, input: CreateCategoryInput) =>
    api.post<MenuCategory>(`/restaurants/${restaurantId}/categories`, input),
  deleteCategory: (restaurantId: number, categoryId: number) =>
    api.delete<void>(`/restaurants/${restaurantId}/categories/${categoryId}`),

  listItems: (restaurantId: number) => api.get<MenuItem[]>(`/restaurants/${restaurantId}/items`),
  createItem: (restaurantId: number, input: CreateItemInput) =>
    api.post<MenuItem>(`/restaurants/${restaurantId}/items`, input),
  updateItem: (restaurantId: number, itemId: number, input: Partial<CreateItemInput>) =>
    api.patch<MenuItem>(`/restaurants/${restaurantId}/items/${itemId}`, input),
  deleteItem: (restaurantId: number, itemId: number) =>
    api.delete<void>(`/restaurants/${restaurantId}/items/${itemId}`),
  uploadPhoto: (restaurantId: number, itemId: number, file: File) =>
    api.upload<MenuItem>(`/restaurants/${restaurantId}/items/${itemId}/photo`, file),
  generateModel: (restaurantId: number, itemId: number) =>
    api.post<MenuItem>(`/restaurants/${restaurantId}/items/${itemId}/generate-model`),
};
