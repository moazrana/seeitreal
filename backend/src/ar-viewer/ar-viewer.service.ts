import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SubscriptionLifecycleService } from '../payments/subscription-lifecycle.service';

/**
 * Thrown when a restaurant's subscription is `expired` (documents/
 * USER-APP-subscription-and-ui.md §4) — deliberately NOT a NotFoundException:
 * unlike suspension/hiding (which must stay indistinguishable from a
 * genuinely missing dish, see the comment below), an expired subscription
 * gets its own honest, on-brand "temporarily unavailable" page. A plain
 * `Error` subclass, not an HttpException — this is a business-state branch
 * the controller renders HTML for, not a client error response.
 */
export class SubscriptionExpiredError extends Error {
  constructor(public readonly restaurantName: string) {
    super('Subscription expired');
  }
}

@Injectable()
export class ArViewerService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly lifecycle: SubscriptionLifecycleService,
  ) {}

  async findItemByPublicSlug(slug: string) {
    const item = await this.prisma.menuItem.findUnique({
      where: { publicSlug: slug },
      include: {
        restaurant: {
          select: {
            name: true,
            suspended: true,
            subscriptions: { orderBy: { createdAt: 'desc' }, take: 1 },
          },
        },
      },
    });
    // Never reveal a suspended restaurant's items or an admin-hidden item
    // publicly (rootApp/ROOT-APP-Implementation-Spec.md §3.2, §3.3) — same
    // generic 404 as "doesn't exist", so this can't be distinguished from
    // a genuinely missing dish.
    if (!item || item.restaurant.suspended || item.hiddenByAdmin) {
      throw new NotFoundException('Dish not found');
    }
    // Only `expired` gates (documents/USER-APP-subscription-and-ui.md §4.1:
    // past_due inside its grace period still serves normally; a restaurant
    // with no Subscription row at all — never checked out — is treated as
    // not gated, see the plan's design notes). Unlike suspension above,
    // this is surfaced honestly, not disguised as a 404.
    if (this.lifecycle.isGated(item.restaurant.subscriptions[0])) {
      throw new SubscriptionExpiredError(item.restaurant.name);
    }
    return item;
  }
}
