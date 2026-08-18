import { UserRole } from '@ar-menu/shared';

export interface JwtPayload {
  sub: number;
  email: string;
  role: UserRole;
}
