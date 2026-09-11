import { describe, it, expect } from 'vitest';
import {
  amenityAt,
  AMENITY_RADIUS,
  buildingComfortOf,
  gatheringLevelOf
} from '$lib/game/systems/pawn/pawnHelpers';
import { nearGatheringPlace, GATHERING_RADIUS } from '$lib/game/core/defs/amenities';
import type { PlacedBuilding } from '$lib/game/core/types';

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

  it('ignores furniture beyond AMENITY_RADIUS on the y-axis', () => {
    const far = AMENITY_RADIUS + 1;
    expect(amenityAt([b('bear_rug', 0, far)], 0, 0).beauty).toBe(0);
  });

  it('sums beauty across multiple buildings rather than taking one', () => {
    const single = amenityAt([b('bear_rug', 0, 0)], 0, 0).beauty;
    const doubled = amenityAt([b('bear_rug', 0, 0), b('bear_rug', 1, 1)], 0, 0).beauty;
    expect(doubled).toBeCloseTo(single * 2);
  });

  it('sums insulation from a building effect and from a material mod', () => {
    const fromEffect = amenityAt([b('thatch_roof', 0, 0)], 0, 0).insulation;
    expect(fromEffect).toBeGreaterThan(0);
    const fromMaterial = amenityAt(
      [b('bear_rug', 0, 0, { 'category:hide': 'bearhide' })],
      0,
      0
    ).insulation;
    expect(fromMaterial).toBeGreaterThan(0);
    const combined = amenityAt(
      [b('thatch_roof', 0, 0), b('bear_rug', 0, 0, { 'category:hide': 'bearhide' })],
      0,
      0
    ).insulation;
    expect(combined).toBeCloseTo(fromEffect + fromMaterial);
  });

  it('returns zero beauty and insulation with no buildings at all', () => {
    expect(amenityAt(undefined, 0, 0)).toEqual({ beauty: 0, insulation: 0 });
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

describe('gatheringLevelOf (level decides which spot wins)', () => {
  it('is 0 for a null or undefined building', () => {
    expect(gatheringLevelOf(null)).toBe(0);
    expect(gatheringLevelOf(undefined)).toBe(0);
  });

  it('is 0 for an incomplete gathering building', () => {
    const inProgress = { ...b('campfire', 0, 0), status: 'under_construction' } as PlacedBuilding;
    expect(gatheringLevelOf(inProgress)).toBe(0);
  });

  it('reads the declared gatheringLevel of a complete gathering building', () => {
    expect(gatheringLevelOf(b('campfire', 0, 0))).toBe(1);
    expect(gatheringLevelOf(b('wooden_table', 0, 0))).toBe(3);
  });
});

describe('nearGatheringPlace (within GATHERING_RADIUS of a gathering spot)', () => {
  it('is true for a complete gathering building right at GATHERING_RADIUS', () => {
    expect(nearGatheringPlace([b('campfire', GATHERING_RADIUS, 0)], 0, 0)).toBe(true);
  });

  it('is false just beyond GATHERING_RADIUS', () => {
    expect(nearGatheringPlace([b('campfire', GATHERING_RADIUS + 1, 0)], 0, 0)).toBe(false);
  });

  it('ignores an in-progress gathering building even when in range', () => {
    const inProgress = { ...b('campfire', 0, 0), status: 'under_construction' } as PlacedBuilding;
    expect(nearGatheringPlace([inProgress], 0, 0)).toBe(false);
  });

  it('ignores a complete, in-range building that is not a gathering place', () => {
    expect(nearGatheringPlace([b('bear_rug', 0, 0)], 0, 0)).toBe(false);
  });

  it('is false with no buildings at all', () => {
    expect(nearGatheringPlace(undefined, 0, 0)).toBe(false);
  });
});
