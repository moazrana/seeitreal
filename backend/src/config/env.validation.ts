import { plainToInstance, Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
  MinLength,
  ValidateIf,
  validateSync,
} from 'class-validator';

enum NodeEnv {
  Development = 'development',
  Test = 'test',
  Production = 'production',
}

export enum StorageDriver {
  Local = 'local',
  S3 = 's3',
}

/**
 * Every required secret/config value the app needs to boot safely.
 * Anything missing or malformed here fails startup immediately (spec §7.1)
 * — we never want to come up half-configured (e.g. with no JWT secret and
 * a fallback default) in any environment, including local dev.
 */
class EnvironmentVariables {
  @IsEnum(NodeEnv)
  NODE_ENV: NodeEnv = NodeEnv.Development;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(65535)
  PORT = 3000;

  @IsString()
  @MinLength(1)
  API_BASE_URL!: string;

  @IsString()
  @MinLength(1)
  CORS_ALLOWED_ORIGINS!: string;

  @IsString()
  @MinLength(1)
  DATABASE_URL!: string;

  @IsString()
  @MinLength(32, {
    message: 'JWT_ACCESS_SECRET must be at least 32 characters',
  })
  JWT_ACCESS_SECRET!: string;

  @IsString()
  @MinLength(1)
  JWT_ACCESS_EXPIRES_IN = '15m';

  @IsString()
  @MinLength(32, {
    message: 'JWT_REFRESH_SECRET must be at least 32 characters',
  })
  JWT_REFRESH_SECRET!: string;

  @IsString()
  @MinLength(1)
  JWT_REFRESH_EXPIRES_IN = '7d';

  @IsString()
  @MinLength(16, { message: 'IP_HASH_SALT must be at least 16 characters' })
  IP_HASH_SALT!: string;

  // --- Storage (uploads + AR models) ---
  @IsEnum(StorageDriver)
  STORAGE_DRIVER: StorageDriver = StorageDriver.Local;

  @IsOptional()
  @IsString()
  LOCAL_STORAGE_DIR?: string;

  // Required only when STORAGE_DRIVER=s3 — validated conditionally so
  // local dev never needs real object-storage credentials.
  @ValidateIf(
    (o: EnvironmentVariables) => o.STORAGE_DRIVER === StorageDriver.S3,
  )
  @IsString()
  @MinLength(1)
  STORAGE_ENDPOINT?: string;

  @ValidateIf(
    (o: EnvironmentVariables) => o.STORAGE_DRIVER === StorageDriver.S3,
  )
  @IsString()
  @MinLength(1)
  STORAGE_REGION?: string;

  @ValidateIf(
    (o: EnvironmentVariables) => o.STORAGE_DRIVER === StorageDriver.S3,
  )
  @IsString()
  @MinLength(1)
  STORAGE_BUCKET?: string;

  @ValidateIf(
    (o: EnvironmentVariables) => o.STORAGE_DRIVER === StorageDriver.S3,
  )
  @IsString()
  @MinLength(1)
  STORAGE_ACCESS_KEY_ID?: string;

  @ValidateIf(
    (o: EnvironmentVariables) => o.STORAGE_DRIVER === StorageDriver.S3,
  )
  @IsString()
  @MinLength(1)
  STORAGE_SECRET_ACCESS_KEY?: string;

  @ValidateIf(
    (o: EnvironmentVariables) => o.STORAGE_DRIVER === StorageDriver.S3,
  )
  @IsString()
  @MinLength(1)
  STORAGE_PUBLIC_BASE_URL?: string;

  // --- 3D generation (Tripo) — optional at boot; TripoService fails loudly
  // at call time (not startup) if unset, since not every deployment needs
  // it wired up immediately.
  @IsOptional()
  @IsString()
  TRIPO_API_KEY?: string;

  @IsOptional()
  @IsString()
  TRIPO_WEBHOOK_SECRET?: string;

  @IsOptional()
  @IsString()
  TRIPO_MODEL_VERSION?: string;

