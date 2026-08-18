import { SetMetadata } from '@nestjs/common';
import { UserRole } from '@ar-menu/shared';

export const ROLES_KEY = 'roles';

/** Restricts a handler to the given roles. Combine with RolesGuard. */
export const Roles = (...roles: UserRole[]) => SetMetadata(ROLES_KEY, roles);
