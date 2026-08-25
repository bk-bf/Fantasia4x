import { describe, it, expect, beforeEach } from 'vitest';
import { TRAIT_DATABASE } from '$lib/game/core/gen/culture';
import { rng } from '$lib/game/core/util/rng';
import { createBodyPlanLimbs } from '$lib/game/core/defs/bodyParts';
import { pawnStatService } from '$lib/game/services/PawnStatService';
import { isPawnDetected } from '$lib/game/services/entity/entityHelpers';
import {
  detectionScore,
  detectionChance,
  isDetectedBy,
  revealPawnToMob,
  DETECT_MIN,
  DETECT_MAX,
  STEALTH_FORGET_S
} from '$lib/game/core/rules/body/stealth';
import { ticksFromSeconds } from '$lib/game/core/util/time';
import type { Pawn, Mob, Trait } from '$lib/game/core/types';

const byId = (id: string): Trait => {
  const t = TRAIT_DATABASE.find((x) => x.id === id);
  if (!t) throw new Error(`trait ${id} missing`);
  return t;
};

function makePawn(
  id: string,
  traits: Trait[] = [],
  opts: { weight?: number; dex?: number } = {}
): Pawn {
  return {
    id,
    name: id,
    stats: {
      strength: 10,
      dexterity: opts.dex ?? 10,
      intelligence: 10,
      perception: 10,
      charisma: 10,
      constitution: 10
    },
    physicalTraits: { height: 170, weight: opts.weight ?? 70, size: 'medium' },
    traits,
    needs: { hunger: 0, fatigue: 0, sleep: 0, lastSleep: 0, lastMeal: 0 },
    state: { mood: 50, isWorking: false, isSleeping: false, isEating: false },
    isAlive: true,
    conditions: [],
    limbs: createBodyPlanLimbs('humanoid', 1),
    position: { x: 5, y: 5 },
    skills: {},
    equipment: {}
  } as unknown as Pawn;
}

function makeWolf(id: string, per = 8): Mob {
  return {
    id,
    creatureId: 'wolf',
    entityClass: 'mob',
    x: 0,
    y: 0,
    health: 30,
    maxHealth: 30,
    state: 'Wander',
    stateSince: 0,
    needs: { hunger: 0, fatigue: 0 },
    stats: {
      strength: 10,
      dexterity: 10,
      intelligence: 4,
      perception: per,
      charisma: 4,
      constitution: 10
    },
    skills: {},
    isAlive: true
  } as unknown as Mob;
}

const stealthOf = (p: Pawn) => pawnStatService.evaluateStat('stealth', p);

describe('STEALTH — getStealth layers (via evaluateStat)', () => {
  it('Layer A base: default pawn ≈ 0.2, DEX gate zeroes at ≤ 8, small+deft climbs', () => {
    expect(stealthOf(makePawn('default'))).toBeCloseTo(0.2, 3);
    expect(stealthOf(makePawn('clumsy', [], { dex: 8 }))).toBe(0);
    expect(stealthOf(makePawn('clumsier', [], { dex: 6 }))).toBe(0);
    expect(stealthOf(makePawn('scout', [], { weight: 40, dex: 16 }))).toBeCloseTo(1.45 * 0.8, 3);
    expect(stealthOf(makePawn('bulky', [], { weight: 120 }))).toBeCloseTo(0.25 * 0.2, 3);
  });

  it('Layer B: trait additives stack on the base; a veto flaw floors at 0', () => {
    expect(stealthOf(makePawn('prowler', [byId('padded-prowl')]))).toBeCloseTo(0.6, 3);
    expect(stealthOf(makePawn('howler', [byId('constant-howling')]))).toBe(0);
  });

  it('Layer B: natural armour drags stealth (the beast tanky↔stealth fork)', () => {
    expect(stealthOf(makePawn('pelted', [byId('thick-fur')]))).toBe(0);
    expect(stealthOf(makePawn('torn', [byId('padded-prowl'), byId('thick-fur')]))).toBeCloseTo(
      0.28,
      3
    );
  });

  it('Layer B: worn armour — explicit stealthMod wins, otherwise weight derives a penalty', () => {
    const quiet = makePawn('quiet');
    (quiet.equipment as Record<string, unknown>).bodyBase = {
      instanceId: 'i1',
      itemId: 'soot_darkened_jerkin',
      durability: 50
    };
    expect(stealthOf(quiet)).toBeCloseTo(0.5, 3);

    const clanking = makePawn('clanking');
    (clanking.equipment as Record<string, unknown>).bodyMid = {
      instanceId: 'i2',
      itemId: 'boarhide_jerkin',
      durability: 50
    };
    expect(stealthOf(clanking)).toBeCloseTo(0.2 - 3.5 * 0.03, 3);
  });

  it('a full specialist lands in the 1.5–2.2 target band', () => {
    const spec = makePawn('assassin', [byId('padded-prowl')], { weight: 45, dex: 18 });
    (spec.equipment as Record<string, unknown>).bodyBase = {
      instanceId: 'i3',
      itemId: 'soot_darkened_jerkin',
      durability: 50
    };
    const v = stealthOf(spec);
    expect(v).toBeGreaterThanOrEqual(1.5);
    expect(v).toBeLessThanOrEqual(2.2);
  });
});

