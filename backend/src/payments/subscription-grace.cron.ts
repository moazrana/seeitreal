import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { SubscriptionLifecycleService } from './subscription-lifecycle.service';

/**
 * Flips `past_due` subscriptions whose grace period has elapsed to
 * `expired` (documents/USER-APP-subscription-and-ui.md §4.3) — gateways
 * never send an explicit "expired" event, so the app owns this transition
 * on a schedule. Mirrors TripoPollCron's overlap-guarded shape.
 */
@Injectable()
export class SubscriptionGraceCron {
  private readonly logger = new Logger(SubscriptionGraceCron.name);
  private running = false;

  constructor(private readonly lifecycle: SubscriptionLifecycleService) {}

  @Cron(CronExpression.EVERY_HOUR)
  async handleCron() {
    if (this.running) return;
    this.running = true;
    try {
      const expired = await this.lifecycle.expireElapsedGracePeriods();
      if (expired > 0) {
        this.logger.debug(
          `Expired ${expired} subscription(s) past their grace period`,
        );
      }
    } catch (err) {
      this.logger.error(
        `Subscription grace-period sweep failed: ${String(err)}`,
      );
    } finally {
      this.running = false;
    }
  }
}
