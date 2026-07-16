import { describe, it, expect, afterEach } from 'vitest';
import { entityService } from './EntityService';
import { TICKS_PER_SECOND } from '../core/time';
import { setSimLogSink, type SimLogSink } from '../core/logSink';
import type { GameState, Mob } from '../core/types';

/** A no-op sink with a recording `threatAlert` — lets a headless sim assert the one-shot threat alert. */
function makeThreatSpy() {
  const calls: unknown[][] = [];
  const noop = () => {};
  const sink = {
    logActivity: () => '',
    logEvent: noop,
    logCombatSwing: noop,
    logCombatKill: noop,
    pushCombatText: noop,
    pushAttackLunge: noop,
    pushCombatSound: noop,
    pushProjectile: noop,
    logEntityDeath: noop,
    threatAlert: (...a: unknown[]) => calls.push(a)
  } as unknown as SimLogSink;
  return { sink, calls };
}

/**
 * Headless entity-simulation harness (the answer to "I can't drive the browser"): it runs the
 * REAL per-tick entity pipeline — `stepEntities` (FSM) + `stepHunger` (needs/starvation) +
 * `removeDead` — over a hand-built GameState, with zero SvelteKit/browser runtime. This is how
 * the starvation-rebalance and collapse behaviour are verified without a live game.
 */
const DAY_TICKS = 300 * TICKS_PER_SECOND; // 1 in-game day = 300 in-game sec × 60 ticks

function smallWorld(w = 20, h = 20) {
  return Array.from({ length: h }, (_, y) =>
    Array.from({ length: w }, (_, x) => ({
      x,
      y,
      walkable: true,
      terrainType: 'plains',
      resources: {} as Record<string, number>
    }))
  );
}

/** STEALTH: these suites exercise POST-detection FSM behaviour (aggro, alerts, flee, combat), so the
 *  fixtures stamp every test pawn as already-detected — otherwise the probabilistic ~2 s detection
 *  roll at the vision gate makes single-tick assertions a coin flip. Fresh object per mob (entries
 *  mutate in place); `at: Infinity` survives any test turn until the first refresh. */
function detectedTestPawns(): Mob['stealthChecks'] {
  return {
    p: { at: Infinity, detected: true },
    p1: { at: Infinity, detected: true },
    hunter: { at: Infinity, detected: true }
  };
}

function makeGoblin(over: Partial<Mob> = {}): Mob {
  return {
    id: 'g1',
    creatureId: 'goblin',
    entityClass: 'mob',
    state: 'Wander',
    isAlive: true,
    x: 5,
    y: 5,
    health: 35, // goblin con 7 → maxHealth 35
    maxHealth: 35,
    bloodVolume: 100,
    maxBloodVolume: 100,
    limbs: [],
    conditions: [],
    needs: { hunger: 0, fatigue: 0 },
    stateSince: 0,
    stealthChecks: detectedTestPawns(),
    ...(over as object)
  } as unknown as Mob;
}

function makeState(mobs: Mob[], turn = 0): GameState {
  return {
    turn,
    mobs,
    pawns: [],
    worldMap: smallWorld(),
    stockpile: {},
    droppedItems: [],
    buildings: []
  } as unknown as GameState;
}

