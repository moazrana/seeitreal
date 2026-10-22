import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { RootAuditModule } from '../audit/root-audit.module';
import { RootAuthController } from './root-auth.controller';
import { RootAuthService } from './root-auth.service';
import { RootJwtStrategy } from './strategies/root-jwt.strategy';
import { TotpService } from './totp.service';

@Module({
  // Secrets are passed explicitly per sign/verify call in RootAuthService
  // (access/refresh/challenge tokens use different secrets/TTLs), so no
  // default is registered here — same pattern as the customer AuthModule.
  imports: [PassportModule, JwtModule.register({}), RootAuditModule],
  controllers: [RootAuthController],
  providers: [RootAuthService, RootJwtStrategy, TotpService],
  exports: [RootAuthService],
})
export class RootAuthModule {}
