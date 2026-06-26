import { describe, it, expect } from 'vitest';
import { itemService } from './ItemService';
import { buildingService } from './BuildingService';
import { recipeService } from './RecipeService';
import {
  consumeMeal,
  applyIntoxication,
  applyFoodPoisoning,
  mealPoisonChance
} from '../systems/pawn/pawnQueries';
import { decayIntoxication } from '../core/needs';
import conditionsData from '../database/conditions.jsonc';
import type { GameState, Pawn } from '../core/types';

// PRODUCTION-CHAIN-II §F8 — milling, baking, brewing + alcohol as a mood good.

describe('§F8 food-chain items', () => {
  it('flour/malt are organic intermediates; bread/pie are prepared meals', () => {
    expect(itemService.getItemById('flour')?.category).toBe('organic');
    expect(itemService.getItemById('malt')?.category).toBe('organic');
    expect((itemService.getItemById('bread')?.nutrition ?? 0)).toBeGreaterThan(0);
    // Cooked dishes group under `meal` now (the overloaded `food` category was split up).
    expect(itemService.getItemById('bread')?.category).toBe('meal');
    expect(itemService.getItemById('meat_pie')?.category).toBe('meal');
  });

  it('ale/wine/mead are drinks carrying an intoxication mood-lift (mead strongest)', () => {
    for (const id of ['ale', 'wine', 'mead']) {
      const d = itemService.getItemById(id)!;
      expect(d.category).toBe('drink');
      expect(d.intoxication ?? 0).toBeGreaterThan(0);
    }
    expect(itemService.getItemById('mead')!.intoxication!).toBeGreaterThan(
      itemService.getItemById('ale')!.intoxication!
    );
  });
});

describe('§F8 stations + recipes', () => {
  it('quern/oven are craft stations; fermenter is a passive station', () => {
    expect(buildingService.getBuildingById('quern')?.effects?.craftingEnabled).toBe(true);
    expect(buildingService.getBuildingById('oven')?.effects?.craftingEnabled).toBe(true);
    expect(buildingService.getBuildingById('fermenter')?.passive).toBe(true);
  });

  it('milling/baking wire to quern/oven; brewing is passive at the fermenter', () => {
    expect(recipeService.getRecipeById('mill_flour')?.station).toBe('quern');
    expect(recipeService.getRecipeById('bake_bread')?.station).toBe('oven');
    for (const id of ['malt_grain', 'brew_ale', 'ferment_wine', 'ferment_mead']) {
      const r = recipeService.getRecipeById(id)!;
      expect(r.station).toBe('fermenter');
      expect(r.passive).toBe(true);
    }
    // The chain links up: wheat → flour → bread, wheat → malt → ale.
    expect(recipeService.getRecipeById('mill_flour')?.inputs).toHaveProperty('wheat');
    expect(recipeService.getRecipeById('brew_ale')?.inputs).toHaveProperty('malt');
  });
});

