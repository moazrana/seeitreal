import { randomUUID } from 'node:crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * Public contact endpoint (documents/TASK-home-page-content.md §5) over the
 * real HTTP stack + DB: validation, honeypot, storage, and the strict
 * per-IP rate limit. Email delivery isn't configured in tests, so
 * enquiries are stored as not_configured and no external call is made.
 */
describe('Contact form (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  const http = () => request(app.getHttpServer());
  const valid = () => ({
    name: 'Ayesha Khan',
    email: 'ayesha@example.com',
    businessName: 'Karachi Grill',
    message: `Please photograph our menu. Ref ${randomUUID()}`,
  });

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

  // Requests below are counted against the 5-per-10-minutes limit, in order.
  it('accepts a valid enquiry and stores it (1/5)', async () => {
    const body = valid();
    await http()
      .post('/api/contact')
      .send(body)
      .expect(202, { received: true });

    const stored = await prisma.contactEnquiry.findFirst({
      where: { message: body.message },
    });
    expect(stored).toMatchObject({
      name: 'Ayesha Khan',
      emailStatus: 'not_configured',
    });
    expect(stored?.ipHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('rejects invalid input: bad email, line breaks in the name, short message (2-3/5)', async () => {
    await http()
      .post('/api/contact')
      .send({ ...valid(), email: 'not-an-email' })
      .expect(400);
    await http()
      .post('/api/contact')
      .send({
        ...valid(),
        name: 'Eve\r\nBcc: victim@example.com',
        message: 'hi',
      })
      .expect(400);
  });

  it('rejects unknown fields (4/5)', async () => {
    await http()
      .post('/api/contact')
      .send({ ...valid(), isAdmin: true })
      .expect(400);
  });

  it('silently accepts but discards a honeypot submission (5/5)', async () => {
    const body = { ...valid(), website: 'http://spam.example' };
    await http().post('/api/contact').send(body).expect(202);

    expect(
      await prisma.contactEnquiry.findFirst({
        where: { message: body.message },
      }),
    ).toBeNull();
  });

  it('rate-limits a 6th submission within 10 minutes with 429', async () => {
    await http().post('/api/contact').send(valid()).expect(429);
  });
});
