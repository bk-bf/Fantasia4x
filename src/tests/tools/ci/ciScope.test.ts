import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import {
  keepsGreen,
  scopeOf,
  unmappedFiles,
  unusedPatterns
} from '../../../../tools/ci/ci-scope.mjs';

const none = {
  check: false,
  coverage: false,
  workPins: false,
  gungraun: false,
  browser: false,
  tps: false,
  bench: false,
  mutants: false
};
const checkOnly = { ...none, check: true };

describe('scopeOf', () => {
  it('runs nothing when only Markdown, agent config or build resources change', () => {
    expect(
      scopeOf([
        'AGENTS.md',
        'tools/README.md',
        '.claude/settings.json',
        'build-resources/icon.png'
      ])
    ).toEqual(none);
  });

  it('checks a tool or workflow change but measures nothing', () => {
    expect(
      scopeOf(['tools/issue.mjs', '.github/workflows/check.yml', 'electron/main.cjs'])
    ).toEqual(checkOnly);
  });

  it('runs every leg but the Rust instruction counts for a game source change', () => {
    expect(scopeOf(['src/lib/game/sim/simProtocol.ts'])).toEqual({
      ...none,
      check: true,
      coverage: true,
      workPins: true,
      browser: true,
      tps: true,
      bench: true
    });
  });

  it('counts instructions when a Rust crate changes', () => {
    expect(scopeOf(['sim-core/src/lib.rs']).gungraun).toBe(true);
  });

  it('runs only the harness that changed', () => {
    expect(scopeOf(['tools/bench/dev-save.bench.ts'])).toEqual({
      ...checkOnly,
      tps: true,
      bench: true
    });
    expect(scopeOf(['tools/gungraun/gate.mjs'])).toEqual({ ...checkOnly, gungraun: true });
  });

  it('runs the mutant pins for a file the mutant registry names, and for the tool', () => {
    expect(scopeOf(['src/lib/game/core/defs/wounds.ts']).mutants).toBe(true);
    expect(scopeOf(['src/tests/game/systems/woundRecovery.test.ts']).mutants).toBe(true);
    expect(scopeOf(['tools/mutants/pins.mjs'])).toEqual({ ...checkOnly, mutants: true });
    expect(scopeOf(['src/lib/game/sim/simProtocol.ts']).mutants).toBe(false);
  });

  it('checks and measures coverage for a change to tests alone', () => {
    expect(scopeOf(['src/tests/game/combat.test.ts'])).toEqual({ ...checkOnly, coverage: true });
  });
});

describe('unmappedFiles', () => {
  it('names a file in a directory the manifest does not mention', () => {
    expect(unmappedFiles(['newdir/thing.ts', 'src/lib/a.ts'])).toEqual(['newdir/thing.ts']);
  });

  it('finds every tracked file in the manifest', () => {
    const tracked = execFileSync('git', ['ls-files'], { encoding: 'utf8' })
      .split('\n')
      .filter(Boolean);
    expect(unmappedFiles(tracked)).toEqual([]);
  });

  it('has no pattern that matches no tracked file', () => {
    const tracked = execFileSync('git', ['ls-files'], { encoding: 'utf8' })
      .split('\n')
      .filter(Boolean);
    expect(unusedPatterns(tracked)).toEqual([]);
  });
});

describe('keepsGreen', () => {
  const repo = () => {
    const cwd = mkdtempSync(join(tmpdir(), 'keeps-green-'));
    const git = (...args: string[]) =>
      execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
    const commit = (file: string, text: string) => {
      mkdirSync(join(cwd, dirname(file)), { recursive: true });
      writeFileSync(join(cwd, file), text);
      git('add', file);
      git('-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-qm', `change ${file}`);
      return git('rev-parse', 'HEAD');
    };
    git('init', '-q', '-b', 'dev');
    const start = commit('src/lib/game/sim/simProtocol.ts', 'a');
    git('switch', '-q', '-c', 'work');
    const green = commit('tools/issue.mjs', 'fix');
    const rebasedOnto = (file: string) => {
      git('switch', '-q', 'dev');
      git('reset', '-q', '--hard', start);
      const base = commit(file, 'moved');
      git('switch', '-q', '-C', 'work', base);
      return { base, head: commit('tools/issue.mjs', 'fix') };
    };
    return { cwd, green, rebasedOnto, commit };
  };

  it('keeps the green result when dev gained only paths that run no jobs', () => {
    const { cwd, green, rebasedOnto } = repo();
    const { base, head } = rebasedOnto('tools/runner/new.mjs');
    expect(keepsGreen({ green, base, head, dev: 'dev', cwd })).toBe(true);
  });

  it('runs again when dev gained a path that runs a job', () => {
    const { cwd, green, rebasedOnto } = repo();
    const { base, head } = rebasedOnto('src/lib/game/sim/other.ts');
    expect(keepsGreen({ green, base, head, dev: 'dev', cwd })).toBe(false);
  });

  it('runs again when the work itself changed since it was green', () => {
    const { cwd, green, rebasedOnto, commit } = repo();
    const { base } = rebasedOnto('tools/runner/new.mjs');
    const head = commit('tools/chain.mjs', 'more');
    expect(keepsGreen({ green, base, head, dev: 'dev', cwd })).toBe(false);
  });
});
