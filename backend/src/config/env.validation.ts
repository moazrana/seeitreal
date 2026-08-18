import { plainToInstance, Type } from 'class-transformer';
import {
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

  // --- GLB -> USDZ conversion — optional at boot, same reasoning as the
  // Tripo vars above; UsdzConversionService falls back to the conventional
  // /opt/usdz-tools install path (see backend README) if unset.
  @IsOptional()
  @IsString()
  USDZ_PYTHON_BIN?: string;

  @IsOptional()
  @IsString()
  USDZ_CONVERTER_SCRIPT?: string;
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
