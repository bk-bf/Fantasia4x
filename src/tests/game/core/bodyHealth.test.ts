import { describe, it, expect } from 'vitest';
import { combatService } from '$lib/game/systems/Combat';
import { bodyHealthShare } from '$lib/game/core/rules/body/bodyHealth';
import { createBodyPlanLimbs } from '$lib/game/core/defs/bodyParts';
import { makeMob } from '$lib/game/services/entity/entitySpawning';
import { getCreatureById } from '$lib/game/core/defs/creatures';
import type { GameState, Injury, Pawn } from '$lib/game/core/types';

const cut = (damage: number, bodyPart: string): Injury =>
  ({
    bodyPart,
    type: 'cut',
    severity: 'minor',
    damage,
    bleeding: 0,
    painContribution: 0,
    infected: false
  }) as Injury;

const state = (over: Partial<GameState>): GameState =>
  ({ turn: 0, pawns: [], mobs: [], worldMap: [], ...over }) as unknown as GameState;

const pawn = (): Pawn =>
  ({
    id: 'p1',
    name: 'Hale',
    isAlive: true,
    position: { x: 5, y: 5 },
    currentState: 'Idle',
    stats: {
      strength: 12,
      dexterity: 12,
      constitution: 12,
      intelligence: 12,
      perception: 12,
      charisma: 10
    },
    traits: [],
    equipment: {},
    limbs: createBodyPlanLimbs(),
    injuries: [],
    conditions: [],
    pain: 0,
    bloodVolume: 100,
    maxBloodVolume: 100,
    needs: { hunger: 0, fatigue: 0, sleep: 0, lastSleep: 0, lastMeal: 0 },
    state: { mood: 50 }
  }) as unknown as Pawn;

describe('body health share', () => {
  it('is whole for an unhurt body', () => {
    expect(bodyHealthShare(createBodyPlanLimbs())).toBe(1);
  });

  it('drops when a pawn is wounded', () => {
    const hurt = combatService.applyInjury('p1', cut(10, 'chest'), state({ pawns: [pawn()] }));
    const share = bodyHealthShare(hurt.pawns[0].limbs);
    expect(share).toBeLessThan(1);
    expect(share).toBeGreaterThan(0);
  });

  it('drops when a creature is wounded, and further with a second wound', () => {
    const mob = makeMob(getCreatureById('wolf')!, 5, 5, 0);
    const once = combatService.applyInjuryToMob(mob.id, cut(10, 'chest'), state({ mobs: [mob] }));
    const twice = combatService.applyInjuryToMob(mob.id, cut(10, 'chest'), once);
    const a = bodyHealthShare(once.mobs![0].limbs);
    const b = bodyHealthShare(twice.mobs![0].limbs);
    expect(a).toBeLessThan(1);
    expect(b).toBeLessThan(a);
  });

  it('counts a missing part as no hit points left', () => {
    const limbs = createBodyPlanLimbs();
    const part = limbs[0].parts![0];
    const total = limbs.flatMap((l) => l.parts ?? []).reduce((n, p) => n + p.maxHp, 0);
    part.isMissing = true;
    expect(bodyHealthShare(limbs)).toBeCloseTo(1 - part.maxHp / total);
  });
});
