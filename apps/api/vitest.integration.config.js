import { defineConfig } from 'vitest/config';

const CONTAINER_STARTUP_MS = 300_000;

export default defineConfig({
  test: {
    include: ['test/integration/**/*.test.js'],
    hookTimeout: CONTAINER_STARTUP_MS,
    testTimeout: 30_000,
    // One MySQL container per file is enough; files run one after another to keep memory low.
    fileParallelism: false,
  },
});
