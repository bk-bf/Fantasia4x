import { describe, it, expect } from 'vitest';
import { planGeneration } from '../../../../tools/audit/lib/generations.mjs';

const issue = (number: number, id: string, status: string, symbols: string[] = []) => ({
  path: String(number),
  number,
  data: { id, status, symbols }
});
const finding = (symbol_key: string) => ({ symbol_key });
const permalinked = (file: string, symbol: string) =>
  `[\`${file}\`](https://github.com/bk-bf/Fantasia4x/blob/66202c10/${file})::${symbol}`;
const keys = (findings: { symbol_key: string }[]) => findings.map((f) => f.symbol_key);

describe('planGeneration', () => {
  it('keeps every finding on the issue while it is open', () => {
    const plan = planGeneration(
      'weak-assertion-game-core',
      [issue(48, 'weak-assertion-game-core', 'open', ['src/a.ts::f#0'])],
      [finding('src/a.ts::f#0'), finding('src/b.ts::g#0')]
    );
    expect(plan.id).toBe('weak-assertion-game-core');
    expect(plan.current?.path).toBe('48');
    expect(keys(plan.own)).toEqual(['src/a.ts::f#0', 'src/b.ts::g#0']);
  });

  it('leaves what a closed issue listed with it and gives the rest a follow-up id', () => {
    const plan = planGeneration(
      'weak-assertion-game-core',
      [
        issue(48, 'weak-assertion-game-core', 'closed', [
          permalinked('src/lib/game/core/a.ts', 'f#0')
        ])
      ],
      [finding('src/lib/game/core/a.ts::f#0'), finding('src/lib/game/core/b.ts::g#0')]
    );
    expect(plan.id).toBe('weak-assertion-game-core-2');
    expect(plan.current).toBeNull();
    expect(keys(plan.own)).toEqual(['src/lib/game/core/b.ts::g#0']);
    expect(keys(plan.settled.get('48'))).toEqual(['src/lib/game/core/a.ts::f#0']);
  });

  it('still matches a listed symbol after its file moved folder', () => {
    const plan = planGeneration(
      'raw-id-in-ui-components-ui',
      [
        issue(17, 'raw-id-in-ui-components-ui', 'closed', [
          permalinked('src/lib/components/UI/GameCanvas.svelte', '<markup>#0')
        ])
      ],
      [finding('src/lib/components/UI/canvas/GameCanvas.svelte::<markup>#0')]
    );
    expect(plan.own).toEqual([]);
  });

  it('refreshes the open follow-up rather than opening another', () => {
    const plan = planGeneration(
      'x-core',
      [issue(48, 'x-core', 'closed', ['src/a.ts::f#0']), issue(90, 'x-core-2', 'open')],
      [finding('src/a.ts::f#0'), finding('src/b.ts::g#0'), finding('src/c.ts::h#0')]
    );
    expect(plan.id).toBe('x-core-2');
    expect(plan.current?.path).toBe('90');
    expect(keys(plan.own)).toEqual(['src/b.ts::g#0', 'src/c.ts::h#0']);
  });

  it('opens a third once the follow-up has closed as well', () => {
    const plan = planGeneration(
      'x-core',
      [
        issue(48, 'x-core', 'closed', ['src/a.ts::f#0']),
        issue(90, 'x-core-2', 'closed', ['src/b.ts::g#0'])
      ],
      [finding('src/a.ts::f#0'), finding('src/b.ts::g#0'), finding('src/c.ts::h#0')]
    );
    expect(plan.id).toBe('x-core-3');
    expect(keys(plan.own)).toEqual(['src/c.ts::h#0']);
    expect([...plan.settled.keys()]).toEqual(['48', '90']);
  });

  it('does not count another group whose id only starts the same', () => {
    const plan = planGeneration(
      'dead-branch-components',
      [issue(7, 'dead-branch-components-ui', 'closed', ['src/a.ts::f#0'])],
      [finding('src/a.ts::f#0')]
    );
    expect(plan.id).toBe('dead-branch-components');
    expect(keys(plan.own)).toEqual(['src/a.ts::f#0']);
  });
});