describe('entity starvation (headless sim)', () => {
  it('a starving goblin with no food takes ~a week to die, not 1–2 days', () => {
    let state = makeState([makeGoblin()]);
    let diedAtTurn = -1;
    const maxTicks = 12 * DAY_TICKS; // safety bound: 12 in-game days

    for (let t = 0; t < maxTicks; t++) {
      state = { ...state, turn: t };
      state = entityService.stepHunger(state);
      state = entityService.removeDead(state);
      const g = state.mobs!.find((m) => m.id === 'g1')!;
      if (g.state === 'Corpse') {
        diedAtTurn = t;
        break;
      }
    }

    expect(diedAtTurn).toBeGreaterThan(0);
    const daysToDie = diedAtTurn / DAY_TICKS;
    // Before the rebalance this was ~1 day. Target: a multi-day ordeal (~a week-and-a-half) — the
    // multi-day severity accrual plus malnutrition's ~1-day onset grace (driver.onsetDelay: a maxed
    // need must HOLD for a day before the condition even begins, so it can't latch from a brief spike).
    expect(daysToDie).toBeGreaterThan(4);
    expect(daysToDie).toBeLessThan(11.5);
  });

  it('a merely-hungry entity does NOT collapse — it keeps acting and tries to feed', () => {
    // hunger 85 is below malnutrition onset (87) and nowhere near severe; the old model collapsed it
    // instantly. Now it stays mobile (wander/forage/hunt), only collapsing once malnutrition is severe.
    let state = makeState([makeGoblin({ needs: { hunger: 85, fatigue: 0 } as any })]);
    state = entityService.stepEntities(state);
    const g = state.mobs!.find((m) => m.id === 'g1')!;
    expect(g.state).not.toBe('Collapsed');
  });

  it('an entity collapses once malnutrition reaches its severe (life-threatening) stage', () => {
    // Drive the data-driven condition directly: severe malnutrition (severity ≥ 0.65) is what now
    // incapacitates — reached only after in-game days of starving, never instantly from raw hunger.
    let state = makeState([
      makeGoblin({
        needs: { hunger: 100, fatigue: 0 } as any,
        conditions: [{ id: 'malnutrition', severity: 0.7 }]
      })
    ]);
    state = entityService.stepEntities(state);
    const g = state.mobs!.find((m) => m.id === 'g1')!;
    expect(g.state).toBe('Collapsed');
  });

  it('a hungry omnivore heads to forage real food (berries) instead of starving', () => {
    // Put a berry bush a few tiles away; goblin is hungry but below the collapse threshold.
    const world = smallWorld();
    world[5][9].resources = { berry_bush: 3 };
    const state = {
      turn: 0,
      mobs: [makeGoblin({ needs: { hunger: 60, fatigue: 0 } as any })],
      pawns: [],
      worldMap: world,
      stockpile: {},
      droppedItems: [],
      buildings: []
    } as unknown as GameState;
    const out = entityService.stepEntities(state);
    const g = out.mobs!.find((m) => m.id === 'g1')!;
    // It should choose to forage (or already be eating/moving toward) the berries — not idle/starve.
    expect(['Foraging', 'Eating']).toContain(g.state);
  });

  it('a hungry omnivore standing ON a corpse scavenges it instead of foraging a far bush', () => {
    // The reported bug: an omnivore predator (goblin/kobold) on a fresh corpse "refused to eat" and
    // marched off toward a bush a few tiles away, because forage was chosen whenever a bush merely
    // EXISTED — ahead of the corpse underfoot. The three food sources are now ranked by distance, so
    // the corpse (dist 0) beats the bush (dist 4).
    const world = smallWorld();
    world[5][9].resources = { berry_bush: 3 }; // bush 4 tiles east — the tempting-but-farther option
    const corpse = {
      id: 'carcass',
      creatureId: 'deer',
      entityClass: 'animal',
      state: 'Corpse',
      isAlive: false,
      x: 5,
      y: 5, // same tile as the goblin — free food underfoot
      intactness: 1.0,
      needs: { hunger: 0, fatigue: 0 },
      stateSince: 0
    } as unknown as Mob;
    const state = {
      turn: 0,
      mobs: [makeGoblin({ needs: { hunger: 70, fatigue: 0 } as any }), corpse],
      pawns: [],
      worldMap: world,
      stockpile: {},
      droppedItems: [],
      buildings: []
    } as unknown as GameState;
    const out = entityService.stepEntities(state);
    const g = out.mobs!.find((m) => m.id === 'g1')!;
    // Scavenge the corpse (Hunting routes corpse-eating) — must NOT walk off to forage.
    expect(['Hunting', 'Eating']).toContain(g.state);
    expect(g.state).not.toBe('Foraging');
  });

  it('an exhausted forager stuck mid-forage bails to sleep instead of grinding forever', () => {
    // #456: a kobold/goblin whose one reachable forage tile is body-blocked by a packmate ground in
    // Foraging forever — the Foraging hold-state had no fatigue exit. Exhausted (fatigue ≥ 60), only
    // mildly hungry (< 87), and stuck (no successful bite for > FEEDING_STUCK_SECONDS, so stateSince is
    // old) → it must abandon the attempt and sleep.
    const stuckTurn = 31 * TICKS_PER_SECOND; // > FEEDING_STUCK_SECONDS (30s) past stateSince 0
    const state = {
      turn: stuckTurn,
      mobs: [
        makeGoblin({ state: 'Foraging', stateSince: 0, needs: { hunger: 50, fatigue: 70 } as any })
      ],
      pawns: [],
      worldMap: smallWorld(),
      stockpile: {},
      droppedItems: [],
      buildings: []
    } as unknown as GameState;
    const out = entityService.stepEntities(state);
    const g = out.mobs!.find((m) => m.id === 'g1')!;
    expect(g.state).toBe('Sleeping');
  });

  it('hunger climbs to the 80 collapse point well before death (long pre-death suffering)', () => {
    let state = makeState([makeGoblin()]);
    let collapseTurn = -1;
    for (let t = 0; t < 12 * DAY_TICKS; t++) {
      state = { ...state, turn: t };
      state = entityService.stepHunger(state);
      if ((state.mobs![0].needs.hunger ?? 0) >= 80) {
        collapseTurn = t;
        break;
      }
    }
    expect(collapseTurn).toBeGreaterThan(0);
    // Reaching the collapse threshold itself should take more than a day.
    expect(collapseTurn / DAY_TICKS).toBeGreaterThan(1);
  });
});

