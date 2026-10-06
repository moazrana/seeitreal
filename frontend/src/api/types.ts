import type {
  ArStatus,
  BusinessType,
  PaymentGateway,
  SubscriptionStatus,
  UserRole,
} from '@ar-menu/shared';

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
  businessType: BusinessType;
  address: string | null;
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
  categoryId: number;
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
  // Set the first time the dish went live and never cleared — the QR code
  // (a stable public URL) stays available from then on.
  qrIssuedAt: string | null;
}

export interface QaQueueItem extends MenuItem {
  restaurant: { id: number; name: string; slug: string };
}

// Billing (documents/USER-APP-subscription-and-ui.md §5) — prices are
// integer minor units (paisa/cents), dual-currency; pick pricePkr or
// priceUsd based on the resolved gateway, never both.
export interface SubscriptionPackage {
  id: number;
  name: string;
  pricePkr: number;
  priceUsd: number;
  interval: 'monthly' | 'yearly';
  maxItems: number | null;
  isActive: boolean;
  sortOrder: number;
}

export interface Subscription {
  id: number;
  restaurantId: number;
  packageId: number;
  gateway: PaymentGateway;
  status: SubscriptionStatus;
  currentPeriodEnd: string;
  // Set only while status is past_due — the deadline before the AR viewer
  // gates (documents/USER-APP-subscription-and-ui.md §4.2).
  graceUntil: string | null;
  package: SubscriptionPackage;
}

export interface Invoice {
  id: number;
  restaurantId: number;
  type: 'subscription' | 'item_setup' | 'deal_campaign';
  // Decimal serialized as a string by the API — never parse as float for
  // display math, only for read-only formatting.
  amount: string;
  status: 'pending' | 'paid' | 'failed' | 'refunded';
  gatewayRef: string | null;
  createdAt: string;
}

export interface PromoPreview {
  code: string;
  discountType: 'percent' | 'fixed';
  amount: number;
  currency: 'PKR' | 'USD' | null;
}

export interface ApiErrorBody {
  statusCode: number;
  message: string | string[];
  error?: string;
}

// ---- Dashboard overview (mango points 2).

export interface RestaurantOverview {
  id: number;
  name: string;
  slug: string;
  dishes: number;
  statusCounts: Record<ArStatus, number>;
}

export interface DashboardOverview {
  totals: { restaurants: number; dishes: number; live: number; inReview: number };
  restaurants: RestaurantOverview[];
}
