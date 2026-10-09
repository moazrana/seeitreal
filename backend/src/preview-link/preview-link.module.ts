import { Module } from '@nestjs/common';
import { PreviewLinkService } from './preview-link.service';

@Module({
  providers: [PreviewLinkService],
  exports: [PreviewLinkService],
})
export class PreviewLinkModule {}
