import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PaymentGateway, SubscriptionStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { SafepayGatewayService } from './gateways/safepay-gateway.service';
import { PaymentsNotificationService } from './payments-notification.service';

// Generate the next period's checkout a day ahead of expiry, giving the
// owner time to pay before currentPeriodEnd actually passes.
const RENEWAL_LEAD_TIME_MS = 24 * 60 * 60 * 1000;

/**
 * Safepay has no native recurring-subscription object (documents/
 * USER-APP-subscription-and-ui.md §3 — "implement PKR recurring as
 * scheduled invoices + retry"), so this cron is what actually renews a
 * Safepay-billed subscription: it generates a fresh one-off checkout for
 * each period, priced fresh from the package's *current* price (this is
 * how "editing a package's price applies at next renewal" naturally holds
 * for Safepay — see the plan's design notes). Stripe subscriptions renew
 * natively and never appear here.
 */
@Injectable()
export class SubscriptionRenewalCron {
  private readonly logger = new Logger(SubscriptionRenewalCron.name);
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly safepay: SafepayGatewayService,
    private readonly notifications: PaymentsNotificationService,
    private readonly config: ConfigService,
  ) {}

  @Cron(CronExpression.EVERY_HOUR)
  async handleCron() {
    if (this.running) return;
    this.running = true;
    try {
      const renewed = await this.renewDueSafepaySubscriptions();
      if (renewed > 0) {
        this.logger.debug(`Generated ${renewed} Safepay renewal checkout(s)`);
      }
    } catch (err) {
      this.logger.error(`Safepay renewal sweep failed: ${String(err)}`);
    } finally {
      this.running = false;
    }
  }

  async renewDueSafepaySubscriptions(): Promise<number> {
    const dueBy = new Date(Date.now() + RENEWAL_LEAD_TIME_MS);
    const due = await this.prisma.subscription.findMany({
      where: {
        gateway: PaymentGateway.safepay,
        status: SubscriptionStatus.active,
        currentPeriodEnd: { lt: dueBy },
      },
      include: { package: true, restaurant: true },
    });

    let count = 0;
    for (const subscription of due) {
      try {
        const frontendBaseUrl = this.frontendBaseUrl();
        await this.safepay.createCheckoutSession({
          metadata: {
            restaurantId: subscription.restaurantId,
            packageId: subscription.packageId,
          },
          restaurantName: subscription.restaurant.name,
          packageName: subscription.package.name,
          amountMinorUnits: subscription.package.pricePkr,
          interval:
            subscription.package.interval === 'yearly' ? 'yearly' : 'monthly',
          existingGatewayCustomerId: subscription.gatewayCustomerId,
          successUrl: `${frontendBaseUrl}/restaurants/${subscription.restaurantId}/billing?renewal=success`,
          cancelUrl: `${frontendBaseUrl}/restaurants/${subscription.restaurantId}/billing?renewal=due`,
        });
        await this.notifications.sendRenewalDue(subscription.restaurantId);
        count++;
      } catch (err) {
        this.logger.error(
          `Failed to generate Safepay renewal checkout for restaurant ${subscription.restaurantId}: ${String(err)}`,
        );
      }
    }
    return count;
  }

  private frontendBaseUrl(): string {
    return (this.config.get<string>('FRONTEND_BASE_URL') ?? '').replace(
      /\/$/,
      '',
    );
  }
}
