import { ConfigService } from '@nestjs/config';
import { MailService } from './mail.service';

describe('MailService', () => {
  const message = {
    to: 'owner@example.com',
    subject: 'Hi',
    text: 'Body',
    replyTo: 'a@example.com',
  };
  let fetchMock: jest.Mock;

  function build(env: Record<string, string | undefined>) {
    return new MailService({
      get: (key: string) => env[key],
    } as unknown as ConfigService);
  }

  beforeEach(() => {
    fetchMock = jest.fn();
    global.fetch = fetchMock;
  });

  it('reports not_configured (and makes no request) without an API key and sender', async () => {
    await expect(build({}).send(message)).resolves.toBe('not_configured');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('sends plain text through Resend with the key as a bearer token', async () => {
    fetchMock.mockResolvedValueOnce({ ok: true, status: 200 });

    const result = await build({
      RESEND_API_KEY: 're_test',
      MAIL_FROM: 'SeeItReal <hi@example.com>',
    }).send(message);

    expect(result).toBe('sent');
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.resend.com/emails');
    expect((init.headers as Record<string, string>).Authorization).toBe(
      'Bearer re_test',
    );
    expect(JSON.parse(init.body as string)).toEqual({
      from: 'SeeItReal <hi@example.com>',
      to: ['owner@example.com'],
      subject: 'Hi',
      text: 'Body',
      reply_to: 'a@example.com',
    });
  });

  it('returns failed (never throws) on a provider error or network failure', async () => {
    const mail = build({
      RESEND_API_KEY: 're_test',
      MAIL_FROM: 'x@example.com',
    });
    fetchMock.mockResolvedValueOnce({ ok: false, status: 422 });
    await expect(mail.send(message)).resolves.toBe('failed');
    fetchMock.mockRejectedValueOnce(new Error('ECONNRESET'));
    await expect(mail.send(message)).resolves.toBe('failed');
  });
});
