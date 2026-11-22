import { it, expect } from 'vitest';
import statsData from '$lib/game/database/pawns/stats.json';
import { pawnStatService } from '$lib/game/services/PawnStatService';
import { createBodyPlanLimbs, DEFAULT_PLAN } from '$lib/game/core/defs/bodyParts';
import type { Mob } from '$lib/game/core/types';

const STATS = {
  strength: 11,
  dexterity: 12,
  intelligence: 13,
  perception: 14,
  charisma: 15,
  constitution: 16
};
const PICKED = [
  'hunger_rate',
  'stamina_recovery_rate',
  'heal_rate',
  'movement_speed',
  'aim_range',
  'mental_resistance',
  'knockdown_resistance',
  'blunt_resistance',
  'trade',
  'dodge'
];

function body(): Mob {
  const limbs = createBodyPlanLimbs(DEFAULT_PLAN, 1);
  limbs.find((l) => l.id === 'left_leg')!.health = 70;
  limbs.flatMap((l) => l.parts ?? []).find((p) => p.id === 'leftKidney')!.health = 5;
  return {
    id: 'formula-slots',
    limbs,
    injuries: [],
    conditions: [],
    stats: STATS,
    physicalTraits: { weight: 83, height: 181 },
    bloodVolume: 100,
    maxBloodVolume: 100
  } as unknown as Mob;
}

function byName(formula: string, vars: Record<string, number>): number {
  const expr = formula.replace(/×/g, '*').replace(/−/g, '-');
  const names = Object.keys(vars);
  const fn = new Function('clamp', ...names, `return (${expr});`) as (...a: unknown[]) => number;
  const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));
  return Math.round(fn(clamp, ...names.map((n) => vars[n])) * 1000) / 1000;
}

it('each stat formula reads every core stat, body measure and capacity from its own slot', () => {
  const m = body();
  const caps = pawnStatService.computeCapacities(m);
  const vars: Record<string, number> = {
    ...Object.fromEntries(Object.entries(STATS).map(([k, v]) => [k.toUpperCase(), v])),
    weight: 83,
    height: 181,
    prestige: 0,
    APT: 1,
    ...caps
  };
  const defs = statsData as unknown as { id: string; formula?: string }[];
  for (const id of PICKED) {
    const def = defs.find((d) => d.id === id)!;
    expect(def.formula, id).toBeTruthy();
    expect(pawnStatService.evaluateStat(id, m), id).toBeCloseTo(byName(def.formula!, vars), 9);
  }
  expect(new Set(PICKED.map((id) => pawnStatService.evaluateStat(id, m))).size).toBe(PICKED.length);
});
