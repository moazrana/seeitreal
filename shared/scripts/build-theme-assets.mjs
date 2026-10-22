// Generates the static theme assets from the compiled token module
// (src/theme.ts) so every consumer shares one definition:
//   dist/theme.css       — imported by the dashboard (frontend/src/main.tsx)
//   dist/theme-init.js   — the blocking no-FOUC <head> script
// Runs after `tsc` as part of `npm run build`.
import { writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const distDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'dist');
const { buildThemeCss, buildThemeInitScript } = createRequire(import.meta.url)(
  join(distDir, 'theme.js'),
);

const banner = '/* Generated from shared/src/theme.ts — do not edit. */\n';
writeFileSync(join(distDir, 'theme.css'), `${banner}${buildThemeCss()}\n`);
writeFileSync(join(distDir, 'theme-init.js'), `${banner}${buildThemeInitScript()}`);
