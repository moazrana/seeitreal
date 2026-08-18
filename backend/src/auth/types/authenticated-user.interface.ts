import { UserRole } from '@ar-menu/shared';

/** Shape of `req.user` after the JWT guard runs — never the raw DB row. */
export interface AuthenticatedUser {
  userId: number;
  email: string;
  role: UserRole;
}
