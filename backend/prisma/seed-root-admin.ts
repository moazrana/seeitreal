/**
 * Creates (or resets) a Root App admin account (rootApp/ROOT-APP-Implementation-Spec.md
 * §5, §8). Deliberately a one-off script, not an HTTP endpoint — there is
 * no self-serve signup for RootAdminUser, and no "create another admin"
 * UI in this pass; accounts are provisioned out-of-band by whoever
 * operates the platform, same convention as the customer app's
 * seed-admin.ts.
 *
 * `totpEnabled` always starts false (or is reset to false on an existing
 * account, along with any pending/confirmed TOTP secret and backup
 * codes) — first login after seeding always walks through 2FA
 * enrollment, since a fresh password reset must not be able to reuse an
 * old TOTP secret it never saw.
 *
 * Usage:
 *   ROOT_ADMIN_EMAIL=root@example.com ROOT_ADMIN_PASSWORD=... ROOT_ADMIN_ROLE=superadmin \
 *     npx ts-node -r tsconfig-paths/register prisma/seed-root-admin.ts
 */
import * as argon2 from 'argon2';
import { PrismaClient } from '@prisma/client';

const VALID_ROLES = ['superadmin', 'support'];

async function main() {
  const email = process.env.ROOT_ADMIN_EMAIL;
  const password = process.env.ROOT_ADMIN_PASSWORD;
  const role = process.env.ROOT_ADMIN_ROLE ?? 'superadmin';

  if (!email || !password) {
    console.error(
      'Usage: ROOT_ADMIN_EMAIL=... ROOT_ADMIN_PASSWORD=... [ROOT_ADMIN_ROLE=superadmin|support] npx ts-node prisma/seed-root-admin.ts',
    );
    process.exit(1);
  }
  if (password.length < 10) {
    console.error(
      "ROOT_ADMIN_PASSWORD must be at least 10 characters (matches the customer app's SignupDto rules).",
    );
    process.exit(1);
  }
  if (!VALID_ROLES.includes(role)) {
    console.error(`ROOT_ADMIN_ROLE must be one of: ${VALID_ROLES.join(', ')}`);
    process.exit(1);
  }

  const prisma = new PrismaClient();
  try {
    const passwordHash = await argon2.hash(password, {
      type: argon2.argon2id,
    });
    const admin = await prisma.rootAdminUser.upsert({
      where: { email },
      update: {
        passwordHash,
        role: role as 'superadmin' | 'support',
        totpEnabled: false,
        totpSecretEncrypted: null,
        backupCodesHashed: null,
        failedLoginAttempts: 0,
        lockedUntil: null,
      },
      create: { email, passwordHash, role: role as 'superadmin' | 'support' },
    });
    // Never log the password/hash — spec §7.7.
    console.log(
      `Root admin ready: id=${admin.id} email=${admin.email} role=${admin.role} (2FA enrollment required on next login)`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err: unknown) => {
  console.error(
    'Failed to seed root admin user:',
    err instanceof Error ? err.message : err,
  );
  process.exit(1);
});
