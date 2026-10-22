import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import {
  Injectable,
  InternalServerErrorException,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PaymentGateway } from '@prisma/client';
import type {
  ChangePackageContext,
  CheckoutContext,
  CheckoutMetadata,
  CheckoutSessionResult,
  NormalizedWebhookEvent,
  PaymentGatewayAdapter,
} from '../payment-gateway.interface';

const DEFAULT_BASE_URL = 'https://sandbox.api.getsafepay.com';

/**
 * Safepay adapter — PKR/Pakistani clients (documents/
 * USER-APP-subscription-and-ui.md §3). Server-side only, key from `.env`
 * (SAFEPAY_API_KEY), same rule as every other gateway/3rd-party secret
 * (spec §7.1).
 *
 * Safepay has no confirmed native recurring-subscription API for this
 * account (the doc explicitly calls this out — §3: "verify whether Safepay
 * supports recurring billing; if it only does one-off charges cleanly,
 * implement PKR recurring as scheduled invoices + retry"). This adapter
 * therefore only ever creates **one-off order checkouts** — the recurring
 * behaviour lives in SubscriptionRenewalCron, which calls
 * `createCheckoutSession` again each period rather than relying on this
 * gateway to auto-renew anything.
 *
 * Because there's no native subscription object, `changePackage` is a
 * local no-op — a package change just updates our own Subscription row,
 * and the *next* cron-generated checkout naturally bills the new price
 * (matches the doc's "apply new pricing on their next renewal" rule
 * exactly, see design notes in the plan).
 *
 * Like the Tripo client's less-certain endpoints, this HTTP contract
 * (endpoint paths, request/response field names, webhook signature header)
 * follows Safepay's publicly documented Checkout/Order API shape but has
 * **not** been confirmed against a live sandbox call in this pass — no
 * Safepay credentials were available. Verify against Safepay's current API
 * reference and a real sandbox order before production use.
 */
@Injectable()
export class SafepayGatewayService implements PaymentGatewayAdapter {
  readonly gateway = PaymentGateway.safepay;
  private readonly logger = new Logger(SafepayGatewayService.name);

  constructor(private readonly config: ConfigService) {}

