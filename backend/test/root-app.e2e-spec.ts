import { randomUUID } from 'node:crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import * as argon2 from 'argon2';
import { authenticator } from 'otplib';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { createCuisineType } from './helpers/cuisine-type';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * Root App happy path (rootApp/ROOT-APP-Implementation-Spec.md), driven
 * against the real API + a real database: seed a superadmin → log in →
 * complete mandatory TOTP enrollment → real dashboard counts → suspend a
 * restaurant (owner + public both blocked) → reactivate (both recover) →
 * model QA approve/reject (moved here from the old admin module).
 */
describe('Root App (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;

  // A fresh app (and so a fresh, per-test in-memory ThrottlerStorage) per
  // test, not shared via beforeAll — the Root App's login throttle is
  // deliberately stricter than the customer app's (5/min, spec §5), and
  // several tests below legitimately call it more than once to verify
  // the enrollment/challenge/wrong-code flows. Isolating per test avoids
  // one test's login calls tripping the limit for the next, without
  // weakening the throttle itself.
  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    app.setGlobalPrefix('api');
    await app.init();

    prisma = moduleFixture.get(PrismaService);
  });

  afterEach(async () => {
    await app.close();
  });

  async function seedRootAdmin(role: 'superadmin' | 'support' = 'superadmin') {
    const email = `root-${randomUUID()}@example.com`;
    const passwordHash = await argon2.hash('CorrectHorse123', {
      type: argon2.argon2id,
    });
    await prisma.rootAdminUser.create({ data: { email, passwordHash, role } });
    return email;
  }

  /** Drives the full login -> TOTP enrollment -> session flow, real crypto
   * throughout — extracts the real secret from the returned otpauth URI
   * (the same thing a diner's authenticator app would scan as a QR). */
  async function loginAndEnroll(email: string) {
    const loginRes = await request(app.getHttpServer())
      .post('/api/root/auth/login')
      .send({ email, password: 'CorrectHorse123' })
      .expect(200);
    expect(loginRes.body.status).toBe('totp_setup_required');

    const secret = new URL(loginRes.body.otpauthUrl as string).searchParams.get(
      'secret',
    )!;
    const code = authenticator.generate(secret);

    const setupRes = await request(app.getHttpServer())
      .post('/api/root/auth/totp/verify-setup')
      .send({ token: loginRes.body.token, code })
      .expect(200);

    return {
      accessToken: setupRes.body.accessToken as string,
      backupCodes: setupRes.body.backupCodes as string[],
      secret,
    };
  }

  // Signup creates the owner's one restaurant in the same request (one
  // restaurant per account) — callers use restaurantId from here rather
  // than a separate POST /api/restaurants, which now 409s for an owner
  // who already has one.
  async function signupAndLogin() {
    const email = `${randomUUID()}@example.com`;
    const res = await request(app.getHttpServer())
      .post('/api/auth/signup')
      .send({
        email,
        password: 'CorrectHorse123',
        confirmPassword: 'CorrectHorse123',
        businessName: `Signup Test Diner ${Date.now()}`,
        address: '1 Signup Test Street',
      })
      .expect(201);
    return {
      accessToken: res.body.accessToken as string,
      restaurantId: res.body.restaurant.id as number,
      restaurantSlug: res.body.restaurant.slug as string,
    };
  }

  it('requires 2FA enrollment on first login, then a TOTP code on every login after', async () => {
    const email = await seedRootAdmin();
    const { secret } = await loginAndEnroll(email);

    // A second login now demands the (already-enrolled) TOTP challenge,
    // not another enrollment.
    const loginRes = await request(app.getHttpServer())
      .post('/api/root/auth/login')
      .send({ email, password: 'CorrectHorse123' })
      .expect(200);
    expect(loginRes.body.status).toBe('totp_required');

    const code = authenticator.generate(secret);
    const verifyRes = await request(app.getHttpServer())
      .post('/api/root/auth/totp/verify')
      .send({ token: loginRes.body.token, code })
      .expect(200);
    expect(verifyRes.body.accessToken).toEqual(expect.any(String));

    // A wrong code is rejected outright.
    await request(app.getHttpServer())
      .post('/api/root/auth/login')
      .send({ email, password: 'CorrectHorse123' })
      .expect(200)
      .then((res) =>
        request(app.getHttpServer())
          .post('/api/root/auth/totp/verify')
          .send({ token: res.body.token, code: '000000' })
          .expect(401),
      );
  });

  it('never accepts the password-only 2FA challenge token as an admin session', async () => {
    const email = await seedRootAdmin();
    const loginRes = await request(app.getHttpServer())
      .post('/api/root/auth/login')
      .send({ email, password: 'CorrectHorse123' })
      .expect(200);

    // Same signing key as a real access token, but it must not get past
    // the root JWT guard — otherwise the password alone bypasses 2FA.
    await request(app.getHttpServer())
      .get('/api/root/qa-queue')
      .set('Authorization', `Bearer ${loginRes.body.token as string}`)
      .expect(401);
  });

  it('makes each 2FA challenge single-use', async () => {
    const email = await seedRootAdmin();
    const { secret } = await loginAndEnroll(email);

    const loginRes = await request(app.getHttpServer())
      .post('/api/root/auth/login')
      .send({ email, password: 'CorrectHorse123' })
      .expect(200);
    const challenge = loginRes.body.token as string;
    await request(app.getHttpServer())
      .post('/api/root/auth/totp/verify')
      .send({ token: challenge, code: authenticator.generate(secret) })
      .expect(200);

    // Replaying the already-used challenge, even with a valid code, fails.
    await request(app.getHttpServer())
      .post('/api/root/auth/totp/verify')
      .send({ token: challenge, code: authenticator.generate(secret) })
      .expect(401);
  });

  it('counts wrong 2FA codes toward lockout and enforces it at the code step', async () => {
    const email = await seedRootAdmin();
    const { secret } = await loginAndEnroll(email);
    const loginRes = await request(app.getHttpServer())
      .post('/api/root/auth/login')
      .send({ email, password: 'CorrectHorse123' })
      .expect(200);

    // One short of the limit, so a single wrong code (rather than five,
    // which the per-route throttle would cut off first) trips the lock.
    await prisma.rootAdminUser.update({
      where: { email },
      data: { failedLoginAttempts: 4 },
    });
    await request(app.getHttpServer())
      .post('/api/root/auth/totp/verify')
      .send({ token: loginRes.body.token, code: '000000' })
      .expect(401);

    // Locked: the still-unexpired challenge plus a correct code is refused.
    const lockedRes = await request(app.getHttpServer())
      .post('/api/root/auth/totp/verify')
      .send({
        token: loginRes.body.token,
        code: authenticator.generate(secret),
      })
      .expect(401);
    expect(lockedRes.body.message).toMatch(/locked/i);
  });

  it('lets an enrolled admin suspend a restaurant, blocking both the owner and the public page, then reactivate', async () => {
    const rootEmail = await seedRootAdmin();
    const { accessToken: rootAccess } = await loginAndEnroll(rootEmail);

    const { accessToken: ownerAccess, restaurantSlug } = await signupAndLogin();

    const categoryId = await createCuisineType(
      app.getHttpServer(),
      ownerAccess,
      restaurantSlug,
    );
    const itemRes = await request(app.getHttpServer())
      .post(`/api/restaurants/${restaurantSlug}/items`)
      .set('Authorization', `Bearer ${ownerAccess}`)
      .send({ name: 'Suspend Test Dish', categoryId })
      .expect(201);
    const publicSlug = itemRes.body.publicSlug as string;

    // Dashboard reflects the real restaurant before suspension.
    const dashRes = await request(app.getHttpServer())
      .get('/api/root/dashboard')
      .set('Authorization', `Bearer ${rootAccess}`)
      .expect(200);
    expect(dashRes.body.restaurants.total).toBeGreaterThanOrEqual(1);

    await request(app.getHttpServer())
      .post(`/api/root/restaurants/${restaurantSlug}/suspend`)
      .set('Authorization', `Bearer ${rootAccess}`)
      .send({ reason: 'e2e test suspension' })
      .expect(200);

    // Owner is blocked (403, not 404 — they still own it).
    await request(app.getHttpServer())
      .get(`/api/restaurants/${restaurantSlug}`)
      .set('Authorization', `Bearer ${ownerAccess}`)
      .expect(403);

    // The public AR page is offline too.
    await request(app.getHttpServer()).get(`/api/m/${publicSlug}`).expect(404);

    await request(app.getHttpServer())
      .post(`/api/root/restaurants/${restaurantSlug}/reactivate`)
      .set('Authorization', `Bearer ${rootAccess}`)
      .expect(200);

    // Both recover.
    await request(app.getHttpServer())
      .get(`/api/restaurants/${restaurantSlug}`)
      .set('Authorization', `Bearer ${ownerAccess}`)
      .expect(200);
    await request(app.getHttpServer()).get(`/api/m/${publicSlug}`).expect(200);
  });

  it('a support-role admin can view the dashboard but cannot suspend (RBAC)', async () => {
    const email = await seedRootAdmin('support');
    const { accessToken } = await loginAndEnroll(email);

    await request(app.getHttpServer())
      .get('/api/root/dashboard')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    const { restaurantSlug: rbacRestaurantSlug } = await signupAndLogin();

    await request(app.getHttpServer())
      .post(`/api/root/restaurants/${rbacRestaurantSlug}/suspend`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ reason: 'should be forbidden' })
      .expect(403);
  });

  it('moves model QA here: approve requires both model files, and reject sends the item back to the owner', async () => {
    const rootEmail = await seedRootAdmin();
    const { accessToken: rootAccess } = await loginAndEnroll(rootEmail);
    const { accessToken: ownerAccess, restaurantSlug } = await signupAndLogin();

    const categoryId = await createCuisineType(
      app.getHttpServer(),
      ownerAccess,
      restaurantSlug,
    );
    const itemRes = await request(app.getHttpServer())
      .post(`/api/restaurants/${restaurantSlug}/items`)
      .set('Authorization', `Bearer ${ownerAccess}`)
      .send({ name: 'Root QA Dish', categoryId })
      .expect(201);
    const itemId = itemRes.body.id as number;

    // Stand in for what a completed Tripo job would have done — walk the
    // item into "qa" with only a GLB (no USDZ yet).
    await prisma.menuItem.update({
      where: { id: itemId },
      data: {
        arStatus: 'qa',
        modelGlbUrl: 'http://localhost/api/uploads/model-glb/x.glb',
      },
    });

    await request(app.getHttpServer())
      .get('/api/root/qa-queue')
      .set('Authorization', `Bearer ${rootAccess}`)
      .expect(200)
      .expect((res) => {
        const items = res.body as {
          id: number;
          category: { id: number; name: string };
        }[];
        const queued = items.find((i) => i.id === itemId);
        expect(queued?.category).toEqual({ id: categoryId, name: 'Mains' });
      });

    // The old /api/admin/* routes are gone entirely.
    await request(app.getHttpServer())
      .get('/api/admin/qa-queue')
      .set('Authorization', `Bearer ${ownerAccess}`)
      .expect(404);

    // Missing USDZ — approval must be refused, not silently accepted.
    await request(app.getHttpServer())
      .post(`/api/root/items/${itemId}/approve`)
      .set('Authorization', `Bearer ${rootAccess}`)
      .expect(400);

    const rejectRes = await request(app.getHttpServer())
      .post(`/api/root/items/${itemId}/reject`)
      .set('Authorization', `Bearer ${rootAccess}`)
      .send({ note: 'Please retake the photo in better lighting' })
      .expect(200);

    expect(rejectRes.body.arStatus).toBe('pending');
    expect(rejectRes.body.qaNote).toBe(
      'Please retake the photo in better lighting',
    );
    expect(rejectRes.body.modelGlbUrl).toBeNull();
  });
});
