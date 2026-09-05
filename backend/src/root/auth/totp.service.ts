import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as argon2 from 'argon2';
import { authenticator } from 'otplib';

// otplib v12 (not the current v13) — deliberate choice: v12's `authenticator`
// singleton API (generateSecret/keyuri/check) is the long-established,
// widely-reviewed surface. v13 is a ground-up rewrite (functional API,
// pluggable crypto/base32 backends) that's too unfamiliar to build a
// security-critical 2FA flow against with confidence. The TOTP algorithm
// itself (RFC 6238) hasn't changed; only package internals have.
const ISSUER = 'SeeItReal Root';
const BACKUP_CODE_COUNT = 8;
const BACKUP_CODE_BYTES = 5; // -> 10 hex chars, matches RootTotpVerifyDto's pattern

@Injectable()
export class TotpService {
  constructor(private readonly config: ConfigService) {}

  generateSecret(): string {
    return authenticator.generateSecret();
  }

  keyUri(accountEmail: string, secret: string): string {
    return authenticator.keyuri(accountEmail, ISSUER, secret);
  }

  verifyCode(code: string, secret: string): boolean {
    try {
      return authenticator.check(code, secret);
    } catch {
      return false;
    }
  }

  /** AES-256-GCM, key derived from ROOT_TOTP_ENCRYPTION_KEY. A TOTP secret
   * is as sensitive as a password — never stored in plaintext. */
  encryptSecret(secret: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.encryptionKey(), iv);
    const ciphertext = Buffer.concat([
      cipher.update(secret, 'utf8'),
      cipher.final(),
    ]);
    const authTag = cipher.getAuthTag();
    return [
      iv.toString('hex'),
      authTag.toString('hex'),
      ciphertext.toString('hex'),
    ].join(':');
  }

  decryptSecret(encrypted: string): string {
    const [ivHex, authTagHex, ciphertextHex] = encrypted.split(':');
    const decipher = createDecipheriv(
      'aes-256-gcm',
      this.encryptionKey(),
      Buffer.from(ivHex, 'hex'),
    );
    decipher.setAuthTag(Buffer.from(authTagHex, 'hex'));
    const plaintext = Buffer.concat([
      decipher.update(Buffer.from(ciphertextHex, 'hex')),
      decipher.final(),
    ]);
    return plaintext.toString('utf8');
  }

  /** 8 one-time codes, shown to the admin exactly once. Stored argon2-hashed
   * — same protection as passwords, since knowing one bypasses TOTP. */
  async generateBackupCodes(): Promise<{ raw: string[]; hashedJson: string }> {
    const raw = Array.from({ length: BACKUP_CODE_COUNT }, () =>
      randomBytes(BACKUP_CODE_BYTES).toString('hex'),
    );
    const hashed = await Promise.all(
      raw.map((code) => argon2.hash(code, { type: argon2.argon2id })),
    );
    return { raw, hashedJson: JSON.stringify(hashed) };
  }

  /** Checks `code` against the stored hashed backup codes; on a match,
   * returns the remaining list with that code consumed (single-use). */
  async verifyBackupCode(
    code: string,
    hashedJson: string | null,
  ): Promise<{ valid: boolean; remainingJson: string | null }> {
    if (!hashedJson) return { valid: false, remainingJson: hashedJson };
    const hashed = JSON.parse(hashedJson) as string[];
    for (let i = 0; i < hashed.length; i++) {
      const match = await argon2.verify(hashed[i], code).catch(() => false);
      if (match) {
        const remaining = [...hashed.slice(0, i), ...hashed.slice(i + 1)];
        return { valid: true, remainingJson: JSON.stringify(remaining) };
      }
    }
    return { valid: false, remainingJson: hashedJson };
  }

  /** Derives a 32-byte AES key from ROOT_TOTP_ENCRYPTION_KEY via SHA-256 —
   * accepts any sufficiently long operator-supplied string (validated at
   * boot, see env.validation.ts) without requiring exact hex formatting. */
  private encryptionKey(): Buffer {
    const raw = this.config.get<string>('ROOT_TOTP_ENCRYPTION_KEY')!;
    return createHash('sha256').update(raw).digest();
  }
}
