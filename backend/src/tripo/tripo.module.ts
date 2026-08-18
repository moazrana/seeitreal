import { Module } from '@nestjs/common';
import { RestaurantsModule } from '../restaurants/restaurants.module';
import { TripoClientService } from './tripo-client.service';
import { TripoGenerationService } from './tripo-generation.service';
import { TripoPollCron } from './tripo-poll.cron';
import { TripoWebhookController } from './tripo-webhook.controller';
import { UsdzConversionService } from './usdz-conversion.service';

@Module({
  imports: [RestaurantsModule],
  controllers: [TripoWebhookController],
  providers: [
    TripoClientService,
    TripoGenerationService,
    TripoPollCron,
    UsdzConversionService,
  ],
  exports: [TripoGenerationService],
})
export class TripoModule {}
