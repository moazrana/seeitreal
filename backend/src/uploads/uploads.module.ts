import { Global, Module } from '@nestjs/common';
import { GlbUploadService } from './glb-upload.service';
import { ImageUploadService } from './image-upload.service';

@Global()
@Module({
  providers: [ImageUploadService, GlbUploadService],
  exports: [ImageUploadService, GlbUploadService],
})
export class UploadsModule {}
