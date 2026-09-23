import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { PaymentGateway, SubscriptionStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PaymentsNotificationService } from './payments-notification.service';
import { SubscriptionLifecycleService } from './subscription-lifecycle.service';

describe('SubscriptionLifecycleService', () => {
  let service: SubscriptionLifecycleService;
  let prisma: {
    subscription: {
      findFirst: jest.Mock;
      findMany: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
    };
  };
  let notifications: {
    sendReactivated: jest.Mock;
    sendPastDue: jest.Mock;
    sendExpired: jest.Mock;
  };
  let config: { get: jest.Mock };

  beforeEach(async () => {
    prisma = {
      subscription: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
    };
    notifications = {
      sendReactivated: jest.fn(),
      sendPastDue: jest.fn(),
      sendExpired: jest.fn(),
    };
    config = { get: jest.fn().mockReturnValue(undefined) };

    const moduleRef = await Test.createTestingModule({
      providers: [
        SubscriptionLifecycleService,
        { provide: PrismaService, useValue: prisma },
        { provide: ConfigService, useValue: config },
        { provide: PaymentsNotificationService, useValue: notifications },
      ],
    }).compile();

    service = moduleRef.get(SubscriptionLifecycleService);
  });

  describe('isGated', () => {
    it('only gates on expired status', () => {
      expect(service.isGated({ status: SubscriptionStatus.expired })).toBe(
        true,
      );
      expect(service.isGated({ status: SubscriptionStatus.past_due })).toBe(
        false,
      );
      expect(service.isGated({ status: SubscriptionStatus.active })).toBe(
        false,
      );
      expect(service.isGated(null)).toBe(false);
      expect(service.isGated(undefined)).toBe(false);
    });
  });

  describe('activate', () => {
    it('creates a new row when the restaurant has never subscribed, and reports created: true', async () => {
      prisma.subscription.findFirst.mockResolvedValueOnce(null);
      const created = { id: 1, status: SubscriptionStatus.active };
      prisma.subscription.create.mockResolvedValueOnce(created);

      const result = await service.activate({
        restaurantId: 5,
        packageId: 2,
        gateway: PaymentGateway.stripe,
        gatewaySubscriptionId: 'sub_1',
        currentPeriodEnd: new Date('2030-01-01'),
      });

      expect(result).toEqual({ subscription: created, created: true });
      expect(prisma.subscription.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            restaurantId: 5,
            status: SubscriptionStatus.active,
          }),
        }),
      );
      expect(notifications.sendReactivated).not.toHaveBeenCalled();
    });

    it('updates the existing row on a renewal and reports created: false', async () => {
      const existing = { id: 9, status: SubscriptionStatus.active };
      prisma.subscription.findFirst.mockResolvedValueOnce(existing);
      const updated = { id: 9, status: SubscriptionStatus.active };
      prisma.subscription.update.mockResolvedValueOnce(updated);

      const result = await service.activate({
        restaurantId: 5,
        packageId: 2,
        gateway: PaymentGateway.stripe,
        gatewaySubscriptionId: 'sub_1',
        currentPeriodEnd: new Date('2030-01-01'),
      });

      expect(result).toEqual({ subscription: updated, created: false });
      expect(prisma.subscription.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 9 } }),
      );
    });

    it('sends a reactivation notice only when the previous status was expired', async () => {
      prisma.subscription.findFirst.mockResolvedValueOnce({
        id: 9,
        status: SubscriptionStatus.expired,
      });
      prisma.subscription.update.mockResolvedValueOnce({ id: 9 });

      await service.activate({
        restaurantId: 5,
        packageId: 2,
        gateway: PaymentGateway.stripe,
        gatewaySubscriptionId: 'sub_1',
        currentPeriodEnd: new Date('2030-01-01'),
      });

      expect(notifications.sendReactivated).toHaveBeenCalledWith(5);
    });
  });

  describe('markPastDue', () => {
    it('does nothing for an unknown gateway subscription ref', async () => {
      prisma.subscription.findFirst.mockResolvedValueOnce(null);
      await service.markPastDue('sub_missing', PaymentGateway.stripe);
      expect(prisma.subscription.update).not.toHaveBeenCalled();
      expect(notifications.sendPastDue).not.toHaveBeenCalled();
    });

    it('sets status past_due and a graceUntil deadline, and notifies the owner', async () => {
      prisma.subscription.findFirst.mockResolvedValueOnce({
        id: 3,
        restaurantId: 7,
        status: SubscriptionStatus.active,
        graceUntil: null,
      });
      prisma.subscription.update.mockResolvedValueOnce({});

      await service.markPastDue('sub_1', PaymentGateway.stripe);

      expect(prisma.subscription.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 3 },
          data: expect.objectContaining({
            status: SubscriptionStatus.past_due,
          }),
        }),
      );
      expect(notifications.sendPastDue).toHaveBeenCalledWith(
        7,
        expect.any(Number),
      );
    });

    it('never resets an already-expired subscription back to past_due', async () => {
      prisma.subscription.findFirst.mockResolvedValueOnce({
        id: 3,
        restaurantId: 7,
        status: SubscriptionStatus.expired,
        graceUntil: null,
      });

      await service.markPastDue('sub_1', PaymentGateway.stripe);

      expect(prisma.subscription.update).not.toHaveBeenCalled();
    });

    it('keeps the earliest graceUntil across repeated failed retries', async () => {
      const earliestGrace = new Date('2030-01-01T00:00:00Z');
      prisma.subscription.findFirst.mockResolvedValueOnce({
        id: 3,
        restaurantId: 7,
        status: SubscriptionStatus.past_due,
        graceUntil: earliestGrace,
      });
      prisma.subscription.update.mockResolvedValueOnce({});

      await service.markPastDue('sub_1', PaymentGateway.stripe);

      expect(prisma.subscription.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ graceUntil: earliestGrace }),
        }),
      );
    });
  });

  describe('expireElapsedGracePeriods', () => {
    it('expires every past_due row whose grace period has elapsed and notifies each owner', async () => {
      prisma.subscription.findMany.mockResolvedValueOnce([
        { id: 1, restaurantId: 10 },
        { id: 2, restaurantId: 11 },
      ]);
      prisma.subscription.update.mockResolvedValue({});

      const count = await service.expireElapsedGracePeriods();

      expect(count).toBe(2);
      expect(prisma.subscription.update).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({
          where: { id: 1 },
          data: { status: SubscriptionStatus.expired },
        }),
      );
      expect(notifications.sendExpired).toHaveBeenCalledWith(10);
      expect(notifications.sendExpired).toHaveBeenCalledWith(11);
    });

    it('is a no-op when nothing has elapsed', async () => {
      prisma.subscription.findMany.mockResolvedValueOnce([]);
      const count = await service.expireElapsedGracePeriods();
      expect(count).toBe(0);
      expect(notifications.sendExpired).not.toHaveBeenCalled();
    });
  });

  describe('markCanceled', () => {
    it('does nothing for an unknown gateway subscription ref', async () => {
      prisma.subscription.findFirst.mockResolvedValueOnce(null);
      await service.markCanceled('sub_missing', PaymentGateway.stripe);
      expect(prisma.subscription.update).not.toHaveBeenCalled();
    });

    it('sets status canceled and clears graceUntil', async () => {
      prisma.subscription.findFirst.mockResolvedValueOnce({ id: 4 });
      prisma.subscription.update.mockResolvedValueOnce({});

      await service.markCanceled('sub_1', PaymentGateway.stripe);

      expect(prisma.subscription.update).toHaveBeenCalledWith({
        where: { id: 4 },
        data: { status: SubscriptionStatus.canceled, graceUntil: null },
      });
    });
  });
});
