import { RootAdminRole } from '@ar-menu/shared';

/** Shape of `req.user` after RootJwtAuthGuard runs — never the raw DB row. */
export interface AuthenticatedRootAdmin {
  adminId: number;
  email: string;
  role: RootAdminRole;
}
