import { createHash } from 'node:crypto';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import { RootAdminRole } from '@ar-menu/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { RootAuditService } from '../audit/root-audit.service';
import type { RootTotpChallengePayload } from '../types/root-totp-challenge-payload.interface';
import type { RootJwtPayload } from '../types/root-jwt-payload.interface';
import type { RootLoginDto } from './dto/root-login.dto';
import type { RootTotpVerifyDto } from './dto/root-totp-verify.dto';
import { TotpService } from './totp.service';

const MAX_FAILED_LOGIN_ATTEMPTS = 5;
const LOCKOUT_MINUTES = 15;
// Short-lived and single-purpose, not a session — just long enough to type
// a 6-digit code from an authenticator app.
const CHALLENGE_TTL_MS = 5 * 60_000;
// A pre-computed argon2id hash of a random value, used only to keep
// login's timing profile the same for "unknown email" as for "wrong
// password" — never actually matches a real password. Same technique as
// AuthService, deliberately a different literal (no reason to share one).
const DUMMY_PASSWORD_HASH =
  '$argon2id$v=19$m=65536,t=3,p=4$cm9vdGFwcHNhbHRyb290$9y2Z6n4m0e2s7RG3t1z0qRqG3g1n2p8m7c0y4r8s6u1';

export interface PublicRootAdmin {
  id: number;
  email: string;
  role: RootAdminRole;
}

type ChallengePurpose = RootTotpChallengePayload['purpose'];

