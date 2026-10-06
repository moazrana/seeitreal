import { randomUUID } from 'node:crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { createCuisineType } from './helpers/cuisine-type';

/**
 * mango points 2 over the real HTTP stack + DB: multiple restaurants per
 * owner, duplicate cuisine-type/dish rejection (case-insensitive), QR scan
 * counting with de-duplication, the dashboard overview, and that none of
 * it leaks across tenants.
 */
describe('Dashboard, duplicates and scans (e2e)', () => {
  let app: INestApplication<App>;
  let token: string;
  let firstSlug: string;
  let categoryId: number;

  const http = () => request(app.getHttpServer());

  async function signup(businessName: string) {
    const res = await http()
      .post('/api/auth/signup')
      .send({
        email: `${randomUUID()}@example.com`,
        password: 'CorrectHorse123',
        confirmPassword: 'CorrectHorse123',
        businessName,
        address: '1 Dashboard Test Street',
      })
      .expect(201);
    return {
      token: res.body.accessToken as string,
      slug: res.body.restaurant.slug as string,
    };
  }

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
    ({ token, slug: firstSlug } = await signup('Dashboard Test Grill'));
    categoryId = await createCuisineType(app.getHttpServer(), token, firstSlug);
  });

  afterAll(async () => {
    await app.close();
  });

  it('lets one owner run several restaurants', async () => {
    await http()
      .post('/api/restaurants')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'Second Branch',
        slug: `second-${randomUUID().slice(0, 8)}`,
        address: '2 Branch Road',
      })
      .expect(201);

    const list = await http()
      .get('/api/restaurants')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(list.body).toHaveLength(2);
  });

  it('rejects a duplicate cuisine type, case-insensitively and ignoring surrounding spaces', async () => {
    const url = `/api/restaurants/${firstSlug}/categories`;
    await http()
      .post(url)
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'BBQ' })
      .expect(201);
    await http()
      .post(url)
      .set('Authorization', `Bearer ${token}`)
      .send({ name: '  bbq ' })
      .expect(409);
  });

  it('rejects a duplicate dish name in the same restaurant', async () => {
    const url = `/api/restaurants/${firstSlug}/items`;
    await http()
      .post(url)
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Seekh Kabab', categoryId })
      .expect(201);
    await http()
      .post(url)
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'seekh kabab', categoryId })
      .expect(409);
  });

  it('requires a cuisine type on every dish and keeps one in use from being deleted', async () => {
    await http()
      .post(`/api/restaurants/${firstSlug}/items`)
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'No Cuisine Dish' })
      .expect(400);

    const item = await http()
      .post(`/api/restaurants/${firstSlug}/items`)
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Mutton Pulao', categoryId })
      .expect(201);
    await http()
      .patch(
        `/api/restaurants/${firstSlug}/items/${item.body.publicSlug as string}`,
      )
      .set('Authorization', `Bearer ${token}`)
      .send({ categoryId: null })
      .expect(400);
    await http()
      .delete(`/api/restaurants/${firstSlug}/categories/${categoryId}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(409);
  });

  it('accepts inch-range dimensions up to 20" and rejects anything larger', async () => {
    const url = `/api/restaurants/${firstSlug}/items`;
    await http()
      .post(url)
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Big Platter', widthMm: 508, categoryId })
      .expect(201);
    await http()
      .post(url)
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Too Big', widthMm: 509, categoryId })
      .expect(400);
  });

  it('counts dish page opens as scans, de-duplicated per visitor, and reports them on the dashboard', async () => {
    const item = await http()
      .post(`/api/restaurants/${firstSlug}/items`)
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Chicken Karahi', categoryId })
      .expect(201);
    const publicSlug = item.body.publicSlug as string;

    // Same visitor opens it three times -> one scan.
    for (let i = 0; i < 3; i++) {
      await http().get(`/api/m/${publicSlug}`).expect(200);
    }

    const scans = await http()
      .get(`/api/restaurants/${firstSlug}/analytics/items`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(scans.body).toEqual([{ itemId: item.body.id as number, scans: 1 }]);

    const overview = await http()
      .get('/api/dashboard/overview')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const first = (
      overview.body.restaurants as {
        slug: string;
        scans: number;
        dishes: number;
        topDishes: { name: string }[];
      }[]
    ).find((r) => r.slug === firstSlug);
    expect(first).toMatchObject({ scans: 1, dishes: 4 });
    expect(first?.topDishes[0].name).toBe('Chicken Karahi');
    expect(overview.body.totals.restaurants).toBe(2);
  });

  it("never exposes one owner's restaurants or scan counts to another owner", async () => {
    const other = await signup('Someone Else Cafe');

    await http()
      .get(`/api/restaurants/${firstSlug}/analytics/items`)
      .set('Authorization', `Bearer ${other.token}`)
      .expect(404);

    const overview = await http()
      .get('/api/dashboard/overview')
      .set('Authorization', `Bearer ${other.token}`)
      .expect(200);
    expect(overview.body.totals.restaurants).toBe(1);
    expect(
      (overview.body.restaurants as { slug: string }[]).map((r) => r.slug),
    ).toEqual([other.slug]);
  });

  it('requires authentication for the dashboard', async () => {
    await http().get('/api/dashboard/overview').expect(401);
  });
});
