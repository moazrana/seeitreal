import { Module } from '@nestjs/common';
import { RootAuditService } from './root-audit.service';

@Module({
  providers: [RootAuditService],
  exports: [RootAuditService],
})
export class RootAuditModule {}
