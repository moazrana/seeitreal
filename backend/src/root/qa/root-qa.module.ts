import { Module } from '@nestjs/common';
import { PreviewLinkModule } from '../../preview-link/preview-link.module';
import { RootAuditModule } from '../audit/root-audit.module';
import { RootQaController } from './root-qa.controller';
import { RootQaService } from './root-qa.service';

@Module({
  imports: [RootAuditModule, PreviewLinkModule],
  controllers: [RootQaController],
  providers: [RootQaService],
})
export class RootQaModule {}
