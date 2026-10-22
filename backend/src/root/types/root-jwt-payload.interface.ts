import { RootAdminRole } from '@ar-menu/shared';

/** `aud` of a full-session access token. RootJwtStrategy accepts only this
 * audience, so a 2FA challenge token (ROOT_CHALLENGE_AUDIENCE) can never
 * be used as a session even though both share ROOT_JWT_ACCESS_SECRET. */
export const ROOT_ACCESS_AUDIENCE = 'root-access';

/** JWT payload for a full Root App session (access + refresh tokens). */
export interface RootJwtPayload {
  sub: number;
  email: string;
  role: RootAdminRole;
  typ: 'access' | 'refresh';
}
