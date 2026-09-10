import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import * as argon2 from 'argon2';
import { RootAdminRole } from '@ar-menu/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { RootAuditService } from '../audit/root-audit.service';
import { RootAuthService } from './root-auth.service';
import { TotpService } from './totp.service';

type MockPrisma = {
  rootAdminUser: {
    findUnique: jest.Mock;
    update: jest.Mock;
  };
  rootRefreshToken: {
    create: jest.Mock;
    findFirst: jest.Mock;
    update: jest.Mock;
    updateMany: jest.Mock;
  };
};

function buildPrismaMock(): MockPrisma {
  return {
    rootAdminUser: { findUnique: jest.fn(), update: jest.fn() },
    rootRefreshToken: {
      create: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
  };
}

describe('RootAuthService', () => {
  let service: RootAuthService;
  let prisma: MockPrisma;
  let jwt: { signAsync: jest.Mock; verifyAsync: jest.Mock };
  let totp: {
    generateSecret: jest.Mock;
    keyUri: jest.Mock;
    verifyCode: jest.Mock;
    encryptSecret: jest.Mock;
    decryptSecret: jest.Mock;
    generateBackupCodes: jest.Mock;
    verifyBackupCode: jest.Mock;
  };
  let audit: { log: jest.Mock };

  let realPasswordHash: string;

  const email = 'root@example.com';

  const baseAdmin = {
    id: 1,
    email,
    role: 'superadmin' as const,
    totpSecretEncrypted: null as string | null,
    totpEnabled: false,
    backupCodesHashed: null as string | null,
    failedLoginAttempts: 0,
    lockedUntil: null as Date | null,
  };

  beforeAll(async () => {
    realPasswordHash = await argon2.hash('CorrectHorse123', {
      type: argon2.argon2id,
    });
  });

  beforeEach(async () => {
    prisma = buildPrismaMock();
    jwt = {
      signAsync: jest.fn().mockResolvedValue('signed.jwt.token'),
      verifyAsync: jest.fn(),
    };
    totp = {
      generateSecret: jest.fn().mockReturnValue('GENERATEDSECRET'),
      keyUri: jest.fn().mockReturnValue('otpauth://totp/fake'),
      verifyCode: jest.fn().mockReturnValue(false),
      encryptSecret: jest.fn().mockReturnValue('encrypted-secret'),
      decryptSecret: jest.fn().mockReturnValue('decrypted-secret'),
      generateBackupCodes: jest.fn().mockResolvedValue({
        raw: ['code1', 'code2'],
        hashedJson: '["hashed1","hashed2"]',
      }),
      verifyBackupCode: jest
        .fn()
        .mockResolvedValue({ valid: false, remainingJson: null }),
    };
    audit = { log: jest.fn() };

    const moduleRef = await Test.createTestingModule({
      providers: [
        RootAuthService,
        { provide: PrismaService, useValue: prisma },
        { provide: JwtService, useValue: jwt },
        { provide: TotpService, useValue: totp },
        { provide: RootAuditService, useValue: audit },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => {
              const values: Record<string, string> = {
                ROOT_JWT_ACCESS_SECRET: 'a'.repeat(32),
                ROOT_JWT_ACCESS_EXPIRES_IN: '10m',
                ROOT_JWT_REFRESH_SECRET: 'b'.repeat(32),
                ROOT_JWT_REFRESH_EXPIRES_IN: '12h',
              };
              return values[key];
            }),
          },
        },
      ],
    }).compile();

    service = moduleRef.get(RootAuthService);
  });

  describe('login', () => {
    it('rejects an unknown email without revealing that it is unknown', async () => {
      prisma.rootAdminUser.findUnique.mockResolvedValueOnce(null);

      await expect(
        service.login(
          { email: 'nobody@example.com', password: 'x' },
          '1.2.3.4',
        ),
      ).rejects.toBeInstanceOf(UnauthorizedException);
      expect(totp.generateSecret).not.toHaveBeenCalled();
    });

    it('rejects a locked account even with the correct password', async () => {
      prisma.rootAdminUser.findUnique.mockResolvedValueOnce({
        ...baseAdmin,
        passwordHash: realPasswordHash,
        lockedUntil: new Date(Date.now() + 60_000),
      });

      await expect(
        service.login({ email, password: 'CorrectHorse123' }, '1.2.3.4'),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('registers a failed attempt and audit-logs it on a wrong password', async () => {
      prisma.rootAdminUser.findUnique.mockResolvedValueOnce({
        ...baseAdmin,
        passwordHash: realPasswordHash,
      });

      await expect(
        service.login({ email, password: 'wrong-password' }, '1.2.3.4'),
      ).rejects.toBeInstanceOf(UnauthorizedException);

      expect(prisma.rootAdminUser.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: baseAdmin.id },
          data: expect.objectContaining({ failedLoginAttempts: 1 }),
        }),
      );
      expect(audit.log).toHaveBeenCalledWith(
        baseAdmin.id,
        'root_login_failed',
        undefined,
        undefined,
        undefined,
        '1.2.3.4',
      );
    });

    it('requires TOTP setup on first-ever login and persists a pending secret', async () => {
      prisma.rootAdminUser.findUnique.mockResolvedValueOnce({
        ...baseAdmin,
        passwordHash: realPasswordHash,
        totpEnabled: false,
      });

      const result = await service.login(
        { email, password: 'CorrectHorse123' },
        '1.2.3.4',
      );

      expect(result.status).toBe('totp_setup_required');
      expect(result).toHaveProperty('otpauthUrl');
      expect(prisma.rootAdminUser.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: baseAdmin.id },
          data: { totpSecretEncrypted: 'encrypted-secret' },
        }),
      );
    });

    it('reuses a still-pending TOTP secret on a repeat login instead of minting a new one', async () => {
      // Regression test: an admin who scans the QR and then reloads the
      // setup page (or just logs in again before finishing enrollment)
      // must keep getting the *same* secret — otherwise the code from the
      // entry they already scanned into their authenticator app can never
      // match what's in the DB.
      prisma.rootAdminUser.findUnique.mockResolvedValueOnce({
        ...baseAdmin,
        passwordHash: realPasswordHash,
        totpEnabled: false,
        totpSecretEncrypted: 'encrypted-pending',
      });

      const result = await service.login(
        { email, password: 'CorrectHorse123' },
        '1.2.3.4',
      );

      expect(result.status).toBe('totp_setup_required');
      expect(totp.decryptSecret).toHaveBeenCalledWith('encrypted-pending');
      expect(totp.generateSecret).not.toHaveBeenCalled();
      expect(prisma.rootAdminUser.update).not.toHaveBeenCalledWith(
        expect.objectContaining({
          data: { totpSecretEncrypted: expect.any(String) },
        }),
      );
    });

    it('requires a TOTP challenge on every login after enrollment', async () => {
      prisma.rootAdminUser.findUnique.mockResolvedValueOnce({
        ...baseAdmin,
        passwordHash: realPasswordHash,
        totpEnabled: true,
        totpSecretEncrypted: 'already-set',
      });

      const result = await service.login(
        { email, password: 'CorrectHorse123' },
        '1.2.3.4',
      );

      expect(result.status).toBe('totp_required');
      expect(result).not.toHaveProperty('otpauthUrl');
      expect(prisma.rootAdminUser.update).not.toHaveBeenCalledWith(
        expect.objectContaining({
          data: { totpSecretEncrypted: expect.any(String) },
        }),
      );
    });
  });

  describe('verifyTotpSetup', () => {
    it('activates TOTP, issues backup codes, and returns a session on a valid code', async () => {
      jwt.verifyAsync.mockResolvedValueOnce({ sub: 1, purpose: 'totp_setup' });
      prisma.rootAdminUser.findUnique.mockResolvedValueOnce({
        ...baseAdmin,
        totpSecretEncrypted: 'encrypted-pending',
      });
      totp.verifyCode.mockReturnValueOnce(true);

      const result = await service.verifyTotpSetup(
        { token: 'challenge-token', code: '123456' },
        '1.2.3.4',
      );

      expect(result.backupCodes).toEqual(['code1', 'code2']);
      expect(result.accessToken).toBe('signed.jwt.token');
      expect(prisma.rootAdminUser.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: {
            totpEnabled: true,
            backupCodesHashed: '["hashed1","hashed2"]',
          },
        }),
      );
      expect(audit.log).toHaveBeenCalledWith(
        1,
        'root_totp_enabled',
        undefined,
        undefined,
        undefined,
        '1.2.3.4',
      );
    });

    it('rejects a challenge token issued for the wrong purpose', async () => {
      jwt.verifyAsync.mockResolvedValueOnce({ sub: 1, purpose: 'totp_login' });

      await expect(
        service.verifyTotpSetup(
          { token: 'wrong-purpose', code: '123456' },
          undefined,
        ),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('rejects an invalid code without activating TOTP', async () => {
      jwt.verifyAsync.mockResolvedValueOnce({ sub: 1, purpose: 'totp_setup' });
      prisma.rootAdminUser.findUnique.mockResolvedValueOnce({
        ...baseAdmin,
        totpSecretEncrypted: 'encrypted-pending',
      });
      totp.verifyCode.mockReturnValueOnce(false);

      await expect(
        service.verifyTotpSetup(
          { token: 'challenge-token', code: '000000' },
          undefined,
        ),
      ).rejects.toBeInstanceOf(UnauthorizedException);
      expect(prisma.rootAdminUser.update).not.toHaveBeenCalled();
    });
  });

  describe('verifyTotp', () => {
    it('issues a session on a valid TOTP code', async () => {
      jwt.verifyAsync.mockResolvedValueOnce({ sub: 1, purpose: 'totp_login' });
      prisma.rootAdminUser.findUnique.mockResolvedValueOnce({
        ...baseAdmin,
        totpEnabled: true,
        totpSecretEncrypted: 'encrypted-secret',
      });
      totp.verifyCode.mockReturnValueOnce(true);

      const result = await service.verifyTotp(
        { token: 'challenge-token', code: '123456' },
        '1.2.3.4',
      );

      expect(result.accessToken).toBe('signed.jwt.token');
      expect(audit.log).toHaveBeenCalledWith(
        1,
        'root_login',
        undefined,
        undefined,
        undefined,
        '1.2.3.4',
      );
    });

    it('falls back to a backup code and consumes it', async () => {
      jwt.verifyAsync.mockResolvedValueOnce({ sub: 1, purpose: 'totp_login' });
      prisma.rootAdminUser.findUnique.mockResolvedValueOnce({
        ...baseAdmin,
        totpEnabled: true,
        totpSecretEncrypted: 'encrypted-secret',
        backupCodesHashed: '["hashed1","hashed2"]',
      });
      totp.verifyCode.mockReturnValueOnce(false);
      totp.verifyBackupCode.mockResolvedValueOnce({
        valid: true,
        remainingJson: '["hashed2"]',
      });

      const result = await service.verifyTotp(
        { token: 'challenge-token', code: 'a1b2c3d4e5' },
        '1.2.3.4',
      );

      expect(result.accessToken).toBe('signed.jwt.token');
      expect(prisma.rootAdminUser.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { backupCodesHashed: '["hashed2"]' },
        }),
      );
      expect(audit.log).toHaveBeenCalledWith(
        1,
        'root_backup_code_used',
        undefined,
        undefined,
        undefined,
        '1.2.3.4',
      );
    });

    it('rejects an invalid code and registers a failed attempt', async () => {
      jwt.verifyAsync.mockResolvedValueOnce({ sub: 1, purpose: 'totp_login' });
      prisma.rootAdminUser.findUnique.mockResolvedValueOnce({
        ...baseAdmin,
        totpEnabled: true,
        totpSecretEncrypted: 'encrypted-secret',
      });
      totp.verifyCode.mockReturnValueOnce(false);
      totp.verifyBackupCode.mockResolvedValueOnce({
        valid: false,
        remainingJson: null,
      });

      await expect(
        service.verifyTotp(
          { token: 'challenge-token', code: '000000' },
          '1.2.3.4',
        ),
      ).rejects.toBeInstanceOf(UnauthorizedException);
      expect(prisma.rootAdminUser.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ failedLoginAttempts: 1 }),
        }),
      );
    });
  });

  describe('refresh', () => {
    it('rotates the presented token and issues a new session', async () => {
      jwt.verifyAsync.mockResolvedValueOnce({ sub: 1 });
      prisma.rootRefreshToken.findFirst.mockResolvedValueOnce({
        id: 5,
        expiresAt: new Date(Date.now() + 60_000),
      });
      prisma.rootAdminUser.findUnique.mockResolvedValueOnce({
        ...baseAdmin,
        role: RootAdminRole.SUPERADMIN,
      });

      const result = await service.refresh('raw-refresh-token');

      expect(prisma.rootRefreshToken.update).toHaveBeenCalledWith({
        where: { id: 5 },
        data: { revoked: true },
      });
      expect(result.accessToken).toBe('signed.jwt.token');
    });

    it('rejects an expired stored token', async () => {
      jwt.verifyAsync.mockResolvedValueOnce({ sub: 1 });
      prisma.rootRefreshToken.findFirst.mockResolvedValueOnce({
        id: 5,
        expiresAt: new Date(Date.now() - 60_000),
      });

      await expect(service.refresh('raw-refresh-token')).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });
  });

  describe('logout', () => {
    it('revokes the matching refresh token', async () => {
      await service.logout('raw-refresh-token');
      expect(prisma.rootRefreshToken.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({ data: { revoked: true } }),
      );
    });

    it('is a no-op with no token', async () => {
      await service.logout(undefined);
      expect(prisma.rootRefreshToken.updateMany).not.toHaveBeenCalled();
    });
  });
});