describe('STEALTH — detection roll math (§5 worked examples)', () => {
  it('detectionScore: dull-eyed floor at PER 8, light-dampened through night vision', () => {
    expect(detectionScore(8, 1, 0)).toBe(0);
    expect(detectionScore(20, 1, 0)).toBeCloseTo(1.44, 3);
    expect(detectionScore(20, 0.2, 0)).toBeCloseTo(1.44 * 0.2, 3);
    expect(detectionScore(20, 0.2, 1)).toBeCloseTo(1.44, 3);
  });

  it('detectionChance: clamped band, proximity ramp, spec table rows', () => {
    expect(detectionChance(0, 1.6, 0)).toBe(DETECT_MIN);
    expect(detectionChance(0, 1.6, 1)).toBeCloseTo(0.13, 3);
    expect(detectionChance(1.44, 1.6, 0)).toBeCloseTo(0.096, 3);
    expect(detectionChance(1.44, 1.6, 1)).toBeCloseTo(0.346, 3);
    expect(detectionChance(0, 0.2, 0)).toBeCloseTo(0.09, 3);
    expect(detectionChance(0, 0.2, 1)).toBeCloseTo(0.34, 3);
    expect(detectionChance(10, 0, 1)).toBe(DETECT_MAX);
  });
});

describe('STEALTH — per-mob detection cache + reveal', () => {
  beforeEach(() => rng.reseed(20260714));

  it('a failed roll is cached until its jittered retry tick (no per-tick re-rolling)', () => {
    const pawn = makePawn('ghost', [byId('padded-prowl')], { weight: 40, dex: 18 });
    const wolf = makeWolf('w1');
    let turn = 1000;
    let tries = 0;
    while (isPawnDetected(wolf, pawn, 10, 10, 1, turn) && tries++ < 50) turn += 500;
    expect(tries).toBeLessThan(50);
    const entry = wolf.stealthChecks![pawn.id];
    expect(entry.detected).toBe(false);
    expect(entry.at).toBeGreaterThan(turn);
    expect(isPawnDetected(wolf, pawn, 1, 10, 1, turn + 1)).toBe(false);
    expect(wolf.stealthChecks![pawn.id]).toBe(entry);
  });

  it('revealPawnToMob sticks, refreshes while watched, and expires after the forget window', () => {
    const pawn = makePawn('ghost2', [byId('padded-prowl')], { weight: 40, dex: 18 });
    const wolf = makeWolf('w2');
    revealPawnToMob(wolf, pawn.id, 100);
    expect(isDetectedBy(wolf, pawn.id)).toBe(true);
    expect(isPawnDetected(wolf, pawn, 5, 10, 1, 150)).toBe(true);
    expect(wolf.stealthChecks![pawn.id].at).toBe(150);
    const later = 150 + ticksFromSeconds(STEALTH_FORGET_S) + 1;
    isPawnDetected(wolf, pawn, 10, 10, 1, later);
    expect(wolf.stealthChecks![pawn.id].at).not.toBe(150);
  });

  it('isDetectedBy: a mob that never saw the pawn treats it as unseen (sneak-shot eligible)', () => {
    const wolf = makeWolf('w3');
    expect(isDetectedBy(wolf, 'nobody')).toBe(false);
  });
});

describe('STEALTH — §9 constraint audit: nothing existing is stealthy by accident', () => {
  it('the default pawn is a non-stealther (< 0.3)', () => {
    expect(stealthOf(makePawn('audit'))).toBeLessThan(0.3);
  });

  it('only the deliberate stealth traits carry a positive stealth effect', () => {
    const DELIBERATE = new Set([
      'padded-prowl',
      'chameleon-skin',
      'ambush-stillness',
      'duskshroud',
      'soft-tread'
    ]);
    for (const t of TRAIT_DATABASE) {
      const s = t.effects?.stealth ?? 0;
      if (s > 0)
        expect(DELIBERATE.has(t.id ?? ''), `${t.id} grants stealth outside the audited set`).toBe(
          true
        );
    }
  });

  it('beast/werewolf stay moderate at most by construction (size tanks the base)', () => {
    const beast = makePawn('beast', [byId('padded-prowl')], { weight: 100, dex: 12 });
    expect(stealthOf(beast)).toBeLessThan(1.0);
  });
});
