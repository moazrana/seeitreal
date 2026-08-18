import { randomBytes, createHash } from 'node:crypto';
import {
  ConflictException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import { UserRole } from '@ar-menu/shared';
import { PrismaService } from '../prisma/prisma.service';
import type { LoginDto } from './dto/login.dto';
import type { SignupDto } from './dto/signup.dto';
import type { JwtPayload } from './types/jwt-payload.interface';

const MAX_FAILED_LOGIN_ATTEMPTS = 5;
const LOCKOUT_MINUTES = 15;
const RANDOM_TOKEN_BYTES = 48;
const EMAIL_VERIFICATION_TTL_HOURS = 24;
const PASSWORD_RESET_TTL_MINUTES = 30;
// A pre-computed argon2id hash of a random value, used only to keep
// login's timing profile the same for "unknown email" as for "wrong
// password" — never actually matches a real password.
const DUMMY_PASSWORD_HASH =
  '$argon2id$v=19$m=65536,t=3,p=4$c29tZXNhbHRzb21lc2FsdA$8x1Y5m3l9d1r6QF2s0y9pQpF2f0m1o7l6b9x3q7r5t0';

export interface PublicUser {
  id: number;
  email: string;
  role: UserRole;
  emailVerified: boolean;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  async signup(dto: SignupDto) {
    const existing = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });
    if (existing) {
      throw new ConflictException('An account with this email already exists');
    }

    const passwordHash = await argon2.hash(dto.password, {
      type: argon2.argon2id,
    });
    const user = await this.prisma.user.create({
      data: { email: dto.email, passwordHash, role: UserRole.OWNER },
    });

    await this.issueEmailVerificationToken(user.id, user.email);

    const tokens = await this.issueTokenPair(
      user.id,
      user.email,
      user.role as UserRole,
    );
    return { user: this.toPublicUser(user), ...tokens };
  }

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });

    if (!user) {
      // Burn roughly the same time as a real verify so response timing
      // doesn't reveal whether the email is registered.
      await argon2.verify(DUMMY_PASSWORD_HASH, dto.password).catch(() => false);
      throw new UnauthorizedException('Invalid email or password');
    }

    if (user.lockedUntil && user.lockedUntil > new Date()) {
      throw new UnauthorizedException(
        'Account temporarily locked due to repeated failed logins',
      );
    }

    const valid = await argon2
      .verify(user.passwordHash, dto.password)
      .catch(() => false);
    if (!valid) {
      await this.registerFailedLogin(user.id, user.failedLoginAttempts);
      throw new UnauthorizedException('Invalid email or password');
    }

    if (user.failedLoginAttempts > 0 || user.lockedUntil) {
      await this.prisma.user.update({
        where: { id: user.id },
        data: { failedLoginAttempts: 0, lockedUntil: null },
      });
    }

    const tokens = await this.issueTokenPair(
      user.id,
      user.email,
      user.role as UserRole,
    );
    return { user: this.toPublicUser(user), ...tokens };
  }

  async refresh(rawToken: string) {
    let payload: JwtPayload;
    try {
      payload = await this.jwt.verifyAsync<JwtPayload>(rawToken, {
        secret: this.config.get<string>('JWT_REFRESH_SECRET'),
      });
    } catch {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    const tokenHash = this.hashToken(rawToken);
    const stored = await this.prisma.refreshToken.findFirst({
      where: { userId: payload.sub, tokenHash, revoked: false },
    });
    if (!stored || stored.expiresAt < new Date()) {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    // Rotation: the presented token is single-use — revoke it immediately
    // so it can never be replayed, even if this exact request fails later.
    await this.prisma.refreshToken.update({
      where: { id: stored.id },
      data: { revoked: true },
    });

    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
    });
    if (!user) {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    const tokens = await this.issueTokenPair(
      user.id,
      user.email,
      user.role as UserRole,
    );
    return { user: this.toPublicUser(user), ...tokens };
  }

  async logout(rawToken: string | undefined) {
    if (!rawToken) return;
    const tokenHash = this.hashToken(rawToken);
    await this.prisma.refreshToken.updateMany({
      where: { tokenHash, revoked: false },
      data: { revoked: true },
    });
  }

  async verifyEmail(rawToken: string) {
    const tokenHash = this.hashToken(rawToken);
    const record = await this.prisma.emailVerificationToken.findFirst({
      where: { tokenHash, usedAt: null },
    });
    if (!record || record.expiresAt < new Date()) {
      throw new UnauthorizedException('Invalid or expired verification token');
    }
    await this.prisma.$transaction([
      this.prisma.emailVerificationToken.update({
        where: { id: record.id },
        data: { usedAt: new Date() },
      }),
      this.prisma.user.update({
        where: { id: record.userId },
        data: { emailVerified: true },
      }),
    ]);
  }

  async requestPasswordReset(email: string) {
    const user = await this.prisma.user.findUnique({ where: { email } });
    // Always behave identically whether or not the account exists, so the
    // caller can't use this endpoint to enumerate registered emails.
    if (!user) return;

    const raw = this.generateRawToken();
    await this.prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        tokenHash: this.hashToken(raw),
        expiresAt: new Date(Date.now() + PASSWORD_RESET_TTL_MINUTES * 60_000),
      },
    });
    this.sendMailStub(user.email, 'Reset your password');
  }

  async resetPassword(rawToken: string, newPassword: string) {
    const tokenHash = this.hashToken(rawToken);
    const record = await this.prisma.passwordResetToken.findFirst({
      where: { tokenHash, usedAt: null },
    });
    if (!record || record.expiresAt < new Date()) {
      throw new UnauthorizedException('Invalid or expired reset token');
    }

    const passwordHash = await argon2.hash(newPassword, {
      type: argon2.argon2id,
    });

    await this.prisma.$transaction([
      this.prisma.passwordResetToken.update({
        where: { id: record.id },
        data: { usedAt: new Date() },
      }),
      this.prisma.user.update({
        where: { id: record.userId },
        data: { passwordHash, failedLoginAttempts: 0, lockedUntil: null },
      }),
      // A password reset means every existing session should stop working.
      this.prisma.refreshToken.updateMany({
        where: { userId: record.userId, revoked: false },
        data: { revoked: true },
      }),
    ]);
  }

  private async registerFailedLogin(userId: number, currentAttempts: number) {
    const attempts = currentAttempts + 1;
    const data: { failedLoginAttempts: number; lockedUntil?: Date } = {
      failedLoginAttempts: attempts,
    };
    if (attempts >= MAX_FAILED_LOGIN_ATTEMPTS) {
      data.lockedUntil = new Date(Date.now() + LOCKOUT_MINUTES * 60_000);
    }
    await this.prisma.user.update({ where: { id: userId }, data });
  }

  private async issueEmailVerificationToken(userId: number, email: string) {
    const raw = this.generateRawToken();
    await this.prisma.emailVerificationToken.create({
      data: {
        userId,
        tokenHash: this.hashToken(raw),
        expiresAt: new Date(
          Date.now() + EMAIL_VERIFICATION_TTL_HOURS * 60 * 60_000,
        ),
      },
    });
    this.sendMailStub(email, 'Verify your email');
  }

  private async issueTokenPair(userId: number, email: string, role: UserRole) {
    const payload: JwtPayload = { sub: userId, email, role };

    // Durations come from env as strings (e.g. "15m") but @nestjs/jwt's
    // `expiresIn` option types a bare `string` too loosely to satisfy its
    // overloads — sign with plain seconds instead, computed via our own
    // parser, which keeps the env format free-form.
    const accessExpiresIn = this.config.get<string>('JWT_ACCESS_EXPIRES_IN')!;
    const accessToken = await this.jwt.signAsync(payload, {
      secret: this.config.get<string>('JWT_ACCESS_SECRET'),
      expiresIn: Math.floor(this.parseDurationMs(accessExpiresIn) / 1000),
    });

    const refreshExpiresIn = this.config.get<string>('JWT_REFRESH_EXPIRES_IN')!;
    const refreshToken = await this.jwt.signAsync(payload, {
      secret: this.config.get<string>('JWT_REFRESH_SECRET'),
      expiresIn: Math.floor(this.parseDurationMs(refreshExpiresIn) / 1000),
    });

    await this.prisma.refreshToken.create({
      data: {
        userId,
        tokenHash: this.hashToken(refreshToken),
        expiresAt: new Date(
          Date.now() + this.parseDurationMs(refreshExpiresIn),
        ),
      },
    });

    return { accessToken, refreshToken };
  }

  /** Refresh/verification/reset tokens are already high-entropy random or
   * signed JWTs, so a fast SHA-256 digest (not a password KDF) is the right
   * tool here — we're indexing/comparing, not defending against brute force
   * of a low-entropy secret. */
  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  private generateRawToken(): string {
    return randomBytes(RANDOM_TOKEN_BYTES).toString('hex');
  }

  private parseDurationMs(duration: string): number {
    const match = /^(\d+)([smhd])$/.exec(duration);
    if (!match) return 7 * 24 * 60 * 60_000;
    const value = Number(match[1]);
    const multipliers: Record<string, number> = {
      s: 1000,
      m: 60_000,
      h: 60 * 60_000,
      d: 24 * 60 * 60_000,
    };
    return value * multipliers[match[2]];
  }

  private sendMailStub(to: string, subject: string) {
    // TODO: wire a real transactional email provider (e.g. SES/Postmark) via
    // env config before production launch. Deliberately not taking/logging
    // the raw token here — never log secrets/tokens (spec §7.7) even in a
    // stub.
    this.logger.debug(`[mail stub] would send "${subject}" to ${to}`);
  }

  private toPublicUser(user: {
    id: number;
    email: string;
    role: string;
    emailVerified: boolean;
  }): PublicUser {
    return {
      id: user.id,
      email: user.email,
      role: user.role as UserRole,
      emailVerified: user.emailVerified,
    };
  }
}
