/**
 * IPv4 exact-IP and CIDR matching for IpAllowlistGuard. IPv6 entries are
 * matched by exact string equality only (no CIDR range support) — not a
 * gap in practice, since admin-allowlist entries are almost always static
 * IPv4 addresses or small IPv4 ranges.
 */

function ipv4ToInt(ip: string): number | null {
  const parts = ip.split('.');
  if (parts.length !== 4) return null;
  let result = 0;
  for (const part of parts) {
    // Reject leading zeros / non-canonical forms ("01") and anything that
    // isn't a plain decimal octet — Number("1e2") would otherwise pass.
    if (!/^\d{1,3}$/.test(part)) return null;
    const n = Number(part);
    if (n > 255) return null;
    result = (result << 8) | n;
  }
  return result >>> 0;
}

/** Strips the IPv4-mapped IPv6 prefix Node sometimes reports for
 * dual-stack sockets (e.g. `::ffff:127.0.0.1` -> `127.0.0.1`). */
export function normalizeIp(ip: string): string {
  return ip.startsWith('::ffff:') ? ip.slice(7) : ip;
}

/** `entry` is either a bare IP ("1.2.3.4") or an IPv4 CIDR ("1.2.3.0/24"). */
export function ipMatchesEntry(ip: string, entry: string): boolean {
  const normalized = normalizeIp(ip);
  if (!entry.includes('/')) {
    return normalized === entry;
  }

  const [range, bitsStr] = entry.split('/');
  const bits = Number(bitsStr);
  const rangeInt = ipv4ToInt(range);
  const ipInt = ipv4ToInt(normalized);
  if (
    rangeInt === null ||
    ipInt === null ||
    !Number.isInteger(bits) ||
    bits < 0 ||
    bits > 32
  ) {
    return false;
  }
  const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
  return (rangeInt & mask) === (ipInt & mask);
}

export function ipMatchesAllowlist(ip: string, allowlist: string[]): boolean {
  return allowlist.some((entry) => ipMatchesEntry(ip, entry));
}
