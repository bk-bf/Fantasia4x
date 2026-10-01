import { describe, it, expect } from 'vitest';
import { entityService } from '$lib/game/services/EntityService';
import { combatService } from '$lib/game/systems/Combat';
import { kingdomService, KILL_RELATION_COST } from '$lib/game/services/KingdomService';
import { CREATURES, getCreatureById } from '$lib/game/core/defs/creatures';
import { WILD_KINGDOMS, isWildKingdomId } from '$lib/game/core/defs/wildKingdoms';
import { huntsPawnsOnSight } from '$lib/game/services/entity/entityAI';
import { SELF_DEFENCE_TICKS } from '$lib/game/services/entity/entityConstants';
import { ensureCulturePool, ensureKingdomPool } from '$lib/game/core/state/initialState';
import { initialGameState } from '$lib/game/core/state/initialState';
import { generateColonyPawns } from '$lib/game/entities/Pawns';
import { COLONY_RELATION_ID } from '$lib/game/core/types';
import { findKingdomRelation } from '$lib/game/core/gen/kingdom';
import { rng } from '$lib/game/core/util/rng';
import type { GameState, Mob, KingdomRelation } from '$lib/game/core/types';

const NOON = 9000;

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

function makeMobFor(creatureId: string, over: Partial<Mob> = {}): Mob {
  return {
    id: 'm1',
    creatureId,
    entityClass: getCreatureById(creatureId)!.entityClass,
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
    stealthChecks: { p1: { at: Infinity, detected: true } },
    ...(over as object)
  } as unknown as Mob;
}

function colonyRow(kingdomId: string, score: number): KingdomRelation {
  return {
    a: COLONY_RELATION_ID,
    b: kingdomId,
    score,
    disposition: score <= -60 ? 'hostile' : 'neutral'
  };
}

function aggroState(mob: Mob, relations: KingdomRelation[]): GameState {
  return {
    turn: NOON,
    mobs: [mob],
    pawns: [{ id: 'p1', isAlive: true, position: { x: 9, y: 5 }, currentState: 'Idle' }],
    worldMap: smallWorld(),
    kingdomRelations: relations,
    stockpile: {},
    droppedItems: [],
    buildings: []
  } as unknown as GameState;
}

describe('creature kingdoms', () => {
  it('every creature kingdom names a wilderness polity that exists', () => {
    const withKingdom = CREATURES.filter((c) => c.kingdom);
    expect(withKingdom.length).toBeGreaterThan(100);
    for (const c of withKingdom) {
      expect(isWildKingdomId(c.kingdom!)).toBe(true);
    }
  });

  it('the raider species carry an always-hostile kingdom, the beasts a derived one', () => {
    const biasOf = (id: string) => WILD_KINGDOMS.find((k) => k.id === id)!.relationBias;
    for (const id of ['goblin', 'orc_reaver', 'kobold_skulker', 'gnoll_marauder', 'harpy']) {
      expect(biasOf(getCreatureById(id)!.kingdom!)).toBe('always_hostile');
    }
    for (const id of ['wolf', 'bear', 'deer', 'rabbit']) {
      expect(biasOf(getCreatureById(id)!.kingdom!)).toBe('derived');
    }
  });

  it('every variant of a species inherits that species kingdom', () => {
    for (const c of CREATURES) {
      if (!c.variantOf) continue;
      expect(c.kingdom).toBe(getCreatureById(c.variantOf)?.kingdom);
    }
  });
});

