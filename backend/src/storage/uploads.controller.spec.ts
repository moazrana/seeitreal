import { NotFoundException } from '@nestjs/common';
import { StorageDriver } from '../config/env.validation';
import type { LocalDiskStorageProvider } from './providers/local-disk-storage.provider';
import { UploadsController } from './uploads.controller';

describe('UploadsController — only platform-generated keys are servable', () => {
  const resolveKeyPath = jest.fn<string, [string]>(() => {
    throw new Error('should not be reached');
  });
  const controller = new UploadsController(
    { get: () => StorageDriver.Local } as never,
    { resolveKeyPath } as unknown as LocalDiskStorageProvider,
  );
  const res = { setHeader: jest.fn() } as never;
  const hex = 'a'.repeat(48);

  beforeEach(() => resolveKeyPath.mockClear());

  it.each([
    ['.', '.env'],
    ['%2e', '.env'],
    ['src', 'main.ts'],
    ['prisma', 'schema.prisma'],
    ['dist', 'main.js'],
    ['model-glb', '.env'],
    ['model-glb', `${hex}.ts`],
    ['model-glb', `${hex.slice(1)}.glb`],
    ['model-glb', `../${hex}.glb`],
    ['unknown-prefix', `${hex}.glb`],
  ])(
    '404s /uploads/%s/%s without touching the filesystem',
    (prefix, filename) => {
      expect(() => controller.getObject(prefix, filename, res)).toThrow(
        NotFoundException,
      );
      expect(resolveKeyPath).not.toHaveBeenCalled();
    },
  );

  it('passes a well-formed key on to path resolution', () => {
    resolveKeyPath.mockReturnValueOnce('/nonexistent/path.glb');

    // Not on disk -> 404, but only after the key shape was accepted.
    expect(() => controller.getObject('model-glb', `${hex}.glb`, res)).toThrow(
      NotFoundException,
    );
    expect(resolveKeyPath).toHaveBeenCalledWith(`model-glb/${hex}.glb`);
  });
});
