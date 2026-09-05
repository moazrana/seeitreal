import { randomUUID } from 'node:crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import sharp from 'sharp';
import type { App } from 'supertest/types';
import { AppModule } from '../src/app.module';

/**
 * Covers what the main happy-path e2e doesn't: the real §7.5 upload
 * pipeline (photos → stored → served back) and the multi-photo/manual-GLB
 * additions from documents/3d-model-enhancement.md. Model QA approve/reject
 * moved to the Root App — see root-app.e2e-spec.ts.
 */
describe('Uploads (e2e)', () => {
  let app: INestApplication<App>;

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

  async function createRestaurantAndItem(accessToken: string, label: string) {
    const restaurantRes = await request(app.getHttpServer())
      .post('/api/restaurants')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        name: `${label} Diner`,
        slug: `${label.toLowerCase()}-${Date.now()}`,
      })
      .expect(201);
    const restaurantId = restaurantRes.body.id as number;

    const itemRes = await request(app.getHttpServer())
      .post(`/api/restaurants/${restaurantId}/items`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ name: `${label} Dish` })
      .expect(201);
    const itemId = itemRes.body.id as number;

    return { restaurantId, itemId };
  }

  async function makeJpeg(color: { r: number; g: number; b: number }) {
    return sharp({
      create: { width: 200, height: 150, channels: 3, background: color },
    })
      .jpeg()
      .toBuffer();
  }

  it('uploads a real photo, validates it, stores it, and serves it back read-only', async () => {
    const { accessToken } = await signupAndLogin();
    const { restaurantId, itemId } = await createRestaurantAndItem(
      accessToken,
      'PhotoTest',
    );

    const jpegBuffer = await makeJpeg({ r: 10, g: 200, b: 30 });

    const uploadRes = await request(app.getHttpServer())
      .post(`/api/restaurants/${restaurantId}/items/${itemId}/photos`)
      .set('Authorization', `Bearer ${accessToken}`)
      .attach('files', jpegBuffer, {
        filename: 'dish.jpg',
        contentType: 'image/jpeg',
      })
      .expect(201);

    expect(uploadRes.body.photoUrl).toEqual(
      expect.stringContaining('/api/uploads/menu-item-photo/'),
    );
    expect(uploadRes.body.arStatus).toBe('pending');
    expect(uploadRes.body.photos).toHaveLength(1);

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

  it('uploads multiple photos in one request, keeping order, and lets one be removed', async () => {
    const { accessToken } = await signupAndLogin();
    const { restaurantId, itemId } = await createRestaurantAndItem(
      accessToken,
      'MultiPhotoTest',
    );

    const first = await makeJpeg({ r: 200, g: 0, b: 0 });
    const second = await makeJpeg({ r: 0, g: 200, b: 0 });

    const uploadRes = await request(app.getHttpServer())
      .post(`/api/restaurants/${restaurantId}/items/${itemId}/photos`)
      .set('Authorization', `Bearer ${accessToken}`)
      .attach('files', first, { filename: 'a.jpg', contentType: 'image/jpeg' })
      .attach('files', second, { filename: 'b.jpg', contentType: 'image/jpeg' })
      .expect(201);

    expect(uploadRes.body.photos).toHaveLength(2);
    const [p0, p1] = uploadRes.body.photos as {
      id: number;
      sortOrder: number;
    }[];
    expect(p0.sortOrder).toBe(0);
    expect(p1.sortOrder).toBe(1);

    const removeRes = await request(app.getHttpServer())
      .delete(
        `/api/restaurants/${restaurantId}/items/${itemId}/photos/${p0.id}`,
      )
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(removeRes.body.photos).toHaveLength(1);
    // The remaining photo (originally sortOrder 1) is renumbered to 0 and
    // promoted to the display photo.
    expect(removeRes.body.photos[0].sortOrder).toBe(0);
    expect(removeRes.body.photoUrl).toBe(removeRes.body.photos[0].url);
  });

  it('rejects a further upload once an item already has 5 photos', async () => {
    const { accessToken } = await signupAndLogin();
    const { restaurantId, itemId } = await createRestaurantAndItem(
      accessToken,
      'TooManyPhotosTest',
    );

    let req = request(app.getHttpServer())
      .post(`/api/restaurants/${restaurantId}/items/${itemId}/photos`)
      .set('Authorization', `Bearer ${accessToken}`);
    for (let n = 0; n < 5; n++) {
      const buf = await makeJpeg({ r: n * 10, g: 0, b: 0 });
      req = req.attach('files', buf, {
        filename: `${n}.jpg`,
        contentType: 'image/jpeg',
      });
    }
    await req.expect(201);

    const extra = await makeJpeg({ r: 1, g: 1, b: 1 });
    await request(app.getHttpServer())
      .post(`/api/restaurants/${restaurantId}/items/${itemId}/photos`)
      .set('Authorization', `Bearer ${accessToken}`)
      .attach('files', extra, {
        filename: 'extra.jpg',
        contentType: 'image/jpeg',
      })
      .expect(400);
  });

  it("rejects a non-image upload, and never touches another owner's item", async () => {
    const { accessToken } = await signupAndLogin();
    const { accessToken: intruderToken } = await signupAndLogin();
    const { restaurantId, itemId } = await createRestaurantAndItem(
      accessToken,
      'RejectTest',
    );

    await request(app.getHttpServer())
      .post(`/api/restaurants/${restaurantId}/items/${itemId}/photos`)
      .set('Authorization', `Bearer ${accessToken}`)
      .attach('files', Buffer.from('not an image'), {
        filename: 'fake.jpg',
        contentType: 'image/jpeg',
      })
      .expect(400);

    await request(app.getHttpServer())
      .post(`/api/restaurants/${restaurantId}/items/${itemId}/photos`)
      .set('Authorization', `Bearer ${intruderToken}`)
      .attach('files', Buffer.from('not an image'), {
        filename: 'fake.jpg',
        contentType: 'image/jpeg',
      })
      .expect(404);
  });

  it('rejects a manual GLB upload that is not a genuine GLB, and requires widthMm first', async () => {
    const { accessToken } = await signupAndLogin();
    const { restaurantId, itemId } = await createRestaurantAndItem(
      accessToken,
      'ManualGlbTest',
    );

    // No widthMm set yet — the hero-dish bypass requires it, same as
    // triggerGeneration (documents/3d-model-enhancement.md §5).
    await request(app.getHttpServer())
      .post(`/api/restaurants/${restaurantId}/items/${itemId}/model`)
      .set('Authorization', `Bearer ${accessToken}`)
      .attach('file', Buffer.from('not a glb'), {
        filename: 'model.glb',
        contentType: 'model/gltf-binary',
      })
      .expect(400);

    await request(app.getHttpServer())
      .patch(`/api/restaurants/${restaurantId}/items/${itemId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ widthMm: 200 })
      .expect(200);

    await request(app.getHttpServer())
      .post(`/api/restaurants/${restaurantId}/items/${itemId}/model`)
      .set('Authorization', `Bearer ${accessToken}`)
      .attach('file', Buffer.from('still not a glb'), {
        filename: 'model.glb',
        contentType: 'model/gltf-binary',
      })
      .expect(400);
  });
});
