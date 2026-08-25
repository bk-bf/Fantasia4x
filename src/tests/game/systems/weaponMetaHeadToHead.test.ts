import { describe, it, expect } from 'vitest';
import { appendFileSync } from 'node:fs';
import { STYLES, duel } from './weaponMetaHarness';

describe('WEAPON META — head to head, nobody armoured', () => {
  it('the full matchup grid, and who counters whom', async () => {
    const SEEDS = [11, 23, 37, 41, 59, 71];
    const totalFights = ((STYLES.length * (STYLES.length - 1)) / 2) * SEEDS.length;
    let done = 0;
    const tick = () => {
      if (++done % 50 !== 0 && done !== totalFights) return;
      try {
        appendFileSync(
          '.debug/weapon-meta-progress.log',
          `  [head-to-head] ${done} of ${totalFights} (${((done / totalFights) * 100).toFixed(1)}%)\n`
        );
      } catch {}
    };
    const wins: Record<string, Record<string, number>> = {};
    for (const s of STYLES) wins[s.label] = {};

    for (let i = 0; i < STYLES.length; i++)
      for (let j = i + 1; j < STYLES.length; j++) {
        let a = 0;
        let b = 0;
        for (const seed of SEEDS) {
          const r = await duel(seed, STYLES[i], STYLES[j]);
          tick();
          if (r.aWon) a++;
          if (r.bWon) b++;
        }
        wins[STYLES[i].label][STYLES[j].label] = a;
        wins[STYLES[j].label][STYLES[i].label] = b;
      }

    const total = (l: string) => Object.values(wins[l]).reduce((x, y) => x + y, 0);
    const order = STYLES.slice().sort((x, y) => total(y.label) - total(x.label));

    const grid = [
      '     ' + order.map((_, i) => String(i + 1).padStart(4)).join(''),
      ...order.map(
        (row, i) =>
          `${String(i + 1).padStart(2)} ${row.label.padEnd(22)}` +
          order
            .map((col) =>
              col.label === row.label ? '  —' : String(wins[row.label][col.label] ?? 0).padStart(4)
            )
            .join('')
      )
    ];

    const counters = order.map((s) => {
      const rows = Object.entries(wins[s.label]).sort((x, y) => y[1] - x[1]);
      const best = rows.filter(([, v]) => v >= 5).map(([k, v]) => `${k} (${v} of ${SEEDS.length})`);
      const worst = rows.filter(([, v]) => v <= 1).map(([k]) => k);
      return (
        `  ${s.label.padEnd(22)} won ${String(total(s.label)).padStart(3)} overall\n` +
        `      dominates: ${best.length ? best.join(', ') : 'nothing'}\n` +
        `      helpless against: ${worst.length ? worst.slice(0, 6).join(', ') : 'nothing'}`
      );
    });

    console.log(
      `[2 · HEAD TO HEAD] nobody armoured, ${SEEDS.length} fights per pairing\n` +
        'rows are numbered; the number in each cell is how many of the six the ROW style won\n' +
        grid.join('\n') +
        '\n\nwhere each style’s wins come from (a style that only beats one or two things is a COUNTER,\n' +
        'not a weak build):\n' +
        counters.join('\n')
    );
    for (const s of STYLES) expect(total(s.label)).toBeGreaterThanOrEqual(0);
  }, 7_200_000);
});