describe('creature conditions affect creatures (parity with pawns)', () => {
  it('a fatigued, awake creature gets the `tired` (Exhausted) transient that crushes its stats', () => {
    // Awake (Attacking → won't sleep it off) and at the exhaustion ceiling (TIRED_FATIGUE_THRESHOLD = 100,
    // shared with pawns — a creature normally sleeps long before this; only one kept awake hits it).
    let state = makeState([
      makeGoblin({ state: 'Attacking', needs: { hunger: 0, fatigue: 100 } as any })
    ]);
    state = entityService.stepHunger(state);
    expect(state.mobs![0].transientConditions ?? []).toContain('tired');
  });

  it('…and `tired` clears once the creature sleeps it off (not derived while resting)', () => {
    let state = makeState([
      makeGoblin({
        state: 'Sleeping',
        needs: { hunger: 0, fatigue: 90 } as any,
        transientConditions: ['tired']
      })
    ]);
    state = entityService.stepHunger(state);
    expect(state.mobs![0].transientConditions ?? []).not.toContain('tired');
  });

  // Weather exposure — creatures feel windchill + wet too, but with hardier thresholds than pawns.
  const weatherState = (mobs: Mob[], wetMoisture: number, wind?: number): GameState => {
    const world = smallWorld();
    (world[5][5] as any).moisture = wetMoisture; // the goblin stands at (5,5)
    return {
      turn: 0, // turn 0 % MOB_WEATHER_INTERVAL === 0 → the exposure pass runs
      mobs,
      pawns: [],
      worldMap: world,
      weather: wind !== undefined ? ({ type: 'windy', wind, windDir: 0 } as any) : undefined,
      stockpile: {},
      droppedItems: [],
      buildings: []
    } as unknown as GameState;
  };

  it('a creature soaks to `wet` on a wet tile — the shared wetness METER, onset at 100 like pawns', () => {
    // Meter model (not instantaneous): start nearly soaked so one exposure pass on a 90% tile tops it to
    // 100 → `wet`. The onset is a full meter for EVERY entity; resistance only changes the fill SPEED.
    let state = weatherState(
      [makeGoblin({ needs: { hunger: 0, fatigue: 0, wetness: 99 } as any })],
      90
    );
    state = entityService.stepHunger(state);
    expect(state.mobs![0].needs.wetness).toBe(100);
    expect(state.mobs![0].transientConditions ?? []).toContain('wet');
  });

  it('…but stays dry on damp-not-soaked ground (tile below the soak threshold)', () => {
    // Tile wetness ≤ WET_TILE_THRESHOLD (50) → the meter never fills, so it never reads `wet`.
    let state = weatherState(
      [makeGoblin({ needs: { hunger: 0, fatigue: 0, wetness: 0 } as any })],
      40
    );
    state = entityService.stepHunger(state);
    expect(state.mobs![0].transientConditions ?? []).not.toContain('wet');
  });

  it('a strong wind windchills a creature (persistent condition driven from the felt wind)', () => {
    let state = weatherState([makeGoblin()], 0, 0.8); // 0.8 ≫ MOB_WIND_ONSET (0.45)
    state = entityService.stepHunger(state);
    expect((state.mobs![0].conditions ?? []).some((c) => c.id === 'windchilled')).toBe(true);
  });
});

