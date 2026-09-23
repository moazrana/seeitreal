import { Module } from '@nestjs/common';
import { RestaurantsModule } from '../restaurants/restaurants.module';
import { SafepayGatewayService } from './gateways/safepay-gateway.service';
import { StripeGatewayService } from './gateways/stripe-gateway.service';
import { PaymentsController } from './payments.controller';
import { PaymentsNotificationService } from './payments-notification.service';
import { PaymentsService } from './payments.service';
import { SafepayWebhookController } from './safepay-webhook.controller';
import { StripeWebhookController } from './stripe-webhook.controller';
import { SubscriptionGraceCron } from './subscription-grace.cron';
import { SubscriptionLifecycleService } from './subscription-lifecycle.service';
import { SubscriptionRenewalCron } from './subscription-renewal.cron';

@Module({
  imports: [RestaurantsModule],
  controllers: [
    PaymentsController,
    StripeWebhookController,
    SafepayWebhookController,
  ],
  providers: [
    PaymentsService,
    SubscriptionLifecycleService,
    PaymentsNotificationService,
    StripeGatewayService,
    SafepayGatewayService,
    SubscriptionGraceCron,
    SubscriptionRenewalCron,
  ],
  // SubscriptionLifecycleService is what ArViewerModule needs to gate the
  // public viewer — nothing else about payments internals is exposed.
  exports: [SubscriptionLifecycleService],
})
export class PaymentsModule {}
