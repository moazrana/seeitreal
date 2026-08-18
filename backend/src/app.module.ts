import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AdminModule } from './admin/admin.module';
import { AppController } from './app.controller';
import { ArViewerModule } from './ar-viewer/ar-viewer.module';
import { AuthModule } from './auth/auth.module';
import { validateEnv } from './config/env.validation';
import { MenuModule } from './menu/menu.module';
import { PrismaModule } from './prisma/prisma.module';
import { RestaurantsModule } from './restaurants/restaurants.module';
import { StorageModule } from './storage/storage.module';
import { TripoModule } from './tripo/tripo.module';
import { UploadsModule } from './uploads/uploads.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: validateEnv,
    }),
    // Global rate limiting (spec §7.4); individual endpoints override with
    // stricter limits via @Throttle (see AuthController).
    ThrottlerModule.forRoot([
      {
        name: 'default',
        ttl: 60_000,
        limit: 100,
      },
    ]),
    // Powers the Tripo poll-fallback cron job (spec §11.1) — webhooks are
    // preferred, this catches any that are missed.
    ScheduleModule.forRoot(),
    PrismaModule,
    StorageModule,
    UploadsModule,
    AuthModule,
    RestaurantsModule,
    MenuModule,
    TripoModule,
    AdminModule,
    ArViewerModule,
  ],
  controllers: [AppController],
  providers: [
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}
