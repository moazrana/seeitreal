/**
 * Creates (or promotes) a platform admin account. Deliberately a one-off
 * script, not an HTTP endpoint — self-serve signup always creates an
 * "owner" (AuthService.signup hardcodes UserRole.OWNER); admin accounts
 * are provisioned out-of-band by whoever operates the platform, per spec
 * §2's role model.
 *
 * Usage:
 *   ADMIN_EMAIL=admin@example.com ADMIN_PASSWORD=... npx ts-node -r tsconfig-paths/register prisma/seed-admin.ts
 */
import * as argon2 from 'argon2';
import { PrismaClient } from '@prisma/client';

async function main() {
  const email = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;

  if (!email || !password) {
    console.error('Usage: ADMIN_EMAIL=... ADMIN_PASSWORD=... npx ts-node prisma/seed-admin.ts');
    process.exit(1);
  }
  if (password.length < 10) {
    console.error('ADMIN_PASSWORD must be at least 10 characters (matches SignupDto rules).');
    process.exit(1);
  }

  const prisma = new PrismaClient();
  try {
    const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
    const user = await prisma.user.upsert({
      where: { email },
      update: { role: 'admin', passwordHash },
      create: { email, passwordHash, role: 'admin', emailVerified: true },
    });
    // Never log the password/hash — spec §7.7.
    console.log(`Admin user ready: id=${user.id} email=${user.email}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err: unknown) => {
  console.error('Failed to seed admin user:', err instanceof Error ? err.message : err);
  process.exit(1);
});
