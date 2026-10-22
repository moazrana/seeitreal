import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RootAdminRole } from '@ar-menu/shared';
import { RootRolesGuard } from './root-roles.guard';

function makeContext(
  user: { role: RootAdminRole } | undefined,
): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
    getHandler: () => undefined,
    getClass: () => undefined,
  } as unknown as ExecutionContext;
}

describe('RootRolesGuard', () => {
  it('allows any authenticated admin when no roles are required', () => {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue(undefined),
    } as unknown as Reflector;
    const guard = new RootRolesGuard(reflector);

    expect(
      guard.canActivate(makeContext({ role: RootAdminRole.SUPPORT })),
    ).toBe(true);
  });

  it('allows a matching role', () => {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue([RootAdminRole.SUPERADMIN]),
    } as unknown as Reflector;
    const guard = new RootRolesGuard(reflector);

    expect(
      guard.canActivate(makeContext({ role: RootAdminRole.SUPERADMIN })),
    ).toBe(true);
  });

  it('rejects a non-matching role', () => {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue([RootAdminRole.SUPERADMIN]),
    } as unknown as Reflector;
    const guard = new RootRolesGuard(reflector);

    expect(
      guard.canActivate(makeContext({ role: RootAdminRole.SUPPORT })),
    ).toBe(false);
  });

  it('rejects when there is no authenticated admin at all', () => {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue([RootAdminRole.SUPERADMIN]),
    } as unknown as Reflector;
    const guard = new RootRolesGuard(reflector);

    expect(guard.canActivate(makeContext(undefined))).toBe(false);
  });
});