@Injectable()
export class RootAuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly totp: TotpService,
    private readonly audit: RootAuditService,
  ) {}

  /** Step 1: password check. Returns either a TOTP-setup challenge (first
   * login ever) or a TOTP-verify challenge (every login after) — never a
   * full session directly, since 2FA is mandatory (spec §5). */
  async login(dto: RootLoginDto, ip: string | undefined) {
    const admin = await this.prisma.rootAdminUser.findUnique({
      where: { email: dto.email },
    });

    if (!admin) {
      await argon2.verify(DUMMY_PASSWORD_HASH, dto.password).catch(() => false);
      throw new UnauthorizedException('Invalid email or password');
    }

    if (admin.lockedUntil && admin.lockedUntil > new Date()) {
      throw new UnauthorizedException(
        'Account temporarily locked due to repeated failed logins',
      );
    }

    const valid = await argon2
      .verify(admin.passwordHash, dto.password)
      .catch(() => false);
    if (!valid) {
      await this.registerFailedLogin(admin.id, admin.failedLoginAttempts);
      await this.audit.log(
        admin.id,
        'root_login_failed',
        undefined,
        undefined,
        undefined,
        ip,
      );
      throw new UnauthorizedException('Invalid email or password');
    }

    if (admin.failedLoginAttempts > 0 || admin.lockedUntil) {
      await this.prisma.rootAdminUser.update({
        where: { id: admin.id },
        data: { failedLoginAttempts: 0, lockedUntil: null },
      });
    }

    if (!admin.totpEnabled) {
      // First-ever login: generate a fresh secret, persist it immediately
      // (still `totpEnabled: false` until confirmed) so the enrollment
      // challenge token never needs to carry the secret itself — a bearer
      // token is a worse place to put sensitive material than the DB.
      const secret = this.totp.generateSecret();
      await this.prisma.rootAdminUser.update({
        where: { id: admin.id },
        data: { totpSecretEncrypted: this.totp.encryptSecret(secret) },
      });
      const token = await this.signChallenge(admin.id, 'totp_setup');
      return {
        status: 'totp_setup_required' as const,
        token,
        otpauthUrl: this.totp.keyUri(admin.email, secret),
      };
    }

    const token = await this.signChallenge(admin.id, 'totp_login');
    return { status: 'totp_required' as const, token };
  }

  /** Step 2 (first login only): confirm the enrollment code, activate
   * TOTP, issue backup codes (shown once), then issue a full session. */
  async verifyTotpSetup(dto: RootTotpVerifyDto, ip: string | undefined) {
    const payload = await this.verifyChallenge(dto.token, 'totp_setup');
    const admin = await this.requireAdmin(payload.sub);
    if (!admin.totpSecretEncrypted) {
      throw new UnauthorizedException('No pending TOTP setup for this account');
    }

    const secret = this.totp.decryptSecret(admin.totpSecretEncrypted);
    if (!this.totp.verifyCode(dto.code, secret)) {
      throw new UnauthorizedException('Invalid verification code');
    }

    const { raw: backupCodes, hashedJson } =
      await this.totp.generateBackupCodes();
    await this.prisma.rootAdminUser.update({
      where: { id: admin.id },
      data: { totpEnabled: true, backupCodesHashed: hashedJson },
    });
    await this.audit.log(
      admin.id,
      'root_totp_enabled',
      undefined,
      undefined,
      undefined,
      ip,
    );

    const tokens = await this.issueSession(
      admin.id,
      admin.email,
      admin.role as RootAdminRole,
    );
    await this.audit.log(
      admin.id,
      'root_login',
      undefined,
      undefined,
      undefined,
      ip,
    );
    return { admin: this.toPublic(admin), backupCodes, ...tokens };
  }

  /** Step 2 (every login after enrollment): verify a TOTP code or a
   * single-use backup code, then issue a full session. */
  async verifyTotp(dto: RootTotpVerifyDto, ip: string | undefined) {
    const payload = await this.verifyChallenge(dto.token, 'totp_login');
    const admin = await this.requireAdmin(payload.sub);
    if (!admin.totpEnabled || !admin.totpSecretEncrypted) {
      throw new UnauthorizedException('TOTP is not enabled for this account');
    }

    const secret = this.totp.decryptSecret(admin.totpSecretEncrypted);
    let ok = this.totp.verifyCode(dto.code, secret);

    if (!ok) {
      const { valid, remainingJson } = await this.totp.verifyBackupCode(
        dto.code,
        admin.backupCodesHashed,
      );
      if (valid) {
        ok = true;
        await this.prisma.rootAdminUser.update({
          where: { id: admin.id },
          data: { backupCodesHashed: remainingJson },
        });
        await this.audit.log(
          admin.id,
          'root_backup_code_used',
          undefined,
          undefined,
          undefined,
          ip,
        );
      }
    }

    if (!ok) {
      await this.registerFailedLogin(admin.id, admin.failedLoginAttempts);
      await this.audit.log(
        admin.id,
        'root_totp_failed',
        undefined,
        undefined,
        undefined,
        ip,
      );
      throw new UnauthorizedException('Invalid verification code');
    }

    if (admin.failedLoginAttempts > 0 || admin.lockedUntil) {
      await this.prisma.rootAdminUser.update({
        where: { id: admin.id },
        data: { failedLoginAttempts: 0, lockedUntil: null },
      });
    }

    const tokens = await this.issueSession(
      admin.id,
      admin.email,
      admin.role as RootAdminRole,
    );
    await this.audit.log(
      admin.id,
      'root_login',
      undefined,
      undefined,
      undefined,
      ip,
    );
    return { admin: this.toPublic(admin), ...tokens };
  }

  async refresh(rawToken: string) {
    let payload: RootJwtPayload;
    try {
      payload = await this.jwt.verifyAsync<RootJwtPayload>(rawToken, {
        secret: this.config.get<string>('ROOT_JWT_REFRESH_SECRET'),
      });
    } catch {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    const tokenHash = this.hashToken(rawToken);
    const stored = await this.prisma.rootRefreshToken.findFirst({
      where: { adminId: payload.sub, tokenHash, revoked: false },
    });
    if (!stored || stored.expiresAt < new Date()) {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    // Rotation: the presented token is single-use — revoke it immediately
    // so it can never be replayed, even if this exact request fails later.
    await this.prisma.rootRefreshToken.update({
      where: { id: stored.id },
      data: { revoked: true },
    });

    const admin = await this.prisma.rootAdminUser.findUnique({
      where: { id: payload.sub },
    });
    if (!admin) {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    const tokens = await this.issueSession(
      admin.id,
      admin.email,
      admin.role as RootAdminRole,
    );
    return { admin: this.toPublic(admin), ...tokens };
  }

  async logout(rawToken: string | undefined) {
    if (!rawToken) return;
    const tokenHash = this.hashToken(rawToken);
    await this.prisma.rootRefreshToken.updateMany({
      where: { tokenHash, revoked: false },
      data: { revoked: true },
    });
  }

  private async signChallenge(
    adminId: number,
    purpose: ChallengePurpose,
  ): Promise<string> {
    const payload: RootTotpChallengePayload = { sub: adminId, purpose };
    return this.jwt.signAsync(payload, {
      secret: this.config.get<string>('ROOT_JWT_ACCESS_SECRET'),
      expiresIn: Math.floor(CHALLENGE_TTL_MS / 1000),
    });
  }

  private async verifyChallenge(
    token: string,
    expectedPurpose: ChallengePurpose,
  ): Promise<RootTotpChallengePayload> {
    let payload: RootTotpChallengePayload;
    try {
      payload = await this.jwt.verifyAsync<RootTotpChallengePayload>(token, {
        secret: this.config.get<string>('ROOT_JWT_ACCESS_SECRET'),
      });
    } catch {
      throw new UnauthorizedException('Invalid or expired challenge');
    }
    if (payload.purpose !== expectedPurpose) {
      throw new UnauthorizedException('Invalid or expired challenge');
    }
    return payload;
  }

  private async requireAdmin(id: number) {
    const admin = await this.prisma.rootAdminUser.findUnique({
      where: { id },
    });
    if (!admin) {
      throw new UnauthorizedException('Invalid or expired challenge');
    }
    return admin;
  }

  private async registerFailedLogin(adminId: number, currentAttempts: number) {
    const attempts = currentAttempts + 1;
    const data: { failedLoginAttempts: number; lockedUntil?: Date } = {
      failedLoginAttempts: attempts,
    };
    if (attempts >= MAX_FAILED_LOGIN_ATTEMPTS) {
      data.lockedUntil = new Date(Date.now() + LOCKOUT_MINUTES * 60_000);
    }
    await this.prisma.rootAdminUser.update({ where: { id: adminId }, data });
  }

  private async issueSession(
    adminId: number,
    email: string,
    role: RootAdminRole,
  ) {
    const payload: RootJwtPayload = { sub: adminId, email, role };

    const accessExpiresIn = this.config.get<string>(
      'ROOT_JWT_ACCESS_EXPIRES_IN',
    )!;
    const accessToken = await this.jwt.signAsync(payload, {
      secret: this.config.get<string>('ROOT_JWT_ACCESS_SECRET'),
      expiresIn: Math.floor(this.parseDurationMs(accessExpiresIn) / 1000),
    });

    const refreshExpiresIn = this.config.get<string>(
      'ROOT_JWT_REFRESH_EXPIRES_IN',
    )!;
    const refreshToken = await this.jwt.signAsync(payload, {
      secret: this.config.get<string>('ROOT_JWT_REFRESH_SECRET'),
      expiresIn: Math.floor(this.parseDurationMs(refreshExpiresIn) / 1000),
    });

    await this.prisma.rootRefreshToken.create({
      data: {
        adminId,
        tokenHash: this.hashToken(refreshToken),
        expiresAt: new Date(
          Date.now() + this.parseDurationMs(refreshExpiresIn),
        ),
      },
    });

    return { accessToken, refreshToken };
  }

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  private parseDurationMs(duration: string): number {
    const match = /^(\d+)([smhd])$/.exec(duration);
    if (!match) return 12 * 60 * 60_000;
    const value = Number(match[1]);
    const multipliers: Record<string, number> = {
      s: 1000,
      m: 60_000,
      h: 60 * 60_000,
      d: 24 * 60 * 60_000,
    };
    return value * multipliers[match[2]];
  }

  private toPublic(admin: {
    id: number;
    email: string;
    role: string;
  }): PublicRootAdmin {
    return {
      id: admin.id,
      email: admin.email,
      role: admin.role as RootAdminRole,
    };
  }
}
