import { NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { ArViewerController } from './ar-viewer.controller';
import { ArViewerService } from './ar-viewer.service';

function makeRes() {
  const headers: Record<string, string> = {};
  return {
    setHeader: jest.fn((name: string, value: string) => {
      headers[name] = value;
    }),
    status: jest.fn(),
    headers,
  };
}

describe('ArViewerController', () => {
  let controller: ArViewerController;
  let arViewer: { findItemByPublicSlug: jest.Mock };
  let config: { get: jest.Mock };

  async function build(configValues: Record<string, string | undefined>) {
    arViewer = { findItemByPublicSlug: jest.fn() };
    config = { get: jest.fn((key: string) => configValues[key]) };
    const moduleRef = await Test.createTestingModule({
      controllers: [ArViewerController],
      providers: [
        { provide: ArViewerService, useValue: arViewer },
        { provide: ConfigService, useValue: config },
      ],
    }).compile();
    controller = moduleRef.get(ArViewerController);
  }

  it("the CSP only allows 'self' plus blob:/data: when no external asset host is configured (e.g. local storage driver)", async () => {
    await build({});
    arViewer.findItemByPublicSlug.mockResolvedValueOnce({
      name: 'Burger',
      arStatus: 'pending',
      photoUrl: null,
      restaurant: { name: 'Demo Diner' },
    });
    const res = makeRes();

    await controller.viewItem('slug', res as never);

    const csp = res.headers['Content-Security-Policy'];
    expect(csp).toContain("img-src 'self' data: blob:;");
    expect(csp).toContain("connect-src 'self' blob: data:;");
  });

  it('CSP explicitly allow-lists the object-storage origin and HDR environment-image origin — never a wildcard (spec §7.6)', async () => {
    await build({
      STORAGE_PUBLIC_BASE_URL: 'https://cdn.example.com/assets',
      AR_ENVIRONMENT_IMAGE_URL: 'https://hdr.example.net/kitchen.hdr',
    });
    arViewer.findItemByPublicSlug.mockResolvedValueOnce({
      name: 'Burger',
      arStatus: 'pending',
      photoUrl: null,
      restaurant: { name: 'Demo Diner' },
    });
    const res = makeRes();

    await controller.viewItem('slug', res as never);

    const csp = res.headers['Content-Security-Policy'];
    expect(csp).toContain('img-src');
    expect(csp).toContain('https://cdn.example.com');
    expect(csp).toContain('https://hdr.example.net');
    expect(csp).not.toContain('*');
  });

  it('never lets a non-URL AR_ENVIRONMENT_IMAGE_URL (e.g. "neutral") leak into the CSP', async () => {
    await build({ AR_ENVIRONMENT_IMAGE_URL: 'neutral' });
    arViewer.findItemByPublicSlug.mockResolvedValueOnce({
      name: 'Burger',
      arStatus: 'pending',
      photoUrl: null,
      restaurant: { name: 'Demo Diner' },
    });
    const res = makeRes();

    await controller.viewItem('slug', res as never);

    const csp = res.headers['Content-Security-Policy'];
    expect(csp).not.toContain('neutral');
  });

  it('renders the 404 page (not an error) for a missing/suspended/hidden item', async () => {
    await build({});
    arViewer.findItemByPublicSlug.mockRejectedValueOnce(
      new NotFoundException('Dish not found'),
    );
    const res = makeRes();

    const html = await controller.viewItem('missing', res as never);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(html).toContain('Dish not found');
  });
});
