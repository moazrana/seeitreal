import { BadRequestException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { StorageService } from '../storage/storage.service';
import { GlbUploadService } from './glb-upload.service';

function makeMulterFile(
  overrides: Partial<Express.Multer.File> & { buffer: Buffer },
): Express.Multer.File {
  return {
    fieldname: 'file',
    originalname: 'model.glb',
    encoding: '7bit',
    mimetype: 'model/gltf-binary',
    size: overrides.buffer.length,
    stream: undefined as never,
    destination: '',
    filename: '',
    path: '',
    ...overrides,
  };
}

/** Builds a minimal-but-genuine GLB binary: a 12-byte header (magic,
 * version 2, total length) followed by an empty JSON chunk — enough to
 * satisfy GlbUploadService's header checks without needing a real mesh. */
function makeGlbBuffer(
  overrides: { length?: number; magic?: number; version?: number } = {},
): Buffer {
  const jsonChunkContent = Buffer.from('{}');
  // Pad to a 4-byte boundary per the glTF chunk-alignment rule, with spaces
  // (the spec's prescribed padding byte for JSON chunks).
  const pad = (4 - (jsonChunkContent.length % 4)) % 4;
  const jsonChunkData = Buffer.concat([
    jsonChunkContent,
    Buffer.alloc(pad, 0x20),
  ]);

  const chunkHeader = Buffer.alloc(8);
  chunkHeader.writeUInt32LE(jsonChunkData.length, 0);
  chunkHeader.writeUInt32LE(0x4e4f534a, 4); // "JSON"

  const header = Buffer.alloc(12);
  header.writeUInt32LE(overrides.magic ?? 0x46546c67, 0); // "glTF"
  header.writeUInt32LE(overrides.version ?? 2, 4);
  const body = Buffer.concat([header, chunkHeader, jsonChunkData]);
  const totalLength = overrides.length ?? body.length;
  body.writeUInt32LE(totalLength, 8);
  return body;
}

describe('GlbUploadService (real binary-header verification — no mocking of the security-critical path)', () => {
  let service: GlbUploadService;
  let storage: { generateKey: jest.Mock; putObject: jest.Mock };

  beforeEach(async () => {
    storage = {
      generateKey: jest.fn().mockReturnValue('model-glb-manual/deadbeef.glb'),
      putObject: jest.fn().mockResolvedValue({
        key: 'model-glb-manual/deadbeef.glb',
        url: 'http://localhost/api/uploads/model-glb-manual/deadbeef.glb',
      }),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        GlbUploadService,
        { provide: StorageService, useValue: storage },
      ],
    }).compile();

    service = moduleRef.get(GlbUploadService);
  });

  it('accepts a genuine, well-formed GLB and stores it under a random key', async () => {
    const file = makeMulterFile({ buffer: makeGlbBuffer() });

    const result = await service.validateAndStore(file, 'model-glb-manual');

    expect(result.url).toContain('model-glb-manual');
    expect(storage.putObject).toHaveBeenCalledWith(
      expect.objectContaining({ contentType: 'model/gltf-binary' }),
    );
  });

  it('rejects a disallowed claimed MIME type before even touching the bytes', async () => {
    const file = makeMulterFile({
      buffer: makeGlbBuffer(),
      mimetype: 'text/html',
    });

    await expect(
      service.validateAndStore(file, 'model-glb-manual'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects a disallowed extension even with an allowed MIME type', async () => {
    const file = makeMulterFile({
      buffer: makeGlbBuffer(),
      originalname: 'payload.php',
    });

    await expect(
      service.validateAndStore(file, 'model-glb-manual'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects a file whose bytes do not start with the GLB magic bytes, regardless of claimed mimetype/extension', async () => {
    const file = makeMulterFile({
      buffer: Buffer.from(
        'this is definitely not a glb, just text pretending to be one',
      ),
    });

    await expect(
      service.validateAndStore(file, 'model-glb-manual'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects an unsupported GLB version', async () => {
    const file = makeMulterFile({ buffer: makeGlbBuffer({ version: 1 }) });

    await expect(
      service.validateAndStore(file, 'model-glb-manual'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects a file whose declared length does not match its actual size (corrupt/polyglot)', async () => {
    const file = makeMulterFile({ buffer: makeGlbBuffer({ length: 99999 }) });

    await expect(
      service.validateAndStore(file, 'model-glb-manual'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects a file too small to contain a GLB header', async () => {
    const file = makeMulterFile({ buffer: Buffer.from([0x67, 0x6c, 0x54]) });

    await expect(
      service.validateAndStore(file, 'model-glb-manual'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
