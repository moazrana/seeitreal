import { access, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { LocalDiskStorageProvider } from './local-disk-storage.provider';

describe('LocalDiskStorageProvider (real filesystem, no mocking)', () => {
  let provider: LocalDiskStorageProvider;
  let rootDir: string;

  beforeEach(async () => {
    rootDir = join(
      tmpdir(),
      `ar-menu-storage-test-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    );

    const moduleRef = await Test.createTestingModule({
      providers: [
        LocalDiskStorageProvider,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn(
              (key: string) =>
                ({
                  LOCAL_STORAGE_DIR: rootDir,
                  API_BASE_URL: 'http://localhost:3000',
                })[key],
            ),
          },
        },
      ],
    }).compile();

    provider = moduleRef.get(LocalDiskStorageProvider);
  });

  afterEach(async () => {
    await rm(rootDir, { recursive: true, force: true });
  });

  it('writes and reads back a real file with restrictive permissions', async () => {
    const body = Buffer.from('hello world');
    await provider.putObject({
      key: 'menu-item-photo/abc.webp',
      body,
      contentType: 'image/webp',
    });

    const filePath = provider.resolveKeyPath('menu-item-photo/abc.webp');
    expect(await readFile(filePath)).toEqual(body);

    // No execute bit for owner/group/other (spec §7.5).
    const mode = (await stat(filePath)).mode & 0o777;
    expect(mode & 0o111).toBe(0);
  });

  it('builds the public URL under /api/uploads', () => {
    expect(provider.getPublicUrl('menu-item-photo/abc.webp')).toBe(
      'http://localhost:3000/api/uploads/menu-item-photo/abc.webp',
    );
  });

  it('refuses to resolve a key that attempts path traversal', () => {
    expect(() => provider.resolveKeyPath('../../etc/passwd')).toThrow();
  });

  it('deleteObject removes a previously written file', async () => {
    await provider.putObject({
      key: 'menu-item-photo/to-delete.webp',
      body: Buffer.from('x'),
      contentType: 'image/webp',
    });
    const filePath = provider.resolveKeyPath('menu-item-photo/to-delete.webp');
    await expect(access(filePath)).resolves.toBeUndefined();

    await provider.deleteObject('menu-item-photo/to-delete.webp');
    await expect(access(filePath)).rejects.toThrow();
  });
});
