import { describe, it, expect } from 'vitest';
import { combatService } from './Combat';
import { healWounds, tendWounds } from './PawnStateMachine';
import { CREATURES } from '../core/Creatures';
import { itemService } from '../services/ItemService';
import { recipeService } from '../services/RecipeService';
import type { GameState, Injury, Mob, Pawn } from '../core/types';

/**
 * Headless combat-sim: drives the REAL combatService.tickCombat over a hand-built
 * state to lock in the COMBAT-SYSTEM behaviours — an undrafted Fighting pawn swings
 * back at an adjacent hostile, and a mob in Attacking state damages an adjacent pawn.
 */
const stats = {
  strength: 14,
  dexterity: 16,
  constitution: 12,
  intelligence: 10,
  perception: 10,
  charisma: 10
};

function makePawn(over: Partial<Pawn> = {}): Pawn {
  return {
    id: 'p1',
    name: 'Wren',
    isAlive: true,
    position: { x: 5, y: 5 },
    currentState: 'Fighting',
    stats: { ...stats, dexterity: 20 },
    racialTraits: [],
    equipment: {},
    limbs: [
      { id: 'head', health: 100, bleedRate: 0, parts: [] },
      { id: 'torso', health: 100, bleedRate: 0, parts: [] },
      { id: 'left_arm', health: 100, bleedRate: 0, parts: [] },
      { id: 'right_arm', health: 100, bleedRate: 0, parts: [] },
      { id: 'left_leg', health: 100, bleedRate: 0, parts: [] },
      { id: 'right_leg', health: 100, bleedRate: 0, parts: [] }
    ],
    injuries: [],
    conditions: [],
    pain: 0,
    bloodVolume: 100,
    maxBloodVolume: 100,
    stamina: 50,
    maxStamina: 50,
    ...(over as object)
  } as unknown as Pawn;
}

function makeGoblin(over: Partial<Mob> = {}): Mob {
  return {
    id: 'g1',
    creatureId: 'goblin',
    entityClass: 'mob',
    state: 'Attacking',
    stateSince: 0,
    isAlive: true,
    x: 5,
    y: 6, // adjacent to the pawn at (5,5)
    health: 35,
    maxHealth: 35,
    stats: { ...stats, dexterity: 4 },
    racialTraits: [],
    bloodVolume: 100,
    maxBloodVolume: 100,
    stamina: 50,
    maxStamina: 50,
    limbs: [
      { id: 'head', health: 100, bleedRate: 0, parts: [] },
      { id: 'torso', health: 100, bleedRate: 0, parts: [] },
      { id: 'left_arm', health: 100, bleedRate: 0, parts: [] },
      { id: 'right_arm', health: 100, bleedRate: 0, parts: [] },
      { id: 'left_leg', health: 100, bleedRate: 0, parts: [] },
      { id: 'right_leg', health: 100, bleedRate: 0, parts: [] }
    ],
    injuries: [],
    conditions: [],
    pain: 0,
    needs: { hunger: 0, fatigue: 0 },
    ...(over as object)
  } as unknown as Mob;
}

function makeState(pawns: Pawn[], mobs: Mob[]): GameState {
  return { turn: 0, pawns, mobs, worldMap: [] } as unknown as GameState;
}

