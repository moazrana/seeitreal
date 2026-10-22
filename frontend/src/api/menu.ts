import { api } from './client';
import type { MenuCategory, MenuItem } from './types';

export interface CreateCategoryInput {
  name: string;
  sortOrder?: number;
}

export interface CreateItemInput {
  name: string;
  description?: string;
  categoryId: number;
  // Real-world dish dimensions in millimetres (documents/TASK-real-world-ar-sizing.md).
  widthMm?: number;
  heightMm?: number;
  lengthMm?: number;
}

export const menuApi = {
  listCategories: (restaurantSlug: string) =>
    api.get<MenuCategory[]>(`/restaurants/${restaurantSlug}/categories`),
  createCategory: (restaurantSlug: string, input: CreateCategoryInput) =>
    api.post<MenuCategory>(`/restaurants/${restaurantSlug}/categories`, input),
  deleteCategory: (restaurantSlug: string, categoryId: number) =>
    api.delete<void>(`/restaurants/${restaurantSlug}/categories/${categoryId}`),

  listItems: (restaurantSlug: string) =>
    api.get<MenuItem[]>(`/restaurants/${restaurantSlug}/items`),
  createItem: (restaurantSlug: string, input: CreateItemInput) =>
    api.post<MenuItem>(`/restaurants/${restaurantSlug}/items`, input),
  updateItem: (restaurantSlug: string, itemSlug: string, input: Partial<CreateItemInput>) =>
    api.patch<MenuItem>(`/restaurants/${restaurantSlug}/items/${itemSlug}`, input),
  deleteItem: (restaurantSlug: string, itemSlug: string) =>
    api.delete<void>(`/restaurants/${restaurantSlug}/items/${itemSlug}`),
  // Up to 5 input photos per dish, driving Tripo multiview generation
  // (documents/3d-model-enhancement.md §1).
  uploadPhotos: (restaurantSlug: string, itemSlug: string, files: File[]) =>
    api.uploadMany<MenuItem>(`/restaurants/${restaurantSlug}/items/${itemSlug}/photos`, files),
  deletePhoto: (restaurantSlug: string, itemSlug: string, photoId: number) =>
    api.delete<MenuItem>(`/restaurants/${restaurantSlug}/items/${itemSlug}/photos/${photoId}`),
  generateModel: (restaurantSlug: string, itemSlug: string) =>
    api.post<MenuItem>(`/restaurants/${restaurantSlug}/items/${itemSlug}/generate-model`),
  // Hero-dish bypass: upload an already-produced GLB instead of generating
  // one via Tripo (documents/3d-model-enhancement.md §5).
  uploadModel: (restaurantSlug: string, itemSlug: string, file: File) =>
    api.upload<MenuItem>(`/restaurants/${restaurantSlug}/items/${itemSlug}/model`, file),
};
