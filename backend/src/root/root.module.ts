import { Module } from '@nestjs/common';
import { RootAuditModule } from './audit/root-audit.module';
import { RootAuthModule } from './auth/root-auth.module';
import { RootDashboardModule } from './dashboard/root-dashboard.module';
import { RootQaModule } from './qa/root-qa.module';
import { RootRestaurantsModule } from './restaurants/root-restaurants.module';

/**
 * The Root App's backend surface (rootApp/ROOT-APP-Implementation-Spec.md)
 * — all routes under /api/root/*. A dedicated module in the same NestJS
 * backend the customer app uses (spec §2: "not a second backend"), with
 * its own auth/session/RBAC/audit machinery, fully independent of the
 * customer-facing AuthModule.
 */
@Module({
  imports: [
    RootAuditModule,
    RootAuthModule,
    RootDashboardModule,
    RootRestaurantsModule,
    RootQaModule,
  ],
})
export class RootModule {}
