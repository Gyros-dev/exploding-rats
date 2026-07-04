import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// GitHub Pages serves the app from https://<user>.github.io/<repo>/ —
// the base must match the repository name. Override with VITE_BASE if
// the repo is named differently or a custom domain is used.
export default defineConfig({
  plugins: [react()],
  base: process.env.VITE_BASE ?? '/exploding-rats/',
  build: {
    outDir: 'dist',
    sourcemap: false,
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
} as Parameters<typeof defineConfig>[0]);