describe('the wilderness polities in the kingdom pool', () => {
  function pooled(): GameState {
    rng.reseed(20260918);
    let gs = { ...initialGameState, kingdoms: [], kingdomRelations: [] } as GameState;
    gs = ensureCulturePool(gs);
    return ensureKingdomPool(gs);
  }

  it('ensureKingdomPool adds every wilderness polity with a colony relation row', () => {
    const gs = pooled();
    for (const wild of WILD_KINGDOMS) {
      expect(gs.kingdoms!.some((k) => k.id === wild.id)).toBe(true);
      expect(findKingdomRelation(gs.kingdomRelations!, COLONY_RELATION_ID, wild.id)).toBeDefined();
    }
  });

  it('beast polities start neutral and raider polities start hostile', () => {
    const gs = pooled();
    const score = (id: string) =>
      findKingdomRelation(gs.kingdomRelations!, COLONY_RELATION_ID, id)!.score;
    expect(score('hunting-packs')).toBe(0);
    expect(score('grazing-herds')).toBe(0);
    expect(score('goblin-warrens')).toBe(-100);
    expect(
      findKingdomRelation(gs.kingdomRelations!, COLONY_RELATION_ID, 'goblin-warrens')!.disposition
    ).toBe('hostile');
  });

  it('a second pass adds nothing and keeps the relation scores already in play', () => {
    const once = pooled();
    const soured = {
      ...once,
      kingdomRelations: kingdomService.adjustColonyRelation(once, 'hunting-packs', -80)
        .kingdomRelations
    };
    const twice = ensureKingdomPool(soured);
    expect(twice.kingdoms!.length).toBe(once.kingdoms!.length);
    expect(twice.kingdomRelations!.length).toBe(once.kingdomRelations!.length);
    expect(findKingdomRelation(twice.kingdomRelations!, COLONY_RELATION_ID, 'hunting-packs')!.score)
      .toBe(-80);
  });

  it('no wilderness polity is a pawn homeland or a caravan sender', () => {
    const gs = pooled();
    const pawns = generateColonyPawns(gs.culturePool, 8, { kingdoms: gs.kingdoms, founders: true });
    for (const p of pawns) {
      if (p.homeKingdomId) expect(isWildKingdomId(p.homeKingdomId)).toBe(false);
    }
    const sent = kingdomService.forceArrival({ ...gs, worldMap: smallWorld(60, 60) } as GameState);
    for (const party of sent.kingdomParties ?? []) {
      expect(isWildKingdomId(party.kingdomId)).toBe(false);
    }
  });
});

describe('a creature attacks a pawn only for a hostile kingdom or in self-defence', () => {
  it('a goblin whose warren is hostile still charges on sight', () => {
    const mob = makeMobFor('goblin', { kingdomId: 'goblin-warrens' });
    const state = aggroState(mob, [colonyRow('goblin-warrens', -100)]);
    expect(entityService.stepEntities(state).mobs![0].state).toBe('Alerted');
  });

  it('the same goblin leaves the pawn alone once its warren is merely neutral', () => {
    const mob = makeMobFor('goblin', { kingdomId: 'goblin-warrens' });
    const state = aggroState(mob, [colonyRow('goblin-warrens', 0)]);
    expect(entityService.stepEntities(state).mobs![0].state).toBe('Wander');
  });

  it('a neutral-kingdom creature that was just struck defends itself', () => {
    const mob = makeMobFor('goblin', {
      kingdomId: 'goblin-warrens',
      provokedUntil: NOON + SELF_DEFENCE_TICKS
    });
    const state = aggroState(mob, [colonyRow('goblin-warrens', 0)]);
    expect(entityService.stepEntities(state).mobs![0].state).toBe('Alerted');
  });

  it('the provocation lapses, and the creature stands down again', () => {
    const def = getCreatureById('goblin')!;
    const mob = makeMobFor('goblin', {
      kingdomId: 'goblin-warrens',
      provokedUntil: NOON - 1
    });
    const state = aggroState(mob, [colonyRow('goblin-warrens', 0)]);
    expect(huntsPawnsOnSight(mob, def, state, false, NOON)).toBe(false);
  });

  it('with no relations known at all the creature falls back to its own behaviour flags', () => {
    const goblin = getCreatureById('goblin')!;
    const deer = getCreatureById('deer')!;
    const wolf = getCreatureById('wolf')!;
    const bare = aggroState(makeMobFor('goblin'), []);
    expect(huntsPawnsOnSight(makeMobFor('goblin'), goblin, bare, false, NOON)).toBe(true);
    expect(huntsPawnsOnSight(makeMobFor('deer'), deer, bare, false, NOON)).toBe(false);
    expect(huntsPawnsOnSight(makeMobFor('wolf'), wolf, bare, true, NOON)).toBe(true);
    expect(huntsPawnsOnSight(makeMobFor('wolf'), wolf, bare, false, NOON)).toBe(false);
  });
});

