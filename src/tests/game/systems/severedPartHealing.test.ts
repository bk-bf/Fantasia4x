import { describe, it, expect } from 'vitest';
import { combatService } from '$lib/game/systems/Combat';
import { healWounds } from '$lib/game/systems/PawnStateMachine';
import { healLimbs, healLimbsInPlace, rollWoundClotting } from '$lib/game/core/defs/wounds';
import { createBodyPlanLimbs } from '$lib/game/core/defs/bodyParts';
import { pawnStatService } from '$lib/game/services/PawnStatService';
import type { GameState, Injury, Pawn, LimbState } from '$lib/game/core/types';

function makePawn(): Pawn {
  return {
    id: 'severed-finger',
    name: 'Hale',
    isAlive: true,
    position: { x: 5, y: 5 },
    currentState: 'Sleeping',
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
    limbs: createBodyPlanLimbs('humanoid'),
    injuries: [],
    conditions: [],
    pain: 0,
    bloodVolume: 100,
    maxBloodVolume: 100,
    needs: { hunger: 0, fatigue: 0, sleep: 0, lastSleep: 0, lastMeal: 0 },
    state: { mood: 50 }
  } as unknown as Pawn;
}

function severedFingerPawn(): Pawn {
  const cut = {
    bodyPart: 'leftIndexFinger',
    type: 'cut',
    severity: 'minor',
    damage: 999,
    bleeding: 0,
    painContribution: 0,
    infected: false
  } as Injury;
  const state = { turn: 0, pawns: [makePawn()], mobs: [], worldMap: [] } as unknown as GameState;
  const pawn = combatService.applyInjury('severed-finger', cut, state).pawns[0];
  for (let i = 0; i < 6; i++) rollWoundClotting(pawn.limbs as LimbState[], 1, i);
  return pawn;
}

describe('a severed part with nothing left to heal', () => {
  it('is missing and holds a non-permanent destroyed wound that no longer bleeds', () => {
    const finger = severedFingerPawn()
      .limbs!.flatMap((l) => l.parts ?? [])
      .find((p) => p.id === 'leftIndexFinger')!;
    expect(finger.isMissing).toBe(true);
    expect(finger.injuries.map((w) => [w.severity, !!w.permanent, w.bleeding])).toEqual([
      ['destroyed', false, 0]
    ]);
  });

  it('leaves healLimbs returning the same limbs', () => {
    const limbs = severedFingerPawn().limbs as LimbState[];
    expect(healLimbs(limbs, 0.05, 100, true, true)).toBe(limbs);
  });

  it('leaves healLimbsInPlace reporting no change', () => {
    expect(healLimbsInPlace(severedFingerPawn().limbs as LimbState[], 0.05, 100, false)).toBe(
      false
    );
  });

  it('keeps the pawn and its capacity cache entry across 100 healing ticks', () => {
    let pawn = severedFingerPawn();
    pawnStatService.computeCapacities(pawn);
    const svc = pawnStatService as unknown as { _capMiss: number };
    const missesBefore = svc._capMiss;
    let replaced = 0;
    for (let t = 0; t < 100; t++) {
      const next = healWounds(pawn, 100 + t);
      if (next.limbs !== pawn.limbs) replaced++;
      pawn = next;
      pawnStatService.computeCapacities(pawn);
    }
    expect(replaced).toBe(0);
    expect(svc._capMiss - missesBefore).toBe(0);
  });
});
