import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { RootAdminRole } from '@ar-menu/shared';
import type { AuthenticatedRootAdmin } from '../../types/authenticated-root-admin.interface';
import { ROOT_ROLES_KEY } from '../decorators/root-roles.decorator';

/**
 * Role check only, mirroring the customer app's RolesGuard exactly — see
 * that file's comment. Destructive Root App actions (suspend/reactivate a
 * restaurant, hide/unhide an item) require RootAdminRole.SUPERADMIN; view
 * endpoints (dashboard, QA queue, restaurant list/detail) allow any
 * authenticated root admin.
 */
@Injectable()
export class RootRolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<
      RootAdminRole[] | undefined
    >(ROOT_ROLES_KEY, [context.getHandler(), context.getClass()]);
    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }
    const { user } = context
      .switchToHttp()
      .getRequest<Request & { user?: AuthenticatedRootAdmin }>();
    return !!user && requiredRoles.includes(user.role);
  }
}
