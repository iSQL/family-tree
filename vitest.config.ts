import path from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@shared': path.resolve(import.meta.dirname, 'shared/src'),
    },
  },
  test: {
    environment: 'node',
    include: ['shared/src/**/*.test.ts', 'server/src/**/*.test.ts'],
  },
});
