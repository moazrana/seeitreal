import { Controller, Get, UseGuards } from '@nestjs/common';
import { IpAllowlistGuard } from '../common/guards/ip-allowlist.guard';
import { RootJwtAuthGuard } from '../common/guards/root-jwt-auth.guard';
import { RootDashboardService } from './root-dashboard.service';

// Read-only — both superadmin and support may view (spec §3.9).
@UseGuards(IpAllowlistGuard, RootJwtAuthGuard)
@Controller('root/dashboard')
export class RootDashboardController {
  constructor(private readonly dashboard: RootDashboardService) {}

  @Get()
  getMetrics() {
    return this.dashboard.getMetrics();
  }
}
