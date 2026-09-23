import {
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PaymentGateway } from '@prisma/client';
import Stripe from 'stripe';
import type {
  ChangePackageContext,
  CheckoutContext,
  CheckoutMetadata,
  CheckoutSessionResult,
  NormalizedWebhookEvent,
  PaymentGatewayAdapter,
} from '../payment-gateway.interface';

/**
 * Stripe adapter — USD/international clients (documents/
 * USER-APP-subscription-and-ui.md §3). Server-side only; STRIPE_SECRET_KEY
 * never reaches the frontend (same rule as TRIPO_API_KEY, spec §11.4).
 *
 * Checkout Sessions are built with inline `price_data` rather than synced
 * Stripe Price objects (design decision in the plan: Root App package
 * price edits must not retroactively re-price an existing subscriber —
 * skipping a Stripe product/price catalog means an existing subscription
 * simply keeps whatever price it was created with until an explicit future
 * migration action, which is out of scope for this pass).
 *
 * `subscription_data.metadata` (not just the Checkout Session's own
 * metadata) is what we set — that's what makes our
 * `restaurantId`/`packageId`/`promoCode` correlation available on every
 * subsequent `customer.subscription.*` event, not just the one-time
 * `checkout.session.completed` event.
 *
 * Like TripoClientService's request-builder, the exact webhook object
 * shapes below follow Stripe's documented format but have not been
 * confirmed against a live/sandbox event in this pass (no test-mode keys
 * were available) — verify with a real Stripe test webhook before
 * production use.
 */
@Injectable()
export class StripeGatewayService implements PaymentGatewayAdapter {
  readonly gateway = PaymentGateway.stripe;
  private readonly logger = new Logger(StripeGatewayService.name);

  constructor(private readonly config: ConfigService) {}

