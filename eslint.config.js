import js from '@eslint/js';
import globals from 'globals';
import tsParser from '@typescript-eslint/parser';
import tsPlugin from '@typescript-eslint/eslint-plugin';
import svelte from 'eslint-plugin-svelte';
import svelteParser from 'svelte-eslint-parser';
import prettier from 'eslint-config-prettier';

const IGNORES = [
  'node_modules/**',
  'build/**',
  'dist/**',
  '.svelte-kit/**',
  'package/**',
  'src/lib/spatial-core-pkg/**',
  'src/lib/sim-core-pkg/**',
  'spatial-core/**',
  'sim-core/**',
  'desktop-spike/**',
  'static/**',
  '**/*.json',
  '**/*.jsonc'
];

const PROJECT_RULES = {
  'no-restricted-properties': [
    'error',
    {
      object: 'Math',
      property: 'random',
      message:
        'Use the seeded RNG (rng.random() from $lib/game/core/util/rng) — Math.random() breaks simulation determinism (P0-2).'
    }
  ]
};

const SHARED = {
  'no-unreachable': 'error',
  'no-fallthrough': 'error',
  'no-constant-condition': ['error', { checkLoops: false }],
  'no-dupe-else-if': 'error',
  'no-self-compare': 'error',
  'no-unsafe-optional-chaining': 'error',
  'no-empty': ['warn', { allowEmptyCatch: false }],
  '@typescript-eslint/no-empty-function': ['warn', { allow: ['arrowFunctions'] }],
  'no-unused-private-class-members': 'error'
};

export default [
  { ignores: IGNORES },
  js.configs.recommended,
  {
    files: ['**/*.{js,ts,mjs,cjs}'],
    languageOptions: {
      parser: tsParser,
      globals: { ...globals.browser, ...globals.node },
      parserOptions: { ecmaVersion: 2022, sourceType: 'module' }
    },
    plugins: { '@typescript-eslint': tsPlugin },
    rules: {
      ...SHARED,
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { args: 'none', varsIgnorePattern: '^_', caughtErrors: 'none' }
      ],
      'no-undef': 'off'
    }
  },
  ...svelte.configs['flat/recommended'],
  {
    files: ['**/*.svelte', '**/*.svelte.ts', '**/*.svelte.js'],
    plugins: { '@typescript-eslint': tsPlugin },
    languageOptions: {
      parser: svelteParser,
      globals: { ...globals.browser },
      parserOptions: { parser: tsParser, extraFileExtensions: ['.svelte'] }
    },
    rules: {
      ...SHARED,
      'no-undef': 'off',
      'no-unused-vars': ['warn', { args: 'none', varsIgnorePattern: '^_', caughtErrors: 'none' }],
      'svelte/no-reactive-functions': 'warn',
      'svelte/no-unused-svelte-ignore': 'warn',
      'svelte/no-immutable-reactive-statements': 'warn',
      'svelte/require-each-key': 'warn',
      'svelte/prefer-svelte-reactivity': 'warn',
      'svelte/no-at-html-tags': 'warn'
    }
  },
  prettier,
  {
    files: ['src/lib/game/**/*.ts'],
    ignores: ['src/lib/game/core/util/rng.ts'],
    rules: PROJECT_RULES
  },
  {
    files: ['src/lib/game/**/*.ts'],
    ignores: ['src/lib/game/core/util/log.ts'],
    rules: { 'no-console': ['error', { allow: ['warn', 'error'] }] }
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
  },
  {
    files: [
      'src/tests/**/*.ts',
      'src/lib/game/headless/**/*.ts',
      'tools/**/*.mjs',
      'scripts/**/*.mjs',
      'electron/**'
    ],
    rules: { 'no-console': 'off' }
  }
];
