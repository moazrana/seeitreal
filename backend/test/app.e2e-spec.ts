import { randomUUID } from 'node:crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { createCuisineType } from './helpers/cuisine-type';

/**
 * Happy-path e2e per spec §8/§12: signup → create restaurant → add item.
 * (AR model generation and diner-facing AR view are separate build-order
 * steps — see spec §9 — and aren't covered here yet.)
 *
 * Requires a reachable test database — see docker-compose.yml at the repo
 * root and backend/README section on running tests.
 */
describe('Signup -> restaurant -> menu item (e2e)', () => {
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
        transformOptions: { enableImplicitConversion: true },
      }),
    );
    app.setGlobalPrefix('api');
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('lets a new owner sign up, create a restaurant, and add a menu item', async () => {
    const email = `${randomUUID()}@example.com`;
    const password = 'CorrectHorse123';

    const signupRes = await request(app.getHttpServer())
      .post('/api/auth/signup')
      .send({
        email,
        password,
        confirmPassword: password,
        businessName: 'E2E Test Diner',
        address: '1 E2E Test Street',
      })
      .expect(201);

    const accessToken = signupRes.body.accessToken as string;
    expect(accessToken).toEqual(expect.any(String));
    expect(signupRes.body.user.email).toBe(email);

    const restaurantId = signupRes.body.restaurant.id as number;
    const restaurantSlug = signupRes.body.restaurant.slug as string;

    const categoryId = await createCuisineType(
      app.getHttpServer(),
      accessToken,
      restaurantSlug,
    );
    const itemRes = await request(app.getHttpServer())
      .post(`/api/restaurants/${restaurantSlug}/items`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ name: 'Cheeseburger', categoryId })
      .expect(201);

    expect(itemRes.body).toMatchObject({
      name: 'Cheeseburger',
      categoryId,
      arStatus: 'pending',
      restaurantId,
    });

    const listRes = await request(app.getHttpServer())
      .get(`/api/restaurants/${restaurantSlug}/items`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(listRes.body).toHaveLength(1);
  });

  it("never lets one owner read another owner's restaurant", async () => {
    const ownerA = {
      email: `${randomUUID()}@example.com`,
      password: 'CorrectHorse123',
      confirmPassword: 'CorrectHorse123',
      businessName: 'Owner A Restaurant',
      address: '1 Owner A Street',
    };
    const ownerB = {
      email: `${randomUUID()}@example.com`,
      password: 'CorrectHorse123',
      confirmPassword: 'CorrectHorse123',
      businessName: 'Owner B Restaurant',
      address: '1 Owner B Street',
    };

    const aSignup = await request(app.getHttpServer())
      .post('/api/auth/signup')
      .send(ownerA)
      .expect(201);
    const bSignup = await request(app.getHttpServer())
      .post('/api/auth/signup')
      .send(ownerB)
      .expect(201);

    await request(app.getHttpServer())
      .get(`/api/restaurants/${aSignup.body.restaurant.slug}`)
      .set('Authorization', `Bearer ${bSignup.body.accessToken}`)
      .expect(404);
  });
});
