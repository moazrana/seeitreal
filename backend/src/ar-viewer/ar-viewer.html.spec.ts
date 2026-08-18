import { renderItemPage, renderNotFoundPage } from './ar-viewer.html';

function fakeItem(
  overrides: Partial<Parameters<typeof renderItemPage>[0]> = {},
) {
  return {
    name: 'Cheeseburger',
    description: 'A classic.',
    price: { toFixed: (n: number) => (8.5).toFixed(n) },
    photoUrl: null,
    previewImageUrl: null,
    modelGlbUrl: null,
    modelUsdzUrl: null,
    arStatus: 'pending',
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
