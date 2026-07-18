import { describe, it, expect } from 'vitest';
import { combatService } from '$lib/game/systems/Combat';
import { healWounds } from '$lib/game/systems/PawnStateMachine';
import { tendPatient } from '$lib/game/services/jobs/caretake';
import { CREATURES } from '$lib/game/core/Creatures';
import { createBodyPlanLimbs, organsOf, PART_DEF_MAP } from '$lib/game/core/BodyParts';
import { itemService } from '$lib/game/services/ItemService';
import { recipeService } from '$lib/game/services/RecipeService';
import type { GameState, Injury, Mob, Pawn } from '$lib/game/core/types';

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

// The combat rebalance made bare fists claw-tier (8 dmg), so a full-strength pawn now BEATS a passive
// goblin to death. The down-not-kill / collapse tests below need the low-damage regime they were built
// for, so they use a deliberately weak (STR 5) attacker — raw ≈ 8 × 0.5 = 4, matching the old
// str14 × fists3 ≈ 4.2 — which downs via cumulative pain instead of destroying a limb.
const weakStats = { ...stats, strength: 5, dexterity: 20 };

function makePawn(over: Partial<Pawn> = {}): Pawn {
  return {
    id: 'p1',
    name: 'Wren',
    isAlive: true,
    position: { x: 5, y: 5 },
    currentState: 'Fighting',
    stats: { ...stats, dexterity: 20 },
    traits: [],
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
    traits: [],
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
    for (let t = 0; t < 1500 && !mobInjured; t++) {
      state = { ...state, turn: t };
      state = combatService.tickCombat(state, 16);
      if ((state.mobs![0].injuries?.length ?? 0) > 0) mobInjured = true;
    }
    expect(mobInjured).toBe(true);
  });

  it('a wounded charger (chargesWhenWounded) retaliates against its attacker — the mammoth bug', () => {
    // A placid grazer (boar / mammoth / aurochs) in Wander that a pawn strikes must LOCK the attacker and
    // fight back (huntTargetId + Attacking) instead of standing inert. Regression: attacking a woolly
    // mammoth never proc'd a counter — only the melee-hunt handler ever set a placid grazer's retaliation,
    // so a drafted or ranged hit left it passive.
    let state = makeState([makePawn()], [makeGoblin({ creatureId: 'boar', state: 'Wander' })]);
    let retaliated = false;
    for (let t = 0; t < 1500 && !retaliated; t++) {
      state = { ...state, turn: t };
      state = combatService.tickCombat(state, 16);
      const m = state.mobs![0];
      if (m.state === 'Attacking' && m.huntTargetId === 'p1') retaliated = true;
    }
    expect(retaliated).toBe(true);
  });

  it('a non-charger (no chargesWhenWounded) is NOT flipped into combat by a hit — the gate holds', () => {
    // Retaliation is opt-in via chargesWhenWounded; a plain goblin never adopts its attacker as a
    // huntTargetId through this path (tickCombat only ever downs it under the beating).
    let state = makeState([makePawn({ stats: weakStats })], [makeGoblin({ state: 'Wander' })]);
    for (let t = 0; t < 400; t++) {
      state = { ...state, turn: t };
      state = combatService.tickCombat(state, 16);
      expect(state.mobs![0].huntTargetId).toBeUndefined();
    }
  });

  it('part damage accumulates and a sustained beating DOWNS a mob via pain collapse (not instant death)', () => {
    // Pawn-only attacker (goblin Wandering, so it never swings back). Vital organs (hitWeight 0) are
    // never directly struck, so the only resolution is cumulative pain/shock → COLLAPSE. Combat collapse
    // now DOWNS a mob into the recoverable Collapsed state (not instant death — that's blood-0/vital only,
    // handled in entityLifecycle, which tickCombat doesn't run). So we assert it's downed, not killed.
    let state = makeState([makePawn({ stats: weakStats })], [makeGoblin({ state: 'Wander' })]);
    let accumulated = false;
    let maxPain = 0;
    let downed = false;
    for (let t = 0; t < 12000 && !downed; t++) {
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
      if (g.state === 'Collapsed') downed = true;
      expect(g.isAlive).not.toBe(false); // never INSTANT-killed by the beating — only downed
    }
    expect(accumulated).toBe(true); // bug fix: part damage persists and accumulates
    expect(downed).toBe(true); // the fight resolves via collapse → DOWNED (Collapsed), not killed
    expect(maxPain).toBeGreaterThan(30); // …with pain a real driver of the downing
  });

  it('a near-collapse (low-blood) mob takes a light blow and DOWNS, never instant-dies (the 3-dmg-punch regression)', () => {
    // Field repro: a jackal in deep hypovolemic shock (it had won a brutal fight, blood critically low)
    // took a 3-dmg blunt punch and INSTANTLY died — a collapse mis-counted as a kill. Combat collapse must
    // DOWN a mob (recoverable Collapsed), never kill it; death is blood-0 / destroyed-vital ONLY.
    const shocked = makeGoblin({ state: 'Wander', bloodVolume: 22, pain: 40 }); // ~78% blood lost → faint
    let state = makeState([makePawn({ stats: weakStats })], [shocked]);
    let sawCollapsed = false;
    for (let t = 0; t < 600; t++) {
      state = { ...state, turn: t };
      state = combatService.tickCombat(state, 16);
      const g = state.mobs![0];
      if (g.state === 'Collapsed') sawCollapsed = true;
      expect(g.isAlive).not.toBe(false); // a light blow never instant-kills…
      expect(g.state).not.toBe('Corpse'); // …it goes DOWN, doesn't die
    }
    expect(sawCollapsed).toBe(true); // the shock + blow downed it (recoverable), as it should
  });

  it('tickCombat leaves its INPUT state arrays/objects intact (status-change diff stays valid)', () => {
    // Perf: tickCombat clones the pawns/mobs arrays once and writes updated entities into the clone's
    // slots in place (no per-hit full-array rebuild). GameEngineImpl diffs preCombatState vs the result
    // by index (handleFreshCombatCorpses, etc.) — that ONLY works if tickCombat never writes through to
    // its input. Drive a pawn beating a passive goblin until it DOWNS (Collapsed — the status-change the
    // clone must isolate now that collapse no longer instant-kills) and assert the input is untouched.
    // Weak (STR 5) attacker so the beating DOWNS the goblin (pain → Collapsed) as the isolation vehicle,
    // instead of killing it — buffed fists would otherwise beat this passive target to death.
    let state = makeState([makePawn({ stats: weakStats })], [makeGoblin({ state: 'Wander' })]);
    let validated = false;
    for (let t = 0; t < 12000 && !validated; t++) {
      const input = { ...state, turn: t };
      const inputMobs = input.mobs!;
      const inputMob = inputMobs[0];
      const upBefore = inputMob.state !== 'Collapsed';
      const result = combatService.tickCombat(input, 16);
      const resultMob = result.mobs![0];
      if (upBefore && resultMob.state === 'Collapsed') {
        // Status-change tick: the result diverged, but the input snapshot must be byte-for-byte unchanged.
        expect(result.mobs).not.toBe(inputMobs); // arrays diverged (clone, not in-place on input)
        expect(input.mobs![0]).toBe(inputMob); // same input object ref…
        expect(inputMob.state).not.toBe('Collapsed'); // …still standing in the input
        validated = true;
      }
      state = result;
    }
    expect(validated).toBe(true);
  });

  it('an Attacking mob damages the adjacent pawn', () => {
    // Accurate mob vs low-dodge pawn so hits land reliably regardless of rng sequence.
    const target = makePawn({ currentState: 'Idle', stats: { ...stats, dexterity: 3 } });
    let state = makeState([target], [makeGoblin({ stats: { ...stats, dexterity: 16 } })]);
    let pawnInjured = false;
    for (let t = 0; t < 1500 && !pawnInjured; t++) {
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
    // High DEX/PER pawn → high base hit_precision; low-dodge target → mostly hits.
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

  it('a blow lands a DOUBLE wound whose flesh and bone depths are INDEPENDENT (blunt cracks bone, blades rarely do)', () => {
    // High-STR attacker, near-zero-dodge target → lots of landed hits. The pawn's hands offer fists
    // (blunt) and claw (cutting); resolveHit rolls between them, so one run samples both damage classes.
    const attacker = makePawn({ stats: { ...stats, strength: 22, dexterity: 20 } });
    const defender = makeGoblin({ stats: { ...stats, dexterity: 1 } });
    const empty = makeState([], []);
    let bluntHits = 0;
    let cutHits = 0;
    let bluntFractures = 0;
    let cutFractures = 0;
    let fractures = 0;
    let diverged = 0;
    for (let i = 0; i < 3000; i++) {
      const r = combatService.resolveHit(attacker, defender, empty);
      if (!r.hit) continue;
      const isBlunt = r.damageType === 'blunt';
      if (isBlunt) bluntHits++;
      else if (r.damageType === 'cutting') cutHits++;
      if (r.fractureInjury) {
        fractures++;
        if (isBlunt) bluntFractures++;
        else if (r.damageType === 'cutting') cutFractures++;
        // Bone load is rolled independently of the flesh crush — NOT the old hardwired-equal value.
        if (r.injury && r.fractureInjury.damage !== r.injury.damage) diverged++;
      }
    }
    expect(fractures).toBeGreaterThan(20); // blunt blows crack bone
    expect(diverged / fractures).toBeGreaterThan(0.8); // flesh vs bone depth decoupled
    // Blunt shock drives through to bone FAR more readily than a cut does, per landed hit.
    expect(bluntFractures / Math.max(1, bluntHits)).toBeGreaterThan(
      cutFractures / Math.max(1, cutHits)
    );
  });

  it('organsOf lists a cavity’s internal organs, and nothing for a part with none', () => {
    // The penetration-targeting source of truth: a cavity exposes its soft internal organs (hitWeight 0,
    // not the skeleton); a limb segment or the hand expose none, so a hit there can never reach an organ.
    expect(organsOf('abdomen')).toEqual(
      expect.arrayContaining(['leftKidney', 'rightKidney', 'liver', 'stomach'])
    );
    expect(organsOf('chest')).toEqual(expect.arrayContaining(['heart', 'leftLung', 'rightLung']));
    expect(organsOf('chest')).not.toContain('ribcage'); // the bone is the fracture path, not an organ
    expect(organsOf('leftForearm')).toEqual([]); // only a skeleton inside → nothing to penetrate to
    expect(organsOf('leftHand')).toEqual([]); // fingers are external sub-parts (hitWeight > 0), not organs
  });

  it('a deep blow can reach an organ inside a cavity — penetrating finds them, blunt rarely ruptures', () => {
    // A high-STR pawn batters a near-zero-dodge defender that carries a FULL humanoid body plan (so its
    // organs actually exist to be struck). Run once with a CUTTING weapon (penetrating) and once with a
    // BLUNT one (shallow) to prove the asymmetry: a thrust/slash reaches organs, a battering rarely does.
    const empty = makeState([], []);
    function organStats(weaponId: string) {
      const attacker = makePawn({
        stats: { ...stats, strength: 22, dexterity: 20 },
        limbs: createBodyPlanLimbs('humanoid', 1), // real hands → the equipped weapon is actually wielded
        equipment: { mainHand: { itemId: weaponId, instanceId: 'w1', durability: 100 } }
      });
      const defender = makePawn({
        id: 'def',
        stats: { ...stats, dexterity: 1 },
        limbs: createBodyPlanLimbs('humanoid', 1)
      });
      let hits = 0;
      let organ = 0;
      let misTargeted = 0;
      for (let i = 0; i < 4000; i++) {
        const r = combatService.resolveHit(attacker, defender, empty);
        if (!r.hit) continue;
        hits++;
        if (r.organInjury) {
          organ++;
          // An organ wound only ever lands on an organ INSIDE the struck cavity — never a flesh/limb part.
          if (PART_DEF_MAP[r.organInjury.bodyPart]?.containedIn !== r.bodyPart) misTargeted++;
        }
      }
      return { hits, organ, misTargeted };
    }
    const pen = organStats('stone_chopper'); // cutting → penetrating
    const blunt = organStats('stone_spear'); // no damageType → blunt → shallow

    expect(pen.organ).toBeGreaterThan(0); // penetrating blows DO reach organs
    expect(pen.misTargeted).toBe(0); // and only ever an organ contained in the struck cavity
    expect(blunt.misTargeted).toBe(0);
    // Penetrating wounds find organs FAR more readily, per landed hit, than blunt force ruptures one — so a
    // shallow battering craters the abdomen HP while the kidneys stay intact (the realism this whole fix is for).
    expect(pen.organ / Math.max(1, pen.hits)).toBeGreaterThan(
      blunt.organ / Math.max(1, blunt.hits)
    );
  });

  it('melee lands a sane ~60% at parity (no more ~80% dodge whiff-slog)', () => {
    // Evenly-matched DEX-10 combatants. The old formula (DEX×3 − dodge×20, no base) gave ~10% here,
    // so fights never resolved; the rebased formula centres parity near 60%.
    const attacker = makePawn({ id: 'atk', stats: { ...stats, dexterity: 10 } });
    const defender = makePawn({ id: 'def', stats: { ...stats, dexterity: 10 } });
    const empty = makeState([], []);
    let hits = 0;
    for (let i = 0; i < 1000; i++)
      if (combatService.resolveHit(attacker, defender, empty).hit) hits++;
    const rate = hits / 1000;
    expect(rate).toBeGreaterThan(0.4);
    expect(rate).toBeLessThan(0.8);
  });

  it('a Hunting pawn attacks its marked quarry even though the prey is neutral', () => {
    // A huntable deer is NOT a "hostile" (the Fighting/auto-engage path would ignore it), so this proves
    // the work-driven hunt path: a pawn in Hunting with huntTargetId set swings at that specific mob and
    // DROPS it (Collapsed). The huntTargetId path keeps striking even a downed quarry (a committed hunter
    // finishes it), and the actual death/corpse to butcher comes from bleed-out in entityLifecycle.
    const hunter = makePawn({ currentState: 'Hunting', huntTargetId: 'deer1' });
    const prey = makeGoblin({
      id: 'deer1',
      entityClass: 'animal',
      state: 'Wander', // peaceful — never attacks back
      markedForHunt: true,
      stats: { ...stats, dexterity: 2 } // low dodge so swings land
    });
    let state = makeState([hunter], [prey]);
    let downed = false;
    for (let t = 0; t < 12000 && !downed; t++) {
      state = { ...state, turn: t };
      state = combatService.tickCombat(state, 16);
      const d = state.mobs![0];
      if (d.state === 'Collapsed' || d.isAlive === false || d.state === 'Corpse') downed = true;
    }
    expect(downed).toBe(true);
  });

  it('a drafted pawn with NO attack order auto-engages an adjacent hostile (NT-4)', () => {
    // Player walked a drafted pawn next to a hostile but never issued an attack order.
    // It must still defend itself rather than stand inert — damage the adjacent goblin.
    const guard = makePawn({ drafted: true, draftTarget: undefined, currentState: 'Idle' });
    const goblin = makeGoblin({ state: 'Attacking', stats: { ...stats, dexterity: 2 } });
    let state = makeState([guard], [goblin]);
    let goblinDamaged = false;
    for (let t = 0; t < 4000 && !goblinDamaged; t++) {
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
      conditionTimers: { winded: 2 }
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
    expect((state.pawns[0].conditionTimers?.winded ?? 0) > 0).toBe(true); // still winded (stamina ≪ max)
  });

  it('a winded entity recovers stamina each turn and un-winds at full', () => {
    // Small pool so the test reaches full quickly; resting (not Fighting, no enemy) → full regen rate.
    const winded = makePawn({
      currentState: 'Idle',
      stamina: 0,
      maxStamina: 1,
      conditionTimers: { winded: 2 }
    });
    let state = makeState([winded], []);
    for (let t = 0; t < 40; t++) {
      state = { ...state, turn: t };
      state = combatService.tickCombat(state, 16);
    }
    const p = state.pawns[0];
    expect(p.stamina).toBe(1); // recovered to full
    expect(p.conditionTimers?.winded ?? 0).toBe(0); // latch cleared
    expect(p.transientConditions ?? []).not.toContain('winded');
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
    // Wound a pawn, then tend with a Chewed Poultice in the stockpile. The patient rests on a bed
    // (treatmentBonus) so the dressing is viable — off-shelter it would be heavily penalised.
    let state = makeState([makePawn({ currentState: 'Sleeping' })], []) as GameState;
    state = combatService.applyInjury('p1', { ...crush(20), bodyPart: 'chest' }, state);
    state = {
      ...state,
      buildings: [{ id: 'bed1', type: 'hay_bed', x: 5, y: 5, status: 'complete', progress: 1 }],
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
    } as unknown as GameState;

    // The patient self-tends here (single pawn); in play a separate Caretaking pawn claims the job.
    const after = tendPatient(state.pawns[0], state.pawns[0], state);
    const wound = after.pawns[0].limbs!.flatMap((l) => l.parts ?? []).find((p) => p.id === 'chest')!
      .injuries[0];
    // Poultice medicineQuality 0.5 → treated, and quality is at least that.
    expect(wound.treatmentQuality ?? 0).toBeGreaterThanOrEqual(0.5);
    expect(wound.treatedAt).toBeDefined();
    // …and the dose was consumed.
    expect(after.stockpile.chewed_poultice ?? 0).toBe(0);
  });

  // ── Containment cascade: a severed container takes the parts nested inside it ──
  const sever = (bodyPart: string): Injury => ({
    bodyPart,
    type: 'cut',
    severity: 'minor', // recomputed up to 'destroyed' once damage ≥ the part's maxHp
    damage: 999,
    bleeding: 0,
    painContribution: 0,
    infected: false
  });
  const torsoPart = (pawn: Pawn, id: string) =>
    pawn.limbs!.find((l) => l.id === 'torso')!.parts!.find((p) => p.id === id)!;

  it('severing the abdomen takes the organs it contains — and the pawn lingers (cascade only)', () => {
    let state = makeState([makePawn({ limbs: createBodyPlanLimbs('humanoid', 1) })], []);
    state = combatService.applyInjury('p1', sever('abdomen'), state);
    const pawn = state.pawns[0];
    expect(torsoPart(pawn, 'abdomen').isMissing).toBe(true);
    for (const organ of ['liver', 'stomach', 'leftKidney', 'rightKidney']) {
      expect(torsoPart(pawn, organ).isMissing).toBe(true);
      expect(torsoPart(pawn, organ).health).toBe(0);
    }
    // No VITAL organ lives in the abdomen, so it is not instant death — the pawn is gutted but alive.
    expect(pawn.isAlive).not.toBe(false);
    // Sibling organs in a DIFFERENT container (the chest) are untouched.
    expect(torsoPart(pawn, 'heart').isMissing).toBe(false);
  });

  it('caving in the chest cascades to heart+lungs and is lethal', () => {
    let state = makeState([makePawn({ limbs: createBodyPlanLimbs('humanoid', 1) })], []);
    state = combatService.applyInjury('p1', sever('chest'), state);
    const pawn = state.pawns[0];
    expect(torsoPart(pawn, 'heart').isMissing).toBe(true);
    expect(torsoPart(pawn, 'leftLung').isMissing).toBe(true);
    expect(pawn.isAlive).toBe(false);
  });

  it('a chest driven to 0 HP by MIXED wound types still guts the organs (no single wound severed it)', () => {
    // The field regression: a chest beaten to 0/160 by a serious crush + a serious puncture — NEITHER
    // wound alone reaching the 'destroyed' severity that flags isMissing — left heart & lungs pristine
    // inside the flattened cavity. Drive exactly that: two different sub-lethal wound types summing past
    // the chest's HP, with no single type ≥ maxHp (so isMissing stays false), and assert the organs go.
    const chestHp = 80; // humanoid chest size at bodyScale 1
    let state = makeState([makePawn({ limbs: createBodyPlanLimbs('humanoid', 1) })], []);
    state = combatService.applyInjury('p1', { ...crush(chestHp * 0.6), bodyPart: 'chest' }, state);
    state = combatService.applyInjury(
      'p1',
      { ...crush(chestHp * 0.6), type: 'puncture', bodyPart: 'chest' },
      state
    );
    const pawn = state.pawns[0];
    const chest = torsoPart(pawn, 'chest');
    expect(chest.health).toBeLessThanOrEqual(0); // caved in…
    expect(chest.isMissing).toBe(false); // …but NOT severed — each wound was only 'serious'
    expect(torsoPart(pawn, 'heart').health).toBe(0); // organs gutted by the HP-trigger cascade
    expect(torsoPart(pawn, 'leftLung').isMissing).toBe(true);
    expect(pawn.isAlive).toBe(false); // a destroyed-vital body is dead (lethalAnatomyCause)
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
    // Tissue heal is weeks-slow now, so use a tiny wound — over a long rest it still fully clears and
    // pain returns to 0 (the point of the test). Resting (Sleeping) → full-rate mend.
    let state = makeState([makePawn({ currentState: 'Sleeping' })], []);
    state = combatService.applyInjury('p1', { ...crush(1), bodyPart: 'chest' }, state);
    let pawn = state.pawns[0];
    expect(pawn.pain ?? 0).toBeGreaterThan(0);
    expect((pawn.injuries ?? []).length).toBe(1);
    for (let i = 0; i < 200000 && (pawn.injuries?.length ?? 0) > 0; i++) pawn = healWounds(pawn);
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
