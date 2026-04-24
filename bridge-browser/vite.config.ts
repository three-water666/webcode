import { defineConfig } from 'vite';
import { crx } from '@crxjs/vite-plugin';
import manifest from './manifest.json';
import { resolve } from 'node:path';

export default defineConfig({
  plugins: [crx({ manifest: manifest as any })],
  build: {
    rollupOptions: {
      output: {
        chunkFileNames: 'assets/chunk-[hash].js',
      }
    }
  },
  resolve: {
    alias: {
      '@': '/src',
      '@webcode/shared': resolve(__dirname, '../shared/src/index.ts')
    }
  }
});
