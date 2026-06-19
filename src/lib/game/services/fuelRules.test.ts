import { describe, it, expect } from 'vitest';
import { planRefuel } from './fuelRules';
import { recipeService } from './RecipeService';
import type { GameState, PlacedBuilding } from '../core/types';

function gs(stockpile: Record<string, number>): GameState {
  return { stockpile } as unknown as GameState;
}
function building(type: string, fuel = 0, extra: Partial<PlacedBuilding> = {}): PlacedBuilding {
  return { id: 'b1', type, x: 0, y: 0, status: 'complete', progress: 1, fuel, ...extra };
}

describe('planRefuel — shared generate/complete plan (refuel-loop fix)', () => {
  it('high-heat station with ONLY low-heat fuel → null (the bug: gate passed, complete consumed nothing → loop)', () => {
    // bloomery minFuelHeat 3; branch fuelHeat defaults to 1 → ineligible. Tons of branch, still null.
    expect(planRefuel(gs({ plant_fiber: 10, branch: 100 }), building('bloomery'))).toBeNull();
  });

  it('high-heat station WITH heat-eligible fuel (coal) → a real plan', () => {
    const plan = planRefuel(gs({ plant_fiber: 10, coal: 10 }), building('bloomery'));
    expect(plan).not.toBeNull();
    expect(plan!.newFuel).toBeGreaterThan(0);
    expect(plan!.consumed.coal).toBeGreaterThan(0);
    expect(plan!.consumed.plant_fiber).toBe(2); // tinder reserved
  });

  it('no tinder in stockpile → null', () => {
    expect(planRefuel(gs({ branch: 100 }), building('campfire'))).toBeNull();
  });

  it('empty stockpile → null (cannot fuel a fire with nothing)', () => {
    expect(planRefuel(gs({}), building('campfire'))).toBeNull();
  });

  it('campfire with tinder + fuel → real plan that fills the tank', () => {
    const plan = planRefuel(gs({ plant_fiber: 10, branch: 100 }), building('campfire'));
    expect(plan).not.toBeNull();
    expect(plan!.newFuel).toBe(60); // campfire maxFuel
    expect(plan!.consumed.branch).toBeGreaterThan(0);
  });

  it('already-full tank → null (nothing to add)', () => {
    expect(planRefuel(gs({ plant_fiber: 10, branch: 100 }), building('campfire', 60))).toBeNull();
  });

  it('iron bloomery (heat 3) runs on charcoal, the historical bloomery fuel', () => {
    const plan = planRefuel(gs({ plant_fiber: 10, charcoal: 10 }), building('bloomery'));
    expect(plan).not.toBeNull();
    expect(plan!.consumed.charcoal).toBeGreaterThan(0);
  });

  it('steel finery (heat 5) accepts ONLY coke — charcoal and coal are too cool/dirty', () => {
    expect(planRefuel(gs({ plant_fiber: 10, charcoal: 50 }), building('finery_forge'))).toBeNull();
    expect(planRefuel(gs({ plant_fiber: 10, coal: 50 }), building('finery_forge'))).toBeNull();
    const plan = planRefuel(gs({ plant_fiber: 10, coke: 50 }), building('finery_forge'));
    expect(plan).not.toBeNull();
    expect(plan!.consumed.coke).toBeGreaterThan(0);
  });
});

describe('passive furnaces are a building-def flag, not a hardcoded list', () => {
  it('flagged furnaces are passive; the anvil/casting hearth (mixed) are not', () => {
    expect(recipeService.isPassiveStation('bloomery')).toBe(true);
    expect(recipeService.isPassiveStation('pottery_kiln')).toBe(true);
    expect(recipeService.isPassiveStation('charcoal_pit')).toBe(true);
    expect(recipeService.isPassiveStation('anvil')).toBe(false);
    expect(recipeService.isPassiveStation('casting_hearth')).toBe(false); // mixed: bars passive per-recipe
  });

  it('partial fill drains the available fuel rather than no-op (self-terminating, not a loop)', () => {
    // Exactly the tinder amount of plant_fiber (so none is left over as fuel) + 3 branch (9 fuel) for
    // a 60-tank campfire: a partial fill, but it DOES add fuel and consumes all of it, so the next
    // plan is null → no infinite re-queue.
    const plan = planRefuel(gs({ plant_fiber: 2, branch: 3 }), building('campfire'));
    expect(plan).not.toBeNull();
    expect(plan!.consumed.branch).toBe(3);
    expect(plan!.newFuel).toBe(9);
  });
});