  async createCheckoutSession(
    ctx: CheckoutContext,
  ): Promise<CheckoutSessionResult> {
    const stripe = this.client();
    const metadata = this.encodeMetadata(ctx.metadata);
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: ctx.existingGatewayCustomerId ?? undefined,
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: 'usd',
            unit_amount: ctx.amountMinorUnits,
            recurring: {
              interval: ctx.interval === 'yearly' ? 'year' : 'month',
            },
            product_data: { name: ctx.packageName },
          },
        },
      ],
      metadata,
      subscription_data: { metadata },
      success_url: ctx.successUrl,
      cancel_url: ctx.cancelUrl,
    });
    if (!session.url) {
      this.logger.error('Stripe Checkout Session created without a url');
      throw new InternalServerErrorException('Could not start checkout');
    }
    return { checkoutUrl: session.url };
  }

  async changePackage(ctx: ChangePackageContext): Promise<void> {
    const stripe = this.client();
    const subscription = await stripe.subscriptions.retrieve(
      ctx.gatewaySubscriptionId,
    );
    const item = subscription.items.data[0];
    const currentPrice = item?.price;
    if (!item || !currentPrice) {
      throw new InternalServerErrorException(
        'Subscription has no billable item',
      );
    }
    // Reuse the ad-hoc Product Stripe created for the original inline
    // price_data (see class doc comment) — an existing subscription item's
    // price_data update takes a `product` id, not inline product_data, so
    // there's no separate catalog for this to drift out of sync with.
    const productId =
      typeof currentPrice.product === 'string'
        ? currentPrice.product
        : currentPrice.product.id;
    await stripe.subscriptions.update(ctx.gatewaySubscriptionId, {
      items: [
        {
          id: item.id,
          price_data: {
            currency: 'usd',
            unit_amount: ctx.amountMinorUnits,
            product: productId,
            recurring: {
              interval: ctx.interval === 'yearly' ? 'year' : 'month',
            },
          },
        },
      ],
      proration_behavior: 'create_prorations',
    });
  }

  async cancelSubscription(gatewaySubscriptionId: string): Promise<void> {
    await this.client().subscriptions.cancel(gatewaySubscriptionId);
  }

  verifyAndParseWebhook(
    rawBody: Buffer,
    signatureHeader: string | undefined,
  ): NormalizedWebhookEvent {
    const event = this.client().webhooks.constructEvent(
      rawBody,
      signatureHeader ?? '',
      this.webhookSecret(),
    );

    switch (event.type) {
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
        return this.fromSubscriptionEvent(event, event.data.object);
      case 'customer.subscription.deleted':
        return {
          type: 'subscription_canceled',
          gateway: this.gateway,
          metadata: this.decodeMetadata(event.data.object.metadata),
          gatewaySubscriptionId: event.data.object.id,
          gatewayCustomerId: this.customerId(event.data.object.customer),
          raw: event,
        };
      case 'invoice.paid':
        return {
          type: 'charge_paid',
          gateway: this.gateway,
          gatewaySubscriptionId: this.subscriptionRef(event.data.object.parent),
          gatewayCustomerId: this.customerId(event.data.object.customer),
          gatewayChargeRef: event.data.object.id,
          amountMinorUnits: event.data.object.amount_paid,
          raw: event,
        };
      case 'invoice.payment_failed':
        return {
          type: 'charge_failed',
          gateway: this.gateway,
          gatewaySubscriptionId: this.subscriptionRef(event.data.object.parent),
          gatewayCustomerId: this.customerId(event.data.object.customer),
          gatewayChargeRef: event.data.object.id,
          amountMinorUnits: event.data.object.amount_due,
          raw: event,
        };
      default:
        // Unhandled event type — not an error, just nothing for the
        // lifecycle state machine to react to (e.g. payment_method.*).
        return { type: 'ignored', gateway: this.gateway, raw: event };
    }
  }

  private fromSubscriptionEvent(
    event: Stripe.Event,
    subscription: Stripe.Subscription,
  ): NormalizedWebhookEvent {
    const base = {
      gateway: this.gateway,
      metadata: this.decodeMetadata(subscription.metadata),
      gatewaySubscriptionId: subscription.id,
      gatewayCustomerId: this.customerId(subscription.customer),
      currentPeriodEnd: subscription.items.data[0]?.current_period_end
        ? new Date(subscription.items.data[0].current_period_end * 1000)
        : undefined,
      raw: event,
    };
    if (
      subscription.status === 'active' ||
      subscription.status === 'trialing'
    ) {
      return { ...base, type: 'subscription_active' };
    }
    if (
      subscription.status === 'past_due' ||
      subscription.status === 'unpaid'
    ) {
      return { ...base, type: 'subscription_past_due' };
    }
    return { ...base, type: 'subscription_canceled' };
  }

  private subscriptionRef(
    parent: Stripe.Invoice['parent'],
  ): string | undefined {
    if (parent?.type !== 'subscription_details') return undefined;
    const subscription = parent.subscription_details?.subscription;
    if (!subscription) return undefined;
    return typeof subscription === 'string' ? subscription : subscription.id;
  }

  private customerId(
    customer: string | Stripe.Customer | Stripe.DeletedCustomer | null,
  ): string | undefined {
    if (!customer) return undefined;
    return typeof customer === 'string' ? customer : customer.id;
  }

  private encodeMetadata(metadata: CheckoutMetadata): Record<string, string> {
    return {
      restaurantId: String(metadata.restaurantId),
      packageId: String(metadata.packageId),
      ...(metadata.promoCode ? { promoCode: metadata.promoCode } : {}),
    };
  }

  private decodeMetadata(
    metadata: Record<string, string> | null | undefined,
  ): CheckoutMetadata | undefined {
    const restaurantId = Number(metadata?.restaurantId);
    const packageId = Number(metadata?.packageId);
    if (!Number.isInteger(restaurantId) || !Number.isInteger(packageId)) {
      return undefined;
    }
    return { restaurantId, packageId, promoCode: metadata?.promoCode };
  }

  private client(): Stripe {
    return new Stripe(this.secretKey());
  }

  private secretKey(): string {
    const key = this.config.get<string>('STRIPE_SECRET_KEY');
    if (!key) {
      throw new InternalServerErrorException(
        'Stripe billing is not configured',
      );
    }
    return key;
  }

  private webhookSecret(): string {
    const secret = this.config.get<string>('STRIPE_WEBHOOK_SECRET');
    if (!secret) {
      this.logger.warn('Rejected Stripe webhook — STRIPE_WEBHOOK_SECRET unset');
      throw new InternalServerErrorException(
        'Stripe billing is not configured',
      );
    }
    return secret;
  }
}