describe('hard tile occupancy (advanceMobMovement)', () => {
  const movingMob = (over: Partial<Mob>) =>
    makeGoblin({ state: 'Wander', pathIndex: 0, nextCellCostLeft: undefined, ...over });

  it('a mob will not step onto a tile held by a pawn (doorway chokepoint)', () => {
    // Pawn stands in the only tile the mob's path passes through.
    let state = makeState([
      movingMob({
        id: 'm',
        x: 5,
        y: 5,
        path: [
          { x: 6, y: 5 },
          { x: 7, y: 5 }
        ]
      })
    ]);
    state = {
      ...state,
      pawns: [{ id: 'p', isAlive: true, position: { x: 6, y: 5 } }]
    } as unknown as GameState;

    for (let t = 0; t < 200; t++) {
      state = { ...state, turn: t };
      state = entityService.advanceMobMovement(state);
      // The mob must never enter the pawn's tile, no matter how long it waits.
      expect(state.mobs!.find((m) => m.id === 'm')!.x).toBe(5);
    }
    // After waiting past the block threshold it drops the path so the FSM re-routes.
    expect(state.mobs!.find((m) => m.id === 'm')!.path ?? []).toHaveLength(0);
  });

  it('two mobs converging on one tile never stack — only one lands there', () => {
    // A from the west, B from the east, both targeting (6,5).
    let state = makeState([
      movingMob({ id: 'a', x: 5, y: 5, path: [{ x: 6, y: 5 }] }),
      movingMob({ id: 'b', x: 7, y: 5, path: [{ x: 6, y: 5 }] })
    ]);

    for (let t = 0; t < 400; t++) {
      state = { ...state, turn: t };
      state = entityService.advanceMobMovement(state);
      // Invariant: no two non-corpse mobs ever share an integer tile.
      const live = state.mobs!.filter((m) => m.state !== 'Corpse');
      const tiles = new Set(live.map((m) => `${m.x},${m.y}`));
      expect(tiles.size).toBe(live.length);
    }

    const a = state.mobs!.find((m) => m.id === 'a')!;
    const b = state.mobs!.find((m) => m.id === 'b')!;
    // Exactly one reaches the contested tile; the other is turned away (path dropped).
    const atTarget = [a, b].filter((m) => m.x === 6 && m.y === 5);
    expect(atTarget).toHaveLength(1);
  });
});

