import { describe, it, expect } from 'vitest';
import { generateCulture } from '$lib/game/core/Culture';
import { generatePawns } from '$lib/game/entities/Pawns';
import { itemService } from '$lib/game/services/ItemService';
import { rng } from '$lib/game/core/rng';
import type { GameState, Pawn } from '$lib/game/core/types';

/**
 * CARRY-CAPACITY AUDIT — can a pawn actually afford the kit its build wants?
 *
 * The armour audit found that a one-handed pawn wears full plate AND a shield without ever becoming
 * encumbered, which erases the trade the design rests on: heavy armour is supposed to demand BRAWN,
 * and a one-handed build's dominant stat is AGILITY. This measures whether the capacity curve
 * actually enforces that, across pawns drawn the way a real game draws them.
 *
 * Load already counts everything worn AND wielded (`getCurrentCarryLoad` sums `pawn.equipment`), so
 * shields and weapons do pay their weight. The question is entirely the CAPACITY side.
 */

const KITS: Record<string, string[]> = {
  light: [
    'linen_gambeson',
    'leather_coif',
    'rawhide_shoulder_pads',
    'rawhide_arm_wraps',
    'rawhide_leg_wraps'
  ],
  medium: ['brigandine_coat', 'leather_coif', 'iron_pauldrons', 'iron_bracers', 'iron_greaves'],
  heavy: ['plate_cuirass', 'great_helm', 'steel_pauldrons', 'steel_vambraces', 'steel_greaves']
};
const WEAPON_1H = 'steel_longsword';
const WEAPON_2H = 'steel_greatsword';
const SHIELD = 'iron_boss_shield';

const kg = (ids: string[]) =>
  ids.reduce((s, id) => s + (itemService.getItemById(id)?.weightKg ?? 0), 0);

const state = { turn: 0 } as unknown as GameState;

/** Encumbrance bands the condition uses: the ratio of load to capacity. */
const band = (ratio: number) =>
  ratio <= 0.75 ? 'free' : ratio <= 1.0 ? 'comfortable' : ratio <= 1.25 ? 'burdened' : 'overloaded';

