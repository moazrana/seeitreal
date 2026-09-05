import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { RootAdminRole } from '@ar-menu/shared';
import { PrismaService } from '../../../prisma/prisma.service';
import type { AuthenticatedRootAdmin } from '../../types/authenticated-root-admin.interface';
import type { RootJwtPayload } from '../../types/root-jwt-payload.interface';

/** Registered as 'root-jwt' (not 'jwt') — a distinct Passport strategy name
 * from the customer app's JwtStrategy, so both can coexist in one process
 * without one overwriting the other. */
@Injectable()
export class RootJwtStrategy extends PassportStrategy(Strategy, 'root-jwt') {
  constructor(
    config: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.get<string>('ROOT_JWT_ACCESS_SECRET')!,
    });
  }

  async validate(payload: RootJwtPayload): Promise<AuthenticatedRootAdmin> {
    // Re-check the admin still exists on every request — a short-lived
    // access token for a since-removed admin should stop working
    // immediately rather than waiting out its own expiry.
    const admin = await this.prisma.rootAdminUser.findUnique({
      where: { id: payload.sub },
    });
    if (!admin) {
      throw new UnauthorizedException();
    }
    return {
      adminId: admin.id,
      email: admin.email,
      role: admin.role as RootAdminRole,
    };
  }
}
