import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';
import base from '../../vitest.config';

export default defineConfig({
  ...base,
  root: fileURLToPath(new URL('../..', import.meta.url)),
  test: {
    ...base.test,
    include: ['tools/native-spike/snapsize.prof.ts'],
    exclude: ['node_modules/**'],
    maxWorkers: 1,
    testTimeout: 1_800_000,
    hookTimeout: 1_800_000
  }
});
