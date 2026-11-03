import path from 'node:path';
import { fileURLToPath } from 'node:url';

import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

const here = path.dirname(fileURLToPath(import.meta.url));
const API_TARGET = process.env.API_PROXY_TARGET ?? 'http://localhost:4000';
// 5180 rather than Vite's 5173, which other local projects on this machine already use.
const DEV_PORT = Number(process.env.WEB_PORT ?? 5180);

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { '@': path.join(here, 'src') },
  },
  server: {
    port: DEV_PORT,
    strictPort: true,
    // Same origin as the app, so the SameSite=Strict session cookies work in development.
    proxy: { '/api': { target: API_TARGET, changeOrigin: false } },
  },
  build: {
    sourcemap: true,
    // The shared vendor chunk (react-dom, react-router, TanStack Query) is ~190 kB gzipped; pages are split per route.
    // Raise this only with a reason: every new route or heavy library should be lazy-loaded instead.
    chunkSizeWarningLimit: 650,
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.js'],
    include: ['src/**/*.test.{js,jsx}'],
    css: false,
  },
});
