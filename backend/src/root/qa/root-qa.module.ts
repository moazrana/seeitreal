import { Module } from '@nestjs/common';
import { RootAuditModule } from '../audit/root-audit.module';
import { RootQaController } from './root-qa.controller';
import { RootQaService } from './root-qa.service';

@Module({
  imports: [RootAuditModule],
  controllers: [RootQaController],
  providers: [RootQaService],
})
export class RootQaModule {}
