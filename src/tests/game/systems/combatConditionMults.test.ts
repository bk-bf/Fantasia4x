import { describe, it, expect } from 'vitest';
import { combatService, type HitResult } from '$lib/game/systems/Combat';
import { createBodyPlanLimbs } from '$lib/game/core/defs/bodyParts';
import { rng } from '$lib/game/core/util/rng';
import type { EntityCondition, GameState, Pawn } from '$lib/game/core/types';

const stats = {
  strength: 12,
  dexterity: 12,
  constitution: 12,
  intelligence: 10,
  perception: 10,
  charisma: 10
};

function body(id: string, transient: string[] = [], conditions: EntityCondition[] = []): Pawn {
  return {
    id,
    name: id,
    isAlive: true,
    position: { x: 5, y: id === 'a' ? 5 : 6 },
    currentState: 'Fighting',
    stats: { ...stats },
    traits: [],
    equipment: {},
    limbs: createBodyPlanLimbs(),
    injuries: [],
    conditions,
    transientConditions: transient,
    conditionTimers: Object.fromEntries(transient.map((t) => [t, 50])),
    pain: 0,
    bloodVolume: 100,
    maxBloodVolume: 100,
    stamina: 50,
    maxStamina: 50,
    needs: { hunger: 0, fatigue: 0 }
  } as unknown as Pawn;
}

function rolls(attacker: Pawn, defender: Pawn, guaranteed = false, n = 3000): HitResult[] {
  rng.reseed(99);
  const state = {
    turn: 0,
    pawns: [attacker, defender],
    mobs: [],
    worldMap: []
  } as unknown as GameState;
  return Array.from({ length: n }, () =>
    combatService.resolveHit(attacker, defender, state, undefined, guaranteed)
  );
}

const hitRate = (hs: HitResult[]) => hs.filter((h) => h.hit).length / hs.length;
const avgDamage = (hs: HitResult[]) => hs.reduce((s, h) => s + h.damage, 0) / hs.length;
const critRate = (hs: HitResult[]) => hs.filter((h) => h.crit).length / hs.length;

describe('conditions scale combat rolls by multiplying', () => {
  it('a winded defender is hit more often, and a winded attacker hits less often, than a fresh one', () => {
    const fresh = hitRate(rolls(body('a'), body('d')));
    const vsWinded = hitRate(rolls(body('a'), body('d', ['winded'])));
    const byWinded = hitRate(rolls(body('a', ['winded']), body('d')));
    expect(vsWinded).toBeGreaterThan(fresh + 0.03);
    expect(byWinded).toBeLessThan(fresh - 0.03);
  });

  it('a badly overmatched attacker hits less often than a fresh one', () => {
    const fresh = hitRate(rolls(body('a'), body('d')));
    const overmatched = hitRate(
      rolls(body('a', [], [{ id: 'overmatched', severity: 0.8 }]), body('d'))
    );
    expect(overmatched).toBeLessThan(fresh - 0.1);
  });

  it('a fouled guard halves blow damage and crit chance, and blood-up lifts damage by about a tenth', () => {
    const fresh = rolls(body('a'), body('d'), true);
    const fouled = rolls(body('a', ['fouled_guard']), body('d'), true);
    const bloodUp = rolls(body('a', ['blood_up']), body('d'), true);
    expect(avgDamage(fouled) / avgDamage(fresh)).toBeLessThan(0.7);
    expect(critRate(fouled)).toBeLessThan(critRate(fresh) * 0.75);
    const lift = avgDamage(bloodUp) / avgDamage(fresh);
    expect(lift).toBeGreaterThan(1.03);
    expect(lift).toBeLessThan(1.4);
  });
});
