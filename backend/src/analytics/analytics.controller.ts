import { Controller, Get, UseGuards } from '@nestjs/common';
import type { AuthenticatedUser } from '../auth/types/authenticated-user.interface';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RestaurantIdFromSlug } from '../common/decorators/slug-param.decorators';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { AnalyticsService } from './analytics.service';

@UseGuards(JwtAuthGuard)
@Controller()
export class AnalyticsController {
  constructor(private readonly analytics: AnalyticsService) {}

  /** The signed-in user's multi-restaurant dashboard — scoped to the
   * restaurants they own (AnalyticsService.overview). */
  @Get('dashboard/overview')
  overview(@CurrentUser() user: AuthenticatedUser) {
    return this.analytics.overview(user);
  }

  /** Scan count per dish; ownership enforced in the service. */
  @Get('restaurants/:restaurantSlug/analytics/items')
  itemScanCounts(
    @CurrentUser() user: AuthenticatedUser,
    @RestaurantIdFromSlug() restaurantId: number,
  ) {
    return this.analytics.itemScanCounts(restaurantId, user);
  }
}
