import { Module } from '@nestjs/common';
import { AnalyticsModule } from '../analytics/analytics.module';
import { PaymentsModule } from '../payments/payments.module';
import { PreviewLinkModule } from '../preview-link/preview-link.module';
import { ArViewerController } from './ar-viewer.controller';
import { ArViewerService } from './ar-viewer.service';

@Module({
  imports: [PaymentsModule, AnalyticsModule, PreviewLinkModule],
  controllers: [ArViewerController],
  providers: [ArViewerService],
})
export class ArViewerModule {}
