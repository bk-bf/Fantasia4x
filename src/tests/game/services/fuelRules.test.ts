import { describe, it, expect } from 'vitest';
import { planRefuel } from '$lib/game/services/fuelRules';
import { recipeService } from '$lib/game/services/RecipeService';
import type { GameState, PlacedBuilding } from '$lib/game/core/types';

function gs(stockpile: Record<string, number>): GameState {
  return { stockpile } as unknown as GameState;
}
function building(type: string, fuel = 0, extra: Partial<PlacedBuilding> = {}): PlacedBuilding {
  return { id: 'b1', type, x: 0, y: 0, status: 'complete', progress: 1, fuel, ...extra };
}

describe('planRefuel — shared generate/complete plan (any fuel loads; heat gates production)', () => {
  it('a station LOADS any fuel, even too-cold fuel — the smelt gate moved to production', () => {
    // bloomery minFuelHeat 3; branch fuelHeat 1. It still refuels (no refuel filter anymore) — the
    // fire just runs too cold to smelt (fireHeat < 3, enforced at processPassiveProduction).
    const plan = planRefuel(gs({ plant_fiber: 10, branch: 100 }), building('bloomery'));
    expect(plan).not.toBeNull();
    expect(plan!.consumed.branch).toBeGreaterThan(0);
    expect(plan!.fireHeat).toBeLessThan(3); // too cold to smelt iron
  });

  it('hotter fuel sets a higher fireHeat — coal clears the bloomery smelt gate', () => {
    const plan = planRefuel(gs({ plant_fiber: 10, coal: 10 }), building('bloomery'));
    expect(plan).not.toBeNull();
    expect(plan!.newFuel).toBeGreaterThan(0);
    expect(plan!.consumed.coal).toBeGreaterThan(0);
    expect(plan!.consumed.plant_fiber).toBe(2); // tinder reserved
    expect(plan!.fireHeat).toBeGreaterThanOrEqual(3); // hot enough to smelt
  });

  it('no tinder in stockpile → null', () => {
    expect(planRefuel(gs({ branch: 100 }), building('campfire'))).toBeNull();
  });

  it('empty stockpile → null (cannot fuel a fire with nothing)', () => {
    expect(planRefuel(gs({}), building('campfire'))).toBeNull();
  });

  it('campfire with tinder + a single fuel type → real plan that fills the tank', () => {
    const plan = planRefuel(gs({ plant_fiber: 10, branch: 100 }), building('campfire'));
    expect(plan).not.toBeNull();
    expect(plan!.newFuel).toBe(120); // campfire maxFuel
    expect(plan!.consumed.branch).toBeGreaterThan(0);
  });

  it('already-full tank → null (nothing to add)', () => {
    expect(planRefuel(gs({ plant_fiber: 10, branch: 100 }), building('campfire', 120))).toBeNull();
  });

  it('iron bloomery (heat 3) runs on charcoal, the historical bloomery fuel', () => {
    const plan = planRefuel(gs({ plant_fiber: 10, charcoal: 10 }), building('bloomery'));
    expect(plan).not.toBeNull();
    expect(plan!.consumed.charcoal).toBeGreaterThan(0);
    expect(plan!.fireHeat).toBeGreaterThanOrEqual(3);
  });

  it('steel finery (heat 5): any fuel loads, but only coke gets the fire hot enough to smelt', () => {
    const charcoalPlan = planRefuel(
      gs({ plant_fiber: 10, charcoal: 50 }),
      building('finery_forge')
    );
    expect(charcoalPlan).not.toBeNull(); // it still loads…
    expect(charcoalPlan!.fireHeat).toBeLessThan(5); // …but too cool to make steel
    const cokePlan = planRefuel(gs({ plant_fiber: 10, coke: 50 }), building('finery_forge'));
    expect(cokePlan).not.toBeNull();
    expect(cokePlan!.consumed.coke).toBeGreaterThan(0);
    expect(cokePlan!.fireHeat).toBeGreaterThanOrEqual(5);
  });

  it('§D burnFactor: better fuel burns longer — charcoal outlasts branch', () => {
    const charcoal = planRefuel(gs({ plant_fiber: 10, charcoal: 50 }), building('hearth'));
    const branch = planRefuel(gs({ plant_fiber: 10, branch: 100 }), building('hearth'));
    expect(charcoal!.burnFactor).toBeGreaterThan(branch!.burnFactor);
    expect(branch!.burnFactor).toBeGreaterThanOrEqual(1); // never speeds a fire up
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
