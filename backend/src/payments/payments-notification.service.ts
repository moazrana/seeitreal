import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Dunning + reactivation emails (documents/USER-APP-subscription-and-ui.md
 * §5: "Dunning emails on failed payment, and a confirmation when links
 * reactivate"). Mirrors AuthService.sendMailStub exactly (auth.service.ts)
 * — this codebase has no real transactional email provider wired up yet
 * anywhere, not just for auth, so this follows the same established
 * stub-and-TODO convention rather than inventing separate infrastructure.
 * Never logs a token/secret; these emails don't carry any either.
 */
@Injectable()
export class PaymentsNotificationService {
  private readonly logger = new Logger(PaymentsNotificationService.name);

  constructor(private readonly prisma: PrismaService) {}

  async sendPastDue(restaurantId: number, graceDays: number): Promise<void> {
    const to = await this.ownerEmail(restaurantId);
    this.sendMailStub(
      to,
      `Payment failed — update your payment method within ${graceDays} days`,
    );
  }

  async sendExpired(restaurantId: number): Promise<void> {
    const to = await this.ownerEmail(restaurantId);
    this.sendMailStub(
      to,
      'Your dish links are now offline — reactivate to restore them',
    );
  }

  async sendReactivated(restaurantId: number): Promise<void> {
    const to = await this.ownerEmail(restaurantId);
    this.sendMailStub(to, 'Payment received — your dish links are back online');
  }

  // Deliberately takes no checkoutUrl — it's a one-time payment link, not
  // something to pass into a stub that only logs a subject line (spec
  // §7.7); a real provider integration would take it and embed it in the
  // email body.
  async sendRenewalDue(restaurantId: number): Promise<void> {
    const to = await this.ownerEmail(restaurantId);
    this.sendMailStub(to, 'Your subscription is due for renewal');
  }

  private async ownerEmail(restaurantId: number): Promise<string | null> {
    const restaurant = await this.prisma.restaurant.findUnique({
      where: { id: restaurantId },
      select: { owner: { select: { email: true } } },
    });
    return restaurant?.owner.email ?? null;
  }

  // TODO: wire a real transactional email provider (e.g. SES/Postmark) via
  // env config before production launch — see AuthService.sendMailStub for
  // the same outstanding TODO on the auth side.
  private sendMailStub(to: string | null, subject: string) {
    if (!to) {
      this.logger.warn(
        `[mail stub] no owner email on file, dropping "${subject}"`,
      );
      return;
    }
    this.logger.debug(`[mail stub] would send "${subject}" to ${to}`);
  }
}
