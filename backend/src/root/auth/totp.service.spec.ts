import { ConfigService } from '@nestjs/config';
import { authenticator } from 'otplib';
import { TotpService } from './totp.service';

function buildService(): TotpService {
  const config = {
    get: jest.fn().mockReturnValue('a-sufficiently-long-test-encryption-key'),
  } as unknown as ConfigService;
  return new TotpService(config);
}

describe('TotpService', () => {
  describe('generateSecret / keyUri / verifyCode', () => {
    it('generates a secret that produces a code verifyCode() accepts', () => {
      const service = buildService();
      const secret = service.generateSecret();
      const code = authenticator.generate(secret);

      expect(service.verifyCode(code, secret)).toBe(true);
    });

    it('rejects a wrong code', () => {
      const service = buildService();
      const secret = service.generateSecret();

      expect(service.verifyCode('000000', secret)).toBe(false);
    });

    it('rejects a malformed secret instead of throwing', () => {
      const service = buildService();
      expect(service.verifyCode('123456', 'not-a-valid-base32-secret!!!')).toBe(
        false,
      );
    });

    it('builds an otpauth:// URI with the account email and issuer', () => {
      const service = buildService();
      const secret = service.generateSecret();
      const uri = service.keyUri('admin@example.com', secret);

      expect(uri).toContain('otpauth://totp/');
      expect(uri).toContain(encodeURIComponent('admin@example.com'));
      expect(uri).toContain(`secret=${secret}`);
    });
  });

  describe('encryptSecret / decryptSecret', () => {
    it('round-trips a secret', () => {
      const service = buildService();
      const secret = service.generateSecret();

      const encrypted = service.encryptSecret(secret);
      expect(encrypted).not.toContain(secret);
      expect(service.decryptSecret(encrypted)).toBe(secret);
    });

    it('produces different ciphertext each time (random IV)', () => {
      const service = buildService();
      const secret = service.generateSecret();

      expect(service.encryptSecret(secret)).not.toBe(
        service.encryptSecret(secret),
      );
    });
  });

  describe('backup codes', () => {
    it('generates 8 unique codes and their hashed form verifies each one exactly once', async () => {
      const service = buildService();
      const { raw, hashedJson } = await service.generateBackupCodes();

      expect(raw).toHaveLength(8);
      expect(new Set(raw).size).toBe(8);

      let remaining: string | null = hashedJson;
      for (const code of raw) {
        const result = await service.verifyBackupCode(code, remaining);
        expect(result.valid).toBe(true);
        remaining = result.remainingJson;
      }
      // Every code consumed — none should verify again.
      const finalCheck = await service.verifyBackupCode(raw[0], remaining);
      expect(finalCheck.valid).toBe(false);
    });

    it('does not consume a code on a failed attempt', async () => {
      const service = buildService();
      const { hashedJson } = await service.generateBackupCodes();

      const badAttempt = await service.verifyBackupCode(
        '0000000000',
        hashedJson,
      );
      expect(badAttempt.valid).toBe(false);
      expect(badAttempt.remainingJson).toBe(hashedJson);
    });

    it('treats a null backup-code list as always invalid', async () => {
      const service = buildService();
      const result = await service.verifyBackupCode('0000000000', null);
      expect(result.valid).toBe(false);
    });
  });
});
