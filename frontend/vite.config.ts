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
})
