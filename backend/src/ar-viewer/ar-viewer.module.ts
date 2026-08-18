import { Module } from '@nestjs/common';
import { ArViewerController } from './ar-viewer.controller';
import { ArViewerService } from './ar-viewer.service';

@Module({
  controllers: [ArViewerController],
  providers: [ArViewerService],
})
export class ArViewerModule {}
