import { describe, it, expect } from 'vitest';
import { generateCulture, SPAWN_STAT_CAP } from '$lib/game/core/gen/culture';
import { generatePawns } from '$lib/game/entities/Pawns';
import { rng } from '$lib/game/core/util/rng';
import type { Pawn } from '$lib/game/core/types';

/**
 * SPAWN STAT CAP — a starting pawn is an ordinary person.
 *
 * Everything above `SPAWN_STAT_CAP` is EARNED through survival and growth events. That is what makes
 * the build tier ladder a record of a colonist's history rather than a property of their birth roll:
 * every pawn should start around the bottom of it.
 *
 * This regressed once already. The roll curve had been shifted ~1.5× on the theory that pawns should
 * start "nearer a beast's tier", which put 93.4% of pawns over the cap on at least one stat and topped
 * out at 33 — the whole ladder handed out at spawn, with nothing left for growth to give. Capping the
 * culture's stat RANGES was not enough on its own either: trait bonuses land on top of the roll, so 6%
 * still cleared it until the clamp moved after `applyCulturalTraitBonuses`.
 */
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
    // …and the population must not be squashed against the ceiling either — the median should sit well
    // below it, or "growth level 1" means nothing.
    const all = pop.flatMap((p) =>
      KEYS.map((k) => (p.stats as unknown as Record<string, number>)[k])
    );
    const median = all.sort((a, b) => a - b)[Math.floor(all.length / 2)];
    expect(median, 'the median pawn should sit well below the cap').toBeLessThan(
      SPAWN_STAT_CAP * 0.8
    );
  });
});
