import {
  ipMatchesAllowlist,
  ipMatchesEntry,
  normalizeIp,
} from './ip-match.util';

describe('normalizeIp', () => {
  it('strips the IPv4-mapped IPv6 prefix', () => {
    expect(normalizeIp('::ffff:127.0.0.1')).toBe('127.0.0.1');
  });

  it('leaves a plain IPv4 address untouched', () => {
    expect(normalizeIp('127.0.0.1')).toBe('127.0.0.1');
  });

  it('leaves a plain IPv6 address untouched', () => {
    expect(normalizeIp('::1')).toBe('::1');
  });
});

describe('ipMatchesEntry', () => {
  it('matches an exact bare IP', () => {
    expect(ipMatchesEntry('203.0.113.4', '203.0.113.4')).toBe(true);
    expect(ipMatchesEntry('203.0.113.5', '203.0.113.4')).toBe(false);
  });

  it('matches an IPv4 CIDR range', () => {
    expect(ipMatchesEntry('198.51.100.42', '198.51.100.0/24')).toBe(true);
    expect(ipMatchesEntry('198.51.101.42', '198.51.100.0/24')).toBe(false);
  });

  it('matches a /32 CIDR the same as a bare IP', () => {
    expect(ipMatchesEntry('203.0.113.4', '203.0.113.4/32')).toBe(true);
    expect(ipMatchesEntry('203.0.113.5', '203.0.113.4/32')).toBe(false);
  });

  it('matches a /0 CIDR against anything', () => {
    expect(ipMatchesEntry('1.2.3.4', '0.0.0.0/0')).toBe(true);
  });

  it('normalizes an IPv4-mapped IPv6 address before matching', () => {
    expect(ipMatchesEntry('::ffff:203.0.113.4', '203.0.113.4')).toBe(true);
  });

  it('rejects malformed octets in a CIDR range instead of silently matching', () => {
    expect(ipMatchesEntry('203.0.113.4', '203.0.113.999/24')).toBe(false);
    expect(ipMatchesEntry('not-an-ip', '203.0.113.0/24')).toBe(false);
    expect(ipMatchesEntry('1e2.0.0.1', '1.0.0.0/24')).toBe(false);
  });

  it('treats a non-CIDR entry as a plain string comparison (no numeric validation)', () => {
    // Deliberate: bare entries never go through IP parsing, so an entry
    // that happens not to look like a real IP still works as an exact
    // match — only the "/mask" path needs numeric validation.
    expect(ipMatchesEntry('not-an-ip', 'not-an-ip')).toBe(true);
  });

  it('rejects an out-of-range CIDR prefix length', () => {
    expect(ipMatchesEntry('1.2.3.4', '1.2.3.0/33')).toBe(false);
  });

  it('matches exact IPv6 addresses (no CIDR range support)', () => {
    expect(ipMatchesEntry('::1', '::1')).toBe(true);
    expect(ipMatchesEntry('::2', '::1')).toBe(false);
  });
});

describe('ipMatchesAllowlist', () => {
  it('is true if any entry matches', () => {
    expect(
      ipMatchesAllowlist('198.51.100.42', ['203.0.113.4', '198.51.100.0/24']),
    ).toBe(true);
  });

  it('is false if no entry matches', () => {
    expect(
      ipMatchesAllowlist('1.2.3.4', ['203.0.113.4', '198.51.100.0/24']),
    ).toBe(false);
  });

  it('is false for an empty allowlist', () => {
    expect(ipMatchesAllowlist('1.2.3.4', [])).toBe(false);
  });
});
