import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import Stripe from 'stripe';
import { StripeGatewayService } from './stripe-gateway.service';

describe('StripeGatewayService.verifyAndParseWebhook', () => {
  let service: StripeGatewayService;
  const webhookSecret = 'whsec_test_secret';
  const stripeForSigning = new Stripe('sk_test_dummy');

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        StripeGatewayService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) =>
              key === 'STRIPE_WEBHOOK_SECRET' ? webhookSecret : 'sk_test_dummy',
            ),
          },
        },
      ],
    }).compile();
    service = moduleRef.get(StripeGatewayService);
  });

  function sign(payload: string): string {
    return stripeForSigning.webhooks.generateTestHeaderString({
      payload,
      secret: webhookSecret,
    });
  }

  it('rejects a payload with an invalid signature', () => {
    const payload = JSON.stringify({
      id: 'evt_1',
      type: 'customer.subscription.updated',
    });
    expect(() =>
      service.verifyAndParseWebhook(Buffer.from(payload), 'bad-signature'),
    ).toThrow();
  });

  it('rejects a payload with no signature header', () => {
    const payload = JSON.stringify({
      id: 'evt_1',
      type: 'customer.subscription.updated',
    });
    expect(() =>
      service.verifyAndParseWebhook(Buffer.from(payload), undefined),
    ).toThrow();
  });

  it('normalizes an active customer.subscription.updated event, decoding metadata', () => {
    const payload = JSON.stringify({
      id: 'evt_1',
      type: 'customer.subscription.updated',
      data: {
        object: {
          id: 'sub_1',
          status: 'active',
          customer: 'cus_1',
          metadata: { restaurantId: '5', packageId: '2', promoCode: 'SAVE10' },
          items: { data: [{ current_period_end: 1893456000 }] },
        },
      },
    });

    const event = service.verifyAndParseWebhook(
      Buffer.from(payload),
      sign(payload),
    );

    expect(event).toMatchObject({
      type: 'subscription_active',
      gatewaySubscriptionId: 'sub_1',
      gatewayCustomerId: 'cus_1',
      metadata: { restaurantId: 5, packageId: 2, promoCode: 'SAVE10' },
    });
    expect(event.currentPeriodEnd).toBeInstanceOf(Date);
  });

  it('normalizes a past_due status to subscription_past_due', () => {
    const payload = JSON.stringify({
      id: 'evt_2',
      type: 'customer.subscription.updated',
      data: {
        object: {
          id: 'sub_1',
          status: 'past_due',
          customer: 'cus_1',
          metadata: {},
          items: { data: [] },
        },
      },
    });

    const event = service.verifyAndParseWebhook(
      Buffer.from(payload),
      sign(payload),
    );

    expect(event.type).toBe('subscription_past_due');
  });

  it('normalizes customer.subscription.deleted to subscription_canceled', () => {
    const payload = JSON.stringify({
      id: 'evt_3',
      type: 'customer.subscription.deleted',
      data: { object: { id: 'sub_1', customer: 'cus_1', metadata: {} } },
    });

    const event = service.verifyAndParseWebhook(
      Buffer.from(payload),
      sign(payload),
    );

    expect(event.type).toBe('subscription_canceled');
  });

  it('treats an unrelated event type as ignored, not a failure', () => {
    const payload = JSON.stringify({
      id: 'evt_4',
      type: 'payment_method.attached',
      data: { object: {} },
    });

    const event = service.verifyAndParseWebhook(
      Buffer.from(payload),
      sign(payload),
    );

    expect(event.type).toBe('ignored');
    expect(event.metadata).toBeUndefined();
  });
});
