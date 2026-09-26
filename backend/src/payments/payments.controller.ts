import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import { RestaurantIdFromSlug } from '../common/decorators/slug-param.decorators';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import type { AuthenticatedUser } from '../auth/types/authenticated-user.interface';
import {
  ChangePackageDto,
  CheckoutDto,
  ValidatePromoDto,
} from './dto/checkout.dto';
import { PaymentsService } from './payments.service';

// Checkout/cancel/change trigger real (or simulated) paid gateway work —
// stricter than the global default, same tier as auth endpoints (spec
// §7.4: "debounce actions that trigger paid or expensive work").
const BILLING_THROTTLE = { default: { limit: 10, ttl: 60_000 } };

@UseGuards(JwtAuthGuard)
@Controller('billing')
export class PaymentsController {
  constructor(private readonly payments: PaymentsService) {}

  // Public pricing — not sensitive, and a prospective checkout screen needs
  // it before the owner necessarily picks a restaurant.
  @Get('packages')
  listPackages() {
    return this.payments.listActivePackages();
  }

  @Get('default-country')
  defaultCountry(@Req() req: Request) {
    return { country: this.payments.defaultCountryHint(req.headers) };
  }

  @Throttle(BILLING_THROTTLE)
  @Post('promo/validate')
  validatePromo(@Body() dto: ValidatePromoDto) {
    return this.payments.validatePromo(dto);
  }

  @Get('restaurants/:restaurantSlug/subscription')
  getSubscription(
    @CurrentUser() user: AuthenticatedUser,
    @RestaurantIdFromSlug() id: number,
  ) {
    return this.payments.getSubscription(id, user);
  }

  @Get('restaurants/:restaurantSlug/invoices')
  listInvoices(
    @CurrentUser() user: AuthenticatedUser,
    @RestaurantIdFromSlug() id: number,
  ) {
    return this.payments.listInvoices(id, user);
  }

  @Throttle(BILLING_THROTTLE)
  @Post('restaurants/:restaurantSlug/checkout')
  checkout(
    @CurrentUser() user: AuthenticatedUser,
    @RestaurantIdFromSlug() id: number,
    @Body() dto: CheckoutDto,
  ) {
    return this.payments.checkout(id, user, dto);
  }

  @Throttle(BILLING_THROTTLE)
  @Patch('restaurants/:restaurantSlug/subscription')
  changePackage(
    @CurrentUser() user: AuthenticatedUser,
    @RestaurantIdFromSlug() id: number,
    @Body() dto: ChangePackageDto,
  ) {
    return this.payments.changePackage(id, user, dto);
  }

  @Throttle(BILLING_THROTTLE)
  @HttpCode(HttpStatus.OK)
  @Post('restaurants/:restaurantSlug/cancel')
  cancel(
    @CurrentUser() user: AuthenticatedUser,
    @RestaurantIdFromSlug() id: number,
  ) {
    return this.payments.cancel(id, user);
  }
}
