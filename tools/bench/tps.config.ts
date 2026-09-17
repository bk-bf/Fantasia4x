import { defineConfig } from 'vitest/config';
import bench from './vitest.config';

export default defineConfig({
  ...bench,
  test: {
    ...bench.test,
    benchmark: { include: ['tools/bench/tps/*.bench.ts'] }
  }
});
