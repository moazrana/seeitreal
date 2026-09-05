import { RootAdminRole } from '@ar-menu/shared';

/** JWT payload for a full Root App session (access + refresh tokens). */
export interface RootJwtPayload {
  sub: number;
  email: string;
  role: RootAdminRole;
}
