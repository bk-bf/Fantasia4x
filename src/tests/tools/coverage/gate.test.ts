import { describe, it, expect } from 'vitest';
import { changedGameFiles, summaryText } from '../../../../tools/coverage/gate.mjs';

const SUMMARY = {
  total: { lines: { total: 100, covered: 60, skipped: 0, pct: 60 } },
  'src/lib/game/sim/commands.ts': { lines: { total: 20, covered: 10, skipped: 0, pct: 50 } },
  'src/lib/game/ai/plan.ts': { lines: { total: 10, covered: 9, skipped: 0, pct: 90 } }
};

describe('changedGameFiles', () => {
  it('keeps only the changed files present in the coverage summary, sorted by path', () => {
    expect(
      changedGameFiles(SUMMARY, new Set(['src/lib/game/ai/plan.ts', 'src/lib/game/sim/commands.ts', 'AGENTS.md']))
    ).toEqual([
      { file: 'src/lib/game/ai/plan.ts', pct: 90 },
      { file: 'src/lib/game/sim/commands.ts', pct: 50 }
    ]);
  });

  it('drops the total row and any changed file the summary has no entry for', () => {
    expect(changedGameFiles(SUMMARY, new Set(['total', 'src/lib/game/headless/scenario.ts']))).toEqual([]);
  });

  it('returns nothing when no changed file is in the summary', () => {
    expect(changedGameFiles(SUMMARY, new Set())).toEqual([]);
  });

  it('matches a summary keyed by absolute paths against the repo-relative diff', () => {
    const absolute = {
      total: SUMMARY.total,
      '/repo/src/lib/game/sim/commands.ts': SUMMARY['src/lib/game/sim/commands.ts']
    };
    expect(changedGameFiles(absolute, new Set(['src/lib/game/sim/commands.ts']), '/repo')).toEqual([
      { file: 'src/lib/game/sim/commands.ts', pct: 50 }
    ]);
  });
});

describe('summaryText', () => {
  it('states the total and the time the run took', () => {
    const text = summaryText(60, [], 12.4);
    expect(text).toContain('### Coverage: 60.0% of `src/lib/game` lines, computed in 12s');
    expect(text).not.toContain('| file |');
  });

  it('lists each changed file and its line percentage', () => {
    const text = summaryText(
      60,
      [
        { file: 'src/lib/game/ai/plan.ts', pct: 90 },
        { file: 'src/lib/game/sim/commands.ts', pct: 50 }
      ],
      1
    );
    expect(text).toContain('| `src/lib/game/ai/plan.ts` | 90.0% |');
    expect(text).toContain('| `src/lib/game/sim/commands.ts` | 50.0% |');
  });
});
