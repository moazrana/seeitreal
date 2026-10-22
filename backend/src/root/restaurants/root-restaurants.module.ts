import { Module } from '@nestjs/common';
import { RootAuditModule } from '../audit/root-audit.module';
import { RootRestaurantsController } from './root-restaurants.controller';
import { RootRestaurantsService } from './root-restaurants.service';

@Module({
  imports: [RootAuditModule],
  controllers: [RootRestaurantsController],
  providers: [RootRestaurantsService],
})
export class RootRestaurantsModule {}
