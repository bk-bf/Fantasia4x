import { defineConfig, type Plugin } from 'vitest/config';
import { fileURLToPath } from 'node:url';

/**
 * Minimal JSONC comment stripper — mirrors the one in vite.config.ts so the data
 * databases (items.jsonc, …) import the same way under Vitest as in the app.
 */
function stripJsoncComments(src: string): string {
  let out = '';
  let i = 0;
  let inStr = false;
  while (i < src.length) {
    if (inStr) {
      if (src[i] === '\\') {
        out += src[i] + src[i + 1];
        i += 2;
      } else if (src[i] === '"') {
        inStr = false;
        out += src[i++];
      } else {
        out += src[i++];
      }
    } else {
      if (src[i] === '"') {
        inStr = true;
        out += src[i++];
      } else if (src[i] === '/' && src[i + 1] === '/') {
        while (i < src.length && src[i] !== '\n') i++;
      } else if (src[i] === '/' && src[i + 1] === '*') {
        i += 2;
        while (i < src.length && !(src[i] === '*' && src[i + 1] === '/')) i++;
        i += 2;
      } else {
        out += src[i++];
      }
    }
  }
  return out;
}

function jsoncPlugin(): Plugin {
  return {
    name: 'vite-plugin-jsonc',
    transform(code, id) {
      if (!id.endsWith('.jsonc')) return;
      return { code: `export default ${stripJsoncComments(code)}`, map: null };
    }
  };
}

export default defineConfig({
  plugins: [jsoncPlugin()],
  resolve: {
    alias: {
      $lib: fileURLToPath(new URL('./src/lib', import.meta.url)),
      '$app/environment': fileURLToPath(
        new URL('./tests/stubs/app-environment.ts', import.meta.url)
      )
    }
  },
  test: {
    environment: 'node',
    include: ['src/**/*.{test,spec}.ts'],
    exclude: ['node_modules/**', '.svelte-kit/**', 'build/**'],
    // RESOURCE CAP (laptop OOM guard). Vitest defaults to one worker PER CORE — on a 22-thread box
    // that is ~21 parallel Node forks, each loading worldgen + WASM + the big JSONC databases. On a
    // 15 GB machine already deep into swap that thrashes RAM and OOM-kills the session. The suite does
    // not run in CI (the desktop build is manual, no test step), so a small default costs nothing
    // elsewhere. Override for a beefier box with `VITEST_MAX_FORKS=8 pnpm test`.
    pool: 'forks',
    poolOptions: {
      forks: {
        minForks: 1,
        maxForks: Math.max(1, Number(process.env.VITEST_MAX_FORKS) || 3)
      }
    }
  }
});
