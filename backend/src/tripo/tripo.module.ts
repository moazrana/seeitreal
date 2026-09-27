import { Module } from '@nestjs/common';
import { RestaurantsModule } from '../restaurants/restaurants.module';
import { ManualModelUploadService } from './manual-model-upload.service';
import { ModelOptimizationService } from './model-optimization.service';
import { ModelScalingService } from './model-scaling.service';
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
    ModelScalingService,
    ModelOptimizationService,
    ManualModelUploadService,
  ],
  exports: [TripoGenerationService, ManualModelUploadService],
})
export class TripoModule {}
