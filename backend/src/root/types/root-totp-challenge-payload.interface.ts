/** `aud` of a 2FA challenge token — never accepted by RootJwtStrategy. */
export const ROOT_CHALLENGE_AUDIENCE = 'root-totp-challenge';

/**
 * JWT payload for a short-lived, single-use 2FA challenge token — issued
 * after password verification, before a full session exists. Never usable
 * as an access token: it carries a different audience and `typ`, both of
 * which RootJwtStrategy checks. `jti` must match the admin's stored
 * totpChallengeJti, which is cleared once the challenge succeeds.
 */
export interface RootTotpChallengePayload {
  sub: number;
  purpose: 'totp_setup' | 'totp_login';
  typ: 'totp_challenge';
  jti: string;
}
