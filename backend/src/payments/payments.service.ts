import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ChargeStatus,
  ChargeType,
  PaymentGateway,
  Prisma,
  PromoAppliesTo,
  PromoCode,
  PromoDiscountType,
  SubscriptionInterval,
  SubscriptionStatus,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { RestaurantsService } from '../restaurants/restaurants.service';
import type { AuthenticatedUser } from '../auth/types/authenticated-user.interface';
import type {
  ChangePackageDto,
  CheckoutDto,
  ValidatePromoDto,
} from './dto/checkout.dto';
import { SafepayGatewayService } from './gateways/safepay-gateway.service';
import { StripeGatewayService } from './gateways/stripe-gateway.service';
import type {
  NormalizedWebhookEvent,
  PaymentGatewayAdapter,
} from './payment-gateway.interface';
import { SubscriptionLifecycleService } from './subscription-lifecycle.service';

type Currency = 'PKR' | 'USD';

/**
 * Orchestrates checkout, package changes, cancellation, and webhook
 * processing (documents/USER-APP-subscription-and-ui.md §3, §4). Gateway
 * wire formats stay inside StripeGatewayService/SafepayGatewayService —
 * this service only ever talks to them through PaymentGatewayAdapter.
 */
@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly restaurants: RestaurantsService,
    private readonly lifecycle: SubscriptionLifecycleService,
    private readonly stripe: StripeGatewayService,
    private readonly safepay: SafepayGatewayService,
    private readonly config: ConfigService,
  ) {}

  listActivePackages() {
    return this.prisma.subscriptionPackage.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: 'asc' },
    });
  }

  async getSubscription(restaurantId: number, user: AuthenticatedUser) {
    await this.restaurants.assertOwnership(restaurantId, user);
    return this.prisma.subscription.findFirst({
      where: { restaurantId },
      orderBy: { createdAt: 'desc' },
      include: { package: true },
    });
  }

  async listInvoices(restaurantId: number, user: AuthenticatedUser) {
    await this.restaurants.assertOwnership(restaurantId, user);
    return this.prisma.charge.findMany({
      where: { restaurantId },
      orderBy: { createdAt: 'desc' },
    });
  }

  /** Preview-only — never redeems. Redemption happens once payment is confirmed by webhook. */
  async validatePromo(dto: ValidatePromoDto) {
    const promo = await this.findValidPromoOrThrow(dto.code, dto.appliesTo);
    return {
      code: promo.code,
      discountType: promo.discountType,
      amount: promo.amount,
      currency: promo.currency,
    };
  }

  /**
   * Soft default only (documents/USER-APP-subscription-and-ui.md §3: "IP is
   * a guess; billing country is truth") — used to pre-select the checkout
   * form's country field, never to silently pick a gateway.
   * `cf-ipcountry` is set automatically when fronted by Cloudflare; falls
   * back to DEFAULT_CHECKOUT_COUNTRY otherwise.
   */
  defaultCountryHint(
    headers: Record<string, string | string[] | undefined>,
  ): string {
    const header = headers['cf-ipcountry'];
    const value = Array.isArray(header) ? header[0] : header;
    if (value && /^[A-Za-z]{2}$/.test(value)) return value.toUpperCase();
    return this.config.get<string>('DEFAULT_CHECKOUT_COUNTRY') ?? 'PK';
  }

  private resolveGateway(billingCountry: string): PaymentGateway {
    return billingCountry.toUpperCase() === 'PK'
      ? PaymentGateway.safepay
      : PaymentGateway.stripe;
  }

  async checkout(
    restaurantId: number,
    user: AuthenticatedUser,
    dto: CheckoutDto,
  ) {
    const restaurant = await this.restaurants.assertOwnership(
      restaurantId,
      user,
    );
    const pkg = await this.prisma.subscriptionPackage.findUnique({
      where: { id: dto.packageId },
    });
    if (!pkg || !pkg.isActive) {
      throw new NotFoundException('Package not found');
    }

    const existing = await this.lifecycle.currentForRestaurant(restaurantId);
    if (existing?.status === SubscriptionStatus.active) {
      throw new ConflictException(
        'This restaurant already has an active subscription — change package instead of checking out again',
      );
    }

    const gateway = this.resolveGateway(dto.billingCountry);
    const currency: Currency =
      gateway === PaymentGateway.safepay ? 'PKR' : 'USD';
    const basePrice = currency === 'PKR' ? pkg.pricePkr : pkg.priceUsd;

    let promo: PromoCode | null = null;
    if (dto.promoCode) {
      promo = await this.findValidPromoOrThrow(
        dto.promoCode,
        PromoAppliesTo.subscription,
      );
      const alreadyUsed = await this.prisma.promoRedemption.findFirst({
        where: { promoCodeId: promo.id, restaurantId },
      });
      if (alreadyUsed) {
        throw new BadRequestException(
          'This promo code has already been used on this restaurant',
        );
      }
    }
    const amountMinorUnits = this.applyDiscount(basePrice, currency, promo);

    const adapter = this.adapterFor(gateway);
    const frontendBaseUrl = this.frontendBaseUrl();
    const { checkoutUrl } = await adapter.createCheckoutSession({
      metadata: { restaurantId, packageId: pkg.id, promoCode: dto.promoCode },
      restaurantName: restaurant.name,
      packageName: pkg.name,
      amountMinorUnits,
      interval:
        pkg.interval === SubscriptionInterval.yearly ? 'yearly' : 'monthly',
      existingGatewayCustomerId:
        existing?.gateway === gateway ? existing.gatewayCustomerId : undefined,
      successUrl: `${frontendBaseUrl}/restaurants/${restaurantId}/billing?checkout=success`,
      cancelUrl: `${frontendBaseUrl}/restaurants/${restaurantId}/billing?checkout=cancelled`,
    });
    return { checkoutUrl };
  }

  async changePackage(
    restaurantId: number,
    user: AuthenticatedUser,
    dto: ChangePackageDto,
  ) {
    await this.restaurants.assertOwnership(restaurantId, user);
    const subscription =
      await this.lifecycle.currentForRestaurant(restaurantId);
    if (!subscription || subscription.status === SubscriptionStatus.canceled) {
      throw new ConflictException(
        'No active subscription — use checkout instead',
      );
    }
    const pkg = await this.prisma.subscriptionPackage.findUnique({
      where: { id: dto.packageId },
    });
    if (!pkg || !pkg.isActive) {
      throw new NotFoundException('Package not found');
    }

    const currency: Currency =
      subscription.gateway === PaymentGateway.safepay ? 'PKR' : 'USD';
    const amountMinorUnits = currency === 'PKR' ? pkg.pricePkr : pkg.priceUsd;

    if (subscription.gatewaySubscriptionId) {
      await this.adapterFor(subscription.gateway).changePackage({
        gatewaySubscriptionId: subscription.gatewaySubscriptionId,
        amountMinorUnits,
        interval:
          pkg.interval === SubscriptionInterval.yearly ? 'yearly' : 'monthly',
        packageName: pkg.name,
      });
    }
    return this.prisma.subscription.update({
      where: { id: subscription.id },
      data: { packageId: pkg.id },
    });
  }

  async cancel(restaurantId: number, user: AuthenticatedUser) {
    await this.restaurants.assertOwnership(restaurantId, user);
    const subscription =
      await this.lifecycle.currentForRestaurant(restaurantId);
    if (!subscription || subscription.status === SubscriptionStatus.canceled) {
      throw new ConflictException('No active subscription to cancel');
    }
    if (subscription.gatewaySubscriptionId) {
      await this.adapterFor(subscription.gateway).cancelSubscription(
        subscription.gatewaySubscriptionId,
      );
    }
    return this.prisma.subscription.update({
      where: { id: subscription.id },
      data: { status: SubscriptionStatus.canceled, graceUntil: null },
    });
  }

  // --- Webhook handling — every state change from here down is driven by
  // an already-signature-verified NormalizedWebhookEvent, never a client
  // request (spec §7.3, documents/USER-APP-subscription-and-ui.md §7). ---

  async handleWebhookEvent(event: NormalizedWebhookEvent): Promise<void> {
    switch (event.type) {
      case 'subscription_active':
        await this.handleSubscriptionActive(event);
        return;
      case 'subscription_past_due':
        if (event.gatewaySubscriptionId) {
          await this.lifecycle.markPastDue(
            event.gatewaySubscriptionId,
            event.gateway,
          );
        }
        return;
      case 'subscription_canceled':
        if (event.gatewaySubscriptionId) {
          await this.lifecycle.markCanceled(
            event.gatewaySubscriptionId,
            event.gateway,
          );
        }
        return;
      case 'charge_paid':
        await this.handleChargePaid(event);
        return;
      case 'charge_failed':
        await this.handleChargeFailed(event);
        return;
      case 'ignored':
        return;
    }
  }

  private async handleSubscriptionActive(event: NormalizedWebhookEvent) {
    await this.activateFromWebhookMetadata(event);
  }

  /**
   * Shared by `subscription_active` (Stripe's persistent subscription
   * object transitioning to active) and `charge_paid` (Safepay's one-off
   * per-period order — there's no persistent subscription object to update
   * separately, so a paid order both confirms payment AND extends the
   * period in one step). Returns the updated Subscription row, or null if
   * the event carries nothing to correlate it to a restaurant with.
   */
  private async activateFromWebhookMetadata(event: NormalizedWebhookEvent) {
    const {
      metadata,
      gatewaySubscriptionId,
      gatewayCustomerId,
      currentPeriodEnd,
      gateway,
    } = event;
    if (!metadata || !gatewaySubscriptionId) {
      // Mirrors TripoGenerationService.handleTaskResult's "not found ->
      // warn and return" idempotent-safety pattern.
      return null;
    }
    const pkg = await this.prisma.subscriptionPackage.findUnique({
      where: { id: metadata.packageId },
    });
    if (!pkg) {
      this.logger.warn(
        `Ignoring ${gateway} activation for unknown packageId=${metadata.packageId}`,
      );
      return null;
    }

    const { subscription, created } = await this.lifecycle.activate({
      restaurantId: metadata.restaurantId,
      packageId: metadata.packageId,
      gateway,
      gatewaySubscriptionId,
      gatewayCustomerId,
      currentPeriodEnd:
        currentPeriodEnd ?? this.fallbackPeriodEnd(pkg.interval),
    });

    // Redeem the promo exactly once — only on the restaurant's first-ever
    // activation, never on a later renewal event (design decision in the plan).
    if (created && metadata.promoCode) {
      await this.redeemPromoIfValid(metadata.promoCode, metadata.restaurantId);
    }
    return subscription;
  }

  private async handleChargePaid(event: NormalizedWebhookEvent) {
    // Safepay always carries metadata (see class doc comment); Stripe's
    // invoice.paid deliberately doesn't (Stripe's own subscription events
    // already keep currentPeriodEnd accurate, so re-activating here too
    // would be redundant, not wrong — but simpler to only do it once).
    let subscription = event.metadata
      ? await this.activateFromWebhookMetadata(event)
      : null;
    if (!subscription && event.gatewaySubscriptionId) {
      subscription = await this.lifecycle.findByGatewayRef(
        event.gatewaySubscriptionId,
        event.gateway,
      );
    }
    if (!subscription) {
      this.logger.warn(
        `Ignoring ${event.gateway} charge-paid for unknown subscription ref`,
      );
      return;
    }
    await this.prisma.charge.create({
      data: {
        restaurantId: subscription.restaurantId,
        type: ChargeType.subscription,
        // Currency is implied by `event.gateway` (stripe -> USD, safepay ->
        // PKR) — Charge has no currency column of its own (pre-existing
        // schema, out of scope to extend here; see plan's design notes).
        amount: this.minorUnitsToDecimal(event.amountMinorUnits ?? 0),
        status: ChargeStatus.paid,
        gatewayRef: event.gatewayChargeRef,
      },
    });
  }

  private async handleChargeFailed(event: NormalizedWebhookEvent) {
    const restaurantId =
      event.metadata?.restaurantId ??
      (event.gatewaySubscriptionId
        ? (
            await this.lifecycle.findByGatewayRef(
              event.gatewaySubscriptionId,
              event.gateway,
            )
          )?.restaurantId
        : undefined);
    if (restaurantId == null) {
      this.logger.warn(
        `Ignoring ${event.gateway} charge-failed with no restaurant to attribute it to`,
      );
      return;
    }
    await this.prisma.charge.create({
      data: {
        restaurantId,
        type: ChargeType.subscription,
        amount: this.minorUnitsToDecimal(event.amountMinorUnits ?? 0),
        status: ChargeStatus.failed,
        gatewayRef: event.gatewayChargeRef,
      },
    });

    const subscription =
      await this.lifecycle.currentForRestaurant(restaurantId);
    if (subscription?.gatewaySubscriptionId) {
      await this.lifecycle.markPastDue(
        subscription.gatewaySubscriptionId,
        event.gateway,
      );
    }
  }

  private async redeemPromoIfValid(
    code: string,
    restaurantId: number,
  ): Promise<void> {
    const promo = await this.prisma.promoCode.findUnique({
      where: { code: code.toUpperCase() },
    });
    if (!promo || !promo.isActive) return;
    if (
      promo.maxRedemptions != null &&
      promo.timesRedeemed >= promo.maxRedemptions
    )
      return;
    const alreadyUsed = await this.prisma.promoRedemption.findFirst({
      where: { promoCodeId: promo.id, restaurantId },
    });
    if (alreadyUsed) return;

    await this.prisma.$transaction([
      this.prisma.promoCode.update({
        where: { id: promo.id },
        data: { timesRedeemed: { increment: 1 } },
      }),
      this.prisma.promoRedemption.create({
        data: { promoCodeId: promo.id, restaurantId },
      }),
    ]);
  }

  private async findValidPromoOrThrow(
    code: string,
    appliesTo: PromoAppliesTo,
  ): Promise<PromoCode> {
    const promo = await this.prisma.promoCode.findUnique({
      where: { code: code.toUpperCase() },
    });
    const now = new Date();
    const valid =
      !!promo &&
      promo.isActive &&
      promo.appliesTo === appliesTo &&
      (!promo.startsAt || promo.startsAt <= now) &&
      (!promo.endsAt || promo.endsAt >= now) &&
      (promo.maxRedemptions == null ||
        promo.timesRedeemed < promo.maxRedemptions);
    if (!valid || !promo) {
      throw new BadRequestException(
        'Promo code is invalid or no longer available',
      );
    }
    return promo;
  }

  private applyDiscount(
    basePriceMinorUnits: number,
    currency: Currency,
    promo: PromoCode | null,
  ): number {
    if (!promo) return basePriceMinorUnits;
    if (promo.discountType === PromoDiscountType.percent) {
      return Math.max(
        Math.round(basePriceMinorUnits * (1 - promo.amount / 100)),
        0,
      );
    }
    // Fixed discount only applies when its currency matches the checkout
    // currency — never silently subtract a mismatched-currency amount.
    if (promo.currency === currency) {
      return Math.max(basePriceMinorUnits - promo.amount, 0);
    }
    return basePriceMinorUnits;
  }

  private minorUnitsToDecimal(minorUnits: number): Prisma.Decimal {
    return new Prisma.Decimal(minorUnits).div(100);
  }

  private fallbackPeriodEnd(interval: SubscriptionInterval): Date {
    const days = interval === SubscriptionInterval.yearly ? 365 : 30;
    return new Date(Date.now() + days * 24 * 60 * 60 * 1000);
  }

  private adapterFor(gateway: PaymentGateway): PaymentGatewayAdapter {
    return gateway === PaymentGateway.stripe ? this.stripe : this.safepay;
  }

  private frontendBaseUrl(): string {
    const url = this.config.get<string>('FRONTEND_BASE_URL');
    if (!url) {
      throw new BadRequestException('Billing checkout is not configured');
    }
    return url.replace(/\/$/, '');
  }
}
