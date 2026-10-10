import { fetchWithRetry } from './fetch-retry';

function networkError(code?: string): TypeError {
  return Object.assign(new TypeError('fetch failed'), {
    cause: code ? { code } : undefined,
  });
}

describe('fetchWithRetry', () => {
  const ok = { ok: true, status: 200 } as Response;
  const noSleep = () => Promise.resolve();
  let fetchMock: jest.Mock;

  beforeEach(() => {
    fetchMock = jest.fn();
    global.fetch = fetchMock;
  });

  it('retries any network failure for idempotent requests', async () => {
    fetchMock
      .mockRejectedValueOnce(networkError('ECONNRESET'))
      .mockResolvedValueOnce(ok);

    await expect(
      fetchWithRetry('https://x', {}, { idempotent: true }, noSleep),
    ).resolves.toBe(ok);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('gives up after three attempts', async () => {
    fetchMock.mockRejectedValue(networkError('UND_ERR_CONNECT_TIMEOUT'));

    await expect(
      fetchWithRetry('https://x', {}, { idempotent: true }, noSleep),
    ).rejects.toThrow('fetch failed');
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('retries a paid submit only when the request never left this machine', async () => {
    fetchMock
      .mockRejectedValueOnce(networkError('UND_ERR_CONNECT_TIMEOUT'))
      .mockResolvedValueOnce(ok);
    await expect(
      fetchWithRetry('https://x', {}, { idempotent: false }, noSleep),
    ).resolves.toBe(ok);

    // A reset mid-request might mean Tripo already created the task.
    fetchMock.mockReset().mockRejectedValueOnce(networkError('ECONNRESET'));
    await expect(
      fetchWithRetry('https://x', {}, { idempotent: false }, noSleep),
    ).rejects.toThrow('fetch failed');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('never retries an HTTP error response', async () => {
    const bad = { ok: false, status: 500 } as Response;
    fetchMock.mockResolvedValueOnce(bad);

    await expect(
      fetchWithRetry('https://x', {}, { idempotent: true }, noSleep),
    ).resolves.toBe(bad);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
