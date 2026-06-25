// Flat ESLint config (ESLint 9). Previously absent — `eslint .` could not run at all
// (P2-11). Kept intentionally minimal so it passes on the existing code; its real job is
// to enforce the project invariants the codebase review called out:
//   - P0-2: ban Math.random() under the simulation core (must use core/rng).
//   - P2-10: discourage raw console in the sim core (route through core/log gatedConsole).
//
// NOTE: .svelte files are not linted here yet — eslint-plugin-svelte needs the
// `svelte-eslint-parser` peer dependency, which is not installed. `svelte-check`
// (pnpm check) covers the Svelte files in the meantime.
import tsParser from '@typescript-eslint/parser';
import tsPlugin from '@typescript-eslint/eslint-plugin';

export default [
  {
    ignores: [
      'node_modules/**',
      'build/**',
      '.svelte-kit/**',
      'package/**',
      'src/lib/spatial-core-pkg/**',
      'spatial-core/**',
      '**/*.svelte',
      '**/*.jsonc',
      '**/*.json'
    ]
  },
  {
    files: ['**/*.{js,ts,mjs}'],
    languageOptions: {
      parser: tsParser,
      parserOptions: { ecmaVersion: 2022, sourceType: 'module' }
    },
    plugins: { '@typescript-eslint': tsPlugin },
    rules: {}
  },
  // P0-2: the seeded RNG (core/rng) is the only place Math.random may be used.
  {
    files: ['src/lib/game/**/*.ts'],
    ignores: ['src/lib/game/core/rng.ts'],
    rules: {
      'no-restricted-properties': [
        'error',
        {
          object: 'Math',
          property: 'random',
          message:
            'Use the seeded RNG (rng.random() from $lib/game/core/rng) — Math.random() breaks simulation determinism (P0-2).'
        }
      ]
    }
  },
  // P2-10: keep raw console out of the sim core — route per-tick/per-action logging through the
  // gated shim (`import { gatedConsole as console } from '../core/log'`), which the rule does not
  // flag because the local import shadows the global `console`. `warn`/`error` stay allowed
  // (genuine problem reporting); `core/log.ts` (the shim itself) is exempt; the `[PROF]` profiler
  // output in GameEngineImpl carries a per-line eslint-disable (ADR-011 exemption).
  {
    files: ['src/lib/game/**/*.ts'],
    ignores: ['src/lib/game/core/log.ts'],
    rules: {
      'no-console': ['error', { allow: ['warn', 'error'] }]
    }
  },
  // Catch the dev-vs-packaged asset trap LIVE in the editor (ESLint LSP) before it reaches a build:
  // fetch() of a `/src…` path works against the Vite dev server (./dev.sh, the Electron spike) but
  // 404s in `pnpm build` output (Electron app://, any static host) — sources are bundled into _app/,
  // there is no /src dir. Import the asset with ?raw / ?url, or put it in static/ and fetch from the
  // site root. (Surfaced 2026-06-25 by the WebGL shader loader; see memory no-runtime-fetch-of-src-paths.)
  // Limitation: matches string-literal `fetch('/src…')` in .js/.ts; .svelte scripts aren't linted yet.
  {
    files: ['**/*.{js,ts,mjs}'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: "CallExpression[callee.name='fetch'] > Literal[value=/^\\/?src\\//]",
          message:
            "fetch() of a /src path 404s in the packaged/static build (it only works against the dev server). Import the asset with ?raw or ?url, or move it to static/ and fetch from the site root."
        }
      ]
    }
  }
];
