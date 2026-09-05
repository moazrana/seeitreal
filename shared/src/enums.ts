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

export enum SubscriptionPlan {
  STARTER = 'starter',
  GROWTH = 'growth',
  PRO = 'pro',
}

export enum SubscriptionStatus {
  ACTIVE = 'active',
  PAST_DUE = 'past_due',
  CANCELED = 'canceled',
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
