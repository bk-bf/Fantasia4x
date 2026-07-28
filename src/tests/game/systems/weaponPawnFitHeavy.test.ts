import { describe, it, expect } from 'vitest';
import { ARMOUR, WEAPONS, FITS, SEEDS, runFit, type Fit, type FitResult } from './weaponPawnFitHarness';

/**
 * WEAPON × PAWN FIT — target in HEAVY armour.
 *
 * One armour class per file so the three run at once; see `weaponPawnFitHarness.ts` for the design and
 * for why the armour-at-hit-location column exists (the hammer question).
 */
const CLASS = 'heavy';

describe('WEAPON x PAWN FIT — target in heavy armour', () => {
  it('every weapon, in well-suited / average / poor hands', async () => {
    const rows: Record<string, Partial<Record<Fit, FitResult>>> = {};
    for (const [label, id] of WEAPONS) {
      rows[label] = {};
      for (const fit of FITS) rows[label][fit] = await runFit(id, fit, ARMOUR[CLASS]);
    }

    const fights = SEEDS.length;
    const cell = (r?: FitResult) => {
      if (!r) return '     —    ';
      const perHit = r.landed ? r.damage / r.landed : 0;
      return `${r.wins}/${fights} ${perHit.toFixed(0)}dmg`.padStart(10);
    };
    const lines = WEAPONS.map(([label]) => {
      const r = rows[label];
      const suited = r.suited!;
      // Armour actually present where this weapon's blows landed — low means it is finding gaps and
      // its penetration is going to waste; high means it is earning its penetration.
      const armAt = suited.landed ? suited.armourAtHits / suited.landed : 0;
      const gain = (suited.wins - (r.poor?.wins ?? 0));
      return (
        label.padEnd(16) +
        cell(r.suited) +
        cell(r.average) +
        cell(r.poor) +
        `   ${armAt.toFixed(1)} armour at hit` +
        `   suited beats poor by ${gain >= 0 ? '+' : ''}${gain}`
      );
    });

    console.log(
      `[WEAPON x PAWN FIT · target in HEAVY] ${fights} fights per cell, wins and damage per landed hit\n` +
        'weapon             suited     average       poor\n' +
        lines.join('\n')
    );

    // Every weapon must at least be usable by the pawn built for it.
    for (const [label] of WEAPONS)
      expect(rows[label].suited, `${label} produced no result`).toBeDefined();
  }, 3_600_000);
});
