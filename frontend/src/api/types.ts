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

export interface MenuItem {
  id: number;
  restaurantId: number;
  categoryId: number | null;
  name: string;
  description: string | null;
  // Serialized as a string by Prisma's Decimal -> JSON (spec: money is
  // DECIMAL, never float — the frontend must not do float math on it,
  // just display it).
  price: string;
  photoUrl: string | null;
  previewImageUrl: string | null;
  modelGlbUrl: string | null;
  modelUsdzUrl: string | null;
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