describe('§F8 alcohol = mood good', () => {
  it('intoxicated is a persistent, staged condition (tipsy → blackout) that relieves pain', () => {
    const intox = (
      conditionsData as Array<{
        id: string;
        transient?: boolean;
        stages?: Array<{ label: string; modifiers: { pain?: number } }>;
      }>
    ).find((c) => c.id === 'intoxicated')!;
    expect(intox.transient).toBeUndefined(); // persistent (severity-driven)
    expect((intox.stages?.length ?? 0)).toBeGreaterThanOrEqual(3);
    // every stage numbs pain (< 1), more so the drunker
    expect(intox.stages!.every((s) => (s.modifiers.pain ?? 1) < 1)).toBe(true);
    // the deepest stage also dims consciousness (can black out)
    const last = intox.stages![intox.stages!.length - 1] as {
      modifiers: { consciousness?: number };
    };
    expect(last.modifiers.consciousness).toBeLessThan(1);
  });

  it('a drink lifts mood + raises intoxicated severity; it decays back off over time', () => {
    const gs = { stockpile: { mead: 5 }, droppedItems: [] } as unknown as GameState;
    const { intoxication } = consumeMeal([{ id: 'mead', units: 2 }], gs);
    expect(intoxication).toBe(2 * itemService.getItemById('mead')!.intoxication!);

    const pawn = { state: { mood: 50 }, conditions: [] } as unknown as Pawn;
    applyIntoxication(pawn, intoxication);
    expect(pawn.state.mood).toBeGreaterThan(50);
    const sev = pawn.conditions!.find((c) => c.id === 'intoxicated')!.severity;
    expect(sev).toBeGreaterThan(0);
    // a tick of decay lowers it
    decayIntoxication(pawn.conditions!);
    expect(pawn.conditions!.find((c) => c.id === 'intoxicated')!.severity).toBeLessThan(sev);
  });

  it('a sober meal (no drink) neither lifts mood nor intoxicates', () => {
    const gs = { stockpile: { bread: 5 }, droppedItems: [] } as unknown as GameState;
    const { intoxication } = consumeMeal([{ id: 'bread', units: 1 }], gs);
    expect(intoxication).toBe(0);
    const pawn = { state: { mood: 50 }, conditions: [] } as unknown as Pawn;
    applyIntoxication(pawn, intoxication);
    expect(pawn.state.mood).toBe(50);
    expect(pawn.conditions!.find((c) => c.id === 'intoxicated')).toBeUndefined();
  });
});

describe('§F8 food poisoning', () => {
  it('nausea + dysentery are transient conditions; dysentery parches (thirstRate > 1)', () => {
    const byId = new Map(
      (
        conditionsData as Array<{
          id: string;
          transient?: boolean;
          modifiers?: { thirstRate?: number };
        }>
      ).map((c) => [c.id, c])
    );
    expect(byId.get('nausea')?.transient).toBe(true);
    expect(byId.get('dysentery')?.transient).toBe(true);
    expect(byId.get('dysentery')?.modifiers?.thirstRate ?? 1).toBeGreaterThan(1);
  });

  it('raw meat is far dicier than a baked loaf; honey/water never poison', () => {
    expect(mealPoisonChance([{ id: 'rabbit_meat', units: 1 }])).toBeGreaterThan(
      mealPoisonChance([{ id: 'bread', units: 1 }])
    );
    expect(mealPoisonChance([{ id: 'honey', units: 3 }])).toBe(0);
    expect(mealPoisonChance([{ id: 'water', units: 3 }])).toBe(0);
  });

  it('a low-rarity cooked dish is poisonier than a higher-rarity one (rarities.jsonc poisonMult)', () => {
    // dried_meat (common, base 0.03) vs salted_meat (uncommon, base 0.02) — rarity widens the gap.
    expect(mealPoisonChance([{ id: 'dried_meat', units: 1 }])).toBeGreaterThan(
      mealPoisonChance([{ id: 'salted_meat', units: 1 }])
    );
  });

  it('eating tainted food can stamp nausea/dysentery; resistance ≥ 1 grants immunity', () => {
    // Force the worst case (rotten meat, 0.85) over many servings, zero resistance → a hit is certain.
    const sick = { conditionTimers: {} } as unknown as Pawn;
    applyFoodPoisoning(sick, [{ id: 'rotten_meat', units: 20 }], 0);
    const timers = sick.conditionTimers ?? {};
    expect((timers.nausea ?? 0) + (timers.dysentery ?? 0)).toBeGreaterThan(0);

    // A fully poison-immune pawn (res ≥ 1) never gets sick — chance is multiplied to 0.
    const immune = { conditionTimers: {} } as unknown as Pawn;
    applyFoodPoisoning(immune, [{ id: 'rotten_meat', units: 20 }], 1);
    expect(Object.keys(immune.conditionTimers ?? {}).length).toBe(0);
  });
});
