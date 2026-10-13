import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    globals: true,
    root: './',
    include: ['**/*.e2e-spec.ts'],
    setupFiles: ['./test/auth-postgres.setup.ts'],
    fileParallelism: false,
    hookTimeout: 15_000,
    testTimeout: 15_000,
  },
});
