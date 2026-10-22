import {
  Controller,
  HttpCode,
  HttpStatus,
  Logger,
  Post,
  Req,
  UnauthorizedException,
  type RawBodyRequest,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import { SafepayGatewayService } from './gateways/safepay-gateway.service';
import type { NormalizedWebhookEvent } from './payment-gateway.interface';
import { PaymentsService } from './payments.service';

const WEBHOOK_THROTTLE = { default: { limit: 120, ttl: 60_000 } };

/**
 * Receives Safepay's order-status events (documents/
 * USER-APP-subscription-and-ui.md §3, §7). Public, unauthenticated by
 * design — the HMAC signature check in SafepayGatewayService IS the
 * authentication, same pattern as StripeWebhookController.
 */
@Controller('webhooks/safepay')
export class SafepayWebhookController {
  private readonly logger = new Logger(SafepayWebhookController.name);

  constructor(
    private readonly safepay: SafepayGatewayService,
    private readonly payments: PaymentsService,
  ) {}

  @Throttle(WEBHOOK_THROTTLE)
  @HttpCode(HttpStatus.OK)
  @Post()
  async handleWebhook(@Req() req: RawBodyRequest<Request>) {
    if (!req.rawBody) {
      this.logger.error('Safepay webhook received with no raw body captured');
      throw new UnauthorizedException();
    }
    let event: NormalizedWebhookEvent;
    try {
      event = this.safepay.verifyAndParseWebhook(
        req.rawBody,
        req.headers['x-sfpy-signature'] as string | undefined,
      );
    } catch (err) {
      if (err instanceof UnauthorizedException) throw err;
      this.logger.warn(
        `Rejected malformed Safepay webhook payload: ${String(err)}`,
      );
      throw new UnauthorizedException();
    }
    await this.payments.handleWebhookEvent(event);
    return { received: true };
  }
}