describe('combat sim (headless tickCombat)', () => {
  it('an undrafted Fighting pawn swings back at an adjacent hostile', () => {
    let state = makeState([makePawn()], [makeGoblin({ state: 'Wander' })]); // mob passive so only the pawn attacks
    let mobInjured = false;
    for (let t = 0; t < 600 && !mobInjured; t++) {
      state = { ...state, turn: t };
      state = combatService.tickCombat(state, 16);
      if ((state.mobs![0].injuries?.length ?? 0) > 0) mobInjured = true;
    }
    expect(mobInjured).toBe(true);
  });

  it('part damage accumulates and a sustained beating drops a mob via pain collapse', () => {
    // Pawn-only attacker (goblin Wandering, so it never swings back). The goblin can
    // only die from cumulative pain collapse here — vital organs (hitWeight 0) are
    // never directly struck — so this also proves collapse, not a lucky vital hit.
    let state = makeState([makePawn()], [makeGoblin({ state: 'Wander' })]);
    let accumulated = false;
    let maxPain = 0;
    let died = false;
    for (let t = 0; t < 6000 && !died; t++) {
      state = { ...state, turn: t };
      state = combatService.tickCombat(state, 16);
      const g = state.mobs![0];
      maxPain = Math.max(maxPain, g.pain ?? 0);
      // Total HP lost across all body parts — stays 0 under the old bug (parts never
      // persisted); grows once damage actually accumulates.
      const lost = (g.limbs ?? []).reduce(
        (s, l) => s + (l.parts ?? []).reduce((ps, p) => ps + (p.maxHp - p.health), 0),
        0
      );
      if (lost > 15) accumulated = true;
      if (g.isAlive === false || g.state === 'Corpse') died = true;
    }
    expect(accumulated).toBe(true); // bug fix: part damage persists and accumulates
    expect(died).toBe(true); // the fight resolves via collapse (vitals are never struck)
    expect(maxPain).toBeGreaterThan(30); // …with pain a real driver of the downing
  });

  it('an Attacking mob damages the adjacent pawn', () => {
    // Accurate mob vs low-dodge pawn so hits land reliably regardless of rng sequence.
    const target = makePawn({ currentState: 'Idle', stats: { ...stats, dexterity: 3 } });
    let state = makeState([target], [makeGoblin({ stats: { ...stats, dexterity: 16 } })]);
    let pawnInjured = false;
    for (let t = 0; t < 600 && !pawnInjured; t++) {
      state = { ...state, turn: t };
      state = combatService.tickCombat(state, 16);
      if ((state.pawns[0].injuries?.length ?? 0) > 0) pawnInjured = true;
    }
    expect(pawnInjured).toBe(true);
  });

  it('rolls between a pawn’s natural weapons (fists/kick) with per-weapon stamina', () => {
    const attacker = makePawn();
    const defender = makeGoblin({ stats: { ...stats, dexterity: 2 } }); // low dodge → lots of hits
    const empty = makeState([], []);
    const seen = new Set<string>();
    const staminaByWeapon = new Map<string, number>();
    for (let i = 0; i < 400; i++) {
      const r = combatService.resolveHit(attacker, defender, empty);
      seen.add(r.weaponId);
      staminaByWeapon.set(r.weaponId, r.staminaCost);
    }
    // Both bare-handed attacks should turn up across 400 swings.
    expect(seen.has('fists')).toBe(true);
    expect(seen.has('kick')).toBe(true);
    // Kicks cost more stamina than jabs (per-weapon staminaCost surfaced).
    expect(staminaByWeapon.get('kick')!).toBeGreaterThan(staminaByWeapon.get('fists')!);
  });

  it('lands critical hits for a high-crit attacker (stat + weapon critMod)', () => {
    // High DEX/PER pawn → high base crit_chance; low-dodge target → mostly hits.
    const attacker = makePawn({ stats: { ...stats, dexterity: 22, perception: 22 } });
    const defender = makeGoblin({ stats: { ...stats, dexterity: 1 } });
    const empty = makeState([], []);
    let crits = 0;
    let hits = 0;
    for (let i = 0; i < 500; i++) {
      const r = combatService.resolveHit(attacker, defender, empty);
      if (r.hit) hits++;
      if (r.crit) crits++;
    }
    expect(hits).toBeGreaterThan(0);
    expect(crits).toBeGreaterThan(0);
  });

  it('a Hunting pawn attacks its marked quarry even though the prey is neutral', () => {
    // A huntable deer is NOT a "hostile" (the Fighting/auto-engage path would ignore it),
    // so this proves the work-driven hunt path: a pawn in Hunting with huntTargetId set
    // swings at that specific mob and kills it — yielding a corpse to butcher.
    const hunter = makePawn({ currentState: 'Hunting', huntTargetId: 'deer1' });
    const prey = makeGoblin({
      id: 'deer1',
      entityClass: 'animal',
      state: 'Wander', // peaceful — never attacks back
      markedForHunt: true,
      stats: { ...stats, dexterity: 2 } // low dodge so swings land
    });
    let state = makeState([hunter], [prey]);
    let died = false;
    for (let t = 0; t < 6000 && !died; t++) {
      state = { ...state, turn: t };
      state = combatService.tickCombat(state, 16);
      const d = state.mobs![0];
      if (d.isAlive === false || d.state === 'Corpse') died = true;
    }
    expect(died).toBe(true);
  });

  it('a drafted pawn with NO attack order auto-engages an adjacent hostile (NT-4)', () => {
    // Player walked a drafted pawn next to a hostile but never issued an attack order.
    // It must still defend itself rather than stand inert — damage the adjacent goblin.
    const guard = makePawn({ drafted: true, draftTarget: undefined, currentState: 'Idle' });
    const goblin = makeGoblin({ state: 'Attacking', stats: { ...stats, dexterity: 2 } });
    let state = makeState([guard], [goblin]);
    let goblinDamaged = false;
    for (let t = 0; t < 2000 && !goblinDamaged; t++) {
      state = { ...state, turn: t };
      state = combatService.tickCombat(state, 16);
      const g = state.mobs![0];
      const hpLost = (g.limbs ?? []).reduce(
        (s, l) => s + (l.parts ?? []).reduce((ps, p) => ps + (p.maxHp - p.health), 0),
        0
      );
      if (hpLost > 0 || g.isAlive === false || g.state === 'Corpse') goblinDamaged = true;
    }
    expect(goblinDamaged).toBe(true);
  });

  it('a winded entity cannot attack — it passes turns instead (stamina gate)', () => {
    // Pawn out of breath (winded latched, stamina 0) standing next to a goblin: it must NOT swing.
    const winded = makePawn({
      currentState: 'Fighting',
      stamina: 0,
      maxStamina: 50,
      statusEffectDurations: { winded: 2 }
    });
    const goblin = makeGoblin({ state: 'Wander', stats: { ...stats, dexterity: 1 } }); // peaceful, won't hit back
    let state = makeState([winded], [goblin]);
    for (let t = 0; t < 10; t++) {
      state = { ...state, turn: t };
      state = combatService.tickCombat(state, 16);
    }
    const g = state.mobs![0];
    const hpLost = (g.limbs ?? []).reduce(
      (s, l) => s + (l.parts ?? []).reduce((ps, p) => ps + (p.maxHp - p.health), 0),
      0
    );
    expect(hpLost).toBe(0); // never swung while winded
    expect((state.pawns[0].statusEffectDurations?.winded ?? 0) > 0).toBe(true); // still winded (stamina ≪ max)
  });

  it('a winded entity recovers stamina each turn and un-winds at full', () => {
    // Small pool so the test reaches full quickly; resting (not Fighting, no enemy) → full regen rate.
    const winded = makePawn({
      currentState: 'Idle',
      stamina: 0,
      maxStamina: 1,
      statusEffectDurations: { winded: 2 }
    });
    let state = makeState([winded], []);
    for (let t = 0; t < 40; t++) {
      state = { ...state, turn: t };
      state = combatService.tickCombat(state, 16);
    }
    const p = state.pawns[0];
    expect(p.stamina).toBe(1); // recovered to full
    expect(p.statusEffectDurations?.winded ?? 0).toBe(0); // latch cleared
    expect(p.activeEffects ?? []).not.toContain('winded');
  });
});