describe('CARRY CAPACITY — does the curve gate heavy armour on brawn?', () => {
  const pop = (() => {
    rng.reseed(20260728);
    const out: Pawn[] = [];
    for (let i = 0; i < 10; i++) out.push(...generatePawns(generateCulture(), 25));
    return out;
  })();

  it('what the capacity curve actually yields across a real population', () => {
    const rows = ['[KIT WEIGHTS]'];
    for (const [name, ids] of Object.entries(KITS))
      rows.push(
        `  ${name.padEnd(7)} armour ${kg(ids).toFixed(1)}kg · +1H ${(kg(ids) + kg([WEAPON_1H])).toFixed(1)}kg · ` +
          `+1H+shield ${(kg(ids) + kg([WEAPON_1H, SHIELD])).toFixed(1)}kg · +2H ${(kg(ids) + kg([WEAPON_2H])).toFixed(1)}kg`
      );

    const brawns = pop.map((p) => p.stats.brawn).sort((a, b) => a - b);
    const weights = pop.map((p) => p.physicalTraits?.weight ?? 70).sort((a, b) => a - b);
    const caps = pop
      .map((p) => itemService.getCarryCapacityBreakdown(p).weight.total)
      .sort((a, b) => a - b);
    const q = (a: number[], f: number) => a[Math.floor(a.length * f)];
    rows.push('');
    rows.push(
      `[POPULATION] n=${pop.length}  brawn p5 ${q(brawns, 0.05)} · median ${q(brawns, 0.5)} · p95 ${q(brawns, 0.95)}`
    );
    rows.push(
      `             bodyweight median ${q(weights, 0.5).toFixed(0)}kg · capacity median ${q(caps, 0.5).toFixed(1)}kg (p5 ${q(caps, 0.05).toFixed(1)} · p95 ${q(caps, 0.95).toFixed(1)})`
    );

    // The old formula was `bodyWeight × clamp(brawn × 0.012, 0.05, 0.3)` and that clamp BOUND at
    // brawn 25 — above it brawn bought nothing, and mass decided the budget. Pin that it is gone: two
    // pawns of the same body but very different brawn must now differ.
    const body = { physicalTraits: { weight: 80, height: 170 }, equipment: {} };
    const capAt = (b: number) =>
      itemService.getCarryCapacityBreakdown({ ...body, stats: { brawn: b } } as unknown as Pawn)
        .weight.total;
    rows.push(
      `             brawn still pays above 25: cap(25) ${capAt(25).toFixed(1)}kg → cap(60) ${capAt(60).toFixed(1)}kg ` +
        `(was flat at the 0.30 clamp)`
    );
    expect(capAt(60), 'brawn must keep paying past the old clamp').toBeGreaterThan(capAt(25) * 1.5);

    rows.push('');
    rows.push('[KIT AFFORDABILITY] share of the population in each encumbrance band');
    rows.push('kit                          free  comfortable  burdened  overloaded');
    const kits: [string, string[]][] = [
      ['1H + light', [...KITS.light, WEAPON_1H]],
      ['1H + shield + light', [...KITS.light, WEAPON_1H, SHIELD]],
      ['1H + shield + medium', [...KITS.medium, WEAPON_1H, SHIELD]],
      ['1H + shield + HEAVY', [...KITS.heavy, WEAPON_1H, SHIELD]],
      ['2H + medium', [...KITS.medium, WEAPON_2H]],
      ['2H + HEAVY', [...KITS.heavy, WEAPON_2H]]
    ];
    const afford: Record<string, Record<string, number>> = {};
    for (const [label, ids] of kits) {
      const load = kg(ids);
      const counts: Record<string, number> = {
        free: 0,
        comfortable: 0,
        burdened: 0,
        overloaded: 0
      };
      for (const p of pop) {
        const cap = itemService.getCarryCapacityBreakdown(p).weight.total;
        counts[band(cap > 0 ? load / cap : 99)]++;
      }
      afford[label] = counts;
      rows.push(
        label.padEnd(28) +
          ['free', 'comfortable', 'burdened', 'overloaded']
            .map((b) =>
              `${((counts[b] / pop.length) * 100).toFixed(0)}%`.padStart(b === 'free' ? 6 : 12)
            )
            .join('')
      );
    }
    console.log(rows.join('\n'));

    // The design claim under test: a heavy kit must be something MOST pawns cannot simply wear.
    const heavyOk = afford['1H + shield + HEAVY'].free + afford['1H + shield + HEAVY'].comfortable;
    console.log(
      `\n  → ${((heavyOk / pop.length) * 100).toFixed(0)}% of ALL pawns can wear plate + shield + sword unencumbered.` +
        `\n    Heavy armour is supposed to demand brawn; a one-handed build's stat is agility.`
    );
    expect(pop.length).toBeGreaterThan(100);
  });

  it('capacity by brawn, at a fixed body — where the curve stops paying', () => {
    const rows = ['[CURVE] capacity for a 70kg body, by brawn'];
    rows.push('brawn   loadFraction   capacity   heavy kit + 1H + shield (33.9kg) fits?');
    for (const b of [8, 12, 16, 20, 25, 30, 40, 60, 100]) {
      const p = {
        stats: { brawn: b },
        physicalTraits: { weight: 70, height: 170 },
        equipment: {}
      } as unknown as Pawn;
      const c = itemService.getCarryCapacityBreakdown(p);
      const load = kg([...KITS.heavy, WEAPON_1H, SHIELD]);
      rows.push(
        String(b).padStart(5) +
          c.weight.loadFraction.toFixed(3).padStart(15) +
          `${c.weight.total.toFixed(1)}kg`.padStart(11) +
          `   ${band(load / c.weight.total)}`
      );
    }
    console.log(rows.join('\n'));
    expect(true).toBe(true);
  });
});
