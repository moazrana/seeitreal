import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const config = app.get(ConfigService);

  // Only when genuinely behind a trusted reverse proxy (nginx) — otherwise
  // req.ip would trust a client-supplied X-Forwarded-For header, letting
  // any caller spoof their IP. Needed for IpAllowlistGuard (Root App) to
  // see real client IPs once deployed; safe to leave off in dev/direct
  // deployments (default false — see env.validation.ts).
  if (config.get<boolean>('TRUST_PROXY')) {
    (
      app.getHttpAdapter().getInstance() as {
        set: (key: string, value: unknown) => void;
      }
    ).set('trust proxy', 1);
  }

  // Security headers (spec §7.6).
  app.use(helmet());
  // Refresh token is delivered as an httpOnly cookie (spec §7.3, §7.6).
  app.use(cookieParser());

  // Explicit CORS allow-list — never "*" on authenticated endpoints.
  const allowedOrigins = (config.get<string>('CORS_ALLOWED_ORIGINS') ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
  app.enableCors({
    origin: allowedOrigins,
    credentials: true,
  });

  // Server is the source of truth for validation (spec §7.2): reject
  // unknown fields instead of silently stripping and continuing.
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  // Never leak stack traces / SQL errors to clients (spec §7.7).
  app.useGlobalFilters(new AllExceptionsFilter());

  app.setGlobalPrefix('api');

  const port = config.get<number>('PORT') ?? 3000;
  await app.listen(port);
}

bootstrap().catch((err) => {
  console.error('Fatal error during bootstrap:', err);
  process.exit(1);
});
