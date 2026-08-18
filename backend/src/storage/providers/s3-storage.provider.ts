import {
  DeleteObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type {
  PutObjectParams,
  StorageProvider,
} from '../storage-provider.interface';

/**
 * S3-compatible object storage (Cloudflare R2, or real S3) — the
 * production provider. Requires STORAGE_ENDPOINT/REGION/BUCKET/
 * ACCESS_KEY_ID/SECRET_ACCESS_KEY/PUBLIC_BASE_URL (spec §7.1: all secrets
 * from env, never hardcoded).
 *
 * Deliberately lazy: config is validated and the S3Client built on first
 * use, not in the constructor. Nest instantiates every provider listed in
 * a module eagerly regardless of which one StorageModule's factory ends
 * up selecting — validating eagerly here would make the app refuse to
 * boot with STORAGE_DRIVER=local whenever S3 env vars are simply unset,
 * which defeats the point of having a local dev driver at all.
 *
 * NOTE: this targets the documented AWS SDK v3 `@aws-sdk/client-s3` API,
 * which R2 is wire-compatible with — it has not been exercised against a
 * real bucket in development (no credentials available in this
 * environment). Verify against a real R2/S3 bucket before relying on it
 * in production.
 */
@Injectable()
export class S3StorageProvider implements StorageProvider {
  private readonly logger = new Logger(S3StorageProvider.name);
  private client?: S3Client;
  private bucket?: string;
  private publicBaseUrl?: string;

  constructor(private readonly config: ConfigService) {}

  async putObject({ key, body, contentType }: PutObjectParams): Promise<void> {
    const { client, bucket } = this.getClient();
    await client.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
      }),
    );
    this.logger.debug(`Uploaded object ${key} (${body.length} bytes)`);
  }

  async deleteObject(key: string): Promise<void> {
    const { client, bucket } = this.getClient();
    await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
  }

  getPublicUrl(key: string): string {
    this.getClient(); // ensures config is validated even for URL-only use
    return `${this.publicBaseUrl}/${key}`;
  }

  private getClient(): { client: S3Client; bucket: string } {
    if (!this.client || !this.bucket) {
      const endpoint = this.require('STORAGE_ENDPOINT');
      const region = this.require('STORAGE_REGION');
      this.bucket = this.require('STORAGE_BUCKET');
      this.publicBaseUrl = this.require('STORAGE_PUBLIC_BASE_URL').replace(
        /\/+$/,
        '',
      );
      this.client = new S3Client({
        endpoint,
        region,
        credentials: {
          accessKeyId: this.require('STORAGE_ACCESS_KEY_ID'),
          secretAccessKey: this.require('STORAGE_SECRET_ACCESS_KEY'),
        },
      });
    }
    return { client: this.client, bucket: this.bucket };
  }

  private require(key: string): string {
    const value = this.config.get<string>(key);
    if (!value) {
      throw new Error(
        `${key} is required when STORAGE_DRIVER=s3 but was not set`,
      );
    }
    return value;
  }
}
