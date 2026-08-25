import { describe, it, expect } from 'vitest';
import { buildingService } from '$lib/game/services/BuildingService';
import { itemService } from '$lib/game/services/ItemService';
import type { GameState, Pawn } from '$lib/game/core/types';

/**
 * Stations & capacity gates (§109 maxCount, §130 carts). These assert the REAL gate functions
 * (`canBuildBuilding`, `getCarryBudget`) that the sim enforces — the same "test the actual gate"
 * approach as the tool-tier and armour-coverage audits. Passive⚙ pawnless production and the cold-fuel
 * smelt gate are already driven headless in the Ore/Steel audits.
 */
const stateWith = (buildings: Array<{ id: string; type: string; status: string }>) =>
  ({ buildings }) as unknown as GameState;

describe('stations & capacity gates', () => {
  it('§109 maxCount is ENFORCED: a capped furniture type refuses the (maxCount+1)th', () => {
    const type = 'bear_rug'; // buildingState.maxCount = 4
    const mk = (n: number) =>
      stateWith(Array.from({ length: n }, (_, i) => ({ id: `br${i}`, type, status: 'complete' })));
    // meetsStateRestrictions is the unique/maxCount gate specifically (canBuildBuilding ALSO checks
    // resources/research/population, which a bare state lacks — so isolate the count gate here).
    const at3 = buildingService.meetsStateRestrictions(type, mk(3));
    const at4 = buildingService.meetsStateRestrictions(type, mk(4));
    console.log(`[CAP maxCount] bear_rug maxCount gate @3=${at3} @4(cap)=${at4}`);
    expect(at3, 'below the cap → allowed').toBe(true);
    expect(at4, 'at maxCount (4) → the next one is refused').toBe(false);
  });

  it('§130 a cart raises the haul carry budget (held wheelbarrow/handcart via inventoryBonus)', () => {
    const base: Pawn = {
      id: 'p1',
      stats: {
        strength: 12,
        dexterity: 10,
        constitution: 10,
        intelligence: 10,
        wisdom: 10,
        charisma: 10,
        perception: 10
      },
      equipment: {},
      inventory: {
        items: {},
        instances: [],
        weightKg: 0,
        maxWeightKg: 20,
        volumeL: 0,
        maxVolumeL: 20
      }
    } as unknown as Pawn;
    const withCart = (cart: string): Pawn =>
      ({
        ...base,
        equipment: { mainHand: { itemId: cart, instanceId: 'c1', durability: 100 } }
      }) as unknown as Pawn;
    const empty = {} as GameState;
    const bare = itemService.getCarryBudget(base, empty).maxWeightKg;
    const barrow = itemService.getCarryBudget(withCart('wheelbarrow'), empty).maxWeightKg;
    const cart = itemService.getCarryBudget(withCart('handcart'), empty).maxWeightKg;
    console.log(
      `[CAP cart] carry budget kg: bare=${bare.toFixed(1)} wheelbarrow=${barrow.toFixed(1)} handcart=${cart.toFixed(1)}`
    );
    expect(barrow, 'a wheelbarrow (+60kg inventoryBonus) raises the budget').toBeGreaterThan(
      bare + 50
    );
    expect(cart, 'a handcart (+160kg) raises it more still').toBeGreaterThan(barrow);
  });

  it('§130 carry budget is ENFORCED on pickup: you can only take what fits', () => {
    const pawn: Pawn = {
      id: 'p2',
      stats: {
        strength: 10,
        dexterity: 10,
        constitution: 10,
        intelligence: 10,
        wisdom: 10,
        charisma: 10,
        perception: 10
      },
      equipment: {},
      inventory: {
        items: {},
        instances: [],
        weightKg: 0,
        maxWeightKg: 20,
        volumeL: 0,
        maxVolumeL: 20
      }
    } as unknown as Pawn;
    const empty = {} as GameState;
    const budgetKg = itemService.getCarryBudget(pawn, empty).maxWeightKg;
    // large_bones weigh ~1kg each; ask for far more than the budget allows and confirm the pickup clamps.
    const asked = 9999;
    const canTake = itemService.clampPickupQuantity(pawn, 'large_bones', asked, empty);
    const per = itemService.getItemById('large_bones')?.weightKg ?? 1;
    console.log(
      `[CAP pickup] budget=${budgetKg.toFixed(1)}kg, large_bones=${per}kg → clamped ${asked}→${canTake}`
    );
    expect(
      canTake,
      'the pickup is clamped below the ask (budget-bound, not unlimited)'
    ).toBeLessThan(asked);
    expect(canTake * per, 'and the taken load stays within the carry budget').toBeLessThanOrEqual(
      budgetKg + per
    );
  });
});

describe('a soil bed can be laid from the soil you DUG', () => {
  // Digging turns up real loam 1-2 at a time. Before this it went nowhere: the `lay_*` beds only ever
  // wanted dirt + compost + fertiliser, so a colonist could dig good soil out of a riverbank and be
  // left holding it. The made route stays the default; the dug route is what makes the spade worth it.
  const withStock = (stock: Record<string, number>): GameState =>
    ({
      seed: 1,
      turn: 0,
      droppedItems: Object.entries(stock).map(([resourceId, quantity], i) => ({
        id: `s${i}`,
        resourceId,
        quantity,
        x: 0,
        y: 0,
        stored: true
      })),
      buildings: [],
      completedResearch: []
    }) as unknown as GameState;

  it('pays from dug loam when there is no compost in the colony', () => {
    expect(buildingService.resolveBuildingCost('lay_loam', withStock({ loam: 6 }))).toEqual({
      loam: 6
    });
  });

  it('still prefers the made route when both are affordable', () => {
    const both = withStock({ loam: 6, fertiliser: 2, compost: 2, blue_clay: 2, dirt: 4 });
    expect(buildingService.resolveBuildingCost('lay_loam', both)).not.toHaveProperty('loam');
  });

  it('falls through to a LATER alternative, not just the first', () => {
    // `lay_loam` accepts loam, or richer soil at a discount. With only terra preta in stock the
    // resolver has to reach the third entry — the bug this test exists for returned null at the first.
    expect(buildingService.resolveBuildingCost('lay_loam', withStock({ terra_preta: 3 }))).toEqual({
      terra_preta: 3
    });
  });

  it('is unaffordable when neither route can be paid', () => {
    expect(buildingService.resolveBuildingCost('lay_loam', withStock({ loam: 1 }))).toBeNull();
  });
});