describe('prey reacts to a pawn hunter (same circuits as predator-prey)', () => {
  function makeAnimal(creatureId: string, over: Partial<Mob> = {}): Mob {
    return {
      id: 'prey',
      creatureId,
      entityClass: 'animal',
      state: 'Wander',
      isAlive: true,
      x: 5,
      y: 5,
      health: 60,
      maxHealth: 60,
      bloodVolume: 100,
      maxBloodVolume: 100,
      limbs: [],
      conditions: [],
      needs: { hunger: 0, fatigue: 0 },
      stateSince: 0,
      stealthChecks: detectedTestPawns(),
      ...(over as object)
    } as unknown as Mob;
  }
  // A pawn hunter standing one tile south of the prey at (5,5).
  function makeHunter(over: Record<string, unknown> = {}) {
    return {
      id: 'hunter',
      name: 'Bryn',
      isAlive: true,
      position: { x: 5, y: 6 },
      currentState: 'Hunting',
      ...over
    } as unknown as GameState['pawns'][number];
  }
  function stateWith(mobs: Mob[], pawns: GameState['pawns']): GameState {
    return { ...makeState(mobs), pawns } as GameState;
  }

  it('a neutral boar turns and attacks an adjacent hunting pawn (territorial)', () => {
    let state = stateWith([makeAnimal('boar')], [makeHunter()]);
    let engaged = false;
    for (let t = 0; t < 10 && !engaged; t++) {
      state = { ...state, turn: t };
      state = entityService.stepEntities(state);
      if (state.mobs![0].state === 'Attacking') engaged = true;
    }
    expect(engaged).toBe(true);
  });

  it('a passive deer cornered by a pawn hunter STAYS fighting (pawn attacker, not just mobs)', () => {
    // Deer already cornered into the shared fight-back state, with the hunter as its
    // attacker. Before the fix the Attacking handler only resolved mob attackers, so a
    // pawn-cornered deer fled instantly; now it holds and trades blows.
    const deer = makeAnimal('deer', { state: 'Attacking', huntTargetId: 'hunter' });
    let state = stateWith([deer], [makeHunter()]);
    state = entityService.stepEntities({ ...state, turn: 1 });
    expect(state.mobs![0].state).toBe('Attacking');
  });

  it('…but breaks off and flees the moment the hunter is no longer adjacent', () => {
    const deer = makeAnimal('deer', { state: 'Attacking', huntTargetId: 'hunter' });
    // Hunter two tiles away — out of melee.
    const farHunter = makeHunter({ position: { x: 5, y: 8 } });
    let state = stateWith([deer], [farHunter]);
    state = entityService.stepEntities({ ...state, turn: 1 });
    expect(state.mobs![0].state).toBe('Fleeing');
  });

  // ── Downed pawns: disengage unless a hungry predator finishes them off ──────
  it('a mob leaves a COLLAPSED pawn alone — never freezes beating the unconscious body', () => {
    // A territorial boar attacks an adjacent hunter (see the test above) — but if that pawn is DOWNED,
    // it must disengage and wander, not lock in Alerted/Attacking over the body (the reported freeze).
    let state = stateWith([makeAnimal('boar')], [makeHunter({ currentState: 'Collapsed' })]);
    let everAttacked = false;
    let everAlerted = false;
    for (let t = 0; t < 25; t++) {
      state = { ...state, turn: t };
      state = entityService.stepEntities(state);
      const s = state.mobs![0].state;
      if (s === 'Attacking') everAttacked = true;
      if (s === 'Alerted') everAlerted = true;
    }
    expect(everAttacked).toBe(false);
    // Must not ping-pong into Alerted either — a downed pawn is invisible to a non-finisher's threat
    // detection, so the mob just keeps wandering rather than oscillating Wander↔Alerted over the body.
    expect(everAlerted).toBe(false);
    expect(state.mobs![0].state).toBe('Wander');
  });

  it('a placid mammoth whose MOB attacker died stands down — never turns on a bystander pawn', () => {
    // Colony-wipe repro: a worg gored the mammoth, so the prey FSM locked its huntTargetId onto the
    // worg and forced it into Attacking (legit self-defence). The worg then died and vanished from the
    // mob list. The mammoth (neutral + territorial:false → placid) must NOT inherit the nearest
    // colonist as a fresh target via the pawn fallback — it stands down to grazing/wander and clears
    // its target. A pawn that never touched it is off-limits.
    const mammoth = makeAnimal('woolly_mammoth', {
      state: 'Attacking',
      huntTargetId: 'dead-worg' // attacker is gone from the mob list
    });
    const bystander = makeHunter({ currentState: 'Idle' }); // adjacent colonist, NOT the attacker
    let state = stateWith([mammoth], [bystander]);
    let everHostile = false;
    for (let t = 1; t <= 10; t++) {
      state = entityService.stepEntities({ ...state, turn: t });
      const s = state.mobs![0].state;
      if (s === 'Attacking' || s === 'Alerted') everHostile = true;
    }
    expect(everHostile).toBe(false);
    expect(state.mobs![0].huntTargetId).toBeUndefined();
  });

  it('…but a placid mammoth a PAWN is hunting still defends itself against that pawn', () => {
    // The stand-down is scoped to a lost MOB attacker. If the attacker IS a live colonist (huntTargetId
    // names the pawn hunting it), the grazer keeps fighting back while that pawn is adjacent — hunting a
    // mammoth still has consequences.
    const mammoth = makeAnimal('woolly_mammoth', {
      state: 'Attacking',
      huntTargetId: 'hunter' // the adjacent pawn IS the attacker
    });
    let state = stateWith([mammoth], [makeHunter()]);
    state = entityService.stepEntities({ ...state, turn: 1 });
    expect(state.mobs![0].state).toBe('Attacking');
  });

  it('a HUNGRY predator DOES finish off an adjacent collapsed pawn', () => {
    // Hungry wolf (carnivore predator) already engaged beside a downed pawn → it presses the attack.
    const wolf = makeAnimal('wolf', {
      state: 'Alerted',
      needs: { hunger: 85, fatigue: 0, sleep: 0, lastSleep: 0, lastMeal: 0 }
    });
    let state = stateWith([wolf], [makeHunter({ currentState: 'Collapsed' })]);
    let engaged = false;
    for (let t = 0; t < 10 && !engaged; t++) {
      state = { ...state, turn: t };
      state = entityService.stepEntities(state);
      if (state.mobs![0].state === 'Attacking') engaged = true;
    }
    expect(engaged).toBe(true);
  });
});

