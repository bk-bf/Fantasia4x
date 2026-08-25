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
      'src/lib/sim-core-pkg/**',
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
  {
    files: ['src/lib/game/**/*.ts'],
    ignores: ['src/lib/game/core/util/rng.ts'],
    rules: {
      'no-restricted-properties': [
        'error',
        {
          object: 'Math',
          property: 'random',
          message:
            'Use the seeded RNG (rng.random() from $lib/game/core/util/rng) — Math.random() breaks simulation determinism (P0-2).'
        }
      ]
    }
  },
  {
    files: ['src/lib/game/**/*.ts'],
    ignores: ['src/lib/game/core/util/log.ts'],
    rules: {
      'no-console': ['error', { allow: ['warn', 'error'] }]
    }
  },
  {
    files: ['**/*.{js,ts,mjs}'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: "CallExpression[callee.name='fetch'] > Literal[value=/^\\/?src\\//]",
          message:
            'fetch() of a /src path 404s in the packaged/static build (it only works against the dev server). Import the asset with ?raw or ?url, or move it to static/ and fetch from the site root.'
        }
      ]
    }
  }
];
