import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { IpAllowlistGuard } from './ip-allowlist.guard';

function makeContext(ip: string | undefined): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => ({ ip }) }),
  } as unknown as ExecutionContext;
}

describe('IpAllowlistGuard', () => {
  it('allows any IP when ROOT_APP_IP_ALLOWLIST is unset (dev default)', () => {
    const config = {
      get: jest.fn().mockReturnValue(undefined),
    } as unknown as ConfigService;
    const guard = new IpAllowlistGuard(config);

    expect(guard.canActivate(makeContext('1.2.3.4'))).toBe(true);
  });

  it('allows a listed IP', () => {
    const config = {
      get: jest.fn().mockReturnValue('203.0.113.4, 198.51.100.0/24'),
    } as unknown as ConfigService;
    const guard = new IpAllowlistGuard(config);

    expect(guard.canActivate(makeContext('203.0.113.4'))).toBe(true);
    expect(guard.canActivate(makeContext('198.51.100.42'))).toBe(true);
  });

  it('rejects an unlisted IP with 403', () => {
    const config = {
      get: jest.fn().mockReturnValue('203.0.113.4'),
    } as unknown as ConfigService;
    const guard = new IpAllowlistGuard(config);

    expect(() => guard.canActivate(makeContext('9.9.9.9'))).toThrow(
      ForbiddenException,
    );
  });

  it('rejects a request with no IP when an allowlist is configured', () => {
    const config = {
      get: jest.fn().mockReturnValue('203.0.113.4'),
    } as unknown as ConfigService;
    const guard = new IpAllowlistGuard(config);

    expect(() => guard.canActivate(makeContext(undefined))).toThrow(
      ForbiddenException,
    );
  });
});
