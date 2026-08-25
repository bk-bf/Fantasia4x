import { describe, it, expect } from 'vitest';
import { writeFileSync, mkdirSync } from 'node:fs';
import {
  ARMOUR,
  WEAPONS,
  FITS,
  SEEDS,
  runFit,
  type Fit,
  type FitResult
} from './weaponPawnFitHarness';

const CLASS = 'medium';

describe('WEAPON x PAWN FIT — target in medium armour', () => {
  it('every weapon, in well-suited / average / poor hands', async () => {
    const rows: Record<string, Partial<Record<Fit, FitResult>>> = {};
    for (const [label, id] of WEAPONS) {
      rows[label] = {};
      for (const fit of FITS) rows[label][fit] = await runFit(id, fit, ARMOUR[CLASS]);
    }

    const fights = SEEDS.length;
    const cell = (r?: FitResult) => {
      if (!r) return '      —    ';
      const eff = r.ticks ? (r.effect / r.ticks) * 1000 : 0;
      return `${eff.toFixed(1)}pts ${r.wins}/${fights}`.padStart(12);
    };
    const lines = WEAPONS.map(([label]) => {
      const r = rows[label];
      const suited = r.suited!;
      const armAt = suited.landed ? suited.armourAtHits / suited.landed : 0;
      const gain = suited.wins - (r.poor?.wins ?? 0);
      return (
        label.padEnd(16) +
        cell(r.suited) +
        cell(r.average) +
        cell(r.poor) +
        `   ${armAt.toFixed(1)} armour at hit` +
        `   suited beats poor by ${gain >= 0 ? '+' : ''}${gain}`
      );
    });

    try {
      mkdirSync('.debug/audit', { recursive: true });
      writeFileSync(
        `.debug/audit/pawnFit-${CLASS}.json`,
        JSON.stringify(
          {
            kind: 'pawnFit',
            armour: CLASS,
            fights: SEEDS.length,
            rows: WEAPONS.map(([label]) => {
              const r = rows[label];
              const s2 = r.suited!;
              return {
                weapon: label,
                armourAtHit: s2.landed ? s2.armourAtHits / s2.landed : 0,
                fits: FITS.map((f) => {
                  const x = r[f]!;
                  return {
                    fit: f,
                    wins: x.wins,
                    landed: x.landed,
                    swings: x.swings,
                    perHit: x.landed ? x.damage / x.landed : 0,
                    effectPer1k: x.ticks ? (x.effect / x.ticks) * 1000 : 0
                  };
                })
              };
            })
          },
          null,
          1
        )
      );
    } catch {}

    console.log(
      `[WEAPON x PAWN FIT · target in MEDIUM] ${fights} fights per cell, wins and damage per landed hit\n` +
        'combat value wrecked per 1000 ticks (kills in brackets)\n' +
        'weapon               suited      average         poor\n' +
        lines.join('\n')
    );

    for (const [label] of WEAPONS)
      expect(rows[label].suited, `${label} produced no result`).toBeDefined();
  }, 3_600_000);
});
