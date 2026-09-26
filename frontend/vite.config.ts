import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import shared from '@ar-menu/shared'

const THEME_INIT_PATH = '/theme-init.js'

// Serves (dev) / emits (build) the blocking no-FOUC theme script from the
// shared token module (documents/USER-APP-theming.md §3). A same-origin
// file rather than an inline <script>, so the app never needs
// 'unsafe-inline' in a Content-Security-Policy (spec §7.2, §7.6).
function themeInitScript(): Plugin {
  const source = shared.buildThemeInitScript()
  return {
    name: 'seeitreal-theme-init',
    configureServer(server) {
      server.middlewares.use(THEME_INIT_PATH, (_req, res) => {
        res.setHeader('Content-Type', 'text/javascript; charset=utf-8')
        res.end(source)
      })
    },
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: THEME_INIT_PATH.slice(1), source })
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), themeInitScript()],
  server: {
    // Non-default port — 5173 is kept free for other local uses.
    // strictPort: fail loudly instead of silently picking a different port.
    port: 4173,
    strictPort: true,
  },
  optimizeDeps: {
    // @ar-menu/shared is a symlinked npm-workspace package built to
    // CommonJS (backend also `require()`s it). Vite's dev server doesn't
    // pre-bundle (and so doesn't CJS-interop) linked workspace packages by
    // default, so importing a named export from it 500s in dev with
    // "does not provide an export named ..." unless forced through
    // esbuild's dependency optimizer here. `vite build` was unaffected
    // (Rollup interops CJS automatically) — this only fixes `vite dev`.
    include: ['@ar-menu/shared'],
  },
})