  // Highest-quality texture option (documents/3d-model-enhancement.md §2) —
  // configurable so it can be tuned without a code change. Defaults to
  // 'detailed' in TripoGenerationService if unset.
  @IsOptional()
  @IsString()
  TRIPO_TEXTURE_QUALITY?: string;

  // Image-based lighting for the diner AR viewer's <model-viewer>
  // (documents/3d-model-enhancement.md §3) — a warm kitchen/restaurant HDR
  // hosted on object storage gives the most realistic result; the literal
  // string "neutral" (model-viewer's built-in studio IBL) is the safe
  // baseline used when unset, per the doc's own fallback guidance.
  @IsOptional()
  @IsString()
  AR_ENVIRONMENT_IMAGE_URL?: string;

  // --- GLB -> USDZ conversion — optional at boot, same reasoning as the
  // Tripo vars above; UsdzConversionService falls back to the conventional
  // /opt/usdz-tools install path (see backend README) if unset.
  @IsOptional()
  @IsString()
  USDZ_PYTHON_BIN?: string;

  @IsOptional()
  @IsString()
  USDZ_CONVERTER_SCRIPT?: string;

  // --- Root App (rootApp/ROOT-APP-Implementation-Spec.md §5) — a fully
  // separate secret/session set from the customer app's JWT_* above, so a
  // leaked customer secret can never forge a root-admin session or vice
  // versa.
  @IsString()
  @MinLength(32, {
    message: 'ROOT_JWT_ACCESS_SECRET must be at least 32 characters',
  })
  ROOT_JWT_ACCESS_SECRET!: string;

  @IsString()
  @MinLength(1)
  ROOT_JWT_ACCESS_EXPIRES_IN = '10m';

  @IsString()
  @MinLength(32, {
    message: 'ROOT_JWT_REFRESH_SECRET must be at least 32 characters',
  })
  ROOT_JWT_REFRESH_SECRET!: string;

  // Shorter-lived than the customer app's 7d default (spec §5: "short-lived
  // sessions").
  @IsString()
  @MinLength(1)
  ROOT_JWT_REFRESH_EXPIRES_IN = '12h';

  // Key TOTP secrets are encrypted with at rest (see root/auth/totp.service.ts).
  @IsString()
  @MinLength(32, {
    message: 'ROOT_TOTP_ENCRYPTION_KEY must be at least 32 characters',
  })
  ROOT_TOTP_ENCRYPTION_KEY!: string;

  // Comma-separated IPs/CIDRs. Optional at boot (empty = allow all, with a
  // loud runtime warning — see IpAllowlistGuard) so local dev isn't locked
  // out by default; must be set before exposing the Root App publicly.
  @IsOptional()
  @IsString()
  ROOT_APP_IP_ALLOWLIST?: string;

  // Only enable once genuinely behind a trusted reverse proxy (nginx) —
  // see main.ts. Left false by default so req.ip can't be spoofed via a
  // forged X-Forwarded-For header in any environment that isn't actually
  // behind one. Deliberately NOT @Type(() => Boolean) — class-transformer's
  // Boolean() coercion treats the string "false" as truthy (a classic
  // gotcha), so this parses explicitly instead.
  @IsOptional()
  @Transform(
    ({ value }: { value: unknown }) => value === 'true' || value === true,
  )
  @IsBoolean()
  TRUST_PROXY = false;
}

export function validateEnv(
  config: Record<string, unknown>,
): EnvironmentVariables {
  const validated = plainToInstance(EnvironmentVariables, config, {
    enableImplicitConversion: true,
  });
  const errors = validateSync(validated, { skipMissingProperties: false });

  if (errors.length > 0) {
    // Fail fast and loud. Messages only ever reference field/constraint
    // names — never the offending value — so a misconfigured secret is
    // never echoed into logs.
    const formatted = errors
      .map(
        (e) =>
          `${e.property}: ${Object.values(e.constraints ?? {}).join(', ')}`,
      )
      .join('; ');
    throw new Error(`Invalid environment configuration — ${formatted}`);
  }

  return validated;
}