  async createCheckoutSession(
    ctx: CheckoutContext,
  ): Promise<CheckoutSessionResult> {
    const baseUrl = this.baseUrl();
    // Self-assigned order reference — encodes the correlation metadata we
    // need back on the webhook, the same role Stripe's subscription_data
    // metadata plays (see StripeGatewayService's doc comment).
    const orderRef = `sub_${randomUUID()}`;
    const res = await fetch(`${baseUrl}/order/v1/init`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey()}`,
      },
      body: JSON.stringify({
        merchant_api_key: this.apiKey(),
        intent: 'CYBERSOURCE',
        mode: 'payment',
        currency: 'PKR',
        amount: ctx.amountMinorUnits,
        order_id: orderRef,
        metadata: this.encodeMetadata(orderRef, ctx.metadata),
        redirect_url: ctx.successUrl,
        cancel_url: ctx.cancelUrl,
      }),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      this.logger.error(`Safepay order init failed (${res.status}): ${detail}`);
      throw new InternalServerErrorException('Could not start checkout');
    }
    const data = (await res.json()) as { data?: { token?: string } };
    const token = data.data?.token;
    if (!token) {
      this.logger.error('Safepay order init returned no checkout token');
      throw new InternalServerErrorException('Could not start checkout');
    }
    const checkoutHost = baseUrl.includes('sandbox')
      ? 'https://sandbox.getsafepay.com'
      : 'https://getsafepay.com';
    return { checkoutUrl: `${checkoutHost}/checkout/pay?beacon=${token}` };
  }

  // No native subscription object to update — see class doc comment.
  changePackage(ctx: ChangePackageContext): Promise<void> {
    this.logger.debug(
      `No-op changePackage for ${ctx.gatewaySubscriptionId} — next renewal checkout will use the new price`,
    );
    return Promise.resolve();
  }

  // No native subscription object to cancel — SubscriptionRenewalCron
  // simply stops generating future checkouts once our own row is canceled.
  cancelSubscription(gatewaySubscriptionId: string): Promise<void> {
    this.logger.debug(`No-op cancelSubscription for ${gatewaySubscriptionId}`);
    return Promise.resolve();
  }

  verifyAndParseWebhook(
    rawBody: Buffer,
    signatureHeader: string | undefined,
  ): NormalizedWebhookEvent {
    this.assertValidSignature(rawBody, signatureHeader);
    const payload = JSON.parse(rawBody.toString('utf8')) as {
      event?: string;
      data?: {
        order_id?: string;
        tracker_id?: string;
        amount?: number;
        state?: string;
        metadata?: Record<string, string>;
      };
    };
    const metadata = this.decodeMetadata(payload.data?.metadata);
    const orderRef = payload.data?.order_id;
    const state = payload.data?.state ?? payload.event;

    if (state === 'PAID' || state === 'TRACKER_ENDED') {
      return {
        type: 'charge_paid',
        gateway: this.gateway,
        metadata,
        gatewaySubscriptionId: orderRef,
        gatewayChargeRef: payload.data?.tracker_id ?? orderRef,
        amountMinorUnits: payload.data?.amount,
        raw: payload,
      };
    }
    if (state === 'FAILED' || state === 'CANCELLED' || state === 'EXPIRED') {
      return {
        type: 'charge_failed',
        gateway: this.gateway,
        metadata,
        gatewaySubscriptionId: orderRef,
        gatewayChargeRef: payload.data?.tracker_id ?? orderRef,
        amountMinorUnits: payload.data?.amount,
        raw: payload,
      };
    }
    // Unrecognized/irrelevant event — genuine no-op, not a failure.
    return { type: 'ignored', gateway: this.gateway, raw: payload };
  }

  private assertValidSignature(rawBody: Buffer, provided: string | undefined) {
    const expected = createHmac('sha256', this.webhookSecret())
      .update(rawBody)
      .digest('hex');
    const providedBuf = Buffer.from(provided ?? '');
    const expectedBuf = Buffer.from(expected);
    const valid =
      providedBuf.length === expectedBuf.length &&
      timingSafeEqual(providedBuf, expectedBuf);
    if (!valid) {
      this.logger.warn('Rejected Safepay webhook call with invalid signature');
      throw new UnauthorizedException();
    }
  }

  private encodeMetadata(
    orderRef: string,
    metadata: CheckoutMetadata,
  ): Record<string, string> {
    return {
      orderRef,
      restaurantId: String(metadata.restaurantId),
      packageId: String(metadata.packageId),
      ...(metadata.promoCode ? { promoCode: metadata.promoCode } : {}),
    };
  }

  private decodeMetadata(
    metadata: Record<string, string> | undefined,
  ): CheckoutMetadata | undefined {
    const restaurantId = Number(metadata?.restaurantId);
    const packageId = Number(metadata?.packageId);
    if (!Number.isInteger(restaurantId) || !Number.isInteger(packageId)) {
      return undefined;
    }
    return { restaurantId, packageId, promoCode: metadata?.promoCode };
  }

  private baseUrl(): string {
    return this.config.get<string>('SAFEPAY_BASE_URL') ?? DEFAULT_BASE_URL;
  }

  private apiKey(): string {
    const key = this.config.get<string>('SAFEPAY_API_KEY');
    if (!key) {
      throw new InternalServerErrorException(
        'Safepay billing is not configured',
      );
    }
    return key;
  }

  private webhookSecret(): string {
    const secret = this.config.get<string>('SAFEPAY_WEBHOOK_SECRET');
    if (!secret) {
      this.logger.warn(
        'Rejected Safepay webhook — SAFEPAY_WEBHOOK_SECRET unset',
      );
      throw new InternalServerErrorException(
        'Safepay billing is not configured',
      );
    }
    return secret;
  }
}
