import type { PaymentGateway } from '@prisma/client';

/**
 * Everything a gateway needs to start a checkout for one restaurant's
 * subscription (documents/USER-APP-subscription-and-ui.md §3). `metadata`
 * is round-tripped by the gateway and read back out of the webhook event —
 * this is how PaymentsService correlates "payment succeeded" back to a
 * restaurant/package without ever pre-creating a Subscription row before a
 * payment is actually confirmed (spec: "confirm subscription state only
 * from verified gateway webhooks").
 */
export interface CheckoutMetadata {
  restaurantId: number;
  packageId: number;
  promoCode?: string;
}

export interface CheckoutContext {
  metadata: CheckoutMetadata;
  restaurantName: string;
  packageName: string;
  /** Final amount to charge per period, in minor units, after any promo discount. */
  amountMinorUnits: number;
  interval: 'monthly' | 'yearly';
  /** Existing gateway customer id, if this restaurant has billed through this gateway before. */
  existingGatewayCustomerId?: string | null;
  successUrl: string;
  cancelUrl: string;
}

export interface CheckoutSessionResult {
  checkoutUrl: string;
}

export type NormalizedWebhookEventType =
  | 'subscription_active'
  | 'subscription_past_due'
  | 'subscription_canceled'
  | 'charge_paid'
  | 'charge_failed'
  // An event type the lifecycle state machine has nothing to do with
  // (e.g. Stripe's payment_method.attached) — a genuine no-op, distinct
  // from "correlation metadata was missing" on a type we DO act on.
  | 'ignored';

/**
 * A gateway-agnostic shape SubscriptionLifecycleService reacts to — Stripe
 * and Safepay events are translated into this before touching any shared
 * logic (mirrors how TripoClientService.parseWebhookPayload normalizes
 * Tripo's wire format before TripoGenerationService.handleTaskResult sees
 * it). `raw` exists for troubleshooting only — never log it directly, it
 * may contain gateway-side customer data (spec §7.7).
 */
export interface NormalizedWebhookEvent {
  type: NormalizedWebhookEventType;
  gateway: PaymentGateway;
  metadata?: CheckoutMetadata;
  gatewaySubscriptionId?: string;
  gatewayCustomerId?: string;
  gatewayChargeRef?: string;
  amountMinorUnits?: number;
  currentPeriodEnd?: Date;
  raw: unknown;
}

export interface ChangePackageContext {
  gatewaySubscriptionId: string;
  amountMinorUnits: number;
  interval: 'monthly' | 'yearly';
  packageName: string;
}

export interface PaymentGatewayAdapter {
  readonly gateway: PaymentGateway;
  createCheckoutSession(ctx: CheckoutContext): Promise<CheckoutSessionResult>;
  /** No-op / best-effort for gateways with no native subscription object (e.g. Safepay). */
  changePackage(ctx: ChangePackageContext): Promise<void>;
  cancelSubscription(gatewaySubscriptionId: string): Promise<void>;
  verifyAndParseWebhook(
    rawBody: Buffer,
    signatureHeader: string | undefined,
  ): NormalizedWebhookEvent;
}
