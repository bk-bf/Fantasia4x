import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';
import base from '../../vitest.config';

const file = /loop/.test(process.env.PROF_FILE ?? '') ? 'loop' : 'tick';

export default defineConfig({
  ...base,
  root: fileURLToPath(new URL('../..', import.meta.url)),
  test: {
    ...base.test,
    include: [`tools/tickprof/${file}.prof.ts`],
    exclude: ['node_modules/**'],
    maxWorkers: 1,
    testTimeout: 1_800_000,
    hookTimeout: 1_800_000,
    execArgv: (process.env.PROF_EXECARGV ?? '').split(' ').filter(Boolean)
  }
});
