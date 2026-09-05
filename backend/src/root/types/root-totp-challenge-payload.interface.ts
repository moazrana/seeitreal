/**
 * JWT payload for a short-lived, single-purpose 2FA challenge token —
 * issued after password verification, before a full session exists.
 * Never usable as an access token: RootJwtStrategy only accepts
 * RootJwtPayload-shaped tokens signed for a full session (see
 * RootAuthService.signChallenge / verifyChallenge).
 */
export interface RootTotpChallengePayload {
  sub: number;
  purpose: 'totp_setup' | 'totp_login';
}
