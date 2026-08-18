import { randomUUID } from 'node:crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import * as argon2 from 'argon2';
import request from 'supertest';
import sharp from 'sharp';
import type { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * Covers what the main happy-path e2e doesn't: the real §7.5 upload
 * pipeline (photo → stored → served back) and the admin QA approve/reject
 * flow. Does NOT exercise the real Tripo network call (no live API key in
 * this environment) — that path is covered by TripoGenerationService's
 * mocked unit tests instead. Here, a menu item is walked into "qa" status
 * directly via Prisma, standing in for what the Tripo pipeline would have
 * done, so the upload path and the admin path can each be verified for
 * real against a real database.
 */
describe('Uploads + Admin QA (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;

  beforeAll(async () => {
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

  afterAll(async () => {
    await app.close();
  });

  async function signupAndLogin() {
    const email = `${randomUUID()}@example.com`;
    const res = await request(app.getHttpServer())
      .post('/api/auth/signup')
      .send({ email, password: 'CorrectHorse123' })
      .expect(201);
    return { email, accessToken: res.body.accessToken as string };
  }

  async function seedAdmin() {
    const email = `admin-${randomUUID()}@example.com`;
    const passwordHash = await argon2.hash('CorrectHorse123', {
      type: argon2.argon2id,
    });
    await prisma.user.create({
      data: { email, passwordHash, role: 'admin', emailVerified: true },
    });
    const res = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email, password: 'CorrectHorse123' })
      .expect(200);
    return res.body.accessToken as string;
  }

  it('uploads a real photo, validates it, stores it, and serves it back read-only', async () => {
    const { accessToken } = await signupAndLogin();

    const restaurantRes = await request(app.getHttpServer())
      .post('/api/restaurants')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ name: 'Upload Test Diner', slug: `upload-test-${Date.now()}` })
      .expect(201);
    const restaurantId = restaurantRes.body.id as number;

    const itemRes = await request(app.getHttpServer())
      .post(`/api/restaurants/${restaurantId}/items`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ name: 'Photo Test Dish', price: 5 })
      .expect(201);
    const itemId = itemRes.body.id as number;

    const jpegBuffer = await sharp({
      create: {
        width: 200,
        height: 150,
        channels: 3,
        background: { r: 10, g: 200, b: 30 },
      },
    })
      .jpeg()
      .toBuffer();

    const uploadRes = await request(app.getHttpServer())
      .post(`/api/restaurants/${restaurantId}/items/${itemId}/photo`)
      .set('Authorization', `Bearer ${accessToken}`)
      .attach('file', jpegBuffer, {
        filename: 'dish.jpg',
        contentType: 'image/jpeg',
      })
      .expect(201);

    expect(uploadRes.body.photoUrl).toEqual(
      expect.stringContaining('/api/uploads/menu-item-photo/'),
    );
    expect(uploadRes.body.arStatus).toBe('pending');

    // The stored file is genuinely readable back through the read-only
    // controller (full round trip, not just a DB field being set).
    const photoPath = new URL(uploadRes.body.photoUrl as string).pathname;
    const getRes = await request(app.getHttpServer())
      .get(photoPath)
      .expect(200);
    expect(getRes.headers['content-type']).toBe('image/webp');
    const servedMeta = await sharp(getRes.body as Buffer).metadata();
    expect(servedMeta.format).toBe('webp');
  });

  it("rejects a non-image upload, and never touches another owner's item", async () => {
    const { accessToken } = await signupAndLogin();
    const { accessToken: intruderToken } = await signupAndLogin();

    const restaurantRes = await request(app.getHttpServer())
      .post('/api/restaurants')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ name: 'Reject Test Diner', slug: `reject-test-${Date.now()}` })
      .expect(201);
    const restaurantId = restaurantRes.body.id as number;

    const itemRes = await request(app.getHttpServer())
      .post(`/api/restaurants/${restaurantId}/items`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ name: 'Bad Upload Dish', price: 5 })
      .expect(201);
    const itemId = itemRes.body.id as number;

    await request(app.getHttpServer())
      .post(`/api/restaurants/${restaurantId}/items/${itemId}/photo`)
      .set('Authorization', `Bearer ${accessToken}`)
      .attach('file', Buffer.from('not an image'), {
        filename: 'fake.jpg',
        contentType: 'image/jpeg',
      })
      .expect(400);

    await request(app.getHttpServer())
      .post(`/api/restaurants/${restaurantId}/items/${itemId}/photo`)
      .set('Authorization', `Bearer ${intruderToken}`)
      .attach('file', Buffer.from('not an image'), {
        filename: 'fake.jpg',
        contentType: 'image/jpeg',
      })
      .expect(404);
  });

  it('admin approve requires both model files, and reject sends the item back to the owner', async () => {
    const { accessToken } = await signupAndLogin();
    const adminToken = await seedAdmin();

    const restaurantRes = await request(app.getHttpServer())
      .post('/api/restaurants')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ name: 'QA Test Diner', slug: `qa-test-${Date.now()}` })
      .expect(201);
    const restaurantId = restaurantRes.body.id as number;

    const itemRes = await request(app.getHttpServer())
      .post(`/api/restaurants/${restaurantId}/items`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ name: 'QA Test Dish', price: 12 })
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
      .get('/api/admin/qa-queue')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200)
      .expect((res) => {
        const items = res.body as { id: number }[];
        expect(items.some((i) => i.id === itemId)).toBe(true);
      });

    // Non-admin (the owner) can't reach admin routes.
    await request(app.getHttpServer())
      .get('/api/admin/qa-queue')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(403);

    // Missing USDZ — approval must be refused, not silently accepted.
    await request(app.getHttpServer())
      .post(`/api/admin/items/${itemId}/approve`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(400);

    const rejectRes = await request(app.getHttpServer())
      .post(`/api/admin/items/${itemId}/reject`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ note: 'Please retake the photo in better lighting' })
      .expect(200);

    expect(rejectRes.body.arStatus).toBe('pending');
    expect(rejectRes.body.qaNote).toBe(
      'Please retake the photo in better lighting',
    );
    expect(rejectRes.body.modelGlbUrl).toBeNull();
  });
});
