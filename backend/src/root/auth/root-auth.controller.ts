import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Throttle } from '@nestjs/throttler';
import type { CookieOptions, Request, Response } from 'express';
import { IpAllowlistGuard } from '../common/guards/ip-allowlist.guard';
import { RootLoginDto } from './dto/root-login.dto';
import { RootTotpVerifyDto } from './dto/root-totp-verify.dto';
import { RootAuthService } from './root-auth.service';

const REFRESH_COOKIE_NAME = 'ar_root_refresh_token';

// Stricter than the customer app's own already-strict auth throttle (spec
// §5: "stricter rate limiting on admin endpoints, especially login") — this
// is the platform operator's login, the highest-value target in the system.
const ROOT_AUTH_THROTTLE = { default: { limit: 5, ttl: 60_000 } };

// IP allowlist applies to every route here, including login itself — an
// attacker outside the allowlist never even reaches password verification.
@UseGuards(IpAllowlistGuard)
@Controller('root/auth')
export class RootAuthController {
  constructor(
    private readonly rootAuth: RootAuthService,
    private readonly config: ConfigService,
  ) {}

  @Throttle(ROOT_AUTH_THROTTLE)
  @HttpCode(HttpStatus.OK)
  @Post('login')
  login(@Body() dto: RootLoginDto, @Req() req: Request) {
    return this.rootAuth.login(dto, req.ip);
  }

  @Throttle(ROOT_AUTH_THROTTLE)
  @HttpCode(HttpStatus.OK)
  @Post('totp/verify-setup')
  async verifyTotpSetup(
    @Body() dto: RootTotpVerifyDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { admin, backupCodes, accessToken, refreshToken } =
      await this.rootAuth.verifyTotpSetup(dto, req.ip);
    this.setRefreshCookie(res, refreshToken);
    return { admin, backupCodes, accessToken };
  }

  @Throttle(ROOT_AUTH_THROTTLE)
  @HttpCode(HttpStatus.OK)
  @Post('totp/verify')
  async verifyTotp(
    @Body() dto: RootTotpVerifyDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { admin, accessToken, refreshToken } = await this.rootAuth.verifyTotp(
      dto,
      req.ip,
    );
    this.setRefreshCookie(res, refreshToken);
    return { admin, accessToken };
  }

  @Throttle(ROOT_AUTH_THROTTLE)
  @HttpCode(HttpStatus.OK)
  @Post('refresh')
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const rawToken = this.readRefreshCookie(req);
    if (!rawToken) {
      throw new UnauthorizedException('Missing refresh token');
    }
    const { admin, accessToken, refreshToken } =
      await this.rootAuth.refresh(rawToken);
    this.setRefreshCookie(res, refreshToken);
    return { admin, accessToken };
  }

  @HttpCode(HttpStatus.NO_CONTENT)
  @Post('logout')
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const rawToken = this.readRefreshCookie(req);
    await this.rootAuth.logout(rawToken);
    res.clearCookie(REFRESH_COOKIE_NAME, this.cookieOptions());
  }

  private readRefreshCookie(req: Request): string | undefined {
    const cookies = req.cookies as Record<string, string> | undefined;
    return cookies?.[REFRESH_COOKIE_NAME];
  }

  private setRefreshCookie(res: Response, token: string) {
    res.cookie(REFRESH_COOKIE_NAME, token, this.cookieOptions());
  }

  private cookieOptions(): CookieOptions {
    return {
      httpOnly: true,
      secure: this.config.get<string>('NODE_ENV') !== 'development',
      sameSite: 'strict',
      // Scoped separately from the customer app's /api/auth cookie path —
      // sessions are fully independent (spec §2).
      path: '/api/root/auth',
    };
  }
}
