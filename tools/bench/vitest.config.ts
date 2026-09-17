import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';
import codspeedPlugin from '@codspeed/vitest-plugin';
import base from '../../vitest.config';

export default defineConfig({
  ...base,
  plugins: [...(base.plugins ?? []), codspeedPlugin()],
  root: fileURLToPath(new URL('../..', import.meta.url)),
  test: {
    ...base.test,
    include: [],
    exclude: ['node_modules/**'],
    maxWorkers: 1,
    benchmark: { include: ['tools/bench/*.bench.ts'] }
  }
});