describe('feeding states do not oscillate (hostile FSM + unreachable forage)', () => {
  function makePrey(over: Partial<Mob> = {}): Mob {
    return {
      id: 'prey',
      creatureId: 'boar', // huntable, neutral
      entityClass: 'animal',
      state: 'Wander',
      isAlive: true,
      x: 5,
      y: 5,
      health: 60,
      maxHealth: 60,
      bloodVolume: 100,
      maxBloodVolume: 100,
      limbs: [],
      conditions: [],
      needs: { hunger: 0, fatigue: 0 },
      stateSince: 0,
      stealthChecks: detectedTestPawns(),
      ...(over as object)
    } as unknown as Mob;
  }
  function makeWolf(over: Partial<Mob> = {}): Mob {
    return {
      id: 'wolf',
      creatureId: 'wolf', // predator, neutral → hostile FSM
      entityClass: 'animal',
      state: 'Wander',
      isAlive: true,
      x: 5,
      y: 6,
      health: 40,
      maxHealth: 40,
      bloodVolume: 100,
      maxBloodVolume: 100,
      limbs: [],
      conditions: [],
      needs: { hunger: 0, fatigue: 0 },
      stateSince: 0,
      stealthChecks: detectedTestPawns(),
      ...(over as object)
    } as unknown as Mob;
  }

  it('a predator fighting a prey MOB (no pawn present) HOLDS in Attacking, not oscillating', () => {
    // Bug 1: the hostile Attacking/Alerted cases resolved their target from the nearest PAWN only.
    // With a predator locked onto a prey mob and no pawn anywhere, that ejected it from combat every
    // tick → Wander↔Hunting flicker. Now it engages the actual prey via huntTargetId.
    const wolf = makeWolf({
      state: 'Attacking',
      huntTargetId: 'prey',
      needs: { hunger: 80, fatigue: 0, sleep: 0, lastSleep: 0, lastMeal: 0 }
    });
    const prey = makePrey({ state: 'Attacking', huntTargetId: 'wolf' }); // mutual melee (5,5)/(5,6)
    let state = makeState([wolf, prey]);
    for (let t = 1; t <= 5; t++) {
      state = entityService.stepEntities({ ...state, turn: t });
      expect(state.mobs!.find((m) => m.id === 'wolf')!.state).toBe('Attacking');
    }
  });

  it('a predator whose prey breaks melee resumes Hunting (not Alerted toward a non-existent pawn)', () => {
    const wolf = makeWolf({
      state: 'Attacking',
      huntTargetId: 'prey',
      needs: { hunger: 80, fatigue: 0, sleep: 0, lastSleep: 0, lastMeal: 0 }
    });
    const prey = makePrey({ x: 5, y: 9 }); // two+ tiles away — out of melee
    let state = makeState([wolf, prey]);
    state = entityService.stepEntities({ ...state, turn: 1 });
    expect(state.mobs!.find((m) => m.id === 'wolf')!.state).toBe('Hunting');
  });

  it('a hungry forager with only UNREACHABLE food backs off instead of flipping every tick', () => {
    // Bug 2: walkable ≠ reachable. With pathfinding unavailable in-test (pathTo → []), the forage
    // tile is unreachable; the forager must set forageCooldownUntil and stop re-entering Foraging
    // every tick (the FORAGE-UNREACHABLE log flood + Grazing↔Foraging flicker).
    const world = smallWorld();
    world[5][8].resources = { grass_patch: 5 }; // edible + walkable, but unreachable (no wasm)
    const deer: Mob = {
      id: 'deer',
      creatureId: 'deer', // passive, grazes, eats food
      entityClass: 'animal',
      state: 'Grazing',
      isAlive: true,
      x: 5,
      y: 5,
      health: 50,
      maxHealth: 50,
      bloodVolume: 100,
      maxBloodVolume: 100,
      limbs: [],
      conditions: [],
      needs: { hunger: 80, fatigue: 0 }, // hungry → wants to forage
      stateSince: 0
    } as unknown as Mob;
    let state = { ...makeState([deer]), worldMap: world } as GameState;

    let foragingTicks = 0;
    for (let t = 1; t <= 20; t++) {
      state = entityService.stepEntities({ ...state, turn: t });
      const s = state.mobs![0].state;
      if (s === 'Foraging' || s === 'Eating') foragingTicks++;
    }
    // Pre-fix this flicked into Foraging on roughly every other tick; the cooldown backoff means it
    // should attempt to forage at most a couple of times across 20 ticks, not ~10.
    expect(foragingTicks).toBeLessThanOrEqual(2);
    expect(state.mobs![0].forageCooldownUntil).toBeGreaterThan(0);
  });
});

