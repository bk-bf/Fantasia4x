import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { scopeOf, unmappedFiles } from '../../../../tools/ci/ci-scope.mjs';

const none = {
  check: false,
  coverage: false,
  workPins: false,
  gungraun: false,
  browser: false,
  tps: false,
  bench: false
};
const checkOnly = { ...none, check: true };

describe('scopeOf', () => {
  it('runs nothing when only Markdown, agent config or the desktop spike change', () => {
    expect(
      scopeOf([
        'AGENTS.md',
        'tools/README.md',
        '.claude/settings.json',
        'desktop-spike/tauri/package.json'
      ])
    ).toEqual(none);
  });

  it('checks a tool or workflow change but measures nothing', () => {
    expect(
      scopeOf(['tools/issue.mjs', '.github/workflows/check.yml', 'electron/main.cjs'])
    ).toEqual(checkOnly);
  });

  it('runs every leg but the Rust instruction counts for a game source change', () => {
    expect(scopeOf(['src/lib/game/sim/commands.ts'])).toEqual({
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
});
