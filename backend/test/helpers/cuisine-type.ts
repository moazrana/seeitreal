import request from 'supertest';
import type { App } from 'supertest/types';

/** Every dish needs a cuisine type — creates one and returns its id. */
export async function createCuisineType(
  server: App,
  accessToken: string,
  restaurantSlug: string,
  name = 'Mains',
): Promise<number> {
  const res = await request(server)
    .post(`/api/restaurants/${restaurantSlug}/categories`)
    .set('Authorization', `Bearer ${accessToken}`)
    .send({ name })
    .expect(201);
  return res.body.id as number;
}
