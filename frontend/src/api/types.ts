import type { ArStatus, UserRole } from '@ar-menu/shared';

export interface PublicUser {
  id: number;
  email: string;
  role: UserRole;
  emailVerified: boolean;
}

export interface Restaurant {
  id: number;
  ownerUserId: number;
  name: string;
  slug: string;
  logoUrl: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface MenuCategory {
  id: number;
  restaurantId: number;
  name: string;
  sortOrder: number;
}

export interface MenuItemPhoto {
  id: number;
  url: string;
  sortOrder: number;
}

export interface MenuItem {
  id: number;
  restaurantId: number;
  categoryId: number | null;
  name: string;
  description: string | null;
  photoUrl: string | null;
  // Up to 5 input photos, ordered (documents/3d-model-enhancement.md §1).
  // photoUrl above always mirrors photos[0].url.
  photos: MenuItemPhoto[];
  previewImageUrl: string | null;
  modelGlbUrl: string | null;
  modelUsdzUrl: string | null;
  // Real-world dish dimensions in millimetres (documents/TASK-real-world-ar-sizing.md).
  // Required before generate-model can run and before an item can go live.
  widthMm: number | null;
  heightMm: number | null;
  lengthMm: number | null;
  arStatus: ArStatus;
  publicSlug: string;
  qaNote: string | null;
}

export interface QaQueueItem extends MenuItem {
  restaurant: { id: number; name: string; slug: string };
}

export interface ApiErrorBody {
  statusCode: number;
  message: string | string[];
  error?: string;
}
