import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

const RESEND_ENDPOINT = 'https://api.resend.com/emails';
const SEND_TIMEOUT_MS = 10_000;

export interface MailMessage {
  to: string;
  subject: string;
  /** Plain text only — no HTML, so user-supplied content can never inject
   * markup or scripts into the recipient's mail client. */
  text: string;
  replyTo?: string;
}

export type MailResult = 'sent' | 'not_configured' | 'failed';

/**
 * Transactional email via Resend's HTTPS API (documents/
 * TASK-home-page-content.md §5). Server-side only: RESEND_API_KEY and
 * MAIL_FROM come from the environment and never reach the frontend. Called
 * with plain fetch rather than an SDK — one endpoint doesn't justify a
 * dependency.
 *
 * Never throws, and never logs recipients, bodies or the API key: callers
 * decide what a failure means, and logs stay free of personal data.
 */
@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);

  constructor(private readonly config: ConfigService) {}

  async send(message: MailMessage): Promise<MailResult> {
    const apiKey = this.config.get<string>('RESEND_API_KEY');
    const from = this.config.get<string>('MAIL_FROM');
    if (!apiKey || !from) {
      this.logger.warn(
        'Email not sent: RESEND_API_KEY / MAIL_FROM are not configured',
      );
      return 'not_configured';
    }

    try {
      const res = await fetch(RESEND_ENDPOINT, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from,
          to: [message.to],
          subject: message.subject,
          text: message.text,
          ...(message.replyTo ? { reply_to: message.replyTo } : {}),
        }),
        signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
      });
      if (!res.ok) {
        // Status only — the provider's error body can echo request fields.
        this.logger.error(
          `Email provider rejected the message (HTTP ${res.status})`,
        );
        return 'failed';
      }
      return 'sent';
    } catch (err) {
      this.logger.error(
        `Email provider request failed: ${err instanceof Error ? err.name : 'unknown error'}`,
      );
      return 'failed';
    }
  }
}
