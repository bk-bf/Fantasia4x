import { describe, it, expect } from 'vitest';
import { onPush, scopeOf } from '../../../../tools/audit/ci-scope.mjs';

const nothing = { workPins: false, gungraun: false, browser: false, tps: false, bench: false };

describe('scopeOf', () => {
  it('measures nothing for tools and docs', () => {
    expect(scopeOf(['tools/issue.mjs', 'AGENTS.md', 'docs/tasks/ROADMAP.md'])).toEqual(nothing);
  });

  it('measures everything but the Rust instruction counts for a game source change', () => {
    expect(scopeOf(['src/lib/game/sim/commands.ts'])).toEqual({
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
    expect(scopeOf(['tools/bench/dev-save.bench.ts'])).toEqual({ ...nothing, tps: true, bench: true });
    expect(scopeOf(['tools/gungraun/gate.mjs'])).toEqual({ ...nothing, gungraun: true });
  });

  it('measures everything when the gating itself changes', () => {
    for (const file of ['tools/audit/ci-scope.mjs', 'tools/remote/ci.mjs', '.github/workflows/check.yml'])
      expect(Object.values(scopeOf([file])).every(Boolean)).toBe(true);
  });
});

describe('onPush', () => {
  it('runs nothing before a push that the pull request check covers', () => {
    expect(onPush(['tools/issue.mjs', 'AGENTS.md'])).toBeNull();
    expect(onPush(['tools/gungraun/gate.mjs'])).toBeNull();
  });

  it('runs the ticks per second leg before a push that changes the game or its harness', () => {
    expect(onPush(['src/lib/game/sim/commands.ts'])).toBe('tps');
    expect(onPush(['tools/work-pins/gate.mjs'])).toBe('tps');
  });

  it('runs the whole of ci:local before a push that changes the gating', () => {
    for (const file of ['tools/remote/ci.mjs', 'tools/remote/run.mjs', 'scripts/hooks/pre-push'])
      expect(onPush([file, 'src/lib/game/sim/commands.ts'])).toBe('all');
  });
});
