import { UnauthorizedException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { SafepayGatewayService } from './gateways/safepay-gateway.service';
import { PaymentsService } from './payments.service';
import { SafepayWebhookController } from './safepay-webhook.controller';

describe('SafepayWebhookController', () => {
  let controller: SafepayWebhookController;
  let safepay: { verifyAndParseWebhook: jest.Mock };
  let payments: { handleWebhookEvent: jest.Mock };

  beforeEach(async () => {
    safepay = { verifyAndParseWebhook: jest.fn() };
    payments = { handleWebhookEvent: jest.fn() };

    const moduleRef = await Test.createTestingModule({
      controllers: [SafepayWebhookController],
      providers: [
        { provide: SafepayGatewayService, useValue: safepay },
        { provide: PaymentsService, useValue: payments },
      ],
    }).compile();

    controller = moduleRef.get(SafepayWebhookController);
  });

  function req(rawBody?: Buffer) {
    return { rawBody, headers: { 'x-sfpy-signature': 'abc' } } as never;
  }

  it('rejects when no raw body was captured', async () => {
    await expect(
      controller.handleWebhook(req(undefined)),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(payments.handleWebhookEvent).not.toHaveBeenCalled();
  });

  it('propagates an UnauthorizedException from signature verification as-is', async () => {
    safepay.verifyAndParseWebhook.mockImplementation(() => {
      throw new UnauthorizedException();
    });

    await expect(
      controller.handleWebhook(req(Buffer.from('{}'))),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('wraps a malformed-payload error as UnauthorizedException too', async () => {
    safepay.verifyAndParseWebhook.mockImplementation(() => {
      throw new SyntaxError('Unexpected token');
    });

    await expect(
      controller.handleWebhook(req(Buffer.from('not json'))),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('forwards a verified event to PaymentsService', async () => {
    const event = { type: 'charge_paid', gateway: 'safepay', raw: {} };
    safepay.verifyAndParseWebhook.mockReturnValueOnce(event);

    const result = await controller.handleWebhook(req(Buffer.from('{}')));

    expect(payments.handleWebhookEvent).toHaveBeenCalledWith(event);
    expect(result).toEqual({ received: true });
  });
});
