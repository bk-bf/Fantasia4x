import { describe, it, expect } from 'vitest';
import { colonists, colonistCount } from '$lib/game/core/state/colonists';
import { markColonyCulturesDiscovered } from '$lib/game/core/state/initialState';
import { buildMeta } from '$lib/stores/saveManager';
import { researchService } from '$lib/game/services/ResearchService';
import { itemService } from '$lib/game/services/ItemService';
import { buildingService } from '$lib/game/services/BuildingService';
import type { GameState, Pawn, Recipe } from '$lib/game/core/types';

const pawn = (id: string, over: Partial<Pawn> = {}): Pawn =>
  ({ id, name: id, isAlive: true, ...over }) as Pawn;

const guest = (id: string, over: Partial<Pawn> = {}): Pawn =>
  pawn(id, { isVisitor: true, visitorKingdomId: 'kingdom-1', ...over });

const stateWith = (pawns: Pawn[], over: Partial<GameState> = {}): GameState =>
  ({ pawns, ...over }) as unknown as GameState;

describe('colonists(state)', () => {
  it('keeps living non-visitor pawns and drops guests and the dead', () => {
    const state = stateWith([
      pawn('alive'),
      pawn('unset', { isAlive: undefined }),
      pawn('dead', { isAlive: false }),
      guest('guest'),
      guest('dead-guest', { isAlive: false })
    ]);
    expect(colonists(state).map((p) => p.id)).toEqual(['alive', 'unset']);
    expect(colonistCount(state)).toBe(2);
  });

  it('is empty for a state with no pawns', () => {
    expect(colonists(stateWith([]))).toEqual([]);
    expect(colonists(null)).toEqual([]);
    expect(colonistCount(undefined)).toBe(0);
  });
});

describe('population gates skip a guest', () => {
  const four = [pawn('c1'), pawn('c2'), pawn('c3'), pawn('c4')];
  const threeAndAGuest = [pawn('c1'), pawn('c2'), pawn('c3'), guest('g1')];

  it('research: military_organization needs 4 colonists, and a guest is not one', () => {
    const research = researchService.getResearchById('military_organization');
    expect(research?.populationRequired).toBe(4);
    expect(researchService.hasRequiredPopulation('military_organization', stateWith(four))).toBe(
      true
    );
    expect(
      researchService.hasRequiredPopulation('military_organization', stateWith(threeAndAGuest))
    ).toBe(false);
  });

  it('recipe: a population-gated recipe counts colonists only', () => {
    const recipe = {
      id: 'test_pop_gated',
      station: 'craft_spot',
      inputs: {},
      outputs: {},
      populationRequired: 2
    } as unknown as Recipe;
    const withStation = (pawns: Pawn[]) =>
      stateWith(pawns, {
        buildings: [{ id: 'b1', type: 'craft_spot', status: 'complete' }],
        completedResearch: []
      } as unknown as Partial<GameState>);
    expect(itemService.canQueueCraftRecipe(recipe, withStation([pawn('c1'), pawn('c2')]))).toBe(
      true
    );
    expect(itemService.canQueueCraftRecipe(recipe, withStation([pawn('c1'), guest('g1')]))).toBe(
      false
    );
  });

  it('building: a guest does not meet a building population requirement', () => {
    expect(buildingService.getBuildingById('campfire')?.populationRequired).toBe(1);
    expect(buildingService.hasRequiredPopulation('campfire', stateWith([pawn('c1')]))).toBe(true);
    expect(buildingService.hasRequiredPopulation('campfire', stateWith([guest('g1')]))).toBe(false);
  });

  it('building: construction time counts colonists as the available workers', () => {
    const alone = buildingService.calculateConstructionTime('campfire', stateWith([pawn('c1')]));
    const withGuests = buildingService.calculateConstructionTime(
      'campfire',
      stateWith([pawn('c1'), guest('g1'), guest('g2')])
    );
    expect(withGuests).toBe(alone);
  });

  it('save meta: the headcount on a save is colonists only', () => {
    const meta = buildMeta(
      stateWith([pawn('c1'), pawn('c2'), guest('g1'), pawn('dead', { isAlive: false })], {
        turn: 0,
        season: 'spring'
      } as unknown as Partial<GameState>),
      'manual'
    );
    expect(meta.population).toBe(2);
  });
});

describe('markColonyCulturesDiscovered', () => {
  const culturePool = [
    { id: 'home', name: 'Home', discovered: false, population: 0 },
    { id: 'away', name: 'Away', discovered: false, population: 0 }
  ];

  it('counts colonists per culture and ignores a guest of another culture', () => {
    const state = stateWith(
      [
        pawn('c1', { cultureId: 'home' }),
        pawn('c2', { cultureId: 'home' }),
        guest('g1', { cultureId: 'away' })
      ],
      { culturePool, culture: culturePool[0] } as unknown as Partial<GameState>
    );
    const next = markColonyCulturesDiscovered(state);
    const home = next.culturePool.find((c) => c.id === 'home')!;
    const away = next.culturePool.find((c) => c.id === 'away')!;
    expect(home.population).toBe(2);
    expect(home.discovered).toBe(true);
    expect(away.population).toBe(0);
    expect(away.discovered).toBe(false);
  });

  it('names a living colonist as the culture it was discovered through', () => {
    const state = stateWith(
      [pawn('dead', { cultureId: 'home', isAlive: false }), pawn('c1', { cultureId: 'home' })],
      { culturePool, culture: culturePool[0] } as unknown as Partial<GameState>
    );
    const home = markColonyCulturesDiscovered(state).culturePool.find((c) => c.id === 'home')!;
    expect(home.discoveredVia).toBe('c1');
    expect(home.population).toBe(1);
  });
});
