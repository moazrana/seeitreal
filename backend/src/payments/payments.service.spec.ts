import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { UserRole } from '@ar-menu/shared';
import {
  ChargeStatus,
  PaymentGateway,
  PromoAppliesTo,
  PromoDiscountType,
  SubscriptionStatus,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { RestaurantsService } from '../restaurants/restaurants.service';
import { SafepayGatewayService } from './gateways/safepay-gateway.service';
import { StripeGatewayService } from './gateways/stripe-gateway.service';
import { PaymentsService } from './payments.service';
import { SubscriptionLifecycleService } from './subscription-lifecycle.service';

describe('PaymentsService', () => {
  let service: PaymentsService;
  let prisma: {
    subscriptionPackage: { findUnique: jest.Mock; findMany: jest.Mock };
    promoCode: { findUnique: jest.Mock; update: jest.Mock };
    promoRedemption: { findFirst: jest.Mock; create: jest.Mock };
    charge: { create: jest.Mock };
    $transaction: jest.Mock;
  };
  let restaurants: { assertOwnership: jest.Mock };
  let lifecycle: {
    currentForRestaurant: jest.Mock;
    findByGatewayRef: jest.Mock;
    activate: jest.Mock;
    markPastDue: jest.Mock;
    markCanceled: jest.Mock;
  };
  let stripe: { createCheckoutSession: jest.Mock };
  let safepay: { createCheckoutSession: jest.Mock };
  let config: { get: jest.Mock };

  const user = { userId: 1, email: 'owner@example.com', role: UserRole.OWNER };

  beforeEach(async () => {
    prisma = {
      subscriptionPackage: { findUnique: jest.fn(), findMany: jest.fn() },
      promoCode: { findUnique: jest.fn(), update: jest.fn() },
      promoRedemption: { findFirst: jest.fn(), create: jest.fn() },
      charge: { create: jest.fn() },
      $transaction: jest.fn((ops: unknown[]) => Promise.all(ops)),
    };
    restaurants = {
      assertOwnership: jest
        .fn()
        .mockResolvedValue({ id: 5, name: 'Demo Diner' }),
    };
    lifecycle = {
      currentForRestaurant: jest.fn().mockResolvedValue(null),
      findByGatewayRef: jest.fn(),
      activate: jest.fn(),
      markPastDue: jest.fn(),
      markCanceled: jest.fn(),
    };
    stripe = {
      createCheckoutSession: jest
        .fn()
        .mockResolvedValue({ checkoutUrl: 'https://stripe.example/checkout' }),
    };
    safepay = { createCheckoutSession: jest.fn() };
    config = {
      get: jest.fn((key: string) =>
        key === 'FRONTEND_BASE_URL' ? 'https://app.example.com' : undefined,
      ),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        PaymentsService,
        { provide: PrismaService, useValue: prisma },
        { provide: RestaurantsService, useValue: restaurants },
        { provide: SubscriptionLifecycleService, useValue: lifecycle },
        { provide: StripeGatewayService, useValue: stripe },
        { provide: SafepayGatewayService, useValue: safepay },
        { provide: ConfigService, useValue: config },
      ],
    }).compile();

    service = moduleRef.get(PaymentsService);
  });

  describe('checkout', () => {
    const pkg = {
      id: 2,
      name: 'Growth',
      isActive: true,
      pricePkr: 500000,
      priceUsd: 2000,
      interval: 'monthly',
    };

    it('rejects checkout when the restaurant already has an active subscription', async () => {
      prisma.subscriptionPackage.findUnique.mockResolvedValueOnce(pkg);
      lifecycle.currentForRestaurant.mockResolvedValueOnce({
        status: SubscriptionStatus.active,
      });

      await expect(
        service.checkout(5, user, { packageId: 2, billingCountry: 'US' }),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(stripe.createCheckoutSession).not.toHaveBeenCalled();
    });

    it('throws NotFoundException for an unknown or retired package', async () => {
      prisma.subscriptionPackage.findUnique.mockResolvedValueOnce(null);
      await expect(
        service.checkout(5, user, { packageId: 999, billingCountry: 'US' }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('routes PK billing country to Safepay in PKR and everything else to Stripe in USD', async () => {
      prisma.subscriptionPackage.findUnique.mockResolvedValue(pkg);
      safepay.createCheckoutSession.mockResolvedValueOnce({
        checkoutUrl: 'https://safepay.example/checkout',
      });

      await service.checkout(5, user, { packageId: 2, billingCountry: 'pk' });
      expect(safepay.createCheckoutSession).toHaveBeenCalledWith(
        expect.objectContaining({ amountMinorUnits: pkg.pricePkr }),
      );

      await service.checkout(5, user, { packageId: 2, billingCountry: 'GB' });
      expect(stripe.createCheckoutSession).toHaveBeenCalledWith(
        expect.objectContaining({ amountMinorUnits: pkg.priceUsd }),
      );
    });

    it('applies a valid percent promo to the checkout amount', async () => {
      prisma.subscriptionPackage.findUnique.mockResolvedValueOnce(pkg);
      prisma.promoCode.findUnique.mockResolvedValueOnce({
        id: 9,
        code: 'SAVE10',
        isActive: true,
        appliesTo: PromoAppliesTo.subscription,
        discountType: PromoDiscountType.percent,
        amount: 10,
        currency: null,
        startsAt: null,
        endsAt: null,
        maxRedemptions: null,
        timesRedeemed: 0,
      });
      prisma.promoRedemption.findFirst.mockResolvedValueOnce(null);

      await service.checkout(5, user, {
        packageId: 2,
        billingCountry: 'US',
        promoCode: 'SAVE10',
      });

      expect(stripe.createCheckoutSession).toHaveBeenCalledWith(
        expect.objectContaining({ amountMinorUnits: 1800 }), // 2000 - 10%
      );
    });

    it('rejects a promo code already redeemed by this restaurant', async () => {
      prisma.subscriptionPackage.findUnique.mockResolvedValueOnce(pkg);
      prisma.promoCode.findUnique.mockResolvedValueOnce({
        id: 9,
        code: 'SAVE10',
        isActive: true,
        appliesTo: PromoAppliesTo.subscription,
        discountType: PromoDiscountType.percent,
        amount: 10,
        startsAt: null,
        endsAt: null,
        maxRedemptions: null,
        timesRedeemed: 0,
      });
      prisma.promoRedemption.findFirst.mockResolvedValueOnce({ id: 1 });

      await expect(
        service.checkout(5, user, {
          packageId: 2,
          billingCountry: 'US',
          promoCode: 'SAVE10',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects a deactivated promo code', async () => {
      prisma.subscriptionPackage.findUnique.mockResolvedValueOnce(pkg);
      prisma.promoCode.findUnique.mockResolvedValueOnce({
        id: 9,
        code: 'OLD',
        isActive: false,
        appliesTo: PromoAppliesTo.subscription,
        discountType: PromoDiscountType.percent,
        amount: 10,
        startsAt: null,
        endsAt: null,
        maxRedemptions: null,
        timesRedeemed: 0,
      });

      await expect(
        service.checkout(5, user, {
          packageId: 2,
          billingCountry: 'US',
          promoCode: 'OLD',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('validatePromo', () => {
    it('rejects a code past its max redemptions', async () => {
      prisma.promoCode.findUnique.mockResolvedValueOnce({
        code: 'CAPPED',
        isActive: true,
        appliesTo: PromoAppliesTo.subscription,
        startsAt: null,
        endsAt: null,
        maxRedemptions: 5,
        timesRedeemed: 5,
      });

      await expect(
        service.validatePromo({ code: 'CAPPED', appliesTo: 'subscription' }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects a code outside its validity window', async () => {
      prisma.promoCode.findUnique.mockResolvedValueOnce({
        code: 'EXPIRED',
        isActive: true,
        appliesTo: PromoAppliesTo.subscription,
        startsAt: new Date('2020-01-01'),
        endsAt: new Date('2020-02-01'),
        maxRedemptions: null,
        timesRedeemed: 0,
      });

      await expect(
        service.validatePromo({ code: 'EXPIRED', appliesTo: 'subscription' }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('handleWebhookEvent', () => {
    it('redeems the promo exactly once, only on first-ever activation', async () => {
      lifecycle.activate.mockResolvedValueOnce({
        subscription: { id: 1, restaurantId: 5 },
        created: true,
      });
      prisma.subscriptionPackage.findUnique.mockResolvedValueOnce({
        id: 2,
        interval: 'monthly',
      });
      prisma.promoCode.findUnique.mockResolvedValueOnce({
        id: 9,
        isActive: true,
        maxRedemptions: null,
        timesRedeemed: 0,
      });
      prisma.promoRedemption.findFirst.mockResolvedValueOnce(null);

      await service.handleWebhookEvent({
        type: 'subscription_active',
        gateway: PaymentGateway.stripe,
        gatewaySubscriptionId: 'sub_1',
        metadata: { restaurantId: 5, packageId: 2, promoCode: 'SAVE10' },
        raw: {},
      });

      expect(prisma.promoRedemption.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: { promoCodeId: 9, restaurantId: 5 } }),
      );
    });

    it('does not redeem a promo on a renewal (created: false)', async () => {
      lifecycle.activate.mockResolvedValueOnce({
        subscription: { id: 1, restaurantId: 5 },
        created: false,
      });
      prisma.subscriptionPackage.findUnique.mockResolvedValueOnce({
        id: 2,
        interval: 'monthly',
      });

      await service.handleWebhookEvent({
        type: 'subscription_active',
        gateway: PaymentGateway.stripe,
        gatewaySubscriptionId: 'sub_1',
        metadata: { restaurantId: 5, packageId: 2, promoCode: 'SAVE10' },
        raw: {},
      });

      expect(prisma.promoCode.findUnique).not.toHaveBeenCalled();
      expect(prisma.promoRedemption.create).not.toHaveBeenCalled();
    });

    it('records a paid Charge for charge_paid events (Stripe, no metadata)', async () => {
      lifecycle.findByGatewayRef.mockResolvedValueOnce({
        id: 1,
        restaurantId: 5,
      });

      await service.handleWebhookEvent({
        type: 'charge_paid',
        gateway: PaymentGateway.stripe,
        gatewaySubscriptionId: 'sub_1',
        gatewayChargeRef: 'in_1',
        amountMinorUnits: 2000,
        raw: {},
      });

      expect(prisma.charge.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            restaurantId: 5,
            status: ChargeStatus.paid,
            gatewayRef: 'in_1',
          }),
        }),
      );
    });

    it('records a failed Charge and marks the subscription past_due on charge_failed', async () => {
      lifecycle.currentForRestaurant.mockResolvedValueOnce({
        gatewaySubscriptionId: 'sub_1',
      });

      await service.handleWebhookEvent({
        type: 'charge_failed',
        gateway: PaymentGateway.stripe,
        metadata: { restaurantId: 5, packageId: 2 },
        gatewayChargeRef: 'in_2',
        amountMinorUnits: 2000,
        raw: {},
      });

      expect(prisma.charge.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: ChargeStatus.failed }),
        }),
      );
      expect(lifecycle.markPastDue).toHaveBeenCalledWith(
        'sub_1',
        PaymentGateway.stripe,
      );
    });

    it('is a no-op for ignored events', async () => {
      await service.handleWebhookEvent({
        type: 'ignored',
        gateway: PaymentGateway.stripe,
        raw: {},
      });
      expect(prisma.charge.create).not.toHaveBeenCalled();
      expect(lifecycle.activate).not.toHaveBeenCalled();
    });
  });
});
