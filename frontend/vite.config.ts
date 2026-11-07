import path from 'node:path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// Ports differ from Shelf-help's (5173, backend 8099) so both run side by side.
const backend = 'http://127.0.0.1:8097'

export default defineConfig({
  // Relative asset paths: HA Ingress serves the app under a changing prefix.
  base: './',
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { '@': path.resolve(import.meta.dirname, 'src') },
  },
  server: {
    port: 5174,
    strictPort: true,
    proxy: { '/api': backend, '/mcp': backend },
  },
})
