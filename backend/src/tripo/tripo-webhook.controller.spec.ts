import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { TripoClientService } from './tripo-client.service';
import { TripoGenerationService } from './tripo-generation.service';
import { TripoWebhookController } from './tripo-webhook.controller';

describe('TripoWebhookController', () => {
  let controller: TripoWebhookController;
  let generation: { handleTaskResult: jest.Mock };
  let tripoClient: { parseWebhookPayload: jest.Mock };
  const secret = 's'.repeat(32);

  beforeEach(async () => {
    generation = { handleTaskResult: jest.fn() };
    tripoClient = {
      parseWebhookPayload: jest
        .fn()
        .mockReturnValue({ taskId: 't1', status: 'success', progress: 100 }),
    };

    const moduleRef = await Test.createTestingModule({
      controllers: [TripoWebhookController],
      providers: [
        {
          provide: ConfigService,
          useValue: { get: jest.fn().mockReturnValue(secret) },
        },
        { provide: TripoClientService, useValue: tripoClient },
        { provide: TripoGenerationService, useValue: generation },
      ],
    }).compile();

    controller = moduleRef.get(TripoWebhookController);
  });

  it('rejects a call with a wrong token without touching the payload', async () => {
    await expect(
      controller.handleCallback(
        { token: 'wrong-token-value' },
        { some: 'payload' },
      ),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(generation.handleTaskResult).not.toHaveBeenCalled();
  });

  it('rejects a call with no token', async () => {
    await expect(
      controller.handleCallback({ token: '' }, {}),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('accepts a call with the correct token and forwards the parsed result', async () => {
    const body = { data: { task_id: 't1', status: 'success' } };
    await controller.handleCallback({ token: secret }, body);

    expect(tripoClient.parseWebhookPayload).toHaveBeenCalledWith(body);
    expect(generation.handleTaskResult).toHaveBeenCalledWith({
      taskId: 't1',
      status: 'success',
      progress: 100,
    });
  });
});
