import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import {
  REGISTRY,
  lineOf,
  mutate,
  occurrences,
  registryErrors,
  selectMutants
} from '../../../../tools/mutants/pins.mjs';

const files: Record<string, string> = {
  'src/a.ts': 'const x = 1;\nif (x >= 1) go();\n',
  'src/tests/a.test.ts': 'test'
};
const read = (f: string) => files[f] ?? null;
const pin = {
  id: 'a-boundary',
  file: 'src/a.ts',
  find: 'x >= 1',
  replace: 'x > 1',
  tests: ['src/tests/a.test.ts']
};

describe('registryErrors', () => {
  it('accepts a mutant whose find text occurs once and whose tests exist', () => {
    expect(registryErrors([pin], read)).toEqual([]);
  });

  it('accepts an empty replacement, which deletes the find text', () => {
    expect(registryErrors([{ ...pin, replace: '' }], read)).toEqual([]);
  });

  it('refuses find text that is missing or occurs more than once', () => {
    expect(registryErrors([{ ...pin, find: 'y' }], read)).toEqual([
      'a-boundary: the find text occurs 0 times in src/a.ts, not once'
    ]);
    expect(registryErrors([{ ...pin, find: 'x' }], read)).toEqual([
      'a-boundary: the find text occurs 2 times in src/a.ts, not once'
    ]);
  });

  it('refuses a duplicate id, a missing file, a no-op and a test that is not a test file', () => {
    expect(
      registryErrors(
        [
          pin,
          { ...pin, file: 'src/b.ts' },
          { ...pin, id: 'noop', replace: pin.find },
          { ...pin, id: 'bad-test', tests: ['src/a.ts'] }
        ],
        read
      )
    ).toEqual([
      'a-boundary: the id is used twice',
      'a-boundary: src/b.ts does not exist',
      'noop: replace is the same as find',
      'bad-test: src/a.ts is not a test file under src/'
    ]);
  });

  it('holds for every mutant in the committed registry', () => {
    const registry = JSON.parse(readFileSync(REGISTRY, 'utf8'));
    expect(
      registryErrors(registry, (f: string) => (existsSync(f) ? readFileSync(f, 'utf8') : null))
    ).toEqual([]);
  });
});

describe('selectMutants', () => {
  const other = { ...pin, id: 'b', file: 'src/b.ts', tests: ['src/tests/b.test.ts'] };

  it('runs a mutant when its file or one of its tests changed', () => {
    expect(selectMutants([pin, other], new Set(['src/a.ts']), [pin, other])).toEqual([pin]);
    expect(selectMutants([pin, other], new Set(['src/tests/b.test.ts']), [pin, other])).toEqual([
      other
    ]);
  });

  it('runs a mutant that is new or edited in the registry', () => {
    expect(selectMutants([pin, other], new Set(), [pin])).toEqual([other]);
    expect(selectMutants([pin], new Set(), [{ ...pin, replace: 'x < 1' }])).toEqual([pin]);
  });

  it('runs every mutant when the tool itself changed', () => {
    expect(selectMutants([pin, other], new Set(['tools/mutants/pins.mjs']), [pin, other])).toEqual([
      pin,
      other
    ]);
  });
});

describe('mutate', () => {
  it('replaces the one occurrence of the find text', () => {
    expect(mutate(files['src/a.ts'], pin)).toBe('const x = 1;\nif (x > 1) go();\n');
  });

  it('counts occurrences and finds the line of the find text', () => {
    expect(occurrences('aXaXa', 'a')).toBe(3);
    expect(lineOf(files['src/a.ts'], pin.find)).toBe(2);
  });
});
