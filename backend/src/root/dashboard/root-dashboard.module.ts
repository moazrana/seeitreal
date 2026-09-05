import { Module } from '@nestjs/common';
import { RootDashboardController } from './root-dashboard.controller';
import { RootDashboardService } from './root-dashboard.service';

@Module({
  controllers: [RootDashboardController],
  providers: [RootDashboardService],
})
export class RootDashboardModule {}
