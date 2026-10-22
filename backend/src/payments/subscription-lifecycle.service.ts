import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  PaymentGateway,
  SubscriptionStatus,
  type Subscription,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PaymentsNotificationService } from './payments-notification.service';

const DEFAULT_GRACE_PERIOD_DAYS = 5;

export interface ActivateParams {
  restaurantId: number;
  packageId: number;
  gateway: PaymentGateway;
  gatewaySubscriptionId: string;
  gatewayCustomerId?: string;
  currentPeriodEnd: Date;
}

/**
 * The payment <-> AR-link lifecycle state machine (documents/
 * USER-APP-subscription-and-ui.md §4). Every state transition here is
 * driven by a verified gateway webhook (or, for `expireElapsedGracePeriods`,
 * by our own grace-period clock) — never by a client request. Only
 * `SubscriptionStatus.expired` gates the public AR viewer; `past_due`
 * (inside its grace period) still serves normally, which is the entire
 * point of having a grace period.
 *
 * There is one logical "current" Subscription row per restaurant,
 * maintained by find-and-update rather than a hard DB unique constraint
 * (mirrors how TripoGenerationService reuses one MenuItem row across a
 * generation job's lifecycle via `tripoTaskId`, rather than creating new
 * rows per attempt).
 */
@Injectable()
export class SubscriptionLifecycleService {
  private readonly logger = new Logger(SubscriptionLifecycleService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly notifications: PaymentsNotificationService,
  ) {}

  async isRestaurantGated(restaurantId: number): Promise<boolean> {
    const subscription = await this.currentForRestaurant(restaurantId);
    return this.isGated(subscription);
  }

  /** Pure check for callers that already loaded the restaurant's subscriptions relation. */
  isGated(
    subscription: { status: SubscriptionStatus } | null | undefined,
  ): boolean {
    return subscription?.status === SubscriptionStatus.expired;
  }

  async currentForRestaurant(
    restaurantId: number,
  ): Promise<Subscription | null> {
    return this.prisma.subscription.findFirst({
      where: { restaurantId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findByGatewayRef(
    gatewaySubscriptionId: string,
    gateway: PaymentGateway,
  ): Promise<Subscription | null> {
    return this.prisma.subscription.findFirst({
      where: { gatewaySubscriptionId, gateway },
    });
  }

  /**
   * Payment succeeded (checkout completed or a renewal charge cleared).
   * Returns `created: true` only the first time this restaurant ever gets
   * a Subscription row — PaymentsService uses that to redeem a promo code
   * exactly once, never on a later renewal.
   */
  async activate(
    params: ActivateParams,
  ): Promise<{ subscription: Subscription; created: boolean }> {
    const existing = await this.currentForRestaurant(params.restaurantId);
    const wasGated = this.isGated(existing);
    const data = {
      packageId: params.packageId,
      gateway: params.gateway,
      status: SubscriptionStatus.active,
      currentPeriodEnd: params.currentPeriodEnd,
      graceUntil: null,
      gatewayCustomerId: params.gatewayCustomerId,
      gatewaySubscriptionId: params.gatewaySubscriptionId,
    };

    if (!existing) {
      const subscription = await this.prisma.subscription.create({
        data: { restaurantId: params.restaurantId, ...data },
      });
      return { subscription, created: true };
    }

    const subscription = await this.prisma.subscription.update({
      where: { id: existing.id },
      data,
    });
    if (wasGated) {
      await this.notifications.sendReactivated(params.restaurantId);
    }
    return { subscription, created: false };
  }

  /** A payment attempt failed — start (or continue) the grace period. */
  async markPastDue(
    gatewaySubscriptionId: string,
    gateway: PaymentGateway,
  ): Promise<void> {
    const subscription = await this.findByGatewayRef(
      gatewaySubscriptionId,
      gateway,
    );
    if (!subscription) {
      this.logger.warn(
        `Ignoring ${gateway} past-due event for unknown subscription ref`,
      );
      return;
    }
    // Already fully expired — don't reset the clock backwards to past_due;
    // the restaurant needs a fresh successful payment to reactivate either way.
    if (subscription.status === SubscriptionStatus.expired) return;

    const graceDays = this.gracePeriodDays();
    const graceUntil = new Date(Date.now() + graceDays * 24 * 60 * 60 * 1000);
    await this.prisma.subscription.update({
      where: { id: subscription.id },
      // Keep the earliest graceUntil if a retry fails again mid-grace —
      // don't let repeated failed retries push the deadline further out.
      data: {
        status: SubscriptionStatus.past_due,
        graceUntil: subscription.graceUntil ?? graceUntil,
      },
    });
    await this.notifications.sendPastDue(subscription.restaurantId, graceDays);
  }

  async markCanceled(
    gatewaySubscriptionId: string,
    gateway: PaymentGateway,
  ): Promise<void> {
    const subscription = await this.findByGatewayRef(
      gatewaySubscriptionId,
      gateway,
    );
    if (!subscription) {
      this.logger.warn(
        `Ignoring ${gateway} cancellation event for unknown subscription ref`,
      );
      return;
    }
    await this.prisma.subscription.update({
      where: { id: subscription.id },
      data: { status: SubscriptionStatus.canceled, graceUntil: null },
    });
  }

  /**
   * Grace period ends without payment (§4.3) — gateways never send an
   * explicit "expired" event, so this app owns the transition on a
   * schedule. Called by SubscriptionGraceCron. Returns how many rows it
   * expired.
   */
  async expireElapsedGracePeriods(): Promise<number> {
    const elapsed = await this.prisma.subscription.findMany({
      where: {
        status: SubscriptionStatus.past_due,
        graceUntil: { lt: new Date() },
      },
    });
    for (const subscription of elapsed) {
      await this.prisma.subscription.update({
        where: { id: subscription.id },
        data: { status: SubscriptionStatus.expired },
      });
      await this.notifications.sendExpired(subscription.restaurantId);
    }
    return elapsed.length;
  }

  private gracePeriodDays(): number {
    const configured = this.config.get<string>(
      'SUBSCRIPTION_GRACE_PERIOD_DAYS',
    );
    const parsed = configured ? Number(configured) : NaN;
    return Number.isFinite(parsed) && parsed > 0
      ? parsed
      : DEFAULT_GRACE_PERIOD_DAYS;
  }
}
