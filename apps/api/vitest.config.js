import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.js'],
    // Integration tests need Docker; they run with `npm run test:integration`.
    exclude: ['test/integration/**'],
  },
});
