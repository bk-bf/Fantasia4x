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
  }
];
