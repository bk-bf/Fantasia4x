import { describe, it, expect } from 'vitest';
import { combatService } from './Combat';
import { createDefaultBodyParts } from '../core/BodyParts';
import { makeMob } from '../services/entity/entitySpawning';
import { getCreatureById } from '../core/Creatures';
import { rng } from '../core/rng';
import type { GameState, Mob, Pawn } from '../core/types';

/**
 * Big-creature combat fix (creatures.jsonc `naturalArmor` + `bodyScale`, the natural-weapon AP/bleed
 * pass): a thick-hided beast soaks low-armorPen attacks, an AP weapon bites through, the blood pool
 * scales with body size, and a big beast's natural weapon hits proportionally harder. Drives the REAL
 * combatService.resolveHit / entitySpawning.makeMob — no mocks.
 */
const baseStats = {
  strength: 10,
  dexterity: 2, // low dodge → most swings land, so totals are comparable
  constitution: 10,
  intelligence: 8,
  perception: 8,
  charisma: 5
};

const fullLimbs = () =>
  (['head', 'torso', 'left_arm', 'right_arm', 'left_leg', 'right_leg'] as const).map((id) => ({
    id,
    health: 100,
    isMissing: false,
    bleedRate: 0,
    parts: createDefaultBodyParts(id)
  }));

/** A mob with a real creatureId (→ naturalArmor / bodyScale lookups) but caller-controlled stats. */
function makeCreature(creatureId: string, statsOver: Partial<typeof baseStats> = {}): Mob {
  return {
    id: `mob-${creatureId}`,
    creatureId,
    entityClass: 'animal',
    state: 'Attacking',
    stateSince: 0,
    isAlive: true,
    x: 5,
    y: 6,
    health: 100,
    maxHealth: 100,
    stats: { ...baseStats, ...statsOver },
    racialTraits: [],
    bloodVolume: 1000,
    maxBloodVolume: 1000,
    stamina: 50,
    maxStamina: 50,
    limbs: fullLimbs(),
    injuries: [],
    conditions: [],
    pain: 0,
    needs: { hunger: 0, fatigue: 0 }
  } as unknown as Mob;
}

function makeArmedPawn(itemId?: string, statsOver: Partial<typeof baseStats> = {}): Pawn {
  return {
    id: 'p1',
    name: 'Striker',
    isAlive: true,
    position: { x: 5, y: 5 },
    currentState: 'Fighting',
    stats: { ...baseStats, strength: 16, dexterity: 20, ...statsOver },
    racialTraits: [],
    equipment: itemId ? { mainHand: { itemId } } : {},
    limbs: fullLimbs(),
    injuries: [],
    conditions: [],
    pain: 0,
    bloodVolume: 100,
    maxBloodVolume: 100,
    stamina: 50,
    maxStamina: 50
  } as unknown as Pawn;
}

const emptyState = { turn: 0, pawns: [], mobs: [], worldMap: [] } as unknown as GameState;

/** Total damage an attacker deals to a defender over `n` reseeded swings (same rng sequence each call). */
function totalDamage(attacker: Pawn | Mob, defender: Mob, n: number, seed: number): number {
  rng.reseed(seed);
  let sum = 0;
  for (let i = 0; i < n; i++) {
    // Fresh limbs each swing so accumulating wounds don't change part HP between runs.
    const d = { ...defender, limbs: fullLimbs() } as Mob;
    sum += combatService.resolveHit(attacker, d, emptyState).damage;
  }
  return sum;
}

describe('big-creature durability (naturalArmor + bodyScale)', () => {
  it('natural armour soaks damage — a hide-armoured beast takes far less than bare flesh', () => {
    const attacker = makeArmedPawn('bone_tipped_spear'); // piercing, AP 0.12
    const mammoth = makeCreature('woolly_mammoth'); // naturalArmor 55
    const unarmoured = makeCreature('giant_rat'); // no naturalArmor

    const dmgMammoth = totalDamage(attacker, mammoth, 600, 4242);
    const dmgBare = totalDamage(attacker, unarmoured, 600, 4242);

    // Both took the identical rng sequence (same parts/hits/crits); only the hide differs.
    expect(dmgMammoth).toBeLessThan(dmgBare);
    expect(dmgMammoth).toBeLessThan(dmgBare * 0.85);
  });

  it('armour penetration bites through hide — a high-AP weapon keeps more of its damage', () => {
    const mammoth = makeCreature('woolly_mammoth');
    const unarmoured = makeCreature('giant_rat');

    // Low-AP (bone knife 0.1) vs high-AP (bronze punch dagger 0.25). For each weapon, the
    // fraction of damage that survives the hide = vsMammoth / vsBareFlesh.
    const lowAp = makeArmedPawn('bone_knife');
    const highAp = makeArmedPawn('bronze_punch_dagger');

    const lowThrough =
      totalDamage(lowAp, mammoth, 600, 99) / totalDamage(lowAp, unarmoured, 600, 99);
    const highThrough =
      totalDamage(highAp, mammoth, 600, 99) / totalDamage(highAp, unarmoured, 600, 99);

    expect(highThrough).toBeGreaterThan(lowThrough);
  });

  it('bodyScale enlarges the blood/health pool at spawn', () => {
    const mammoth = makeMob(getCreatureById('woolly_mammoth')!, 0, 0, 0);
    const rat = makeMob(getCreatureById('giant_rat')!, 0, 0, 0);

    // con 24 × 5 × bodyScale 3.5 = 420; the rat has no bodyScale → con 4 × 5 = 20.
    expect(mammoth.maxBloodVolume).toBe(420);
    expect(mammoth.maxHealth).toBe(420);
    expect(rat.maxBloodVolume).toBe(20);
  });

  it('a big beast hits harder — bodyScale scales its natural-weapon damage', () => {
    // Equal stats → the only difference is bodyScale (mammoth 3.5 vs wolf 1.1) + its heavier weapons.
    const mammoth = makeCreature('woolly_mammoth', { dexterity: 22 });
    const wolf = makeCreature('wolf', { dexterity: 22 });
    const target = makeCreature('giant_rat', { dexterity: 1 }); // bare flesh, low dodge

    const mammothDmg = totalDamage(mammoth as unknown as Pawn, target, 800, 7);
    const wolfDmg = totalDamage(wolf as unknown as Pawn, target, 800, 7);

    expect(mammothDmg).toBeGreaterThan(wolfDmg * 1.3);
  });

  it('blunt wounds now bleed (contusion) — fists draw some blood over a fight', () => {
    const fists = makeArmedPawn(undefined, { strength: 20 }); // unarmed → blunt fists/kick
    const target = makeCreature('giant_rat');
    rng.reseed(11);
    let anyBleed = false;
    for (let i = 0; i < 200 && !anyBleed; i++) {
      const r = combatService.resolveHit(fists, target, emptyState);
      if (r.hit && r.damageType === 'blunt' && (r.injury?.bleeding ?? 0) > 0) anyBleed = true;
    }
    expect(anyBleed).toBe(true);
  });
});
