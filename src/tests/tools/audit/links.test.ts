import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import {
  linkify,
  resolveRepoPath,
  isGitIgnored,
  stripLinks,
  lastTracked
} from '../../../../tools/audit/lib/links.mjs';

describe('stripLinks', () => {
  it('reduces every markdown link to its label', () => {
    expect(
      stripLinks(
        'inside [`core/defs/backgrounds.ts`](https://github.com/bk-bf/Fantasia4x/blob/d178d46f/src/lib/game/core/defs/backgrounds.ts), a module'
      )
    ).toBe('inside `core/defs/backgrounds.ts`, a module');
  });

  it('makes a body the issue wrapper linked equal to the body the raiser rendered', () => {
    const rendered = 'evaluated inside `core/defs/backgrounds.ts` at roll time';
    const stored =
      'evaluated inside [`core/defs/backgrounds.ts`](https://github.com/bk-bf/Fantasia4x/blob/d178d46f/src/lib/game/core/defs/backgrounds.ts) at roll time';
    expect(stripLinks(stored)).toBe(stripLinks(rendered));
  });
});

describe('isGitIgnored', () => {
  it('matches a path under a gitignored directory even though it is never tracked', () => {
    expect(isGitIgnored('tools/audit/.ledger/worker-3.json')).toBe(true);
    expect(isGitIgnored('tools/audit/.ledger/tmp/task-2.json')).toBe(true);
  });

  it('does not match a tracked path', () => {
    expect(isGitIgnored('package.json')).toBe(false);
  });
});

describe('resolveRepoPath', () => {
  it('resolves a path that is actually tracked', () => {
    expect(resolveRepoPath('package.json', 'HEAD')).toBe('package.json');
  });

  it('refuses a path under a gitignored directory', () => {
    expect(resolveRepoPath('tools/audit/.ledger/worker-3.json', 'HEAD')).toBeNull();
  });

  it('refuses a path that does not exist at the indexed commit', () => {
    expect(resolveRepoPath('src/tests/does-not-exist-xyz-123.test.ts', 'HEAD')).toBeNull();
  });

  it('does not guess a file by its name when the folder it names is not in the repo', () => {
    expect(resolveRepoPath('.svelte-kit/tsconfig.json', 'HEAD')).toBeNull();
  });

  it('still resolves a bare file name and the end of a path', () => {
    expect(resolveRepoPath('tsconfig.json', 'HEAD')).toBe('tsconfig.json');
    expect(resolveRepoPath('audit/lib/links.mjs', 'HEAD')).toBe('tools/audit/lib/links.mjs');
  });
});

describe('lastTracked', () => {
  it('finds the last commit on dev that still holds a deleted file', () => {
    const old = lastTracked('docs/game/ARCHITECTURE.md');
    expect(old?.path).toBe('docs/game/ARCHITECTURE.md');
    expect(() => execFileSync('git', ['cat-file', '-e', `${old?.sha}:${old?.path}`])).not.toThrow();
  });

  it('gives nothing for a file that was never tracked or is ignored', () => {
    expect(lastTracked('src/tests/does-not-exist-xyz-123.test.ts')).toBeNull();
    expect(lastTracked('tools/audit/.ledger/worker-3.json')).toBeNull();
  });
});

describe('linkify', () => {
  it('turns a resolvable backtick-wrapped path into a permalink', () => {
    const out = linkify('See `tools/audit/README.md` for the overview.', 'HEAD');
    expect(out).toBe(
      'See [`tools/audit/README.md`](https://github.com/bk-bf/Fantasia4x/blob/HEAD/tools/audit/README.md) for the overview.'
    );
  });

  it('strips the backticks off a path that does not exist, instead of citing it', () => {
    const out = linkify('Add `src/tests/does-not-exist-xyz-123.test.ts` to cover this.', 'HEAD');
    expect(out).toBe('Add src/tests/does-not-exist-xyz-123.test.ts to cover this.');
    expect(out).not.toContain('`');
    expect(out).not.toContain('](');
  });

  it('strips the backticks off a path git check-ignore matches', () => {
    const out = linkify('Logged to `tools/audit/.ledger/worker-3.json` during the run.', 'HEAD');
    expect(out).toBe('Logged to tools/audit/.ledger/worker-3.json during the run.');
    expect(out).not.toContain('`');
    expect(out).not.toContain('](');
  });

  it('leaves a path already inside a markdown link alone', () => {
    const input = 'See [`tools/audit/README.md`](https://example.com/elsewhere) instead.';
    expect(linkify(input, 'HEAD')).toBe(input);
  });

  it('still linkifies a bare path mentioned in prose', () => {
    const out = linkify('See tools/audit/README.md for the overview.', 'HEAD');
    expect(out).toBe(
      'See [`tools/audit/README.md`](https://github.com/bk-bf/Fantasia4x/blob/HEAD/tools/audit/README.md) for the overview.'
    );
  });
});
