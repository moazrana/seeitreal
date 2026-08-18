import { randomUUID } from 'node:crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * The diner-facing public AR page — no auth, reachable by MenuItem's
 * public_slug (spec §9 build order step 3). Covers the real HTTP surface:
 * live vs. not-yet-ready rendering, 404 for unknown slugs, and that
 * owner-supplied text can't break out of the HTML (XSS) over the actual
 * request/response path, not just the template function in isolation.
 */
describe('Diner AR viewer (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let accessToken: string;
  let restaurantId: number;

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

    const email = `${randomUUID()}@example.com`;
    const signupRes = await request(app.getHttpServer())
      .post('/api/auth/signup')
      .send({ email, password: 'CorrectHorse123' })
      .expect(201);
    accessToken = signupRes.body.accessToken as string;

    const restaurantRes = await request(app.getHttpServer())
      .post('/api/restaurants')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        name: 'AR Viewer Test Diner',
        slug: `ar-viewer-test-${Date.now()}`,
      })
      .expect(201);
    restaurantId = restaurantRes.body.id as number;
  });

  afterAll(async () => {
    await app.close();
  });

  async function createItem(name: string, description?: string) {
    const res = await request(app.getHttpServer())
      .post(`/api/restaurants/${restaurantId}/items`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ name, price: 9.99, description })
      .expect(201);
    return res.body as { id: number; publicSlug: string };
  }

  it('serves the model-viewer page for a live item with both model files', async () => {
    const item = await createItem('Live Cheeseburger');
    await prisma.menuItem.update({
      where: { id: item.id },
      data: {
        arStatus: 'live',
        modelGlbUrl: 'https://cdn.example/model.glb',
        modelUsdzUrl: 'https://cdn.example/model.usdz',
      },
    });

    const res = await request(app.getHttpServer())
      .get(`/api/m/${item.publicSlug}`)
      .expect(200);

    expect(res.headers['content-type']).toContain('text/html');
    expect(res.text).toContain('<model-viewer');
    expect(res.text).toContain('https://cdn.example/model.glb');
    expect(res.text).toContain('Live Cheeseburger');
    // model-viewer needs relaxed CSP (blob:/data:, wasm-unsafe-eval for its
    // Draco/KTX2 decoder) — scoped to this route only.
    expect(res.headers['content-security-policy']).toContain('blob:');
    expect(res.headers['content-security-policy']).toContain(
      'wasm-unsafe-eval',
    );
  });

  it('shows a "coming soon" notice, not a broken model-viewer, for a pending item', async () => {
    const item = await createItem('Pending Pizza');

    const res = await request(app.getHttpServer())
      .get(`/api/m/${item.publicSlug}`)
      .expect(200);

    expect(res.text).not.toContain('<model-viewer');
    expect(res.text).toContain('still being prepared');
  });

  it('returns 404 with a generic not-found page for an unknown slug', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/m/no-such-dish-xyz')
      .expect(404);
    expect(res.text).toContain('Dish not found');
  });

  it('escapes a malicious item name over the real HTTP response (stored XSS)', async () => {
    const item = await createItem(
      '<script>alert(document.cookie)</script>',
      '"><img src=x onerror=alert(1)>',
    );

    const res = await request(app.getHttpServer())
      .get(`/api/m/${item.publicSlug}`)
      .expect(200);

    expect(res.text).not.toContain('<script>alert(document.cookie)</script>');
    expect(res.text).not.toContain('<img src=x onerror=alert(1)>');
    expect(res.text).toContain('&lt;script&gt;');
  });

  it('serves the self-hosted model-viewer script with a long cache lifetime', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/vendor/model-viewer.min.js')
      .expect(200);
    expect(res.headers['content-type']).toContain('javascript');
    expect(res.headers['cache-control']).toContain('immutable');
    expect(res.text.length).toBeGreaterThan(1000);
  });

  it('never requires auth for the public page (no Authorization header sent)', async () => {
    const item = await createItem('No Auth Needed Nachos');
    await request(app.getHttpServer())
      .get(`/api/m/${item.publicSlug}`)
      .expect(200);
  });
});
