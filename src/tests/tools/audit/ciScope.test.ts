import { describe, it, expect } from 'vitest';
import { scopeOf } from '../../../../tools/audit/ci-scope.mjs';

const checkOnly = { check: true, workPins: false, gungraun: false, browser: false, tps: false, bench: false };

describe('scopeOf', () => {
  it('checks a tool change but measures nothing', () => {
    expect(scopeOf(['tools/issue.mjs', 'AGENTS.md', 'docs/tasks/ROADMAP.md'])).toEqual(checkOnly);
  });

  it('skips the check and every leg when only Markdown or docs change', () => {
    expect(scopeOf(['AGENTS.md', 'tools/README.md', 'docs/tasks/ROADMAP.md'])).toEqual({ ...checkOnly, check: false });
  });

  it('measures everything but the Rust instruction counts for a game source change', () => {
    expect(scopeOf(['src/lib/game/sim/commands.ts'])).toEqual({
      check: true,
      workPins: true,
      gungraun: false,
      browser: true,
      tps: true,
      bench: true
    });
  });

  it('counts instructions when a Rust crate changes', () => {
    expect(scopeOf(['sim-core/src/lib.rs']).gungraun).toBe(true);
  });

  it('runs only the harness that changed', () => {
    expect(scopeOf(['tools/bench/dev-save.bench.ts'])).toEqual({ ...checkOnly, tps: true, bench: true });
    expect(scopeOf(['tools/gungraun/gate.mjs'])).toEqual({ ...checkOnly, gungraun: true });
  });

  it('measures nothing when only the CI files change, since no leg runs them', () => {
    for (const file of [
      'tools/audit/ci-scope.mjs',
      'tools/remote/ci.mjs',
      'tools/remote/run.mjs',
      'tools/hooks/pre-push',
      '.github/workflows/check.yml'
    ])
      expect(scopeOf([file])).toEqual(checkOnly);
  });
});
