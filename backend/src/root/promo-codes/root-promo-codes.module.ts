import { Module } from '@nestjs/common';
import { RootAuditModule } from '../audit/root-audit.module';
import { RootPromoCodesController } from './root-promo-codes.controller';
import { RootPromoCodesService } from './root-promo-codes.service';

@Module({
  imports: [RootAuditModule],
  controllers: [RootPromoCodesController],
  providers: [RootPromoCodesService],
})
export class RootPromoCodesModule {}
