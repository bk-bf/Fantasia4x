import { describe, it, expect } from 'vitest';
import { amenityAt, AMENITY_RADIUS, buildingComfortOf } from '$lib/game/systems/pawn/pawnHelpers';
import type { PlacedBuilding } from '$lib/game/core/types';

/**
 * §M room amenity — BEAUTY (+insulation) of complete furniture within AMENITY_RADIUS of a tile, used to
 * speed rest (handleSleeping) and wound healing (healWounds). The build material feeds in via `materials`.
 *
 * COMFORT is deliberately NOT ambient: a pawn gets comfort by USING a piece (lounging on the seat,
 * sleeping in the bed), read per-building via `buildingComfortOf` — never by standing near one.
 */
const b = (
  type: string,
  x: number,
  y: number,
  materials?: Record<string, string>
): PlacedBuilding =>
  ({
    id: `${type}-${x}-${y}`,
    type,
    x,
    y,
    status: 'complete',
    progress: 1,
    ...(materials ? { materials } : {})
  }) as PlacedBuilding;

describe('amenityAt (ambient = beauty only)', () => {
  it('sums beauty of nearby complete furniture (bear rug)', () => {
    expect(amenityAt([b('bear_rug', 0, 0)], 0, 0).beauty).toBeGreaterThan(0);
  });

  it('ignores furniture beyond AMENITY_RADIUS', () => {
    const far = AMENITY_RADIUS + 1;
    expect(amenityAt([b('bear_rug', far, 0)], 0, 0).beauty).toBe(0);
  });

  it('ignores blueprints (only complete buildings count)', () => {
    const bp = { ...b('bear_rug', 0, 0), status: 'planned' } as PlacedBuilding;
    expect(amenityAt([bp], 0, 0).beauty).toBe(0);
  });

  it('the build material adds beauty (oak plank → +beauty on the tile)', () => {
    const plain = amenityAt([b('feather_bed', 0, 0)], 0, 0).beauty;
    const oak = amenityAt([b('feather_bed', 0, 0, { 'category:plank': 'oak_plank' })], 0, 0).beauty;
    expect(oak).toBeGreaterThan(plain);
  });
});

describe('buildingComfortOf (comfort comes from the piece you USE)', () => {
  it('reads a seat/bed own comfort', () => {
    expect(buildingComfortOf(b('couch', 0, 0))).toBeGreaterThan(0);
  });

  it('a better piece is comfier (couch > log stool)', () => {
    expect(buildingComfortOf(b('couch', 0, 0))).toBeGreaterThan(
      buildingComfortOf(b('log_stool', 0, 0))
    );
  });

  it('a finer stuffing makes the same piece comfier (mammoth wool > goat wool)', () => {
    const coarse = buildingComfortOf(b('padded_bench', 0, 0, { 'category:wool': 'goat_wool' }));
    const fine = buildingComfortOf(b('padded_bench', 0, 0, { 'category:wool': 'mammoth_wool' }));
    expect(fine).toBeGreaterThan(coarse);
  });

  it('is 0 for a blueprint or a nothing-building', () => {
    expect(buildingComfortOf({ ...b('couch', 0, 0), status: 'planned' } as PlacedBuilding)).toBe(0);
    expect(buildingComfortOf(undefined)).toBe(0);
  });
});
