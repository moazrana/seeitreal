/**
 * Enums shared between the backend (Prisma models / DTOs) and the frontend
 * (dashboard UI). Keep these in sync with the Prisma schema in
 * backend/prisma/schema.prisma — they are duplicated there because Prisma
 * generates its own enum types, but the string values must match exactly.
 */

export enum UserRole {
  OWNER = 'owner',
  ADMIN = 'admin',
}

// Only one business type exists today (spec is restaurant-only for now);
// kept as an enum rather than a hardcoded string so a second type can be
// added later without changing the field's shape.
export enum BusinessType {
  RESTAURANT = 'restaurant',
}

export enum ArStatus {
  PENDING = 'pending',
  GENERATING = 'generating',
  QA = 'qa',
  LIVE = 'live',
}

export enum DealStatus {
  DRAFT = 'draft',
  ACTIVE = 'active',
  ENDED = 'ended',
}

export enum QrTargetType {
  ITEM = 'item',
  DEAL = 'deal',
  MENU = 'menu',
}

export enum AnalyticsEventType {
  SCAN = 'scan',
  AR_LAUNCH = 'ar_launch',
}

export enum SubscriptionInterval {
  MONTHLY = 'monthly',
  YEARLY = 'yearly',
}

export enum SubscriptionStatus {
  ACTIVE = 'active',
  PAST_DUE = 'past_due',
  // Grace period elapsed with no successful payment (documents/
  // USER-APP-subscription-and-ui.md §4.3) — the one status that gates the
  // public AR viewer.
  EXPIRED = 'expired',
  CANCELED = 'canceled',
}

/** documents/USER-APP-subscription-and-ui.md §3. */
export enum PaymentGateway {
  STRIPE = 'stripe',
  SAFEPAY = 'safepay',
}

/** rootApp/documents/ROOT-APP-subscriptions-and-promos.md §3. */
export enum PromoDiscountType {
  PERCENT = 'percent',
  FIXED = 'fixed',
}

export enum PromoAppliesTo {
  SUBSCRIPTION = 'subscription',
  SETUP = 'setup',
  DEAL = 'deal',
}

/** Currency for a fixed-amount promo discount; null on the record for percent discounts. */
export enum PromoCurrency {
  PKR = 'PKR',
  USD = 'USD',
}

export enum ChargeType {
  SUBSCRIPTION = 'subscription',
  ITEM_SETUP = 'item_setup',
  DEAL_CAMPAIGN = 'deal_campaign',
}

export enum ChargeStatus {
  PENDING = 'pending',
  PAID = 'paid',
  FAILED = 'failed',
  REFUNDED = 'refunded',
}

export enum SupportTicketStatus {
  OPEN = 'open',
  IN_PROGRESS = 'in_progress',
  RESOLVED = 'resolved',
  CLOSED = 'closed',
}

export enum SupportTicketPriority {
  LOW = 'low',
  NORMAL = 'normal',
  HIGH = 'high',
}

export enum TicketSenderRole {
  OWNER = 'owner',
  ADMIN = 'admin',
}

export enum FeedbackType {
  SUGGESTION = 'suggestion',
  COMPLAINT = 'complaint',
  PRAISE = 'praise',
}

export enum FeedbackStatus {
  NEW = 'new',
  REVIEWED = 'reviewed',
}

/** Root App admin roles (rootApp/ROOT-APP-Implementation-Spec.md §3.9). */
export enum RootAdminRole {
  SUPERADMIN = 'superadmin',
  SUPPORT = 'support',
}