describe('wound system (stacking + healing)', () => {
  const crush = (dmg: number): Injury => ({
    bodyPart: 'leftLittleFinger',
    type: 'crush',
    severity: 'minor',
    damage: dmg,
    bleeding: 0,
    painContribution: 0,
    infected: false
  });

  it('stacks same-type hits into one escalating wound (not five entries)', () => {
    let state = makeState([], [makeGoblin()]);
    for (let i = 0; i < 5; i++) {
      state = combatService.applyInjuryToMob('g1', crush(2), state);
    }
    const finger = state
      .mobs![0].limbs!.find((l) => l.id === 'left_arm')!
      .parts!.find((p) => p.id === 'leftLittleFinger')!;
    expect(finger.injuries).toHaveLength(1); // merged, not 5
    expect(finger.injuries[0].type).toBe('crush');
    // little finger maxHp 8; 5×2 = 10 capped at 8 → fully destroyed (severity escalated)
    expect(finger.injuries[0].severity).toBe('destroyed');
    expect(state.mobs![0].pain ?? 0).toBeGreaterThan(0);
  });

  it('keeps different damage types as separate wounds on the same part', () => {
    let state = makeState([], [makeGoblin()]);
    state = combatService.applyInjuryToMob('g1', crush(2), state);
    state = combatService.applyInjuryToMob('g1', { ...crush(2), type: 'cut' }, state);
    const finger = state
      .mobs![0].limbs!.find((l) => l.id === 'left_arm')!
      .parts!.find((p) => p.id === 'leftLittleFinger')!;
    expect(finger.injuries.map((w) => w.type).sort()).toEqual(['crush', 'cut']);
  });

  it('tended wounds heal faster than untended ones (treatment quality)', () => {
    let state = makeState([makePawn({ currentState: 'Idle' })], []);
    state = combatService.applyInjury('p1', { ...crush(20), bodyPart: 'chest' }, state);
    state = combatService.applyInjury('p1', { ...crush(20), bodyPart: 'leftUpperLeg' }, state);
    // Tend the chest wound only (treatedAt now, high quality).
    const pawn: Pawn = {
      ...state.pawns[0],
      limbs: state.pawns[0].limbs!.map((l) => ({
        ...l,
        parts: (l.parts ?? []).map((p) =>
          p.id === 'chest'
            ? {
                ...p,
                injuries: p.injuries.map((w) => ({ ...w, treatedAt: 0, treatmentQuality: 0.8 }))
              }
            : p
        )
      }))
    };
    const woundDmg = (pw: Pawn, partId: string) =>
      pw.limbs!.flatMap((l) => l.parts ?? []).find((p) => p.id === partId)!.injuries[0].damage;
    const chestBefore = woundDmg(pawn, 'chest');
    const legBefore = woundDmg(pawn, 'leftUpperLeg');
    const healed = healWounds(pawn, 1);
    expect(chestBefore - woundDmg(healed, 'chest')).toBeGreaterThan(
      legBefore - woundDmg(healed, 'leftUpperLeg')
    );
  });

  it('tending consumes the best medicine and boosts treatment quality', () => {
    // Wound a pawn, then tend with a Chewed Poultice in the stockpile.
    let state = makeState([makePawn({ currentState: 'Idle' })], []) as GameState;
    state = combatService.applyInjury('p1', { ...crush(20), bodyPart: 'chest' }, state);
    state = {
      ...state,
      stockpile: { chewed_poultice: 1 },
      stockpileZones: [
        {
          id: 'z1',
          name: 'med',
          tiles: [],
          filter: { allowedCategories: [], blockedItems: [] },
          inventory: { chewed_poultice: 1 }
        }
      ]
    } as GameState;

    const after = tendWounds(state.pawns[0], state);
    const wound = after.pawns[0].limbs!.flatMap((l) => l.parts ?? []).find((p) => p.id === 'chest')!
      .injuries[0];
    // Poultice medicineQuality 0.5 → treated, and quality is at least that.
    expect(wound.treatmentQuality ?? 0).toBeGreaterThanOrEqual(0.5);
    expect(wound.treatedAt).toBeDefined();
    // …and the dose was consumed.
    expect(after.stockpile.chewed_poultice ?? 0).toBe(0);
  });

  it('the poultice recipe and medicine items are well-formed', () => {
    const herb = itemService.getItemById('woundwort');
    const poultice = itemService.getItemById('chewed_poultice');
    expect(herb?.medicineQuality).toBeGreaterThan(0);
    expect(poultice?.medicineQuality).toBeGreaterThan(herb!.medicineQuality!);
    // recipe now lives in the registry (recipes.jsonc), not inline on the item
    const recipe = recipeService.getRecipeForItem('chewed_poultice');
    expect(recipe?.inputs?.woundwort).toBeGreaterThan(0); // recipe references the herb
  });

  it('wounds heal over time, restoring HP and lowering pain to zero', () => {
    let state = makeState([makePawn({ currentState: 'Idle' })], []);
    state = combatService.applyInjury('p1', { ...crush(20), bodyPart: 'chest' }, state);
    let pawn = state.pawns[0];
    expect(pawn.pain ?? 0).toBeGreaterThan(0);
    expect((pawn.injuries ?? []).length).toBe(1);
    for (let i = 0; i < 8000 && (pawn.injuries?.length ?? 0) > 0; i++) pawn = healWounds(pawn);
    expect(pawn.injuries ?? []).toHaveLength(0);
    expect(pawn.pain).toBe(0);
  });
});

describe('natural-weapon data contract', () => {
  it('every creature natural-weapon id resolves to a natural_weapon item', () => {
    for (const creature of CREATURES) {
      for (const id of creature.naturalWeapons) {
        const item = itemService.getItemById(id);
        expect(item, `${creature.id} references missing weapon '${id}'`).toBeDefined();
        expect(item!.category, `'${id}' should be a natural_weapon`).toBe('natural_weapon');
        expect(item!.weaponProperties, `'${id}' needs weaponProperties`).toBeDefined();
      }
    }
  });

  it('pawn default attacks (fists/kick) exist as natural_weapon items', () => {
    for (const id of ['fists', 'kick']) {
      const item = itemService.getItemById(id);
      expect(item?.category).toBe('natural_weapon');
      expect(item?.weaponProperties?.damageType).toBeDefined();
    }
  });
});
