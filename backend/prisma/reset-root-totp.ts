/**
 * Resets TOTP enrollment on a Root App admin account back to
 * "unenrolled" — clears the secret, backup codes, and any lockout state.
 * Does NOT disable 2FA (it's mandatory per spec §5): the next successful
 * password login for this account automatically re-triggers fresh
 * enrollment (a new QR/otpauth URL), same as a brand-new admin's first
 * login. Use this when an admin is locked out because they lost their
 * authenticator (local dev convenience; in production this should go
 * through a reviewed/audited support path, not a raw script).
 *
 * Usage:
 *   ROOT_ADMIN_EMAIL=admin@example.com npx ts-node -r tsconfig-paths/register prisma/reset-root-totp.ts
 */
import { PrismaClient } from '@prisma/client';

async function main() {
  const email = process.env.ROOT_ADMIN_EMAIL;
  if (!email) {
    console.error('Usage: ROOT_ADMIN_EMAIL=... npx ts-node prisma/reset-root-totp.ts');
    process.exit(1);
  }

  const prisma = new PrismaClient();
  try {
    const admin = await prisma.rootAdminUser.findUnique({ where: { email } });
    if (!admin) {
      console.error(`No root admin found with email ${email}`);
      process.exit(1);
    }

    await prisma.rootAdminUser.update({
      where: { email },
      data: {
        totpEnabled: false,
        totpSecretEncrypted: null,
        backupCodesHashed: null,
        failedLoginAttempts: 0,
        lockedUntil: null,
      },
    });

    // Never log secrets/hashes — spec §7.7.
    console.log(
      `TOTP reset for ${email}. Next login with the correct password will return status "totp_setup_required" with a fresh otpauthUrl to scan.`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err: unknown) => {
  console.error('Failed to reset TOTP:', err instanceof Error ? err.message : err);
  process.exit(1);
});
