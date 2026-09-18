import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    root: 'src',
    environment: 'node',
    setupFiles: ['__tests__/setup-data-dir.ts'],
  },
});
