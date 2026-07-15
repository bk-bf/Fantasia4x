import { describe, it, expect } from 'vitest';
import { amenityAt, AMENITY_RADIUS } from '$lib/game/systems/pawn/pawnHelpers';
import type { PlacedBuilding } from '$lib/game/core/types';

/**
 * §M room amenity — comfort/beauty of complete furniture within AMENITY_RADIUS of a tile, used to speed
 * rest (handleSleeping) and wound healing (healWounds). The build material feeds in via `materials`.
 */
const b = (type: string, x: number, y: number, materials?: Record<string, string>): PlacedBuilding =>
  ({
    id: `${type}-${x}-${y}`,
    type,
    x,
    y,
    status: 'complete',
    progress: 1,
    ...(materials ? { materials } : {})
  }) as PlacedBuilding;

describe('amenityAt', () => {
  it('sums comfort of nearby complete furniture (couch)', () => {
    expect(amenityAt([b('couch', 0, 0)], 0, 0).comfort).toBeGreaterThan(0);
  });

  it('ignores furniture beyond AMENITY_RADIUS', () => {
    const far = AMENITY_RADIUS + 1;
    expect(amenityAt([b('couch', far, 0)], 0, 0).comfort).toBe(0);
  });

  it('ignores blueprints (only complete buildings count)', () => {
    const bp = { ...b('couch', 0, 0), status: 'planned' } as PlacedBuilding;
    expect(amenityAt([bp], 0, 0).comfort).toBe(0);
  });

  it('the build material adds beauty (oak plank → +beauty on the tile)', () => {
    const plain = amenityAt([b('feather_bed', 0, 0)], 0, 0).beauty;
    const oak = amenityAt([b('feather_bed', 0, 0, { 'category:plank': 'oak_plank' })], 0, 0).beauty;
    expect(oak).toBeGreaterThan(plain);
  });
});
