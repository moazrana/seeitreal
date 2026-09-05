import { api } from './client';
import type { MenuCategory, MenuItem } from './types';

export interface CreateCategoryInput {
  name: string;
  sortOrder?: number;
}

export interface CreateItemInput {
  name: string;
  description?: string;
  categoryId?: number;
  // Real-world dish dimensions in millimetres (documents/TASK-real-world-ar-sizing.md).
  widthMm?: number;
  heightMm?: number;
  lengthMm?: number;
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
  // Up to 5 input photos per dish, driving Tripo multiview generation
  // (documents/3d-model-enhancement.md §1).
  uploadPhotos: (restaurantId: number, itemId: number, files: File[]) =>
    api.uploadMany<MenuItem>(`/restaurants/${restaurantId}/items/${itemId}/photos`, files),
  deletePhoto: (restaurantId: number, itemId: number, photoId: number) =>
    api.delete<MenuItem>(`/restaurants/${restaurantId}/items/${itemId}/photos/${photoId}`),
  generateModel: (restaurantId: number, itemId: number) =>
    api.post<MenuItem>(`/restaurants/${restaurantId}/items/${itemId}/generate-model`),
  // Hero-dish bypass: upload an already-produced GLB instead of generating
  // one via Tripo (documents/3d-model-enhancement.md §5).
  uploadModel: (restaurantId: number, itemId: number, file: File) =>
    api.upload<MenuItem>(`/restaurants/${restaurantId}/items/${itemId}/model`, file),
};
