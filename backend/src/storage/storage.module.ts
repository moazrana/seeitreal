import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { StorageDriver } from '../config/env.validation';
import { LocalDiskStorageProvider } from './providers/local-disk-storage.provider';
import { S3StorageProvider } from './providers/s3-storage.provider';
import { STORAGE_PROVIDER, StorageService } from './storage.service';
import { UploadsController } from './uploads.controller';

@Global()
@Module({
  controllers: [UploadsController],
  providers: [
    LocalDiskStorageProvider,
    S3StorageProvider,
    {
      provide: STORAGE_PROVIDER,
      useFactory: (
        config: ConfigService,
        local: LocalDiskStorageProvider,
        s3: S3StorageProvider,
      ) =>
        config.get<StorageDriver>('STORAGE_DRIVER') === StorageDriver.S3
          ? s3
          : local,
      inject: [ConfigService, LocalDiskStorageProvider, S3StorageProvider],
    },
    StorageService,
  ],
  exports: [StorageService],
})
export class StorageModule {}
