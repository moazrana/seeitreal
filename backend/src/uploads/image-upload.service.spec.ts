import { BadRequestException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import sharp from 'sharp';
import { StorageService } from '../storage/storage.service';
import { ImageUploadService } from './image-upload.service';
import {
  IMAGE_OUTPUT_PROFILES,
  MAX_IMAGE_DIMENSION_PX,
  MIN_DISH_PHOTO_EDGE_PX,
  MIN_DISH_PHOTO_QUALITY,
} from './image-upload.constants';

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

  function storedBody(): Buffer {
    return (storage.putObject.mock.calls[0] as [{ body: Buffer }])[0].body;
  }

  it('accepts a genuine small JPEG and stores it re-encoded as JPEG', async () => {
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
      expect.objectContaining({ contentType: 'image/jpeg' }),
    );
    expect(storage.generateKey).toHaveBeenCalledWith('menu-item-photo', 'jpg');
    // Re-encoded bytes actually decode as a valid image of the same
    // dimensions (small images are never enlarged) — proves this isn't
    // just passing the original bytes through.
    const storedMeta = await sharp(storedBody()).metadata();
    expect(storedMeta.format).toBe('jpeg');
    expect(storedMeta.width).toBe(100);
    expect(storedMeta.height).toBe(80);
  });

  describe('normalization (documents/TASK-image-optimization.md)', () => {
    it('applies the EXIF orientation, then strips all metadata', async () => {
      // 200x100 pixels, tagged "rotate 90° clockwise" (orientation 6) the
      // way a phone held upright tags its sensor-landscape image.
      const buffer = await sharp({
        create: {
          width: 200,
          height: 100,
          channels: 3,
          background: { r: 10, g: 120, b: 30 },
        },
      })
        .jpeg()
        .withMetadata({
          orientation: 6,
          exif: { IFD0: { Make: 'PhoneCo', Model: 'Camera 1' } },
        })
        .toBuffer();

      await service.processAndStore(
        makeMulterFile({ buffer }),
        'menu-item-photo',
      );

      const meta = await sharp(storedBody()).metadata();
      expect([meta.width, meta.height]).toEqual([100, 200]);
      expect(meta.orientation).toBeUndefined();
      expect(meta.exif).toBeUndefined();
      expect(meta.icc).toBeUndefined();
    });

    it('resizes a large dish photo to a 2048px longest edge, keeping aspect ratio', async () => {
      const buffer = await sharp({
        create: {
          width: 4000,
          height: 3000,
          channels: 3,
          background: { r: 180, g: 90, b: 40 },
        },
      })
        .jpeg({ quality: 100 })
        .toBuffer();

      await service.processAndStore(
        makeMulterFile({ buffer }),
        'menu-item-photo',
      );

      const meta = await sharp(storedBody()).metadata();
      expect([meta.width, meta.height]).toEqual([2048, 1536]);
      expect(storedBody().length).toBeLessThan(buffer.length);
    });

    it('flattens transparent areas onto white (JPEG has no alpha, sharp defaults to black)', async () => {
      const buffer = await sharp({
        create: {
          width: 20,
          height: 20,
          channels: 4,
          background: { r: 0, g: 0, b: 0, alpha: 0 },
        },
      })
        .png()
        .toBuffer();

      await service.processAndStore(
        makeMulterFile({
          buffer,
          originalname: 'cutout.png',
          mimetype: 'image/png',
        }),
        'menu-item-photo',
      );

      const { data } = await sharp(storedBody())
        .raw()
        .toBuffer({ resolveWithObject: true });
      expect(Math.min(...data)).toBeGreaterThan(245);
    });

    it('keeps logos as WebP (transparency preserved) capped at 1024px', async () => {
      const buffer = await sharp({
        create: {
          width: 3000,
          height: 1500,
          channels: 4,
          background: { r: 0, g: 0, b: 0, alpha: 0 },
        },
      })
        .png()
        .toBuffer();

      await service.processAndStore(
        makeMulterFile({
          buffer,
          originalname: 'logo.png',
          mimetype: 'image/png',
        }),
        'restaurant-logo',
      );

      expect(storage.putObject).toHaveBeenCalledWith(
        expect.objectContaining({ contentType: 'image/webp' }),
      );
      const meta = await sharp(storedBody()).metadata();
      expect(meta.format).toBe('webp');
      expect(meta.hasAlpha).toBe(true);
      expect([meta.width, meta.height]).toEqual([1024, 512]);
    });

    it('never over-compresses dish photos below the reconstruction guardrail', () => {
      const profile = IMAGE_OUTPUT_PROFILES['menu-item-photo'];
      expect(profile.maxEdgePx).toBeGreaterThanOrEqual(MIN_DISH_PHOTO_EDGE_PX);
      expect(profile.quality).toBeGreaterThanOrEqual(MIN_DISH_PHOTO_QUALITY);
    });
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
