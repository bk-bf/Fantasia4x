import { describe, it, expect, afterEach } from 'vitest';
import { entityService } from '$lib/game/services/EntityService';
import { TICKS_PER_SECOND } from '$lib/game/core/util/time';
import { setSimLogSink, type SimLogSink } from '$lib/game/core/util/logSink';
import type { GameState, Mob } from '$lib/game/core/types';

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

const DAY_TICKS = 300 * TICKS_PER_SECOND;

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
    health: 35,
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
    const maxTicks = 12 * DAY_TICKS;

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
    expect(daysToDie).toBeGreaterThan(4);
    expect(daysToDie).toBeLessThan(11.5);
  });

  it('a merely-hungry entity does NOT collapse — it keeps acting and tries to feed', () => {
    let state = makeState([makeGoblin({ needs: { hunger: 85, fatigue: 0 } as any })]);
    state = entityService.stepEntities(state);
    const g = state.mobs!.find((m) => m.id === 'g1')!;
    expect(g.state).not.toBe('Collapsed');
  });

  it('an entity collapses once malnutrition reaches its severe (life-threatening) stage', () => {
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
    expect(['Foraging', 'Eating']).toContain(g.state);
  });

  it('a hungry omnivore standing ON a corpse scavenges it instead of foraging a far bush', () => {
    const world = smallWorld();
    world[5][9].resources = { berry_bush: 3 };
    const corpse = {
      id: 'carcass',
      creatureId: 'deer',
      entityClass: 'animal',
      state: 'Corpse',
      isAlive: false,
      x: 5,
      y: 5,
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
    expect(['Hunting', 'Eating']).toContain(g.state);
    expect(g.state).not.toBe('Foraging');
  });

  it('an exhausted forager stuck mid-forage bails to sleep instead of grinding forever', () => {
    const stuckTurn = 31 * TICKS_PER_SECOND;
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
    expect(collapseTurn / DAY_TICKS).toBeGreaterThan(1);
  });
});

