import { Module } from '@nestjs/common';
import { PaymentsModule } from '../payments/payments.module';
import { ArViewerController } from './ar-viewer.controller';
import { ArViewerService } from './ar-viewer.service';

@Module({
  imports: [PaymentsModule],
  controllers: [ArViewerController],
  providers: [ArViewerService],
})
export class ArViewerModule {}
