import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';
import { ipMatchesAllowlist } from '../utils/ip-match.util';

/**
 * App-level IP allowlist for the Root App (spec §5, §7). This works
 * regardless of reverse proxy — the real edge-level allowlist (nginx) is a
 * later, separate deployment step (rootApp/ROOT-APP-Implementation-Spec.md
 * §7); this guard means the app is still IP-gated even before that lands.
 *
 * ROOT_APP_IP_ALLOWLIST empty/unset -> allow every IP (so local dev isn't
 * locked out by default), but logs a loud one-time warning so this can't
 * silently ship wide-open.
 *
 * Requires TRUST_PROXY=true once actually behind nginx, or req.ip will
 * only ever be the proxy's own address (see main.ts).
 */
@Injectable()
export class IpAllowlistGuard implements CanActivate {
  private readonly logger = new Logger(IpAllowlistGuard.name);
  private warned = false;

  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const allowlist = this.parseAllowlist();
    if (allowlist.length === 0) {
      if (!this.warned) {
        this.logger.warn(
          'ROOT_APP_IP_ALLOWLIST is not set — the Root App is reachable from any IP. Set it before exposing this app publicly.',
        );
        this.warned = true;
      }
      return true;
    }

    const req = context.switchToHttp().getRequest<Request>();
    const clientIp = req.ip;
    if (clientIp && ipMatchesAllowlist(clientIp, allowlist)) {
      return true;
    }

    throw new ForbiddenException('Access denied from this network');
  }

  private parseAllowlist(): string[] {
    return (this.config.get<string>('ROOT_APP_IP_ALLOWLIST') ?? '')
      .split(',')
      .map((ip) => ip.trim())
      .filter(Boolean);
  }
}
