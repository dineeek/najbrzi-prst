import { defineConfig } from 'vitest/config';
import { crx } from '@crxjs/vite-plugin';
import manifest from './manifest.json' with { type: 'json' };
import pkg from './package.json' with { type: 'json' };

export default defineConfig({
  plugins: [crx({ manifest: { ...manifest, version: pkg.version } })],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: { offscreen: 'offscreen.html' }
    }
  },
  test: {
    environment: 'jsdom',
    include: ['src/__tests__/**/*.spec.ts']
  }
});
