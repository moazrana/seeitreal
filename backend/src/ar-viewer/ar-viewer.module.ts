import { Module } from '@nestjs/common';
import { AnalyticsModule } from '../analytics/analytics.module';
import { PaymentsModule } from '../payments/payments.module';
import { ArViewerController } from './ar-viewer.controller';
import { ArViewerService } from './ar-viewer.service';

@Module({
  imports: [PaymentsModule, AnalyticsModule],
  controllers: [ArViewerController],
  providers: [ArViewerService],
})
export class ArViewerModule {}
