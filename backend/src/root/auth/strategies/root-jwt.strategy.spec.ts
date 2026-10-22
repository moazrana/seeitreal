import { UnauthorizedException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { PrismaService } from '../../../prisma/prisma.service';
import type { RootJwtPayload } from '../../types/root-jwt-payload.interface';
import { RootJwtStrategy } from './root-jwt.strategy';

describe('RootJwtStrategy', () => {
  const admin = { id: 1, email: 'root@example.com', role: 'superadmin' };
  let findUnique: jest.Mock;
  let strategy: RootJwtStrategy;

  beforeEach(() => {
    findUnique = jest.fn().mockResolvedValue(admin);
    strategy = new RootJwtStrategy(
      { get: () => 'a'.repeat(32) } as unknown as ConfigService,
      { rootAdminUser: { findUnique } } as unknown as PrismaService,
    );
  });

  it('accepts a full-session access token', async () => {
    await expect(
      strategy.validate({
        sub: 1,
        email: admin.email,
        role: 'superadmin',
        typ: 'access',
      } as RootJwtPayload),
    ).resolves.toEqual({ adminId: 1, email: admin.email, role: 'superadmin' });
  });

  it.each([
    [
      'a 2FA challenge token',
      { sub: 1, purpose: 'totp_login', typ: 'totp_challenge' },
    ],
    [
      'a token with no type (pre-fix challenge)',
      { sub: 1, purpose: 'totp_login' },
    ],
    ['a refresh token', { sub: 1, typ: 'refresh' }],
  ])('rejects %s', async (_label, payload) => {
    await expect(
      strategy.validate(payload as unknown as RootJwtPayload),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(findUnique).not.toHaveBeenCalled();
  });
});
