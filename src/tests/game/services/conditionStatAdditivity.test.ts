import { describe, it, expect } from 'vitest';
import { pawnStatService } from '$lib/game/services/PawnStatService';
import { conditionModifierSum } from '$lib/game/core/rules/body/conditions';
import conditionsData from '$lib/game/database/pawns/conditions.jsonc';
import statsData from '$lib/game/database/pawns/stats.jsonc';
import type { EntityCondition, Pawn } from '$lib/game/core/types';

const STAT_IDS = new Set((statsData as Array<{ id: string }>).map((s) => s.id));
const MULTIPLIED_ELSEWHERE = new Set(['pain', 'consciousness', 'dodge', 'block']);
const CORE_STAT_KEYS = ['strength', 'dexterity', 'constitution', 'perception', 'intelligence'];
const WEAK = 6;
const AVERAGE = 10;
const STRONG = 20;

const limbs = () =>
  ['head', 'torso', 'left_arm', 'right_arm', 'left_leg', 'right_leg'].map((id) => ({
    id,
    health: 100,
    bleedRate: 0,
    parts: []
  }));

function pawnAt(level: number, conditions: EntityCondition[], transient: string[]): Pawn {
  return {
    id: 'p',
    isAlive: true,
    stats: {
      strength: level,
      dexterity: level,
      constitution: level,
      perception: level,
      intelligence: level,
      charisma: 10
    },
    traits: [],
    equipment: {},
    limbs: limbs(),
    conditions,
    transientConditions: transient,
    pain: 0
  } as unknown as Pawn;
}

type Stage = { label: string; minSeverity: number; modifiers?: Record<string, number> };
type Def = {
  id: string;
  transient?: boolean;
  modifiers?: Record<string, number>;
  stages?: Stage[];
};

type Case = {
  what: string;
  key: string;
  value: number;
  conditions: EntityCondition[];
  transient: string[];
  scalesCapacity: boolean;
};

const CAPACITY_FACTOR_KEYS = ['pain', 'consciousness'];
const carriesCapacityFactor = (def: Def): boolean =>
  [def.modifiers, ...(def.stages ?? []).map((s) => s.modifiers)].some((m) =>
    CAPACITY_FACTOR_KEYS.some((k) => (m ?? {})[k] != null)
  );

const cases: Case[] = [];
for (const def of conditionsData as unknown as Def[]) {
  if (def.transient) {
    for (const [key, value] of Object.entries(def.modifiers ?? {})) {
      if (!STAT_IDS.has(key)) continue;
      cases.push({
        what: `${def.id}`,
        key,
        value,
        conditions: [],
        transient: [def.id],
        scalesCapacity: carriesCapacityFactor(def)
      });
    }
    continue;
  }
  const stages = def.stages ?? [];
  stages.forEach((stage, i) => {
    const next = stages[i + 1]?.minSeverity ?? 1;
    const severity = Math.min(0.99, (stage.minSeverity + next) / 2);
    for (const [key, value] of Object.entries(stage.modifiers ?? {})) {
      if (!STAT_IDS.has(key)) continue;
      cases.push({
        what: `${def.id}/${stage.label}`,
        key,
        value,
        conditions: [{ id: def.id, severity }],
        transient: [],
        scalesCapacity: carriesCapacityFactor(def)
      });
    }
  });
}

describe('conditions reach the sim by naming a derived stat, additively', () => {
  it('no condition modifies a core stat any more', () => {
    const offenders: string[] = [];
    for (const def of conditionsData as unknown as Def[]) {
      const sets = [def.modifiers, ...(def.stages ?? []).map((s) => s.modifiers)];
      for (const mods of sets)
        for (const key of Object.keys(mods ?? {}))
          if (CORE_STAT_KEYS.includes(key)) offenders.push(`${def.id}:${key}`);
    }
    expect(offenders).toEqual([]);
  });

  it('there is something to check', () => {
    expect(cases.length).toBeGreaterThan(100);
  });

  it('every condition that names a derived stat moves the sim reader by the same amount for a weak, an average and a strong pawn', () => {
    const failures: string[] = [];
    for (const c of cases) {
      if (MULTIPLIED_ELSEWHERE.has(c.key)) continue;
      if (c.scalesCapacity) {
        const sum = conditionModifierSum(pawnAt(AVERAGE, c.conditions, c.transient), c.key);
        if (Math.abs(sum - c.value) > 1e-9)
          failures.push(`${c.what} ${c.key}: contributed ${sum}, data says ${c.value}`);
        continue;
      }
      const deltas = [WEAK, AVERAGE, STRONG].map((level) => {
        const off = pawnStatService.evaluateStat(c.key, pawnAt(level, [], []));
        const on = pawnStatService.evaluateStat(c.key, pawnAt(level, c.conditions, c.transient));
        return on - off;
      });
      for (const [i, d] of deltas.entries())
        if (Math.abs(d - c.value) > 1e-9)
          failures.push(
            `${c.what} ${c.key}: at stat ${[WEAK, AVERAGE, STRONG][i]} reader moved ${d}, data says ${c.value}`
          );
    }
    expect(failures).toEqual([]);
  });

  it('a modifier whose key is consumed as a factor elsewhere is not also added to the stat of the same name', () => {
    const guarded = cases.filter((c) => MULTIPLIED_ELSEWHERE.has(c.key));
    expect(guarded.length).toBeGreaterThan(0);
    const failures: string[] = [];
    for (const c of guarded) {
      const withCond = pawnAt(AVERAGE, c.conditions, c.transient);
      const off = pawnStatService.evaluateStat(c.key, pawnAt(AVERAGE, [], []));
      const on = pawnStatService.evaluateStat(c.key, withCond);
      if (Math.abs(on - off) > 1e-9)
        failures.push(`${c.what} ${c.key}: reader moved ${on - off}, it must not`);
      if (c.value !== 0 && Math.abs(conditionModifierSum(withCond, c.key) - c.value) > 1e-9)
        failures.push(`${c.what} ${c.key}: expected ${c.value} to be held back`);
    }
    expect(failures).toEqual([]);
  });

  it('a warmth condition is worth the same degrees to a frail pawn as to a hardy one', () => {
    const degs = [WEAK, AVERAGE, STRONG].map((level) => {
      const off = pawnStatService.temperatureTolerance(pawnAt(level, [], []));
      const on = pawnStatService.temperatureTolerance(pawnAt(level, [], ['banked_warmth']));
      return on.coldDeg - off.coldDeg;
    });
    expect(degs[0]).toBeGreaterThan(0);
    expect(degs[1]).toBeCloseTo(degs[0], 9);
    expect(degs[2]).toBeCloseTo(degs[0], 9);
  });

  it('the temperature breakdown names the condition, not the pawn constitution', () => {
    const tol = pawnStatService.temperatureTolerance(pawnAt(WEAK, [], ['banked_warmth']));
    const labels = tol.coldSources.map((s) => s.label);
    expect(labels).toContain('Banked Warmth');
    const con = tol.coldSources.find((s) => s.label === 'Constitution');
    const bare = pawnStatService.temperatureTolerance(pawnAt(WEAK, [], []));
    expect(con?.deg).toBeCloseTo(bare.coldSources.find((s) => s.label === 'Constitution')!.deg, 9);
  });
});
