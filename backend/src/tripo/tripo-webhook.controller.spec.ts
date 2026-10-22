import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { TripoClientService } from './tripo-client.service';
import { TripoWebhookController } from './tripo-webhook.controller';

// TripoGenerationService (imported below via require, not a static import)
// pulls in ModelScalingService, which statically imports
// @gltf-transform/core — a CJS build that requires the ESM-only
// `property-graph` package. Real Node 22 resolves that fine, but Jest's
// own module loader doesn't, so it can't be loaded for real here (see the
// same note in tripo-generation.service.spec.ts). We only need
// TripoGenerationService as a DI token in this file (it's always provided
// via `useValue`), so mocking it away is harmless.
//
// Deliberately `require`d (not statically `import`ed) — TS/ts-jest always
// hoists `import` statements above other statements when compiling to
// CommonJS, which would load the real module before jest.mock() below had
// a chance to register the mock.
jest.mock('./model-scaling.service', () => ({
  ModelScalingService: jest.fn(),
}));
// eslint-disable-next-line @typescript-eslint/no-require-imports
const tripoGenerationModule = require('./tripo-generation.service');
const { TripoGenerationService } =
  tripoGenerationModule as typeof import('./tripo-generation.service');

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
