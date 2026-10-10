import type { ConfigService } from '@nestjs/config';
import {
  TripoClientService,
  TripoRequestRejectedError,
} from './tripo-client.service';

describe('TripoClientService guidance parameters', () => {
  let fetchMock: jest.Mock;
  let client: TripoClientService;

  const json = (body: unknown, status = 200) =>
    ({
      ok: status < 400,
      status,
      json: () => Promise.resolve(body),
      text: () => Promise.resolve(JSON.stringify(body)),
    }) as unknown as Response;
  const sentBody = (call: number): Record<string, unknown> =>
    JSON.parse(
      (fetchMock.mock.calls[call][1] as RequestInit).body as string,
    ) as Record<string, unknown>;

  beforeEach(() => {
    fetchMock = jest.fn();
    global.fetch = fetchMock;
    client = new TripoClientService({
      get: (key: string) => (key === 'TRIPO_API_KEY' ? 'test-key' : undefined),
    } as unknown as ConfigService);
  });

  it('sends seeds and texture alignment when given', async () => {
    fetchMock.mockResolvedValueOnce(json({ data: { task_id: 't1' } }));

    await client.submitImageToModel('https://cdn.example/p.jpg', {
      modelSeed: 11,
      textureSeed: 22,
      textureAlignment: 'original_image',
    });

    expect(sentBody(0)).toMatchObject({
      model_seed: 11,
      texture_seed: 22,
      texture_alignment: 'original_image',
    });
  });

  it('retries once without guidance if Tripo rejects those parameters', async () => {
    fetchMock
      .mockResolvedValueOnce(json({ message: 'unknown field' }, 400))
      .mockResolvedValueOnce(json({ data: { task_id: 't2' } }));

    await expect(
      client.submitMultiviewToModel(
        ['https://cdn.example/a.jpg', 'https://cdn.example/b.jpg'],
        { modelSeed: 11, textureAlignment: 'original_image', faceLimit: 5 },
      ),
    ).resolves.toEqual({ taskId: 't2' });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(sentBody(1)).not.toHaveProperty('model_seed');
    expect(sentBody(1)).not.toHaveProperty('texture_alignment');
    expect(sentBody(1)).toMatchObject({ face_limit: 5 });
  });

  it('does not retry a 400 when no guidance was sent', async () => {
    fetchMock.mockResolvedValueOnce(json({ message: 'bad' }, 400));

    await expect(
      client.submitImageToModel('https://cdn.example/p.jpg', {}),
    ).rejects.toThrow('could not be started');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('always sends exactly 4 multiview slots, leaving missing views empty', async () => {
    fetchMock.mockResolvedValueOnce(json({ data: { task_id: 't3' } }));

    await client.submitMultiviewToModel(
      [
        'https://cdn.example/a.jpg',
        'https://cdn.example/b.jpg',
        'https://cdn.example/c.jpg',
      ],
      {},
    );

    expect(sentBody(0).files).toEqual([
      { type: 'jpg', url: 'https://cdn.example/a.jpg' },
      { type: 'jpg', url: 'https://cdn.example/b.jpg' },
      { type: 'jpg', url: 'https://cdn.example/c.jpg' },
      {},
    ]);
  });

  it('reports a 4xx refusal as TripoRequestRejectedError', async () => {
    fetchMock.mockResolvedValueOnce(json({ message: 'bad' }, 400));

    await expect(
      client.submitImageToModel('https://cdn.example/p.jpg', {}),
    ).rejects.toBeInstanceOf(TripoRequestRejectedError);
  });
});
