import { renderItemPage, renderNotFoundPage } from './ar-viewer.html';

function fakeItem(
  overrides: Partial<Parameters<typeof renderItemPage>[0]> = {},
) {
  return {
    name: 'Cheeseburger',
    description: 'A classic.',
    photoUrl: null,
    previewImageUrl: null,
    modelGlbUrl: null,
    modelUsdzUrl: null,
    arStatus: 'pending',
    widthMm: null,
    heightMm: null,
    lengthMm: null,
    ...overrides,
  };
}

describe('renderItemPage', () => {
  it('renders the model-viewer element with glb/usdz when live and both files exist', () => {
    const html = renderItemPage(
      fakeItem({
        arStatus: 'live',
        modelGlbUrl: 'https://cdn.example/model.glb',
        modelUsdzUrl: 'https://cdn.example/model.usdz',
        previewImageUrl: 'https://cdn.example/preview.jpg',
      }),
      'Demo Diner',
    );

    expect(html).toContain('<model-viewer');
    expect(html).toContain('src="https://cdn.example/model.glb"');
    expect(html).toContain('ios-src="https://cdn.example/model.usdz"');
    expect(html).toContain('/api/vendor/model-viewer.min.js');
  });

  it('renders the lighting/shadow config for realistic rendering (documents/3d-model-enhancement.md §3)', () => {
    const html = renderItemPage(
      fakeItem({
        arStatus: 'live',
        modelGlbUrl: 'https://cdn.example/model.glb',
        modelUsdzUrl: 'https://cdn.example/model.usdz',
      }),
      'Demo Diner',
      'https://cdn.example/kitchen.hdr',
    );

    expect(html).toContain(
      'environment-image="https://cdn.example/kitchen.hdr"',
    );
    expect(html).toContain('exposure="1.0"');
    expect(html).toContain('tone-mapping="neutral"');
    expect(html).toContain('shadow-intensity="1"');
    expect(html).toContain('shadow-softness="1"');
  });

  it('defaults environment-image to "neutral" when no HDR is configured', () => {
    const html = renderItemPage(
      fakeItem({
        arStatus: 'live',
        modelGlbUrl: 'https://cdn.example/model.glb',
        modelUsdzUrl: 'https://cdn.example/model.usdz',
      }),
      'Demo Diner',
    );

    expect(html).toContain('environment-image="neutral"');
  });

  it('falls back to a "coming soon" notice when live but missing a model file', () => {
    const html = renderItemPage(
      fakeItem({
        arStatus: 'live',
        modelGlbUrl: 'https://cdn.example/model.glb',
        modelUsdzUrl: null,
      }),
      'Demo Diner',
    );

    expect(html).not.toContain('<model-viewer');
    expect(html).toContain('still being prepared');
  });

  it('shows the photo with a "coming soon" notice for a pending item', () => {
    const html = renderItemPage(
      fakeItem({
        arStatus: 'pending',
        photoUrl: 'https://cdn.example/photo.jpg',
      }),
      'Demo Diner',
    );

    expect(html).not.toContain('<model-viewer');
    expect(html).toContain(
      '<img class="photo" src="https://cdn.example/photo.jpg"',
    );
    expect(html).toContain('still being prepared');
  });

  it('shows a placeholder when pending with no photo at all', () => {
    const html = renderItemPage(
      fakeItem({ arStatus: 'pending', photoUrl: null }),
      'Demo Diner',
    );
    expect(html).toContain('No photo yet');
  });

  it('never emits an unescaped <script> tag from owner-supplied name/description/restaurant (XSS)', () => {
    const html = renderItemPage(
      fakeItem({
        name: '<script>alert(1)</script>',
        description: '"><img src=x onerror=alert(2)>',
      }),
      '<script>alert(3)</script>',
    );

    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).not.toContain('<img src=x onerror=alert(2)>');
    expect(html).not.toContain('<script>alert(3)</script>');
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
  });

  it('shows the real-world size caption when the item is AR-ready and dimensions are set (documents/TASK-real-world-ar-sizing.md)', () => {
    const html = renderItemPage(
      fakeItem({
        arStatus: 'live',
        modelGlbUrl: 'https://cdn.example/model.glb',
        modelUsdzUrl: 'https://cdn.example/model.usdz',
        widthMm: 260,
        heightMm: 150,
        lengthMm: 80,
      }),
      'Demo Diner',
    );

    expect(html).toContain('26.0 × 15.0 × 8.0 cm');
  });

  it('omits the size caption when no dimensions are set', () => {
    const html = renderItemPage(
      fakeItem({
        arStatus: 'live',
        modelGlbUrl: 'https://cdn.example/model.glb',
        modelUsdzUrl: 'https://cdn.example/model.usdz',
      }),
      'Demo Diner',
    );

    expect(html).not.toContain('class="dimensions"');
  });

  it('escapes model/photo URLs too, so a compromised URL field cannot break out of the attribute', () => {
    const html = renderItemPage(
      fakeItem({
        arStatus: 'live',
        modelGlbUrl: `x.glb" onload="alert(1)`,
        modelUsdzUrl: 'https://cdn.example/model.usdz',
      }),
      'Demo Diner',
    );

    expect(html).not.toContain('" onload="alert(1)');
  });
});

describe('renderNotFoundPage', () => {
  it('renders a generic not-found page', () => {
    const html = renderNotFoundPage();
    expect(html).toContain('Dish not found');
  });
});
