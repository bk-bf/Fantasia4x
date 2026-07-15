import { describe, it, expect } from 'vitest';
import { buildingService } from '$lib/game/services/BuildingService';
import type { GameState } from '$lib/game/core/types';

/**
 * §A any-rock stations — `category:<cat>` building-cost slots resolve to ANY items of that
 * category (the building-cost analogue of a recipe's acceptsCategory). The `hearth` costs
 * `{ "category:stone": 8, branch: 4 }`, so it builds from any mix of granite/limestone/…/slate.
 */
// ADR-016: building cost is paid from AVAILABLE stored drops (reserved-for-craft stacks
// excluded), so seed physical stored drops — not just the derived `stockpile` aggregate.
function gs(stock: Record<string, number>): GameState {
  const droppedItems = Object.entries(stock).map(([resourceId, quantity], i) => ({
    id: `stored-${resourceId}-${i}`,
    resourceId,
    x: i,
    y: 0,
    quantity,
    stored: true
  }));
  return { stockpile: stock, droppedItems } as unknown as GameState;
}

describe('§A category building-cost (resolveBuildingCost)', () => {
  it('covers a category:stone slot from a single rock type (granite)', () => {
    const out = buildingService.resolveBuildingCost('hearth', gs({ granite: 10, branch: 4 }));
    expect(out).toEqual({ granite: 8, branch: 4 });
  });

  it('covers a category:stone slot from a MIX of rock types', () => {
    const out = buildingService.resolveBuildingCost(
      'hearth',
      gs({ granite: 5, slate: 5, branch: 4 })
    );
    expect(out).not.toBeNull();
    const stoneTotal = (out!['granite'] ?? 0) + (out!['slate'] ?? 0) + (out!['limestone'] ?? 0);
    expect(stoneTotal).toBe(8);
    expect(out!['branch']).toBe(4);
  });

  it('returns null when there is not enough stone of any kind', () => {
    expect(buildingService.resolveBuildingCost('hearth', gs({ granite: 3, branch: 4 }))).toBeNull();
    expect(buildingService.hasRequiredResources('hearth', gs({ granite: 3, branch: 4 }))).toBe(
      false
    );
  });

  it('hasRequiredResources is true once any 8 stone + 4 branch are present', () => {
    expect(buildingService.hasRequiredResources('hearth', gs({ marble: 8, branch: 4 }))).toBe(true);
  });

  it('spends the player-chosen material first for a category slot (materialOverride)', () => {
    // Plenty of both rocks; choosing slate must spend slate, not the auto-pick (granite).
    const out = buildingService.resolveBuildingCost(
      'hearth',
      gs({ granite: 10, slate: 10, branch: 4 }),
      { 'category:stone': 'slate' }
    );
    expect(out).toEqual({ slate: 8, branch: 4 });
  });

  it('auto-fills the shortfall when the chosen material runs short', () => {
    // Only 5 slate available for an 8 slot → spend all 5 slate, top up the remaining 3 from granite.
    const out = buildingService.resolveBuildingCost(
      'hearth',
      gs({ granite: 10, slate: 5, branch: 4 }),
      { 'category:stone': 'slate' }
    );
    expect(out).not.toBeNull();
    expect(out!['slate']).toBe(5);
    expect(out!['granite']).toBe(3);
    expect(out!['branch']).toBe(4);
  });
});
