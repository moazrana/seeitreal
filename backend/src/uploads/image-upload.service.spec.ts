import { BadRequestException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import sharp from 'sharp';
import { StorageService } from '../storage/storage.service';
import { ImageUploadService } from './image-upload.service';
import { MAX_IMAGE_DIMENSION_PX } from './image-upload.constants';

function makeMulterFile(
  overrides: Partial<Express.Multer.File> & { buffer: Buffer },
): Express.Multer.File {
  return {
    fieldname: 'file',
    originalname: 'photo.jpg',
    encoding: '7bit',
    mimetype: 'image/jpeg',
    size: overrides.buffer.length,
    stream: undefined as never,
    destination: '',
    filename: '',
    path: '',
    ...overrides,
  };
}

describe('ImageUploadService (real sharp decode — no mocking of the security-critical path)', () => {
  let service: ImageUploadService;
  let storage: { generateKey: jest.Mock; putObject: jest.Mock };

  beforeEach(async () => {
    storage = {
      generateKey: jest.fn().mockReturnValue('menu-item-photo/deadbeef.webp'),
      putObject: jest.fn().mockResolvedValue({
        key: 'menu-item-photo/deadbeef.webp',
        url: 'http://localhost/api/uploads/menu-item-photo/deadbeef.webp',
      }),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        ImageUploadService,
        { provide: StorageService, useValue: storage },
      ],
    }).compile();

    service = moduleRef.get(ImageUploadService);
  });

  it('accepts a genuine small JPEG and stores it re-encoded as webp', async () => {
    const buffer = await sharp({
      create: {
        width: 100,
        height: 80,
        channels: 3,
        background: { r: 200, g: 50, b: 50 },
      },
    })
      .jpeg()
      .toBuffer();
    const file = makeMulterFile({
      buffer,
      originalname: 'dish.jpg',
      mimetype: 'image/jpeg',
    });

    const result = await service.processAndStore(file, 'menu-item-photo');

    expect(result.url).toContain('menu-item-photo');
    expect(storage.putObject).toHaveBeenCalledWith(
      expect.objectContaining({ contentType: 'image/webp' }),
    );
    // Re-encoded bytes actually decode as a valid webp image of the same
    // dimensions — proves this isn't just passing the original bytes through.
    const storedBuffer = storage.putObject.mock.calls[0][0].body as Buffer;
    const storedMeta = await sharp(storedBuffer).metadata();
    expect(storedMeta.format).toBe('webp');
    expect(storedMeta.width).toBe(100);
    expect(storedMeta.height).toBe(80);
  });

  it('rejects a file whose bytes are not a real image, regardless of claimed mimetype/extension', async () => {
    const file = makeMulterFile({
      buffer: Buffer.from(
        'this is definitely not image data, just text pretending to be one',
      ),
      originalname: 'fake.jpg',
      mimetype: 'image/jpeg',
    });

    await expect(
      service.processAndStore(file, 'menu-item-photo'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects a disallowed claimed MIME type before even touching the bytes', async () => {
    const file = makeMulterFile({
      buffer: Buffer.from('irrelevant'),
      originalname: 'script.svg',
      mimetype: 'image/svg+xml',
    });

    await expect(
      service.processAndStore(file, 'menu-item-photo'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects a disallowed extension even with an allowed MIME type', async () => {
    const file = makeMulterFile({
      buffer: Buffer.from('irrelevant'),
      originalname: 'payload.php',
      mimetype: 'image/jpeg',
    });

    await expect(
      service.processAndStore(file, 'menu-item-photo'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects a real image that exceeds the max dimension', async () => {
    const tooLarge = MAX_IMAGE_DIMENSION_PX + 100;
    const buffer = await sharp({
      create: {
        width: tooLarge,
        height: 10,
        channels: 3,
        background: { r: 0, g: 0, b: 0 },
      },
    })
      .png()
      .toBuffer();
    const file = makeMulterFile({
      buffer,
      originalname: 'huge.png',
      mimetype: 'image/png',
    });

    await expect(
      service.processAndStore(file, 'menu-item-photo'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects a real, valid image of a disallowed format (e.g. GIF) even with a spoofed .jpg name/mimetype', async () => {
    const buffer = await sharp({
      create: {
        width: 50,
        height: 50,
        channels: 3,
        background: { r: 1, g: 2, b: 3 },
      },
    })
      .gif()
      .toBuffer();
    // Client claims JPEG — the real decode should still catch the mismatch.
    const file = makeMulterFile({
      buffer,
      originalname: 'sneaky.jpg',
      mimetype: 'image/jpeg',
    });

    await expect(
      service.processAndStore(file, 'menu-item-photo'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
