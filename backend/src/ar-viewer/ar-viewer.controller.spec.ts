import { NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { AnalyticsService } from '../analytics/analytics.service';
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
  let analytics: { recordScan: jest.Mock };
  const req = { ip: '203.0.113.7' };

  async function build(configValues: Record<string, string | undefined>) {
    arViewer = { findItemByPublicSlug: jest.fn() };
    config = { get: jest.fn((key: string) => configValues[key]) };
    analytics = { recordScan: jest.fn().mockResolvedValue(undefined) };
    const moduleRef = await Test.createTestingModule({
      controllers: [ArViewerController],
      providers: [
        { provide: ArViewerService, useValue: arViewer },
        { provide: ConfigService, useValue: config },
        { provide: AnalyticsService, useValue: analytics },
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

    await controller.viewItem('slug', req as never, res as never);

    const csp = res.headers['Content-Security-Policy'];
    expect(csp).toContain("img-src 'self' data: blob:;");
    expect(csp).toContain("connect-src 'self' blob: data:;");
  });

  it('CSP explicitly allow-lists the object-storage origin and HDR environment-image origin — never a wildcard (spec §7.6)', async () => {
    await build({
      STORAGE_PUBLIC_BASE_URL: 'https://cdn.example.com/assets',
      AR_ENVIRONMENT_IMAGE_URL: 'https://hdr.example.net/kitchen.hdr',
      AR_ENVIRONMENT_IMAGE_URL_LIGHT:
        'https://light-hdr.example.org/studio.hdr',
    });
    arViewer.findItemByPublicSlug.mockResolvedValueOnce({
      name: 'Burger',
      arStatus: 'pending',
      photoUrl: null,
      restaurant: { name: 'Demo Diner' },
    });
    const res = makeRes();

    await controller.viewItem('slug', req as never, res as never);

    const csp = res.headers['Content-Security-Policy'];
    expect(csp).toContain('img-src');
    expect(csp).toContain('https://cdn.example.com');
    expect(csp).toContain('https://hdr.example.net');
    expect(csp).toContain('https://light-hdr.example.org');
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

    await controller.viewItem('slug', req as never, res as never);

    const csp = res.headers['Content-Security-Policy'];
    expect(csp).not.toContain('neutral');
  });

  it('passes per-theme environment images, falling back to "neutral" for light (documents/USER-APP-theming.md §5)', async () => {
    await build({
      AR_ENVIRONMENT_IMAGE_URL: 'https://hdr.example.net/kitchen.hdr',
    });
    arViewer.findItemByPublicSlug.mockResolvedValueOnce({
      name: 'Burger',
      arStatus: 'live',
      modelGlbUrl: 'https://cdn.example/m.glb',
      modelUsdzUrl: 'https://cdn.example/m.usdz',
      photoUrl: null,
      restaurant: { name: 'Demo Diner' },
    });
    const res = makeRes();

    const html = await controller.viewItem('slug', req as never, res as never);

    expect(html).toContain(
      'data-environment-image-dark="https://hdr.example.net/kitchen.hdr"',
    );
    expect(html).toContain('data-environment-image-light="neutral"');
  });

  it('serves the theme script as cacheable JavaScript', async () => {
    await build({});
    const res = { ...makeRes(), send: jest.fn() };

    controller.getThemeScript(res as never);

    expect(res.headers['Content-Type']).toContain('javascript');
    expect(res.headers['Cache-Control']).toBe('public, max-age=86400');
    expect(res.send).toHaveBeenCalledWith(
      expect.stringContaining('prefers-color-scheme: light'),
    );
  });

  it('records a scan (with the request IP, hashed downstream) when a dish page is served', async () => {
    await build({});
    arViewer.findItemByPublicSlug.mockResolvedValueOnce({
      id: 42,
      restaurantId: 7,
      name: 'Burger',
      arStatus: 'pending',
      photoUrl: null,
      restaurant: { name: 'Demo Diner' },
    });

    await controller.viewItem('slug', req as never, makeRes() as never);

    expect(analytics.recordScan).toHaveBeenCalledWith(7, 42, '203.0.113.7');
  });

  it('renders the 404 page (not an error) for a missing/suspended/hidden item', async () => {
    await build({});
    arViewer.findItemByPublicSlug.mockRejectedValueOnce(
      new NotFoundException('Dish not found'),
    );
    const res = makeRes();

    const html = await controller.viewItem(
      'missing',
      req as never,
      res as never,
    );

    expect(res.status).toHaveBeenCalledWith(404);
    expect(html).toContain('Dish not found');
    // A page that wasn't served is never counted as a scan.
    expect(analytics.recordScan).not.toHaveBeenCalled();
  });
});