describe('creature conditions affect creatures (parity with pawns)', () => {
  it('a fatigued, awake creature gets the `tired` (Exhausted) transient that crushes its stats', () => {
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

  const weatherState = (mobs: Mob[], wetMoisture: number, wind?: number): GameState => {
    const world = smallWorld();
    (world[5][5] as any).moisture = wetMoisture;
    return {
      turn: 0,
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
    let state = weatherState(
      [makeGoblin({ needs: { hunger: 0, fatigue: 0, wetness: 99 } as any })],
      90
    );
    state = entityService.stepHunger(state);
    expect(state.mobs![0].needs.wetness).toBe(100);
    expect(state.mobs![0].transientConditions ?? []).toContain('wet');
  });

  it('…but stays dry on damp-not-soaked ground (tile below the soak threshold)', () => {
    let state = weatherState(
      [makeGoblin({ needs: { hunger: 0, fatigue: 0, wetness: 0 } as any })],
      40
    );
    state = entityService.stepHunger(state);
    expect(state.mobs![0].transientConditions ?? []).not.toContain('wet');
  });

  it('a strong wind windchills a creature (persistent condition driven from the felt wind)', () => {
    let state = weatherState([makeGoblin()], 0, 0.8);
    state = entityService.stepHunger(state);
    expect((state.mobs![0].conditions ?? []).some((c) => c.id === 'windchilled')).toBe(true);
  });
});

describe('hard tile occupancy (advanceMobMovement)', () => {
  const movingMob = (over: Partial<Mob>) =>
    makeGoblin({ state: 'Wander', pathIndex: 0, nextCellCostLeft: undefined, ...over });

  it('a mob will not step onto a tile held by a pawn (doorway chokepoint)', () => {
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
      expect(state.mobs!.find((m) => m.id === 'm')!.x).toBe(5);
    }
    expect(state.mobs!.find((m) => m.id === 'm')!.path ?? []).toHaveLength(0);
  });

  it('two mobs converging on one tile never stack — only one lands there', () => {
    let state = makeState([
      movingMob({ id: 'a', x: 5, y: 5, path: [{ x: 6, y: 5 }] }),
      movingMob({ id: 'b', x: 7, y: 5, path: [{ x: 6, y: 5 }] })
    ]);

    for (let t = 0; t < 400; t++) {
      state = { ...state, turn: t };
      state = entityService.advanceMobMovement(state);
      const live = state.mobs!.filter((m) => m.state !== 'Corpse');
      const tiles = new Set(live.map((m) => `${m.x},${m.y}`));
      expect(tiles.size).toBe(live.length);
    }

    const a = state.mobs!.find((m) => m.id === 'a')!;
    const b = state.mobs!.find((m) => m.id === 'b')!;
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
    const deer = makeAnimal('deer', { state: 'Attacking', huntTargetId: 'hunter' });
    let state = stateWith([deer], [makeHunter()]);
    state = entityService.stepEntities({ ...state, turn: 1 });
    expect(state.mobs![0].state).toBe('Attacking');
  });

  it('…but breaks off and flees the moment the hunter is no longer adjacent', () => {
    const deer = makeAnimal('deer', { state: 'Attacking', huntTargetId: 'hunter' });
    const farHunter = makeHunter({ position: { x: 5, y: 8 } });
    let state = stateWith([deer], [farHunter]);
    state = entityService.stepEntities({ ...state, turn: 1 });
    expect(state.mobs![0].state).toBe('Fleeing');
  });

  it('a mob leaves a COLLAPSED pawn alone — never freezes beating the unconscious body', () => {
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
    expect(everAlerted).toBe(false);
    expect(state.mobs![0].state).toBe('Wander');
  });

  it('a placid mammoth whose MOB attacker died stands down — never turns on a bystander pawn', () => {
    const mammoth = makeAnimal('woolly_mammoth', {
      state: 'Attacking',
      huntTargetId: 'dead-worg'
    });
    const bystander = makeHunter({ currentState: 'Idle' });
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
    const mammoth = makeAnimal('woolly_mammoth', {
      state: 'Attacking',
      huntTargetId: 'hunter'
    });
    let state = stateWith([mammoth], [makeHunter()]);
    state = entityService.stepEntities({ ...state, turn: 1 });
    expect(state.mobs![0].state).toBe('Attacking');
  });

  it('a HUNGRY predator DOES finish off an adjacent collapsed pawn', () => {
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
      creatureId: 'boar',
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
      creatureId: 'wolf',
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
    const wolf = makeWolf({
      state: 'Attacking',
      huntTargetId: 'prey',
      needs: { hunger: 80, fatigue: 0, sleep: 0, lastSleep: 0, lastMeal: 0 }
    });
    const prey = makePrey({ state: 'Attacking', huntTargetId: 'wolf' });
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
    const prey = makePrey({ x: 5, y: 9 });
    let state = makeState([wolf, prey]);
    state = entityService.stepEntities({ ...state, turn: 1 });
    expect(state.mobs!.find((m) => m.id === 'wolf')!.state).toBe('Hunting');
  });

  it('a hungry forager with only UNREACHABLE food backs off instead of flipping every tick', () => {
    const world = smallWorld();
    world[5][8].resources = { grass_patch: 5 };
    const deer: Mob = {
      id: 'deer',
      creatureId: 'deer',
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
      needs: { hunger: 80, fatigue: 0 },
      stateSince: 0
    } as unknown as Mob;
    let state = { ...makeState([deer]), worldMap: world } as GameState;

    let foragingTicks = 0;
    for (let t = 1; t <= 20; t++) {
      state = entityService.stepEntities({ ...state, turn: t });
      const s = state.mobs![0].state;
      if (s === 'Foraging' || s === 'Eating') foragingTicks++;
    }
    expect(foragingTicks).toBeLessThanOrEqual(2);
    expect(state.mobs![0].forageCooldownUntil).toBeGreaterThan(0);
  });
});

describe('mob aggro requires line of sight (no chasing pawns seen through walls)', () => {
  const NOON = 9000;
  const pawnAt = (x: number, y: number) =>
    ({ id: 'p1', isAlive: true, position: { x, y }, currentState: 'Idle' }) as any;

  function aggroState(blockSight: boolean): GameState {
    const world = smallWorld();
    if (blockSight) (world[5][7] as any).blocksSight = true;
    return {
      turn: NOON,
      mobs: [makeGoblin({ x: 5, y: 5, state: 'Wander' })],
      pawns: [pawnAt(9, 5)],
      worldMap: world,
      stockpile: {},
      droppedItems: [],
      buildings: []
    } as unknown as GameState;
  }

  it('an aggressive mob does NOT aggro a pawn it can only "see" through a wall', () => {
    const g = entityService.stepEntities(aggroState(true)).mobs!.find((m) => m.id === 'g1')!;
    expect(g.state).toBe('Wander');
    expect(g.lastSeenX).toBeUndefined();
  });

  it('the same mob DOES aggro on clear line of sight, and remembers the tile it saw them on', () => {
    const g = entityService.stepEntities(aggroState(false)).mobs!.find((m) => m.id === 'g1')!;
    expect(g.state).toBe('Alerted');
    expect(g.lastSeenX).toBe(9);
    expect(g.lastSeenY).toBe(5);
  });

  it('firing the threat alert ONCE per episode (auto-pause + chronicle pulse), not every tick', () => {
    const { sink, calls } = makeThreatSpy();
    setSimLogSink(sink);

    let state = aggroState(false);
    state = entityService.stepEntities(state);
    const g1 = state.mobs!.find((m) => m.id === 'g1')!;
    expect(g1.state).toBe('Alerted');
    expect(g1.alertedPawn).toBe(true);
    expect(calls.length).toBe(1);
    expect(calls[0][0]).toBe('g1');

    for (let i = 0; i < 3; i++) {
      state = { ...state, turn: NOON + i + 1 };
      state = entityService.stepEntities(state);
    }
    expect(calls.length).toBe(1);
  });

  afterEach(() => {
    setSimLogSink(makeThreatSpy().sink);
  });
});
