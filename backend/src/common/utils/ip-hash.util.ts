import { createHmac } from 'node:crypto';

/**
 * Privacy-preserving visitor fingerprint (spec §7.7: store hashed IPs
 * only). An HMAC-SHA256 keyed with IP_HASH_SALT — without the key the
 * hash can't be reversed by brute-forcing the IPv4 space. Used only to
 * de-duplicate and rate-reason about anonymous traffic, never to identify.
 */
export function hashIp(ip: string | undefined, salt: string): string {
  return createHmac('sha256', salt)
    .update(ip ?? 'unknown')
    .digest('hex');
}
