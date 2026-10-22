// WCAG AA contrast checks for the theme tokens (documents/USER-APP-theming.md
// §6) plus the generated-CSS contract. Zero-dependency: node's built-in test
// runner against the compiled dist/ output (run `npm run build` first).
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { test } from 'node:test';

const { THEMES, brandTokens, buildThemeCss, buildThemeInitScript, isThemePreference, themeTokens } =
  createRequire(import.meta.url)('../dist/index.js');

function parseColor(value) {
  const hex = /^#([0-9a-f]{6})$/i.exec(value);
  if (hex) {
    const n = parseInt(hex[1], 16);
    return { r: n >> 16, g: (n >> 8) & 255, b: n & 255, a: 1 };
  }
  const rgba = /^rgba\((\d+), (\d+), (\d+), ([\d.]+)\)$/.exec(value);
  if (rgba) return { r: +rgba[1], g: +rgba[2], b: +rgba[3], a: +rgba[4] };
  throw new Error(`Unparseable colour: ${value}`);
}

/** Alpha-composites `fg` over an opaque `bg`. */
function over(fg, bg) {
  const mix = (f, b) => Math.round(f * fg.a + b * (1 - fg.a));
  return { r: mix(fg.r, bg.r), g: mix(fg.g, bg.g), b: mix(fg.b, bg.b), a: 1 };
}

function luminance({ r, g, b }) {
  const lin = (c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

function contrast(fgValue, bgValue, base) {
  const bg = base ? over(parseColor(bgValue), parseColor(base)) : parseColor(bgValue);
  const fg = over(parseColor(fgValue), bg);
  const [hi, lo] = [luminance(fg), luminance(bg)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

const AA_TEXT = 4.5;
const AA_NON_TEXT = 3;

for (const theme of THEMES) {
  const t = themeTokens[theme];
  const surfaces = ['bg', 'surface', 'surface-2'];

  test(`${theme}: body and muted text meet AA on every surface`, () => {
    for (const surface of surfaces) {
      for (const fg of ['text', 'text-muted']) {
        const ratio = contrast(t[fg], t[surface]);
        assert.ok(ratio >= AA_TEXT, `${fg} on ${surface}: ${ratio.toFixed(2)}`);
      }
    }
  });

  test(`${theme}: faint (secondary/decorative) text meets the 3:1 non-text floor`, () => {
    for (const surface of surfaces) {
      const ratio = contrast(t['text-faint'], t[surface]);
      assert.ok(ratio >= AA_NON_TEXT, `text-faint on ${surface}: ${ratio.toFixed(2)}`);
    }
  });

  test(`${theme}: accent and status (ok/warning/danger) text meet AA on bg and surface`, () => {
    for (const surface of ['bg', 'surface']) {
      for (const fg of ['accent-strong', 'ok', 'danger', 'warning']) {
        const ratio = contrast(t[fg], t[surface]);
        assert.ok(ratio >= AA_TEXT, `${fg} on ${surface}: ${ratio.toFixed(2)}`);
      }
    }
  });

  test(`${theme}: banner text meets AA on its own tinted background`, () => {
    for (const kind of ['ok', 'danger', 'warning']) {
      const ratio = contrast(t[kind], t[`${kind}-bg`], t.surface);
      assert.ok(ratio >= AA_TEXT, `${kind} on ${kind}-bg: ${ratio.toFixed(2)}`);
    }
  });

  test(`${theme}: status-badge text meets AA on its tint`, () => {
    for (const hue of ['violet', 'blue', 'teal']) {
      const ratio = contrast(t[`tint-${hue}-text`], brandTokens[`tint-${hue}-bg`], t.surface);
      assert.ok(ratio >= AA_TEXT, `tint-${hue}: ${ratio.toFixed(2)}`);
    }
  });
}

test('both themes define exactly the same token names', () => {
  assert.deepEqual(Object.keys(themeTokens.light).sort(), Object.keys(themeTokens.dark).sort());
});

test('generated CSS follows the data-theme override pattern', () => {
  const css = buildThemeCss();
  assert.match(css, /:root \{[^}]*--bg: #0a0b14;/);
  assert.match(css, /:root\[data-theme="light"\] \{[^}]*--bg: #eceef3;/);
  assert.match(css, /@media \(prefers-color-scheme: light\) \{\s*:root:not\(\[data-theme\]\)/);
});

test('system-only CSS has no data-theme override', () => {
  const css = buildThemeCss({ allowOverride: false });
  assert.doesNotMatch(css, /data-theme/);
  assert.match(css, /@media \(prefers-color-scheme: light\) \{\s*:root \{/);
});

test('init script only applies whitelisted stored values', () => {
  const script = buildThemeInitScript();
  assert.match(script, /stored === 'light' \|\| stored === 'dark'/);
  assert.match(script, /try \{/);
});

test('isThemePreference rejects anything outside the whitelist', () => {
  assert.ok(isThemePreference('system'));
  assert.ok(!isThemePreference('"><script>'));
  assert.ok(!isThemePreference(null));
});
