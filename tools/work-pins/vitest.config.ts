import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';
import base from '../../vitest.config';

export default defineConfig({
  ...base,
  root: fileURLToPath(new URL('../..', import.meta.url)),
  test: {
    ...base.test,
    include: ['tools/work-pins/*.pins.ts'],
    exclude: ['node_modules/**']
  }
});
