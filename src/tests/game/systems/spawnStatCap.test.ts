import { describe, it, expect } from 'vitest';
import { generateCulture, SPAWN_STAT_CAP } from '$lib/game/core/gen/culture';
import { generatePawns } from '$lib/game/entities/Pawns';
import { rng } from '$lib/game/core/util/rng';
import type { Pawn } from '$lib/game/core/types';

const KEYS = ['strength', 'dexterity', 'constitution', 'perception', 'intelligence', 'charisma'] as const;

describe('SPAWN STAT CAP — growth-level-1 pawns are ordinary people', () => {
  it(`no generated pawn exceeds ${SPAWN_STAT_CAP} in any core stat`, () => {
    rng.reseed(20260728);
    const pop: Pawn[] = [];
    for (let i = 0; i < 20; i++) pop.push(...generatePawns(generateCulture(), 25));

    const rows = [`[SPAWN STATS] n=${pop.length} pawns`, 'stat        min   p50   p95   max'];
    const offenders: string[] = [];
    for (const k of KEYS) {
      const xs = pop
        .map((p) => (p.stats as unknown as Record<string, number>)[k])
        .sort((a, b) => a - b);
      const q = (f: number) => xs[Math.floor(xs.length * f)];
      rows.push(
        k.padEnd(12) +
          String(xs[0]).padStart(3) +
          String(q(0.5)).padStart(6) +
          String(q(0.95)).padStart(6) +
          String(xs[xs.length - 1]).padStart(6)
      );
      if (xs[xs.length - 1] > SPAWN_STAT_CAP) offenders.push(`${k} max ${xs[xs.length - 1]}`);
    }
    console.log(rows.join('\n'));

    expect(offenders, 'stats over the spawn cap').toEqual([]);
    const all = pop.flatMap((p) =>
      KEYS.map((k) => (p.stats as unknown as Record<string, number>)[k])
    );
    const median = all.sort((a, b) => a - b)[Math.floor(all.length / 2)];
    expect(median, 'the median pawn should sit well below the cap').toBeLessThan(
      SPAWN_STAT_CAP * 0.8
    );
  });
});
