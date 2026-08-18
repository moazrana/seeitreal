import { randomBytes } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import type {
  PutObjectParams,
  StorageProvider,
} from './storage-provider.interface';

export const STORAGE_PROVIDER = Symbol('STORAGE_PROVIDER');

@Injectable()
export class StorageService {
  constructor(
    @Inject(STORAGE_PROVIDER) private readonly provider: StorageProvider,
  ) {}

  async putObject(
    params: PutObjectParams,
  ): Promise<{ key: string; url: string }> {
    await this.provider.putObject(params);
    return { key: params.key, url: this.provider.getPublicUrl(params.key) };
  }

  deleteObject(key: string): Promise<void> {
    return this.provider.deleteObject(key);
  }

  getPublicUrl(key: string): string {
    return this.provider.getPublicUrl(key);
  }

  /** Server-generated random key — never derived from user input (spec §7.5). */
  generateKey(prefix: string, extension: string): string {
    const random = randomBytes(24).toString('hex');
    return `${prefix}/${random}.${extension}`;
  }
}
