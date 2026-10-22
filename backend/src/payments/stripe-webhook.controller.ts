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
import { StripeGatewayService } from './gateways/stripe-gateway.service';
import type { NormalizedWebhookEvent } from './payment-gateway.interface';
import { PaymentsService } from './payments.service';

// Generous — Stripe retries failed webhook deliveries and this must never
// be the reason a legitimate retry gets dropped, but still bounded (spec §7.4).
const WEBHOOK_THROTTLE = { default: { limit: 120, ttl: 60_000 } };

/**
 * Receives Stripe's subscription/invoice events (documents/
 * USER-APP-subscription-and-ui.md §3, §7: "webhook signature verification
 * for both Safepay and Stripe; reject unsigned/invalid"). Public,
 * unauthenticated by design — same documented-intentional pattern as
 * ArViewerController and TripoWebhookController; the signature check IS
 * the authentication.
 */
@Controller('webhooks/stripe')
export class StripeWebhookController {
  private readonly logger = new Logger(StripeWebhookController.name);

  constructor(
    private readonly stripe: StripeGatewayService,
    private readonly payments: PaymentsService,
  ) {}

  @Throttle(WEBHOOK_THROTTLE)
  @HttpCode(HttpStatus.OK)
  @Post()
  async handleWebhook(@Req() req: RawBodyRequest<Request>) {
    if (!req.rawBody) {
      // Should be impossible once main.ts's rawBody option is on — fail
      // loudly rather than silently skip signature verification.
      this.logger.error('Stripe webhook received with no raw body captured');
      throw new UnauthorizedException();
    }
    let event: NormalizedWebhookEvent;
    try {
      event = this.stripe.verifyAndParseWebhook(
        req.rawBody,
        req.headers['stripe-signature'] as string | undefined,
      );
    } catch (err) {
      this.logger.warn(
        `Rejected Stripe webhook: ${err instanceof Error ? err.message : 'invalid signature'}`,
      );
      throw new UnauthorizedException();
    }
    await this.payments.handleWebhookEvent(event);
    return { received: true };
  }
}
