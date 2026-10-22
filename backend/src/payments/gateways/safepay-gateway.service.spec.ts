import { createHmac } from 'node:crypto';
import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { SafepayGatewayService } from './safepay-gateway.service';

describe('SafepayGatewayService.verifyAndParseWebhook', () => {
  let service: SafepayGatewayService;
  const webhookSecret = 's'.repeat(32);

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        SafepayGatewayService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) =>
              key === 'SAFEPAY_WEBHOOK_SECRET' ? webhookSecret : undefined,
            ),
          },
        },
      ],
    }).compile();
    service = moduleRef.get(SafepayGatewayService);
  });

  function sign(body: string): string {
    return createHmac('sha256', webhookSecret).update(body).digest('hex');
  }

  it('rejects a payload with an invalid signature', () => {
    const raw = Buffer.from(JSON.stringify({ data: { state: 'PAID' } }));
    expect(() => service.verifyAndParseWebhook(raw, 'wrong-signature')).toThrow(
      UnauthorizedException,
    );
  });

  it('rejects a payload with no signature header', () => {
    const raw = Buffer.from(JSON.stringify({ data: { state: 'PAID' } }));
    expect(() => service.verifyAndParseWebhook(raw, undefined)).toThrow(
      UnauthorizedException,
    );
  });

  it('accepts a correctly signed PAID event and normalizes it to charge_paid with metadata', () => {
    const body = JSON.stringify({
      data: {
        order_id: 'sub_abc',
        tracker_id: 'trk_1',
        amount: 150000,
        state: 'PAID',
        metadata: { restaurantId: '5', packageId: '2' },
      },
    });
    const raw = Buffer.from(body);

    const event = service.verifyAndParseWebhook(raw, sign(body));

    expect(event).toMatchObject({
      type: 'charge_paid',
      gatewaySubscriptionId: 'sub_abc',
      gatewayChargeRef: 'trk_1',
      amountMinorUnits: 150000,
      metadata: { restaurantId: 5, packageId: 2 },
    });
  });

  it('accepts a correctly signed FAILED event and normalizes it to charge_failed', () => {
    const body = JSON.stringify({
      data: { order_id: 'sub_abc', state: 'FAILED', metadata: {} },
    });
    const raw = Buffer.from(body);

    const event = service.verifyAndParseWebhook(raw, sign(body));

    expect(event.type).toBe('charge_failed');
  });

  it('treats an unrecognized event as a genuine no-op, not a failure', () => {
    const body = JSON.stringify({
      data: { order_id: 'sub_abc', state: 'SOMETHING_ELSE' },
    });
    const raw = Buffer.from(body);

    const event = service.verifyAndParseWebhook(raw, sign(body));

    expect(event.type).toBe('ignored');
  });

  it('drops metadata that does not carry integer restaurantId/packageId', () => {
    const body = JSON.stringify({
      data: {
        order_id: 'sub_abc',
        state: 'PAID',
        metadata: { restaurantId: 'nope' },
      },
    });
    const raw = Buffer.from(body);

    const event = service.verifyAndParseWebhook(raw, sign(body));

    expect(event.metadata).toBeUndefined();
  });
});
