import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
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
