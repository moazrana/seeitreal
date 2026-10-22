import { SetMetadata } from '@nestjs/common';
import { RootAdminRole } from '@ar-menu/shared';

export const ROOT_ROLES_KEY = 'rootRoles';

/** Restricts a handler to the given Root App roles. Combine with RootRolesGuard. */
export const RootRoles = (...roles: RootAdminRole[]) =>
  SetMetadata(ROOT_ROLES_KEY, roles);
