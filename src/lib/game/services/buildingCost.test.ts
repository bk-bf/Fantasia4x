import { describe, it, expect } from 'vitest';
import { buildingService } from './BuildingService';
import type { GameState } from '../core/types';

/**
 * §A any-rock stations — `category:<cat>` building-cost slots resolve to ANY items of that
 * category (the building-cost analogue of a recipe's acceptsCategory). The `hearth` costs
 * `{ "category:stone": 8, branch: 4 }`, so it builds from any mix of granite/limestone/…/slate.
 */
function gs(stock: Record<string, number>): GameState {
  return { stockpile: stock } as unknown as GameState;
}

describe('§A category building-cost (resolveBuildingCost)', () => {
  it('covers a category:stone slot from a single rock type (granite)', () => {
    const out = buildingService.resolveBuildingCost('hearth', gs({ granite: 10, branch: 4 }));
    expect(out).toEqual({ granite: 8, branch: 4 });
  });

  it('covers a category:stone slot from a MIX of rock types', () => {
    const out = buildingService.resolveBuildingCost('hearth', gs({ granite: 5, slate: 5, branch: 4 }));
    expect(out).not.toBeNull();
    const stoneTotal = (out!['granite'] ?? 0) + (out!['slate'] ?? 0) + (out!['limestone'] ?? 0);
    expect(stoneTotal).toBe(8);
    expect(out!['branch']).toBe(4);
  });

  it('returns null when there is not enough stone of any kind', () => {
    expect(buildingService.resolveBuildingCost('hearth', gs({ granite: 3, branch: 4 }))).toBeNull();
    expect(buildingService.hasRequiredResources('hearth', gs({ granite: 3, branch: 4 }))).toBe(false);
  });

  it('hasRequiredResources is true once any 8 stone + 4 branch are present', () => {
    expect(buildingService.hasRequiredResources('hearth', gs({ marble: 8, branch: 4 }))).toBe(true);
  });
});