describe('mob aggro requires line of sight (no chasing pawns seen through walls)', () => {
  const NOON = 9000; // timeOfDay ≈ 0.5 → full ambient light, so vision range isn't night-shortened
  const pawnAt = (x: number, y: number) =>
    ({ id: 'p1', isAlive: true, position: { x, y }, currentState: 'Idle' }) as any;

  function aggroState(blockSight: boolean): GameState {
    const world = smallWorld();
    // Wall tile on the straight line between the goblin (5,5) and the pawn (9,5).
    if (blockSight) (world[5][7] as any).blocksSight = true;
    return {
      turn: NOON,
      mobs: [makeGoblin({ x: 5, y: 5, state: 'Wander' })], // goblin behaviour is "aggressive"
      pawns: [pawnAt(9, 5)],
      worldMap: world,
      stockpile: {},
      droppedItems: [],
      buildings: []
    } as unknown as GameState;
  }

  it('an aggressive mob does NOT aggro a pawn it can only "see" through a wall', () => {
    const g = entityService.stepEntities(aggroState(true)).mobs!.find((m) => m.id === 'g1')!;
    expect(g.state).toBe('Wander'); // blocked line of sight → never alerts
    expect(g.lastSeenX).toBeUndefined(); // and never records having seen the pawn
  });

  it('the same mob DOES aggro on clear line of sight, and remembers the tile it saw them on', () => {
    const g = entityService.stepEntities(aggroState(false)).mobs!.find((m) => m.id === 'g1')!;
    expect(g.state).toBe('Alerted'); // clear LOS → engages
    expect(g.lastSeenX).toBe(9); // last-seen memory → chase to here when the pawn breaks LOS
    expect(g.lastSeenY).toBe(5);
  });

  it('firing the threat alert ONCE per episode (auto-pause + chronicle pulse), not every tick', () => {
    const { sink, calls } = makeThreatSpy();
    setSimLogSink(sink);

    // First think: Wander → Alerted on the visible pawn → one threatAlert, alertedPawn latched.
    let state = aggroState(false);
    state = entityService.stepEntities(state);
    const g1 = state.mobs!.find((m) => m.id === 'g1')!;
    expect(g1.state).toBe('Alerted');
    expect(g1.alertedPawn).toBe(true);
    expect(calls.length).toBe(1);
    // calls[0] = [mobId, mobName, pawnName, turn, x, y]
    expect(calls[0][0]).toBe('g1');

    // Subsequent thinks while it stays Alerted on the same pawn → no repeat alert.
    for (let i = 0; i < 3; i++) {
      state = { ...state, turn: NOON + i + 1 };
      state = entityService.stepEntities(state);
    }
    expect(calls.length).toBe(1); // still once — guarded by alertedPawn
  });

  afterEach(() => {
    // Restore a quiet sink so the spy doesn't leak into other suites.
    setSimLogSink(makeThreatSpy().sink);
  });
});