describe('a kill costs relations with the victim kingdom', () => {
  it('onMobKilled charges the victim kingdom and leaves the others alone', () => {
    const state = {
      kingdomRelations: [colonyRow('hunting-packs', 0), colonyRow('grazing-herds', 0)]
    } as unknown as GameState;
    const after = kingdomService.onMobKilled(state, makeMobFor('wolf', { kingdomId: 'hunting-packs' }));
    expect(findKingdomRelation(after.kingdomRelations!, COLONY_RELATION_ID, 'hunting-packs')!.score)
      .toBe(KILL_RELATION_COST);
    expect(findKingdomRelation(after.kingdomRelations!, COLONY_RELATION_ID, 'grazing-herds')!.score)
      .toBe(0);
  });

  it('an unaffiliated creature costs nothing', () => {
    const state = {
      kingdomRelations: [colonyRow('hunting-packs', 0)]
    } as unknown as GameState;
    const after = kingdomService.onMobKilled(state, makeMobFor('shadow_wraith'));
    expect(after.kingdomRelations).toBe(state.kingdomRelations);
  });

  it('a pawn beating a wolf to death charges the pack and provokes its denmates', () => {
    rng.reseed(20260918);
    const limbs = () => [
      { id: 'head', health: 100, bleedRate: 0, parts: [] },
      { id: 'torso', health: 100, bleedRate: 0, parts: [] },
      { id: 'left_arm', health: 100, bleedRate: 0, parts: [] },
      { id: 'right_arm', health: 100, bleedRate: 0, parts: [] },
      { id: 'left_leg', health: 100, bleedRate: 0, parts: [] },
      { id: 'right_leg', health: 100, bleedRate: 0, parts: [] }
    ];
    const pawn = {
      id: 'p1',
      name: 'Wren',
      isAlive: true,
      position: { x: 5, y: 5 },
      currentState: 'Hunting',
      huntTargetId: 'w1',
      stats: {
        strength: 30,
        dexterity: 20,
        constitution: 12,
        intelligence: 10,
        perception: 10,
        charisma: 10
      },
      traits: [],
      equipment: {},
      limbs: limbs(),
      injuries: [],
      conditions: [],
      pain: 0,
      bloodVolume: 100,
      maxBloodVolume: 100,
      stamina: 500,
      maxStamina: 500
    };
    const wolfAt = (id: string, x: number, y: number) =>
      makeMobFor('wolf', {
        id,
        kingdomId: 'hunting-packs',
        lairId: 'den-1',
        x,
        y,
        state: 'Wander',
        health: 40,
        maxHealth: 40,
        stats: { strength: 8, dexterity: 4, constitution: 8, perception: 8 },
        limbs: limbs(),
        stamina: 50,
        maxStamina: 50
      } as unknown as Partial<Mob>);

    let state = {
      turn: 0,
      pawns: [pawn],
      mobs: [wolfAt('w1', 5, 6), wolfAt('w2', 8, 6)],
      worldMap: [],
      kingdomRelations: [colonyRow('hunting-packs', 0)]
    } as unknown as GameState;

    for (let t = 0; t < 40000 && state.mobs!.find((m) => m.id === 'w1')!.isAlive !== false; t++) {
      state = combatService.tickCombat({ ...state, turn: t }, 16);
    }
    expect(state.mobs!.find((m) => m.id === 'w1')!.isAlive).toBe(false);
    expect(
      findKingdomRelation(state.kingdomRelations!, COLONY_RELATION_ID, 'hunting-packs')!.score
    ).toBe(KILL_RELATION_COST);
    expect(state.mobs!.find((m) => m.id === 'w2')!.provokedUntil).toBeGreaterThan(0);
  });

  it('enough kills turn the pack hostile, and its survivors then charge pawns on sight', () => {
    let state = {
      kingdomRelations: [colonyRow('hunting-packs', 0)]
    } as unknown as GameState;
    const victim = makeMobFor('wolf', { kingdomId: 'hunting-packs' });
    const wolf = getCreatureById('wolf')!;
    expect(huntsPawnsOnSight(victim, wolf, state, false, NOON)).toBe(false);
    const killsToHostile = Math.ceil(60 / Math.abs(KILL_RELATION_COST));
    for (let i = 0; i < killsToHostile; i++) state = kingdomService.onMobKilled(state, victim);
    const rel = findKingdomRelation(state.kingdomRelations!, COLONY_RELATION_ID, 'hunting-packs')!;
    expect(rel.score).toBe(killsToHostile * KILL_RELATION_COST);
    expect(rel.disposition).toBe('hostile');
    expect(huntsPawnsOnSight(victim, wolf, state, false, NOON)).toBe(true);

    const charging = aggroState(makeMobFor('wolf', { kingdomId: 'hunting-packs' }), [
      colonyRow('hunting-packs', rel.score)
    ]);
    expect(entityService.stepEntities(charging).mobs![0].state).toBe('Alerted');
  });
});
