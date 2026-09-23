import { UnauthorizedException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { StripeGatewayService } from './gateways/stripe-gateway.service';
import { PaymentsService } from './payments.service';
import { StripeWebhookController } from './stripe-webhook.controller';

describe('StripeWebhookController', () => {
  let controller: StripeWebhookController;
  let stripe: { verifyAndParseWebhook: jest.Mock };
  let payments: { handleWebhookEvent: jest.Mock };

  beforeEach(async () => {
    stripe = { verifyAndParseWebhook: jest.fn() };
    payments = { handleWebhookEvent: jest.fn() };

    const moduleRef = await Test.createTestingModule({
      controllers: [StripeWebhookController],
      providers: [
        { provide: StripeGatewayService, useValue: stripe },
        { provide: PaymentsService, useValue: payments },
      ],
    }).compile();

    controller = moduleRef.get(StripeWebhookController);
  });

  function req(rawBody?: Buffer) {
    return { rawBody, headers: { 'stripe-signature': 't=1,v1=abc' } } as never;
  }

  it('rejects when no raw body was captured, without touching the event handler', async () => {
    await expect(
      controller.handleWebhook(req(undefined)),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(payments.handleWebhookEvent).not.toHaveBeenCalled();
  });

  it('rejects when signature verification throws', async () => {
    stripe.verifyAndParseWebhook.mockImplementation(() => {
      throw new Error('No signatures found matching the expected signature');
    });

    await expect(
      controller.handleWebhook(req(Buffer.from('{}'))),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(payments.handleWebhookEvent).not.toHaveBeenCalled();
  });

  it('forwards a verified event to PaymentsService', async () => {
    const event = { type: 'subscription_active', gateway: 'stripe', raw: {} };
    stripe.verifyAndParseWebhook.mockReturnValueOnce(event);

    const result = await controller.handleWebhook(req(Buffer.from('{}')));

    expect(payments.handleWebhookEvent).toHaveBeenCalledWith(event);
    expect(result).toEqual({ received: true });
  });
});
