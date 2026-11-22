import { describe, it, expect } from 'vitest';
import { amenityAt, AMENITY_RADIUS } from '$lib/game/core/defs/amenities';
import type { PlacedBuilding } from '$lib/game/core/types';

const rug = (x: number, y: number): PlacedBuilding =>
  ({
    id: `rug-${x}-${y}`,
    type: 'bear_rug',
    x,
    y,
    status: 'complete',
    progress: 1
  }) as PlacedBuilding;

describe('amenity reach', () => {
  it('furniture exactly AMENITY_RADIUS away on either axis still counts', () => {
    expect(amenityAt([rug(AMENITY_RADIUS, 0)], 0, 0).beauty).toBeGreaterThan(0);
    expect(amenityAt([rug(0, AMENITY_RADIUS)], 0, 0).beauty).toBeGreaterThan(0);
    expect(amenityAt([rug(AMENITY_RADIUS + 1, 0)], 0, 0).beauty).toBe(0);
  });
});
