import { Module } from '@nestjs/common';
import { RootAuditModule } from '../audit/root-audit.module';
import { RootPackagesController } from './root-packages.controller';
import { RootPackagesService } from './root-packages.service';

@Module({
  imports: [RootAuditModule],
  controllers: [RootPackagesController],
  providers: [RootPackagesService],
})
export class RootPackagesModule {}
